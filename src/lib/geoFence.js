import { haversine } from './geo.js'

/*
 * Geofencing per aree marine protette: point-in-polygon (ray casting) e
 * distanza approssimata dal perimetro (minimo sui vertici).
 */

export function pointInPolygon(lat, lon, polygon) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lonI] = polygon[i]
    const [latJ, lonJ] = polygon[j]
    if (
      lonI > lon !== lonJ > lon &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI
    ) {
      inside = !inside
    }
  }
  return inside
}

export function distanceToPolygon(lat, lon, polygon) {
  let min = Infinity
  for (const [vLat, vLon] of polygon) {
    const d = haversine(lat, lon, vLat, vLon)
    if (d < min) min = d
  }
  return min
}

/**
 * Stato della barca rispetto a un'area: 'inside', 'near' (entro nearMeters)
 * o null.
 */
export function fenceStatus(lat, lon, polygon, nearMeters = 1852) {
  if (pointInPolygon(lat, lon, polygon)) return 'inside'
  if (distanceToPolygon(lat, lon, polygon) <= nearMeters) return 'near'
  return null
}
