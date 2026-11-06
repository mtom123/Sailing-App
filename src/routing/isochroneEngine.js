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

import { solvePolar } from './polarSolver.js'
import { haversine, destination } from '../lib/geo.js'
import { crossesLand, isLandCached } from '../lib/landMask.js'

const R_EARTH = 6371000

// Ore della previsione convertite una volta sola: rifarlo a ogni lettura del
// vento era quasi tutto il tempo del calcolo
const parsedTimes = new WeakMap()

/** Indice dell'ora più vicina a timeMs; le ore sono in ordine. */
function nearestTime(times, timeMs) {
  let ms = parsedTimes.get(times)
  if (!ms) {
    ms = times.map((t) => new Date(t).getTime())
    parsedTimes.set(times, ms)
  }
  let lo = 0
  let hi = ms.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ms[mid] < timeMs) lo = mid + 1
    else hi = mid
  }
  return lo > 0 && timeMs - ms[lo - 1] <= ms[lo] - timeMs ? lo - 1 : lo
}

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
  const best = nearestTime(point.times, timeMs)
  return {
    speed: point.wind?.[best] ?? point.speed ?? 0,
    dir: point.windDir?.[best] ?? point.dir ?? 0,
  }
}

function sampleTimeAtPointCurrent(point, timeMs) {
  if (!point.times || !point.times.length) {
    return { speed: point.speed || 0, dir: point.dir || 0 }
  }
  const best = nearestTime(point.times, timeMs)
  return {
    speed: point.currSpeed?.[best] ?? point.speed ?? 0,
    dir: point.currDir?.[best] ?? point.dir ?? 0,
  }
}

// Onda e raffica del punto di griglia più vicino: non servono interpolate
function sampleSea(grib, lat, lon, timeMs) {
  if (!grib?.grid?.length) return { wave: 0, gust: 0 }
  let near = grib.grid[0]
  let bestD = Infinity
  for (const p of grib.grid) {
    const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2
    if (d < bestD) {
      bestD = d
      near = p
    }
  }
  if (!near.times?.length) return { wave: 0, gust: 0 }
  const best = nearestTime(near.times, timeMs)
  return { wave: near.wave?.[best] ?? 0, gust: near.gust?.[best] ?? 0 }
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

const MERC_R = 6378137
const mercX = (lon) => (MERC_R * lon * Math.PI) / 180
const mercY = (lat) => MERC_R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
// Attorno a partenza e arrivo moli e dighe non fermano la ricerca. Stretto, così
// la rotta non taglia la terra; largo solo se da un porto chiuso non si esce
const PORT_FREE_NM = 0.3
const PORT_FREE_WIDE_NM = 1
const MAX_SEARCH_MS = 20000 // tetto per ogni rotta: sull'iPad il worker non deve girare per minuti

/*
 * Controllo della terra. Con la griglia della costa OSM (routeLandGrid) vede
 * promontori e isole; senza resta la maschera del Mediterraneo, grossolana
 * (per lei La Maddalena non esiste).
 */
function makeLandCheck(landGrid, start, goal, isLandFn, portFreeNm) {
  const coarse = isLandFn || ((lat, lon) => isLandCached(lat, lon))
  if (!landGrid) {
    return {
      point: coarse,
      leg: (a, b) => crossesLand(a.lat, a.lon, b.lat, b.lon, 8),
    }
  }
  const { minX, maxY, res, w, h, land } = landGrid
  const directM = haversine(start.lat, start.lon, goal.lat, goal.lon)
  const free = Math.min(portFreeNm * 1852, directM * 0.2) / Math.cos((start.lat * Math.PI) / 180)
  const sx = mercX(start.lon)
  const sy = mercY(start.lat)
  const gx = mercX(goal.lon)
  const gy = mercY(goal.lat)
  // Fuori dalla griglia ci si ferma: ha già un largo margine attorno alla tratta,
  // e lì la maschera grossolana rallentava tutto
  const at = (x, y) => {
    if (Math.hypot(x - sx, y - sy) < free || Math.hypot(x - gx, y - gy) < free) return false
    const c = Math.floor((x - minX) / res)
    const r = Math.floor((maxY - y) / res)
    if (c < 0 || r < 0 || c >= w || r >= h) return true
    return land[r * w + c] === 1
  }
  return {
    point: (lat, lon) => at(mercX(lon), mercY(lat)),
    leg: (a, b) => {
      const ax = mercX(a.lon)
      const ay = mercY(a.lat)
      const bx = mercX(b.lon)
      const by = mercY(b.lat)
      const n = Math.min(80, Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / (res * 1.5))))
      for (let i = 0; i <= n; i++) {
        const t = i / n
        if (at(ax + (bx - ax) * t, ay + (by - ay) * t)) return true
      }
      return false
    },
  }
}

