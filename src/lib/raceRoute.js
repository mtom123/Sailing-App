import { solvePolar } from '../routing/polarSolver.js'
import { sampleCurrent, sampleWind } from '../routing/isochroneEngine.js'
import { haversine } from './geo.js'

/*
 * Rotta ideale verso la boa, per distanze da regata (il routing a isocrone
 * lavora a passi di 30 minuti, adatto alle traversate).
 *
 * A ogni passo si prendono vento e corrente in quel punto e a quell'ora, si
 * calcola la velocità sul fondo per ogni prua dalla polare e si cerca la
 * coppia di prue che arriva prima alla boa: una sola prua quando si può
 * andare diritti, due mure quando bisogna bordeggiare. Si avanza sulla prima
 * e si ripete, così i salti di vento previsti spostano le virate.
 */

const HEADING_STEP = 2
const STEP_H = 0.5 // ogni mezz'ora si rilegge il vento
const MAX_STEPS = 96
const ARRIVED_NM = 0.02
const MIN_SPEED_KN = 0.3
const SAME_LEG_DEG = 8 // prue così vicine sono lo stesso bordo
const LIVE_WIND_MS = 30 * 60 * 1000 // il vento misurato vale per la prima mezz'ora
const rad = Math.PI / 180

// Velocità sul fondo (kn, x verso est, y verso nord) per ogni prua utile
function groundVelocities(polarKey, wind, current) {
  const cu = current.speed * Math.sin(current.dir * rad)
  const cv = current.speed * Math.cos(current.dir * rad)
  const out = []
  for (let h = 0; h < 360; h += HEADING_STEP) {
    const twa = Math.abs(((wind.dir - h + 540) % 360) - 180)
    const bs = solvePolar(polarKey, wind.speed, twa)
    if (bs < MIN_SPEED_KN) continue
    out.push({ h, x: bs * Math.sin(h * rad) + cu, y: bs * Math.cos(h * rad) + cv })
  }
  return out
}

// Coppia di prue più rapida per coprire (dx, dy) miglia: t1·v1 + t2·v2 = D
function bestPair(vels, dx, dy) {
  let best = null
  for (let i = 0; i < vels.length; i++) {
    const a = vels[i]
    for (let j = i; j < vels.length; j++) {
      const b = vels[j]
      const det = a.x * b.y - a.y * b.x
      if (Math.abs(det) < 1e-6) continue
      const t1 = (dx * b.y - dy * b.x) / det
      const t2 = (a.x * dy - a.y * dx) / det
      if (t1 < 0 || t2 < 0) continue
      if (!best || t1 + t2 < best.total) best = { a, b, t1, t2, total: t1 + t2 }
    }
  }
  return best
}

const headingGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

/**
 * { points: [{ lat, lon }], legs: [{ heading, distNm, ms, twa, tws, side }],
 * turns: [{ lat, lon }], downwind, totalMs, distNm } oppure { error }. flip: inizia con le altre mure
 * (se quelle preferite portano su terra o bassi fondali).
 */
export function solveRaceRoute({ from, mark, nowMs, heading, grib, currentField, liveWind, polarKey, flip = false }) {
  let { lat, lon } = from
  let t = nowMs
  let prev = heading
  let first = true
  const raw = []

  for (let step = 0; step < MAX_STEPS; step++) {
    const distNm = haversine(lat, lon, mark.lat, mark.lon) / 1852
    if (distNm < ARRIVED_NM) break
    const cosLat = Math.cos(lat * rad)
    const dx = (mark.lon - lon) * 60 * cosLat
    const dy = (mark.lat - lat) * 60
    const wind = liveWind && t - nowMs < LIVE_WIND_MS ? liveWind : sampleWind(grib, lat, lon, t)
    if (!wind?.speed || wind.speed < 1) return { error: 'Serve il vento: previsione non disponibile o calma' }
    const current = sampleCurrent(currentField, lat, lon, t)
    const pair = bestPair(groundVelocities(polarKey, wind, current), dx, dy)
    if (!pair) return { error: 'Nessuna rotta possibile con questo vento' }

    // Un bordo trascurabile è una rotta diritta. Altrimenti si continua sulle
    // mure attuali, per non virare senza motivo
    let leg = pair.t1 >= pair.t2 ? { v: pair.a, h: pair.t1 } : { v: pair.b, h: pair.t2 }
    if (Math.min(pair.t1, pair.t2) > pair.total * 0.03) {
      const aFirst = prev == null || headingGap(pair.a.h, prev) <= headingGap(pair.b.h, prev)
      const useA = first && flip ? !aFirst : aFirst
      leg = useA ? { v: pair.a, h: pair.t1 } : { v: pair.b, h: pair.t2 }
    }
    first = false

    const dtH = Math.min(leg.h, STEP_H)
    const nextLat = lat + (leg.v.y * dtH) / 60
    const nextLon = lon + (leg.v.x * dtH) / (60 * cosLat)
    const twa = ((wind.dir - leg.v.h + 540) % 360) - 180
    raw.push({ lat, lon, heading: leg.v.h, toLat: nextLat, toLon: nextLon, ms: dtH * 3600000, twa: Math.abs(twa), tws: wind.speed, side: twa >= 0 ? 'dritta' : 'sinistra' })
    lat = nextLat
    lon = nextLon
    t += dtH * 3600000
    prev = leg.v.h
  }

  if (haversine(lat, lon, mark.lat, mark.lon) / 1852 >= ARRIVED_NM * 3) return { error: 'Boa troppo lontana per questo calcolo' }

  // Passi sulla stessa prua → un bordo solo
  const legs = []
  for (const s of raw) {
    const last = legs[legs.length - 1]
    if (last && headingGap(last.heading, s.heading) < SAME_LEG_DEG) {
      last.ms += s.ms
      last.toLat = s.toLat
      last.toLon = s.toLon
    } else {
      legs.push({ ...s })
    }
  }
  const points = [{ lat: from.lat, lon: from.lon }]
  const turns = [] // dove si cambiano le mure; un salto di vento sulle stesse mure non conta
  legs.forEach((l, i) => {
    points.push({ lat: l.toLat, lon: l.toLon })
    l.distNm = haversine(l.lat, l.lon, l.toLat, l.toLon) / 1852
    if (i > 0 && legs[i - 1].side !== l.side) turns.push({ lat: l.lat, lon: l.lon })
  })
  points[points.length - 1] = { lat: mark.lat, lon: mark.lon }
  return {
    points,
    legs,
    totalMs: legs.reduce((sum, l) => sum + l.ms, 0),
    distNm: legs.reduce((sum, l) => sum + l.distNm, 0),
    turns,
    downwind: legs.every((l) => l.twa > 90),
  }
}
