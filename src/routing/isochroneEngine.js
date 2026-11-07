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
 * Output: rotta con ETA, distanza e condizioni percorrendo la linea finale (sailLine)
 */

import { solvePolar } from './polarSolver.js'
import { bearing, haversine, destination } from '../lib/geo.js'
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

// Scomodità di un tratto: 0 mare piatto e vento leggero, 1 già si sente, oltre 5 duro.
// Continua, perché la ricerca deve poter preferire un po' meno onda o bolina
function legPenalty(tws, twa, wave, gust) {
  let p = Math.max(0, (tws - 12) / 6) + Math.max(0, (wave - 0.7) / 0.6)
  if (twa != null && twa < 60 && tws > 8) p += ((60 - twa) / 15) * Math.min(1, tws / 14)
  if (gust > 18 && gust / Math.max(tws, 1) > 1.4) p += 1
  return p
}

// Velocità utile a vela lungo una rotta: dentro l'angolo di bolina o di poppa
// migliore si bordeggia sulle due mure attorno alla linea, e vale la VMG
function madeGoodKn(polarKey, tws, twa) {
  const rad = Math.PI / 180
  let up = { vmg: 0, angle: 0 }
  let down = { vmg: 0, angle: 180 }
  for (let a = 30; a <= 180; a += 5) {
    const vmg = solvePolar(polarKey, tws, a) * Math.cos(a * rad)
    if (vmg > up.vmg) up = { vmg, angle: a }
    if (-vmg > down.vmg) down = { vmg: -vmg, angle: a }
  }
  let kn = solvePolar(polarKey, tws, twa)
  if (twa < up.angle) kn = up.vmg / Math.cos(twa * rad)
  else if (twa > down.angle) kn = down.vmg / -Math.cos(twa * rad)
  return Math.max(kn, 1)
}

/*
 * Come si muove la barca. mode: 'sail' polari, 'motor' sempre a motore, 'hybrid'
 * a vela, a motore quando verso quella rotta si fa meno di motorBelowKn. A motore
 * il vento non conta e l'onda frena: stima da tarare, un 12% per metro oltre il
 * mezzo metro, mai sotto metà velocità.
 */
function makeDrive(polarKey, { mode = 'sail', motorKn = MOTOR_KN, motorBelowKn = 4 } = {}) {
  const motorSpeed = (wave) => motorKn * Math.max(0.5, 1 - 0.12 * Math.max(0, wave - 0.5))
  const seen = new Map()
  const madeGood = (tws, twa) => {
    const key = `${Math.round(tws)}|${Math.round(twa / 5)}`
    if (!seen.has(key)) seen.set(key, madeGoodKn(polarKey, tws, twa))
    return seen.get(key)
  }
  const usesMotor = (tws, twa) => mode === 'motor' || tws < 1 || (mode === 'hybrid' && madeGood(tws, twa) < motorBelowKn)
  return {
    mode,
    /** Velocità lungo la prua (ricerca); 0 se a vela di lì non si passa. */
    heading(tws, twa, wave) {
      if (usesMotor(tws, twa)) return { kn: motorSpeed(wave), motor: true }
      const kn = solvePolar(polarKey, tws, twa)
      // Con un filo di vento si avanza piano: scartare tutte le prue chiudeva la ricerca
      return { kn: tws < LIGHT_AIR_KN ? Math.max(kn, 0.5) : kn, motor: false }
    },
    /** Velocità lungo una linea, bordi compresi (tempi finali). */
    line(tws, twa, wave) {
      if (usesMotor(tws, twa)) return { kn: motorSpeed(wave), motor: true }
      return { kn: madeGood(tws, twa), motor: false }
    },
  }
}

// A motore contano solo l'onda e la corrente: niente bolina né vento nel comfort
const seaPenalty = (motor, tws, twa, wave, gust) => (motor ? legPenalty(0, null, wave, 0) : legPenalty(tws, twa, wave, gust))

/*
 * Percorre la linea disegnata con vento, onda e corrente di ogni ora: tempi,
 * distanza e condizioni sono quelli della rotta che si vede, non della ricerca.
 * cost: le ore, più le ore scomode pesate con `weight` e quelle oltre i limiti.
 */