// Via i punti che scostano poco dalla linea tra i vicini, se la scorciatoia è in acqua
function simplifyRoute(points, tolNm, land) {
  const pts = [...points]
  for (let k = 1; k < pts.length - 1; ) {
    const a = pts[k - 1]
    const b = pts[k + 1]
    const p = pts[k]
    const cos = Math.cos((p.lat * Math.PI) / 180)
    const ux = (b.lon - a.lon) * cos
    const uy = b.lat - a.lat
    const off = Math.abs(ux * (a.lat - p.lat) - (a.lon - p.lon) * cos * uy) / (Math.hypot(ux, uy) || 1)
    if (off * 60 < tolNm && !land.leg(a, b)) pts.splice(k, 1)
    else k++
  }
  return pts
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
    landGrid = null,
    portFreeNm = PORT_FREE_NM,
  } = opts

  const land = makeLandCheck(landGrid, start, goal, isLandFn, portFreeNm)

  const directDist = haversine(start.lat, start.lon, goal.lat, goal.lon) / 1852
  // Passi di mezz'ora sulle traversate, più corti sulle rotte brevi: tra le
  // isole un passo da 3 miglia sbatteva contro la terra in ogni direzione
  const DT_MIN = Math.min(30, Math.max(5, ((directDist / 6) * 60) / 15))
  const dt = DT_MIN * 60 * 1000
  const dtSec = DT_MIN * 60
  const NUM_DIRECTIONS = 24
  const MAX_FRONTIER = 800
  const maxDistNm = directDist * 3 + 50
  const maxDistM = maxDistNm * 1852
  const goalThresholdNm = Math.min(2, Math.max(0.3, directDist * 0.05))
  // Riquadri della frontiera in proporzione alla tratta: un punto ogni 6 miglia
  // non riusciva a doppiare un capo
  const cellDeg = Math.max(0.01, directDist / 60 / 15)

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
      goalDist: directDist,
    },
  ]

  const seen = new Map() // riquadro → distanza dall'arrivo migliore finora
  const startedAt = Date.now()
  let goalReached = null
  let elapsed = 0
  let iterations = 0
  const MAX_ITER = Math.ceil((maxHours * 3600 * 1000) / dt)

  while (frontier.length > 0 && elapsed < maxHours * 3600 * 1000 && iterations < MAX_ITER) {
    iterations++
    const nextFrontier = []

    for (const point of frontier) {
      // Stesso punto e stessa ora per tutte le direzioni: una lettura sola
      const wind = sampleWind(grib, point.lat, point.lon, point.time)
      const current = currentField ? sampleCurrent(currentField, point.lat, point.lon, point.time) : { speed: 0, dir: 0 }
      const { wave, gust } = sampleSea(grib, point.lat, point.lon, point.time)
      if (constraints.maxWindKn && wind.speed > constraints.maxWindKn) continue
      if (constraints.maxWaveM && wave > constraints.maxWaveM) continue
      const gustFactor = wind.speed > 1 ? gust / wind.speed : 1

      for (let d = 0; d < NUM_DIRECTIONS; d++) {
        const courseDeg = (d * 360) / NUM_DIRECTIONS

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

        // Il passo intero deve stare in acqua, non solo il punto d'arrivo
        if (land.point(newPos.lat, newPos.lon) || land.leg(point, newPos)) continue

        const comfortP = motoring ? 0 : legPenalty(wind.speed, twa, wave, gustFactor)

        let safetyP = 0
        const hour = new Date(point.time).getHours()
        if (constraints.nightAvoidance && (hour < 6 || hour > 20)) safetyP += 1.5
        if (wind.speed > 25) safetyP += 1.5
        if (wind.speed > 30) safetyP += 2

        const newPathDist = point.pathDist + boatDistM + currentDistM
        if (newPathDist > maxDistM) continue

        // Check goal: vicino non basta, il tratto finale deve stare in acqua
        const distToGoal = haversine(newPos.lat, newPos.lon, goal.lat, goal.lon) / 1852
        if (distToGoal < goalThresholdNm && !land.leg(newPos, goal)) {
          const candidate = {
            ...newPos,
            parent: point,
            time: point.time + dt + (distToGoal / Math.max(boatSpeedKn, 1)) * 3600000,
            cost: point.cost + comfortP,
            depth: point.depth + 1,
            pathDist: newPathDist + distToGoal * 1852,
            twa,
            speed: boatSpeedKn,
            comfortPenalty: point.comfortPenalty + comfortP,
            safetyPenalty: point.safetyPenalty + safetyP,
            motoring,
            reachedGoal: true,
          }
          if (!goalReached || candidate.time < goalReached.time) {
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
          goalDist: distToGoal,
        })
      }
    }

    elapsed += dt
    if (goalReached) break

    frontier = pruneFrontier(nextFrontier, MAX_FRONTIER, cellDeg, seen)
    if (Date.now() - startedAt > MAX_SEARCH_MS) break
  }

  if (!goalReached) return null

  // Backtrack
  const path = []
  for (let cur = goalReached; cur; cur = cur.parent) path.unshift({ lat: cur.lat, lon: cur.lon })
  path[0] = { lat: start.lat, lon: start.lon }
  path.push({ lat: goal.lat, lon: goal.lon })
  const waypoints = simplifyRoute(path, Math.max(0.2, directDist * 0.02), land).map((p, i) => ({ ...p, name: `WP${i + 1}` }))

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
    coarseLand: !landGrid,
    widePorts: portFreeNm > PORT_FREE_NM,
  }
}

