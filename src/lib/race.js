import { bearing, haversine } from './geo.js'

/*
 * Regata: VMG verso una boa (o qualunque punto) e lettura delle coordinate
 * scritte a mano.
 */

/**
 * Coordinata da testo: "44.2667", "44 16.002 N", "44°16.002' N",
 * "44 16 00 N", con virgola o punto, emisfero N/S/E/O/W prima o dopo.
 * Ritorna gradi decimali, o null se non è valida.
 */
export function parseCoord(text, isLat) {
  const t = String(text || '').trim().toUpperCase().replace(/,/g, '.')
  if (!t) return null
  const hemi = t.match(/[NSEOW]/)?.[0]
  if (hemi && (isLat ? !'NS'.includes(hemi) : !'EOW'.includes(hemi))) return null
  const nums = t.match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length > 3) return null
  const [d, m = 0, s = 0] = nums.map(Number)
  if (m >= 60 || s >= 60) return null
  let v = d + m / 60 + s / 3600
  if (v > (isLat ? 90 : 180)) return null
  if (hemi === 'S' || hemi === 'O' || hemi === 'W' || t.startsWith('-')) v = -v
  return v
}

/**
 * Verso la boa: { distM, brg, vmg, etaMs }. VMG = velocità sul fondo
 * proiettata sulla direzione della boa; negativa se ci si allontana. Senza
 * rotta sul fondo (barca ferma) vmg è null. etaMs solo con VMG utile.
 */
export function raceStats(geo, mark) {
  if (!mark || geo.lat == null) return null
  const distM = haversine(geo.lat, geo.lon, mark.lat, mark.lon)
  const brg = bearing(geo.lat, geo.lon, mark.lat, mark.lon)
  const vmg = geo.sog != null && geo.cog != null ? geo.sog * Math.cos(((geo.cog - brg) * Math.PI) / 180) : null
  const etaMs = vmg != null && vmg > 0.2 ? (distM / 1852 / vmg) * 3600 * 1000 : null
  return { distM, brg, vmg, etaMs }
}
