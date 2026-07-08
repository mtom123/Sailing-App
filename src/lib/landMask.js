/**
 * Land Mask — point-in-polygon test contro la costa del Mediterranean.
 *
 * Usa un GeoJSON semplificato (114KB) di tutte le terre emerse del Med.
 * Ottimizzato con grid spatial index (1°×1°) per O(1) lookup.
 */

import medLandData from '../data/geo/mediterranean-land.json'

// Pre-estrai tutti i poligoni (flat list)
const allPolygons = []
for (const feat of medLandData.features) {
  const geom = feat.geometry
  if (geom.type === 'Polygon') {
    allPolygons.push(geom.coordinates)
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      allPolygons.push(poly)
    }
  }
}

// Bounding box globale
let globalBBox = null
for (const poly of allPolygons) {
  for (const ring of poly) {
    for (const [lon, lat] of ring) {
      if (!globalBBox) globalBBox = { minLon: lon, minLat: lat, maxLon: lon, maxLat: lat }
      if (lon < globalBBox.minLon) globalBBox.minLon = lon
      if (lon > globalBBox.maxLon) globalBBox.maxLon = lon
      if (lat < globalBBox.minLat) globalBBox.minLat = lat
      if (lat > globalBBox.maxLat) globalBBox.maxLat = lat
    }
  }
}

// BBox + grid index per ogni poligono
const GRID_SIZE = 1.0 // 1°x1° cells
const grid = new Map() // "lon,lat" -> [polyIdx, polyIdx, ...]

const polyBBoxes = allPolygons.map((poly, idx) => {
  const outer = poly[0]
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  for (const [lon, lat] of outer) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  // Register in grid
  const minCellX = Math.floor(minLon / GRID_SIZE)
  const maxCellX = Math.floor(maxLon / GRID_SIZE)
  const minCellY = Math.floor(minLat / GRID_SIZE)
  const maxCellY = Math.floor(maxLat / GRID_SIZE)
  for (let cx = minCellX; cx <= maxCellX; cx++) {
    for (let cy = minCellY; cy <= maxCellY; cy++) {
      const key = `${cx},${cy}`
      if (!grid.has(key)) grid.set(key, [])
      grid.get(key).push(idx)
    }
  }
  return { minLon, minLat, maxLon, maxLat, poly, idx }
})

function pointInPolygon(lon, lat, poly) {
  let inside = false
  for (const ring of poly) {
    let ringInside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      const intersect =
        yi > lat !== yj > lat &&
        lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
      if (intersect) ringInside = !ringInside
    }
    if (ringInside) inside = !inside
  }
  return inside
}

/**
 * Verifica se un punto è sulla terraferma.
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean}
 */
export function isLand(lat, lon) {
  if (
    lon < globalBBox.minLon ||
    lon > globalBBox.maxLon ||
    lat < globalBBox.minLat ||
    lat > globalBBox.maxLat
  ) {
    return false
  }
  // Grid lookup: O(1) per trovare candidate polygons
  const cellX = Math.floor(lon / GRID_SIZE)
  const cellY = Math.floor(lat / GRID_SIZE)
  const candidates = grid.get(`${cellX},${cellY}`)
  if (!candidates || !candidates.length) return false

  for (const polyIdx of candidates) {
    const { poly, minLon, minLat, maxLon, maxLat } = polyBBoxes[polyIdx]
    // Quick bbox reject
    if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue
    if (pointInPolygon(lon, lat, poly)) return true
  }
  return false
}

/**
 * Verifica se un segmento attraversa terra (per routing).
 */
export function crossesLand(lat1, lon1, lat2, lon2, samples = 4) {
  if (
    (lon1 < globalBBox.minLon || lon1 > globalBBox.maxLon || lat1 < globalBBox.minLat || lat1 > globalBBox.maxLat) &&
    (lon2 < globalBBox.minLon || lon2 > globalBBox.maxLon || lat2 < globalBBox.minLat || lat2 > globalBBox.maxLat)
  ) {
    return false
  }
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const lat = lat1 + (lat2 - lat1) * t
    const lon = lon1 + (lon2 - lon1) * t
    if (isLand(lat, lon)) return true
  }
  return false
}

// Cache LRU per isLand
const landCache = new Map()
const LAND_CACHE_MAX = 5000

export function isLandCached(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
  if (landCache.has(key)) return landCache.get(key)
  const result = isLand(lat, lon)
  if (landCache.size >= LAND_CACHE_MAX) {
    const it = landCache.keys()
    for (let i = 0; i < LAND_CACHE_MAX / 4; i++) landCache.delete(it.next().value)
  }
  landCache.set(key, result)
  return result
}

export const POLYGON_COUNT = allPolygons.length
export const GLOBAL_BBOX = globalBBox
export const GRID_CELL_SIZE = GRID_SIZE

export default { isLand, crossesLand, isLandCached, POLYGON_COUNT, GLOBAL_BBOX }
