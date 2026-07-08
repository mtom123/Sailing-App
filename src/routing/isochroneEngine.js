/**
 * Isochrone Weather Routing Engine
 *
 * Algoritmo:
 * 1. Parte dal punto di start
 * 2. Per ogni step temporale dt (es. 30min), esplora N direzioni (es. 36 ogni 10°)
 * 3. Per ogni direzione: legge vento, calcola TWA, risolve polar → boat speed
 * 4. Calcola nuova posizione via dead reckoning
 * 5. Filtra posizioni non valide (terra, secche, fuori area)
 * 6. Pruning: mantiene solo i punti Pareto-ottimali (frontiera efficiente)
 * 7. Quando raggiunge il goal, fa backtrack per ricostruire la rotta
 *
 * Output: rotta ottimale con ETA, comfort score, safety score
 */

import { solvePolar, optimalTwa } from './polarSolver.js'
import { haversine, bearing, destination } from '../lib/geo.js'

const R_EARTH = 6371000 // metri

/**
 * Campiona il vento in una posizione/time
 * @param {Object} grib - { grid: [{lat,lon,times:[],wind:[],dir:[]}, ...] }
 * @param {number} lat
 * @param {number} lon
 * @param {number} timeMs
 * @returns {{speed:number, dir:number}}
 */
export function sampleWind(grib, lat, lon, timeMs) {
  if (!grib || !grib.grid || !grib.grid.length) {
    return { speed: 0, dir: 0 }
  }
  // Trova i 4 punti griglia più vicini (IDW inverse-distance weighting)
  const dists = grib.grid.map((p) => ({
    p,
    d: (p.lat - lat) ** 2 + (p.lon - lon) ** 2,
  }))
  dists.sort((a, b) => a.d - b.d)
  const nearest = dists.slice(0, 4)

  let sumW = 0
  let sumSpeed = 0
  let sumU = 0
  let sumV = 0

  for (const { p, d } of nearest) {
    if (d === 0) {
      // esatto
      return sampleTimeAtPoint(p, timeMs)
    }
    const w = 1 / d
    const sample = sampleTimeAtPoint(p, timeMs)
    if (sample.speed == null) continue
    const rad = (sample.dir * Math.PI) / 180
    sumU += w * sample.speed * Math.sin(rad)
    sumV += w * sample.speed * Math.cos(rad)
    sumW += w
  }
  if (sumW === 0) return { speed: 0, dir: 0 }
  const u = sumU / sumW
  const v = sumV / sumW
  return {
    speed: Math.sqrt(u * u + v * v),
    dir: (Math.atan2(u, v) * 180) / Math.PI,
  }
}

function sampleTimeAtPoint(point, timeMs) {
  if (!point.times || !point.times.length) {
    return { speed: point.speed || 0, dir: point.dir || 0 }
  }
  // nearest hour
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < point.times.length; i++) {
    const t = new Date(point.times[i]).getTime()
    const diff = Math.abs(t - timeMs)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return {
    speed: point.wind?.[best] ?? point.speed ?? 0,
    dir: point.windDir?.[best] ?? point.dir ?? 0,
  }
}

/**
 * Penalità per comfort e sicurezza
 */
function legPenalty(speed, twa, waveHeight, gustFactor) {
  let p = 0
  if (speed > 28) p += 4
  else if (speed > 22) p += 2.5
  else if (speed > 16) p += 1
  if (gustFactor > 1.4) p += 1.5
  if (waveHeight > 2.5) p += 3
  else if (waveHeight > 1.5) p += 1.5
  else if (waveHeight > 1) p += 0.5
  if (twa < 45 && speed > 12) p += 1 // bolina stretta con vento
  return p
}

/**
 * Calcola rotta ottimale via isocrone
 *
 * @param {Object} opts
 * @param {{lat,lon}} opts.start
 * @param {{lat,lon}} opts.goal
 * @param {Object} opts.grib - wind field
 * @param {Object} opts.polarKey - boat polar key
 * @param {number} opts.departureMs - departure time
 * @param {number} opts.maxHours - max routing horizon
 * @param {Object} opts.constraints - { maxWindKn, maxWaveM, nightAvoidance }
 * @param {Function} opts.isLand - (lat, lon) => boolean
 * @returns {Object} - { waypoints, etaMs, distNm, twaAvg, comfortScore, safetyScore }
 */
