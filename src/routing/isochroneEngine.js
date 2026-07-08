/**
 * Isochrone Weather Routing Engine
 *
 * Algoritmo:
 * 1. Parte dal punto di start
 * 2. Per ogni step temporale dt (es. 30min), esplora N direzioni (es. 24 ogni 15°)
 * 3. Per ogni direzione: legge vento, calcola TWA, risolve polar → boat speed
 *    + effetto corrente (sottrae vettore corrente dalla rotta)
 * 4. Calcola nuova posizione via dead reckoning
 * 5. Filtra posizioni non valide (terra, secche, fuori area)
 * 6. Pruning: mantiene solo i punti Pareto-ottimali (frontiera efficiente)
 * 7. Quando raggiunge il goal, fa backtrack per ricostruire la rotta
 *
 * Output: rotta ottimale con ETA, comfort score, safety score
 */

import { solvePolar, optimalTwa } from './polarSolver.js'
import { haversine, bearing, destination } from '../lib/geo.js'
import { isLand, crossesLand, isLandCached } from '../lib/landMask.js'

const R_EARTH = 6371000

/**
 * Campiona il vento in una posizione/time con IDW (inverse distance weighting)
 */
export function sampleWind(grib, lat, lon, timeMs) {
  if (!grib || !grib.grid || !grib.grid.length) {
    return { speed: 0, dir: 0 }
  }
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
    if (d === 0) return sampleTimeAtPoint(p, timeMs)
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

/**
 * Campiona corrente marina in una posizione/time
 * Returns { speed (kn), dir (deg, "verso") }
 */
export function sampleCurrent(currentField, lat, lon, timeMs) {
  if (!currentField || !currentField.grid || !currentField.grid.length) {
    return { speed: 0, dir: 0 }
  }
  const dists = currentField.grid.map((p) => ({
    p,
    d: (p.lat - lat) ** 2 + (p.lon - lon) ** 2,
  }))
  dists.sort((a, b) => a.d - b.d)
  const nearest = dists.slice(0, 4)

  let sumW = 0
  let sumU = 0
  let sumV = 0

  for (const { p, d } of nearest) {
    if (d === 0) {
      const s = sampleTimeAtPointCurrent(p, timeMs)
      return s
    }
    const w = 1 / d
    const s = sampleTimeAtPointCurrent(p, timeMs)
    if (s.speed == null) continue
    // dir = "verso" corrente, quindi u/v è la direzione di flusso
    const rad = (s.dir * Math.PI) / 180
    sumU += w * s.speed * Math.sin(rad)
    sumV += w * s.speed * Math.cos(rad)
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

function sampleTimeAtPointCurrent(point, timeMs) {
  if (!point.times || !point.times.length) {
    return { speed: point.speed || 0, dir: point.dir || 0 }
  }
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
    speed: point.currSpeed?.[best] ?? point.speed ?? 0,
    dir: point.currDir?.[best] ?? point.dir ?? 0,
  }
}

function legPenalty(speed, twa, waveHeight, gustFactor) {
  let p = 0
  if (speed > 28) p += 4
  else if (speed > 22) p += 2.5
  else if (speed > 16) p += 1
  if (gustFactor > 1.4) p += 1.5
  if (waveHeight > 2.5) p += 3
  else if (waveHeight > 1.5) p += 1.5
  else if (waveHeight > 1) p += 0.5
  if (twa < 45 && speed > 12) p += 1
  return p
}

/**
 * Calcola rotta ottimale via isocrone
 */
export function computeRoute(opts) {
  const {
    start,
    goal,
    grib,
    currentField = null,
    polarKey = 'dufour-41-classic',
    departureMs = Date.now(),
    maxHours = 72,
    constraints = {},
    isLand: isLandFn = null,
  } = opts

  const landCheck = isLandFn || ((lat, lon) => isLandCached(lat, lon))

  const DT_MIN = 30
  const dt = DT_MIN * 60 * 1000
  const dtSec = DT_MIN * 60
  const NUM_DIRECTIONS = 24
  const MAX_FRONTIER = 200
  const GOAL_THRESHOLD_NM = 2

  const directDist = haversine(start.lat, start.lon, goal.lat, goal.lon) / 1852
  const maxDistNm = directDist * 3 + 50
  const maxDistM = maxDistNm * 1852

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

  let goalReached = null
  let elapsed = 0
  let iterations = 0
  const MAX_ITER = Math.ceil((maxHours * 3600 * 1000) / dt)

  while (frontier.length > 0 && elapsed < maxHours * 3600 * 1000 && iterations < MAX_ITER) {
    iterations++
    const nextFrontier = []

    for (const point of frontier) {
      for (let d = 0; d < NUM_DIRECTIONS; d++) {
        const courseDeg = (d * 360) / NUM_DIRECTIONS

        // Campiona vento
        const wind = sampleWind(grib, point.lat, point.lon, point.time)
        
        // Campiona corrente
        const current = currentField ? sampleCurrent(currentField, point.lat, point.lon, point.time) : { speed: 0, dir: 0 }

        let boatSpeedKn
        let motoring = false
        let twa = null

        if (!wind.speed || wind.speed < 1) {
          // vento zero: usa motore
          boatSpeedKn = 6.5
          motoring = true
        } else {
          twa = Math.abs(((wind.dir - courseDeg + 540) % 360) - 180)
          boatSpeedKn = solvePolar(polarKey, wind.speed, twa)
          if (boatSpeedKn < 0.5) continue
        }

        // Calcola spostamento tenendo conto della corrente
        // La barca naviga a boatSpeedKn lungo courseDeg
        // La corrente spinge a current.speed lungo current.dir
        // Risultato: posizione finale = barca + corrente
        const boatDistM = (boatSpeedKn * 1852 * dtSec) / 3600
        const currentDistM = (current.speed * 1852 * dtSec) / 3600

        // Prima la barca lungo la rotta
        let newPos = destination(point.lat, point.lon, courseDeg, boatDistM)
        // Poi aggiungi corrente
        if (current.speed > 0.1) {
          newPos = destination(newPos.lat, newPos.lon, current.dir, currentDistM)
        }

        // Salta se è terra (al waypoint di arrivo)
        if (landCheck(newPos.lat, newPos.lon)) continue
        // Salta se attraversa terra: solo per spostamenti > 3nm (evita overhead inutile)
        // Per spostamenti brevi (dt=30min × speed normale), basta il check al waypoint
        const segDistNm = (boatDistM + currentDistM) / 1852
        if (segDistNm > 3 && crossesLand(point.lat, point.lon, newPos.lat, newPos.lon, 4)) continue

        const waveH = point.waveH || 0
        const comfortP = motoring ? 0 : legPenalty(wind.speed, twa, waveH, 1.0)

        let safetyP = 0
        const hour = new Date(point.time).getHours()
        if (constraints.nightAvoidance && (hour < 6 || hour > 20)) safetyP += 1.5
        if (wind.speed > 25) safetyP += 1.5
        if (wind.speed > 30) safetyP += 2

        if (constraints.maxWindKn && wind.speed > constraints.maxWindKn + 5) continue
        if (constraints.maxWaveM && waveH > constraints.maxWaveM + 0.5) continue

        const newPathDist = point.pathDist + boatDistM + currentDistM
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
            speed: boatSpeedKn,
            comfortPenalty: point.comfortPenalty + comfortP,
            safetyPenalty: point.safetyPenalty + safetyP,
            motoring,
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
          speed: boatSpeedKn,
          comfortPenalty: point.comfortPenalty + comfortP,
          safetyPenalty: point.safetyPenalty + safetyP,
          motoring,
        })
      }
    }

    elapsed += dt
    if (goalReached) break

    frontier = pruneFrontier(nextFrontier, MAX_FRONTIER)
  }

  if (!goalReached) return null

  // Backtrack
  const waypoints = []
  let cur = goalReached
  while (cur) {
    waypoints.unshift({ lat: cur.lat, lon: cur.lon, name: `WP${waypoints.length + 1}` })
    cur = cur.parent
  }

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
    iterations,
  }
}

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
  const baseOpts = { ...opts, maxHours: 72 }

  const fastest = computeRoute({
    ...baseOpts,
    constraints: { maxWindKn: 35, maxWaveM: 4 },
  })
  const comfortable = computeRoute({
    ...baseOpts,
    constraints: { maxWindKn: 22, maxWaveM: 1.5 },
  })
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
  sampleCurrent,
}
