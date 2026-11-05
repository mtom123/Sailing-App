import { destination, haversine } from './geo.js'

/*
 * Dove può essere arrivato il naufrago dal momento del MOB: si parte dal
 * punto GPS e si avanza a passi di un minuto con la corrente e con lo
 * scarroccio, circa il 2% del vento (di solito 1-3% per una persona in acqua).
 *
 * È una stima: il modello di corrente è a maglie larghe e poco affidabile
 * sotto costa. Per questo il raggio di incertezza cresce col tempo e il punto
 * GPS resta sempre il riferimento.
 */

const LEEWAY = 0.02
const KN_TO_MS = 1852 / 3600
const STEP_MS = 60000
const MAX_MS = 6 * 3600 * 1000
const BASE_RADIUS_M = 30
const SPREAD_MS = 0.25 * KN_TO_MS // incertezza di corrente e scarroccio

function nearest(grid, lat, lon) {
  let best = null
  let bestD = Infinity
  for (const g of grid) {
    const d = (g.lat - lat) ** 2 + (g.lon - lon) ** 2
    if (d < bestD) {
      bestD = d
      best = g
    }
  }
  return best
}

function hourIndex(g, ms) {
  if (!g.times?.length) return -1
  let best = 0
  let bestD = Infinity
  g.times.forEach((t, i) => {
    const d = Math.abs(Date.parse(t) - ms)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/**
 * { lat, lon, radiusM, minutes, driftM, sources } oppure null se mancano sia
 * corrente sia vento. grid: griglia oraria di useGrib; wind: { speed, dir }
 * misurato a bordo (kn, da dove viene), che vince sulla previsione.
 */
export function estimateDrift(mob, now, { grid, wind } = {}) {
  const elapsed = Math.min(Math.max(0, now - mob.ts), MAX_MS)
  let { lat, lon } = mob
  let usedCurrent = false
  let usedWind = false
  let path = 0
  for (let t = 0; t < elapsed; t += STEP_MS) {
    const dt = Math.min(STEP_MS, elapsed - t) / 1000
    const g = grid?.length ? nearest(grid, lat, lon) : null
    const i = g ? hourIndex(g, mob.ts + t) : -1
    const curSpeed = i >= 0 ? g.currSpeed?.[i] : null
    const curDir = i >= 0 ? g.currDir?.[i] : null
    const windSpeed = wind?.speed ?? (i >= 0 ? g.wind?.[i] : null)
    const windDir = wind?.dir ?? (i >= 0 ? g.windDir?.[i] : null)
    if (curSpeed != null && curDir != null) {
      const m = curSpeed * KN_TO_MS * dt
      ;({ lat, lon } = destination(lat, lon, curDir, m)) // la corrente è "verso"
      path += m
      usedCurrent = true
    }
    if (windSpeed != null && windDir != null) {
      const m = windSpeed * LEEWAY * KN_TO_MS * dt
      ;({ lat, lon } = destination(lat, lon, (windDir + 180) % 360, m)) // il vento è "da"
      path += m
      usedWind = true
    }
  }
  if (elapsed > 0 && !usedCurrent && !usedWind) return null
  const sec = elapsed / 1000
  return {
    lat,
    lon,
    radiusM: BASE_RADIUS_M + sec * SPREAD_MS + path * 0.5,
    minutes: Math.floor(elapsed / 60000),
    driftM: haversine(mob.lat, mob.lon, lat, lon),
    sources: { current: usedCurrent, wind: usedWind },
  }
}