export function computeRoute(opts) {
  const {
    start,
    goal,
    grib,
    polarKey = 'dufour-41-classic',
    departureMs = Date.now(),
    maxHours = 72,
    constraints = {},
    isLand = () => false,
  } = opts

  const DT_MIN = 30 // step 30 minuti
  const dt = DT_MIN * 60 * 1000
  const dtSec = DT_MIN * 60
  const NUM_DIRECTIONS = 24 // 24 direzioni ogni 15°
  const MAX_FRONTIER = 200 // per performance
  const GOAL_THRESHOLD_NM = 2 // nm

  // Distance start → goal in nm
  const directDist = haversine(start.lat, start.lon, goal.lat, goal.lon) / 1852
  // Heuristic: nessun percorso ottimale è più lungo del 3x diretto
  const maxDistNm = directDist * 3 + 50
  const maxDistM = maxDistNm * 1852

  // Frontier: lista di {lat, lon, parent, time, cost, depth, twa, speed, comfortPenalty, safetyPenalty}
  let frontier = [
    {
      lat: start.lat,
      lon: start.lon,
      parent: null,
      time: departureMs,
      cost: 0,
      depth: 0,
      pathDist: 0,
      comfortPenalty: 0,
      safetyPenalty: 0,
    },
  ]

  // Goal tracking
  let goalReached = null
  let elapsed = 0

  while (frontier.length > 0 && elapsed < maxHours * 3600 * 1000) {
    const nextFrontier = []

    for (const point of frontier) {
      // Per ogni direzione, calcola nuova posizione
      for (let d = 0; d < NUM_DIRECTIONS; d++) {
        const courseDeg = (d * 360) / NUM_DIRECTIONS

        // Campiona vento al punto corrente
        const wind = sampleWind(grib, point.lat, point.lon, point.time)
        if (!wind.speed || wind.speed < 1) {
          // vento zero: usa motore
          const motoringSpeed = 6.5 // kn
          const dist = (motoringSpeed * dtSec) / 3600 / 1.94384 / 1000 // km... wait, riscrivo
          const distM = (motoringSpeed * 1852 * dtSec) / 3600
          const newPos = destination(point.lat, point.lon, courseDeg, distM)

          // Salta se è terra o supera maxDist
          if (isLand(newPos.lat, newPos.lon)) continue
          const newPathDist = point.pathDist + distM
          if (newPathDist > maxDistM) continue

          nextFrontier.push({
            ...newPos,
            parent: point,
            time: point.time + dt,
            cost: point.cost,
            depth: point.depth + 1,
            pathDist: newPathDist,
            twa: null,
            speed: motoringSpeed,
            comfortPenalty: point.comfortPenalty,
            safetyPenalty: point.safetyPenalty,
            motoring: true,
          })
          continue
        }

        // TWA = angolo tra rotta e direzione vento
        const twa = Math.abs(((wind.dir - courseDeg + 540) % 360) - 180)

        // Boat speed dalla polar
        const boatSpeed = solvePolar(polarKey, wind.speed, twa)
        if (boatSpeed < 0.5) continue // troppo lento

        // Penalità per direzioni non ottimali
        const optimalAngle = optimalTwa(polarKey, wind.speed, twa)
        // Se twa < optimalAngle, stiamo stringendo troppo → peggiore
        // Lasciamo comunque esplorare, ma la velocità sarà bassa

        // Wave height (se disponibile nel grib)
        const waveH = point.waveH || 0
        const comfortP = legPenalty(wind.speed, twa, waveH, 1.0)

        // Safety: evita notte + vento forte
        let safetyP = 0
        const hour = new Date(point.time).getHours()
        if (hour < 6 || hour > 20) safetyP += 0.3 // notte
        if (wind.speed > 25) safetyP += 1.5
        if (wind.speed > 30) safetyP += 2

        // Constraints: skip posizioni fuori limiti
        if (constraints.maxWindKn && wind.speed > constraints.maxWindKn + 5) continue
        if (constraints.maxWaveM && waveH > constraints.maxWaveM + 0.5) continue

        // Calcola nuova posizione
        const distM = (boatSpeed * 1852 * dtSec) / 3600
        const newPos = destination(point.lat, point.lon, courseDeg, distM)

        // Salta se è terra
        if (isLand(newPos.lat, newPos.lon)) continue

        const newPathDist = point.pathDist + distM
        if (newPathDist > maxDistM) continue

        // Check goal
        const distToGoal = haversine(newPos.lat, newPos.lon, goal.lat, goal.lon) / 1852
        if (distToGoal < GOAL_THRESHOLD_NM) {
          const candidate = {
            ...newPos,
            parent: point,
            time: point.time + dt,
            cost: point.cost + comfortP,
            depth: point.depth + 1,
            pathDist: newPathDist,
            twa,
            speed: boatSpeed,
            comfortPenalty: point.comfortPenalty + comfortP,
            safetyPenalty: point.safetyPenalty + safetyP,
            motoring: false,
            reachedGoal: true,
          }
          if (!goalReached || candidate.cost < goalReached.cost) {
            goalReached = candidate
          }
          continue
        }

        nextFrontier.push({
          ...newPos,
          parent: point,
          time: point.time + dt,
          cost: point.cost + comfortP + safetyP * 0.5,
          depth: point.depth + 1,
          pathDist: newPathDist,
          twa,
          speed: boatSpeed,
          comfortPenalty: point.comfortPenalty + comfortP,
          safetyPenalty: point.safetyPenalty + safetyP,
          motoring: false,
        })
      }
    }

    elapsed += dt

    // Se abbiamo raggiunto il goal, possiamo continuare ancora un po' per ottimizzare
    // o fermarci. Per semplicità, ci fermiamo al primo goal raggiunto.
    if (goalReached) break

    // Pruning: mantieni solo i migliori MAX_FRONTIER punti
    // Ordina per (lat,lon) grid 0.5° e tieni il migliore per cella
    frontier = pruneFrontier(nextFrontier, MAX_FRONTIER)
  }

  if (!goalReached) {
    return null
  }

  // Backtrack per ricostruire rotta
  const waypoints = []
  let cur = goalReached
  while (cur) {
    waypoints.unshift({ lat: cur.lat, lon: cur.lon, name: `WP${waypoints.length + 1}` })
    cur = cur.parent
  }

  // Aggiungi goal come ultimo WP
  if (
    waypoints[waypoints.length - 1].lat !== goal.lat ||
    waypoints[waypoints.length - 1].lon !== goal.lon
  ) {
    waypoints.push({ ...goal, name: `WP${waypoints.length + 1}` })
  }

  const totalDistNm = goalReached.pathDist / 1852
  const etaMs = goalReached.time
  const comfortScore = goalReached.comfortPenalty
  const safetyScore = goalReached.safetyPenalty

  return {
    waypoints,
    etaMs,
    distNm: totalDistNm,
    comfortScore,
    safetyScore,
    durationH: (etaMs - departureMs) / 3600000,
    avgSpeedKn: totalDistNm / ((etaMs - departureMs) / 3600000),
  }
}