function sailLine(points, { grib, currentField, drive, departureMs }, weight, limits) {
  let t = departureMs
  let motorH = 0
  let distNm = 0
  let rough = 0
  let overH = 0
  let maxWind = 0
  let maxWave = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const legNm = haversine(a.lat, a.lon, b.lat, b.lon) / 1852
    const course = bearing(a.lat, a.lon, b.lat, b.lon)
    distNm += legNm
    let pos = a
    let left = legNm
    while (left > 0.001) {
      const wind = sampleWind(grib, pos.lat, pos.lon, t)
      const { wave, gust } = sampleSea(grib, pos.lat, pos.lon, t)
      const current = currentField ? sampleCurrent(currentField, pos.lat, pos.lon, t) : { speed: 0, dir: 0 }
      const twa = Math.abs(((wind.dir - course + 540) % 360) - 180)
      const drift = current.speed * Math.cos(((current.dir - course) * Math.PI) / 180)
      const move = drive.line(wind.speed, twa, wave)
      const ground = Math.max(0.5, move.kn + drift)
      const stepNm = Math.min(left, ground * 0.5)
      const hours = stepNm / ground
      rough += seaPenalty(move.motor, wind.speed, twa, wave, gust) * hours
      if (move.motor) motorH += hours
      if (wind.speed > limits.maxWindKn || wave > limits.maxWaveM) overH += hours
      maxWind = Math.max(maxWind, wind.speed)
      maxWave = Math.max(maxWave, wave)
      pos = destination(pos.lat, pos.lon, course, stepNm * 1852)
      left -= stepNm
      t += hours * 3600000
      if (t - departureMs > MAX_SAIL_MS) return null
    }
  }
  const hours = (t - departureMs) / 3600000
  return { etaMs: t, hours, distNm, comfort: rough / Math.max(hours, 0.01), motorH, maxWind, maxWave, cost: hours + weight * rough + overH * 50 }
}

// Toglie le spezzate che non servono: un punto resta solo se senza costa di più
function straighten(points, land, ctx, weight, limits) {
  const pts = [...points]
  let line = sailLine(pts, ctx, weight, limits)
  for (;;) {
    if (!line || pts.length < 3) return { pts, line }
    let best = -1
    let bestLine = null
    let bestCost = line.cost * 1.003
    for (let i = 1; i < pts.length - 1; i++) {
      if (land.leg(pts[i - 1], pts[i + 1])) continue
      const next = sailLine([...pts.slice(0, i), ...pts.slice(i + 1)], ctx, weight, limits)
      if (next && next.cost < bestCost) {
        best = i
        bestLine = next
        bestCost = next.cost
      }
    }
    if (best < 0) return { pts, line }
    pts.splice(best, 1)
    line = bestLine
  }
}

const MERC_R = 6378137
const mercX = (lon) => (MERC_R * lon * Math.PI) / 180
const mercY = (lat) => MERC_R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
// Attorno a partenza e arrivo moli e dighe non fermano la ricerca. Stretto, così
// la rotta non taglia la terra; largo solo se da un porto chiuso non si esce
const PORT_FREE_NM = 0.3
const PORT_FREE_WIDE_NM = 1
const MAX_SEARCH_MS = 20000 // tetto per ogni rotta: sull'iPad il worker non deve girare per minuti
const MOTOR_KN = 6.5 // senza vento si va a motore
const LIGHT_AIR_KN = 3
const MAX_SAIL_MS = 120 * 3600000
const OVER_LIMIT_SLOW = 4 // oltre i limiti dell'opzione un passo rende un quinto

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
 * Area delle previsioni per una rotta: partenza e punti, con margine per i
 * bordi e gli aggiramenti. Arrotondata, così la barca che si muove non chiede
 * ogni volta una griglia nuova.
 */
