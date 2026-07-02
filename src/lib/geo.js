const R_EARTH = 6371000 // metri

export const toRad = (d) => (d * Math.PI) / 180
export const toDeg = (r) => (r * 180) / Math.PI

// Distanza haversine in metri
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.sqrt(a))
}

// Rilevamento vero (0-360) dal punto 1 al punto 2
export function bearing(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const dλ = toRad(lon2 - lon1)
  const y = Math.sin(dλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// Sposta un punto di `meters` metri lungo `bearingDeg`
export function destination(lat, lon, bearingDeg, meters) {
  const δ = meters / R_EARTH
  const θ = toRad(bearingDeg)
  const φ1 = toRad(lat)
  const λ1 = toRad(lon)
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  )
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    )
  return { lat: toDeg(φ2), lon: ((toDeg(λ2) + 540) % 360) - 180 }
}

export const msToKnots = (ms) => ms * 1.94384
export const metersToNm = (m) => m / 1852

const CARDINALS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
]
export function cardinal(deg) {
  if (deg == null || Number.isNaN(deg)) return '--'
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}

// Verifica se un angolo cade in un settore [from, to] (gestisce il wrap a 360)
export function angleInSector(angle, from, to) {
  const a = ((angle % 360) + 360) % 360
  const f = ((from % 360) + 360) % 360
  const t = ((to % 360) + 360) % 360
  if (f <= t) return a >= f && a <= t
  return a >= f || a <= t
}

export function formatCoord(value, isLat) {
  if (value == null || Number.isNaN(value)) return '--'
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'O'
  const abs = Math.abs(value)
  const deg = Math.floor(abs)
  const min = (abs - deg) * 60
  return `${String(deg).padStart(isLat ? 2 : 3, '0')}°${min.toFixed(3).padStart(6, '0')}' ${hemi}`
}

export function formatDeg(deg) {
  if (deg == null || Number.isNaN(deg)) return '---'
  return String(Math.round(((deg % 360) + 360) % 360)).padStart(3, '0')
}