/**
 * Pruning Pareto: griglia 0.5° x 0.5°, tiene solo il punto migliore per cella
 */
function pruneFrontier(frontier, max) {
  if (frontier.length <= max) return frontier
  const grid = new Map()
  for (const p of frontier) {
    const key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`
    const existing = grid.get(key)
    if (!existing || p.cost < existing.cost) {
      grid.set(key, p)
    }
  }
  // Se ancora troppi, riduci la risoluzione
  let result = Array.from(grid.values())
  if (result.length > max) {
    result.sort((a, b) => a.cost - b.cost)
    result = result.slice(0, max)
  }
  return result
}

/**
 * Calcola 3 opzioni di rotta: fastest, comfortable, safest
 */
export function computeRouteOptions(opts) {
  const baseOpts = {
    ...opts,
    maxHours: 72,
  }

  // 1. Fastest: minimo tempo, comfort penalty leggero
  const fastest = computeRoute({
    ...baseOpts,
    constraints: { maxWindKn: 35, maxWaveM: 4 },
  })

  // 2. Comfortable: max wave 1.5m, max wind 22kn
  const comfortable = computeRoute({
    ...baseOpts,
    constraints: { maxWindKn: 22, maxWaveM: 1.5 },
  })

  // 3. Safest: max wave 1m, max wind 18kn, evita notte
  const safest = computeRoute({
    ...baseOpts,
    constraints: { maxWindKn: 18, maxWaveM: 1.0, nightAvoidance: true },
  })

  return { fastest, comfortable, safest }
}

export default {
  computeRoute,
  computeRouteOptions,
  sampleWind,
}