export function routeForecastBounds(start, waypoints = []) {
  const pts = [start, ...waypoints].filter(Boolean)
  if (pts.length < 2) return null
  const lats = pts.map((p) => p.lat)
  const lons = pts.map((p) => p.lon)
  const south = Math.min(...lats)
  const north = Math.max(...lats)
  const west = Math.min(...lons)
  const east = Math.max(...lons)
  const pad = Math.max(0.3, Math.max(north - south, east - west) * 0.2)
  const down = (v) => Math.floor(v * 5) / 5
  const up = (v) => Math.ceil(v * 5) / 5
  return { south: down(south - pad), west: down(west - pad), north: up(north + pad), east: up(east + pad) }
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
    propulsion = {},
    departureMs = Date.now(),
    maxHours = 72,
    constraints = {},
    isLand: isLandFn = null,
    landGrid = null,
    portFreeNm = PORT_FREE_NM,
  } = opts

  const land = makeLandCheck(landGrid, start, goal, isLandFn, portFreeNm)
  const drive = makeDrive(polarKey, propulsion)
  const comfortWeight = constraints.comfortWeight ?? 0
  const softLimits = constraints.soft ?? { maxWindKn: Infinity, maxWaveM: Infinity }

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
  // Riquadri della frontiera in proporzione alla tratta. Devono stare vicini al
  // passo della barca: con poco vento un passo per doppiare un capo restava nel suo
  // riquadro senza avvicinarsi, veniva scartato e la ricerca finiva senza rotta
  const cellDeg = Math.max(0.01, directDist / 60 / 40)

  let frontier = [
    {
      lat: start.lat,
      lon: start.lon,
      parent: null,
      time: departureMs,
      clock: departureMs,
      pathDist: 0,
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
      const wind = sampleWind(grib, point.lat, point.lon, point.clock)
      const current = currentField ? sampleCurrent(currentField, point.lat, point.lon, point.clock) : { speed: 0, dir: 0 }
      const { wave, gust } = sampleSea(grib, point.lat, point.lon, point.clock)
      if (constraints.maxWindKn && wind.speed > constraints.maxWindKn) continue
      if (constraints.maxWaveM && wave > constraints.maxWaveM) continue
      // I limiti della comoda e della sicura si evitano, non chiudono la strada:
      // un fronte che passa fermerebbe tutta la ricerca
      const overSoft = wind.speed > softLimits.maxWindKn || wave > softLimits.maxWaveM

      for (let d = 0; d < NUM_DIRECTIONS; d++) {
        const courseDeg = (d * 360) / NUM_DIRECTIONS

        const twa = Math.abs(((wind.dir - courseDeg + 540) % 360) - 180)
        const move = drive.heading(wind.speed || 0, twa, wave)
        const boatSpeedKn = move.kn
        if (boatSpeedKn < 0.5) continue

        // Calcola spostamento tenendo conto della corrente
        // La barca naviga a boatSpeedKn lungo courseDeg
        // La corrente spinge a current.speed lungo current.dir
        // Risultato: posizione finale = barca + corrente
        // Nella ricerca i tratti scomodi "rendono" meno: un passo copre meno
        // strada e l'orologio delle previsioni avanza meno. Tempi veri: sailLine
        const slow = 1 + comfortWeight * seaPenalty(move.motor, wind.speed, twa, wave, gust) + (overSoft ? OVER_LIMIT_SLOW : 0)
        const boatDistM = (boatSpeedKn * 1852 * dtSec) / 3600 / slow
        const currentDistM = (current.speed * 1852 * dtSec) / 3600 / slow

        // Prima la barca lungo la rotta
        let newPos = destination(point.lat, point.lon, courseDeg, boatDistM)
        // Poi aggiungi corrente
        if (current.speed > 0.1) {
          newPos = destination(newPos.lat, newPos.lon, current.dir, currentDistM)
        }

        // Il passo intero deve stare in acqua, non solo il punto d'arrivo
        if (land.point(newPos.lat, newPos.lon) || land.leg(point, newPos)) continue

        const newPathDist = point.pathDist + boatDistM + currentDistM
        if (newPathDist > maxDistM) continue

        // Check goal: vicino non basta, il tratto finale deve stare in acqua
        const distToGoal = haversine(newPos.lat, newPos.lon, goal.lat, goal.lon) / 1852
        if (distToGoal < goalThresholdNm && !land.leg(newPos, goal)) {
          const candidate = {
            ...newPos,
            parent: point,
            time: point.time + dt + (distToGoal / Math.max(boatSpeedKn, 1)) * 3600000,
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
          clock: point.clock + dt / slow,
          pathDist: newPathDist,
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
  const ctx = { grib, currentField, drive, departureMs }
  const { pts, line } = straighten(simplifyRoute(path, Math.max(0.2, directDist * 0.02), land), land, ctx, comfortWeight, softLimits)
  if (!line) return null

  return {
    waypoints: pts.map((p, i) => ({ lat: p.lat, lon: p.lon, name: `WP${i + 1}` })),
    etaMs: line.etaMs,
    distNm: line.distNm,
    comfortScore: line.comfort,
    motorHours: line.motorH,
    maxWindKn: line.maxWind,
    maxWaveM: line.maxWave,
    overLimits: line.maxWind > softLimits.maxWindKn * 1.05 || line.maxWave > softLimits.maxWaveM * 1.05, // uno sfioramento non conta
    durationH: line.hours,
    avgSpeedKn: line.distNm / line.hours,
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

// Punto a una frazione della linea
function alongLine(pts, frac) {
  const legs = pts.slice(1).map((p, i) => haversine(pts[i].lat, pts[i].lon, p.lat, p.lon))
  let left = legs.reduce((sum, l) => sum + l, 0) * frac
  for (let i = 0; i < legs.length; i++) {
    if (left <= legs[i] && legs[i] > 0) {
      const k = left / legs[i]
      return { lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * k, lon: pts[i].lon + (pts[i + 1].lon - pts[i].lon) * k }
    }
    left -= legs[i]
  }
  return pts[pts.length - 1]
}

// Due rotte sono la stessa se non si scostano di più del 2% (almeno mezzo miglio)
function sameRoute(a, b) {
  if (!a || !b) return false
  const tolNm = Math.max(0.5, a.distNm * 0.02)
  for (let i = 1; i < 20; i++) {
    const p = alongLine(a.waypoints, i / 20)
    const q = alongLine(b.waypoints, i / 20)
    if (haversine(p.lat, p.lon, q.lat, q.lon) / 1852 > tolNm) return false
  }
  return true
}

/**
 * Tre rotte con obiettivi diversi. Veloce: il tempo. Comoda: meno bolina, onda
 * e vento forte, anche allungando. Sicura: ancora di più, con limiti più
 * stretti. Con mare calmo possono coincidere: sameAs lo dice.
 */
export function computeRouteOptions(opts) {
  const baseOpts = { ...opts, maxHours: 72 }
  const fastestLimits = { maxWindKn: 35, maxWaveM: 4 } // valgono per tutte
  // A motore il vento resta solo limite di sicurezza
  const windLimit = (kn) => (opts.propulsion?.mode === 'motor' ? Infinity : kn)

  let fastest = computeRoute({ ...baseOpts, constraints: fastestLimits })
  if (!fastest && opts.landGrid) {
    baseOpts.portFreeNm = PORT_FREE_WIDE_NM
    fastest = computeRoute({ ...baseOpts, constraints: fastestLimits })
  }
  let comfortable = computeRoute({
    ...baseOpts,
    constraints: { ...fastestLimits, soft: { maxWindKn: windLimit(22), maxWaveM: 1.5 }, comfortWeight: 0.4 },
  })
  let safest = computeRoute({
    ...baseOpts,
    constraints: { ...fastestLimits, soft: { maxWindKn: windLimit(18), maxWaveM: 1 }, comfortWeight: 1 },
  })

  // La ricerca è approssimata: l'opzione che non batte quella prima di lei
  // sul suo terreno prende il suo posto, così i nomi dicono il vero
  if (comfortable && (!fastest || comfortable.etaMs < fastest.etaMs)) fastest = comfortable
  if (safest && fastest && safest.etaMs < fastest.etaMs) fastest = safest
  if (comfortable && safest && safest.comfortScore > comfortable.comfortScore) safest = comfortable
  if (comfortable && fastest && comfortable.comfortScore > fastest.comfortScore) comfortable = fastest

  return {
    fastest,
    comfortable,
    safest,
    allSame: sameRoute(fastest, comfortable) && sameRoute(comfortable, safest),
    sameAs: { comfortable: sameRoute(fastest, comfortable), safest: sameRoute(fastest, safest) || sameRoute(comfortable, safest) },
  }
}

export default {
  computeRoute,
  computeRouteOptions,
  sampleWind,
  sampleCurrent,
}