// Per ogni riquadro il punto più vicino all'arrivo. Si tengono molti riquadri:
// quelli che si allontanano dall'arrivo servono a doppiare i capi. Un riquadro
// già visto si riapre solo avvicinandosi all'arrivo: da un porto chiuso la
// ricerca finisce subito, invece di girare in tondo per tutte le ore
function pruneFrontier(frontier, max, cellDeg, seen) {
  const grid = new Map()
  for (const p of frontier) {
    const key = `${Math.floor(p.lat / cellDeg)},${Math.floor(p.lon / cellDeg)}`
    if (seen.has(key) && p.goalDist >= seen.get(key)) continue
    const existing = grid.get(key)
    if (!existing || p.goalDist < existing.goalDist) grid.set(key, p)
  }
  for (const [key, p] of grid) seen.set(key, p.goalDist)
  const result = Array.from(grid.values())
  if (result.length <= max) return result
  result.sort((a, b) => a.goalDist - b.goalDist)
  return result.slice(0, max)
}

const samePath = (a, b) => !!a && !!b && a.waypoints.length === b.waypoints.length && a.waypoints.every((w, i) => w.lat === b.waypoints[i].lat && w.lon === b.waypoints[i].lon)

/**
 * Calcola 3 opzioni di rotta: fastest, comfortable, safest. Con vento e onda
 * sotto i limiti coincidono: allSame lo dice, invece di far credere a tre scelte.
 */
export function computeRouteOptions(opts) {
  const baseOpts = { ...opts, maxHours: 72 }
  const fastestLimits = { maxWindKn: 35, maxWaveM: 4 }

  let fastest = computeRoute({ ...baseOpts, constraints: fastestLimits })
  if (!fastest && opts.landGrid) {
    baseOpts.portFreeNm = PORT_FREE_WIDE_NM
    fastest = computeRoute({ ...baseOpts, constraints: fastestLimits })
  }
  const comfortable = computeRoute({
    ...baseOpts,
    constraints: { maxWindKn: 22, maxWaveM: 1.5 },
  })
  const safest = computeRoute({
    ...baseOpts,
    constraints: { maxWindKn: 18, maxWaveM: 1.0, nightAvoidance: true },
  })

  return { fastest, comfortable, safest, allSame: samePath(fastest, comfortable) && samePath(comfortable, safest) }
}

export default {
  computeRoute,
  computeRouteOptions,
  sampleWind,
  sampleCurrent,
}
