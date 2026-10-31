import { haversine, metersToNm } from './geo.js'

/*
 * Statistiche di una traccia a tratti: [[[lat, lon, ts, sog]]].
 * Velocità massima dalla SOG del GPS o, se manca, tra punti successivi
 * (scartando i salti oltre 40 nodi, tipici di un fix sbagliato).
 */

const MOVING_KN = 0.7 // sotto, la barca è ferma (ormeggio, ancora)
const SPIKE_KN = 40

export function trackStats(segments, start, end) {
  let distM = 0
  let movingMs = 0
  let maxKn = 0
  let points = 0
  for (const seg of segments) {
    points += seg.length
    for (let i = 0; i < seg.length; i++) {
      const [lat, lon, ts, sog] = seg[i]
      if (sog != null && sog < SPIKE_KN) maxKn = Math.max(maxKn, sog)
      if (i === 0) continue
      const [plat, plon, pts] = seg[i - 1]
      const d = haversine(plat, plon, lat, lon)
      const dt = ts - pts
      if (dt <= 0) continue
      const kn = (d / dt) * 1943.84 // m/ms → nodi
      if (kn > SPIKE_KN) continue
      distM += d
      if (kn >= MOVING_KN) movingMs += dt
      if (sog == null) maxKn = Math.max(maxKn, kn)
    }
  }
  const durationMs = Math.max(0, (end ?? Date.now()) - start)
  return {
    distanceNm: metersToNm(distM),
    durationMs,
    movingMs,
    avgKn: movingMs > 0 ? metersToNm(distM) / (movingMs / 3600000) : 0,
    maxKn,
    points,
  }
}

export const fmtDuration = (ms) => {
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  return `${h}h ${String(mins % 60).padStart(2, '0')}m`
}
