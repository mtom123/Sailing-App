/*
 * Vento della griglia oraria (useGrib) a un istante: per le frecce del vento
 * quando il cursore del tempo non è su "ORA". Interpolato tra le due ore
 * vicine; la direzione per la via più corta (350° → 10° passa da 0°).
 */

export function windFieldAt(grib, ms) {
  if (!grib?.grid?.length) return null
  const out = []
  for (const g of grib.grid) {
    const times = g.times.map((t) => Date.parse(t))
    if (!times.length || ms < times[0] || ms > times[times.length - 1]) continue
    let i = times.findIndex((t) => t > ms) - 1
    if (i < 0) i = times.length - 2
    const f = Math.min(1, Math.max(0, (ms - times[i]) / (times[i + 1] - times[i] || 1)))
    const s0 = g.wind[i]
    const s1 = g.wind[i + 1] ?? s0
    const d0 = g.windDir[i]
    const d1 = g.windDir[i + 1] ?? d0
    if (s0 == null || d0 == null) continue
    const dd = ((d1 - d0 + 540) % 360) - 180
    out.push({ lat: g.lat, lon: g.lon, speed: s0 + (s1 - s0) * f, dir: (d0 + dd * f + 360) % 360 })
  }
  return out.length ? out : null
}
