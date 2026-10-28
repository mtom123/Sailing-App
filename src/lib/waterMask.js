/**
 * Poligoni dell'acqua (mare, lagune, laghi) da OpenStreetMap, via i tasselli
 * vettoriali di OpenFreeMap (gratuiti, senza chiave). Servono da maschera:
 * le isobate EMODnet (celle da ~115 m) sulle coste ripide finirebbero sugli
 * scogli; la costa OSM è disegnata al metro.
 */
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet'
const MAX_TILE_ZOOM = 14 // massimo dettaglio dei tasselli OpenMapTiles
const MAX_TILES = 24

let templatePromise = null
const tiles = new Map() // "z/x/y" -> Promise<rings [lat, lon][][]>

// L'URL dei tasselli contiene la versione dei dati: si legge dal TileJSON
function tileTemplate() {
  if (!templatePromise) {
    templatePromise = fetch(TILEJSON_URL)
      .then((r) => r.json())
      .then((j) => j.tiles[0])
    templatePromise.catch(() => (templatePromise = null))
  }
  return templatePromise
}

function loadTile(z, x, y) {
  const key = `${z}/${x}/${y}`
  if (!tiles.has(key)) {
    const p = tileTemplate()
      .then((tpl) => fetch(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)))
      .then((r) => {
        if (!r.ok) throw new Error(`OpenFreeMap ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        const water = new VectorTile(new Pbf(new Uint8Array(buf))).layers.water
        const rings = []
        if (!water) return rings
        for (let i = 0; i < water.length; i++) {
          const g = water.feature(i).toGeoJSON(x, y, z).geometry
          const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
          for (const poly of polys) for (const ring of poly) rings.push(ring.map(([lon, lat]) => [lat, lon]))
        }
        return rings
      })
    p.catch(() => tiles.delete(key))
    tiles.set(key, p)
  }
  return tiles.get(key)
}

const tileX = (lon, n) => Math.floor(((lon + 180) / 360) * n)
const tileY = (lat, n) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
}

/**
 * Anelli dei poligoni d'acqua che coprono `bounds` (L.LatLngBounds), al
 * dettaglio adatto allo zoom della mappa. Gli anelli di tasselli vicini si
 * sovrappongono un po' (buffer): vanno riempiti con la regola nonzero.
 * Risolve null se servirebbero troppi tasselli.
 */
export async function waterRings(bounds, mapZoom) {
  // Tasselli da 512 px: un livello sotto lo zoom della mappa
  const z = Math.max(0, Math.min(MAX_TILE_ZOOM, Math.round(mapZoom) - 1))
  const n = 2 ** z
  const x0 = tileX(bounds.getWest(), n)
  const x1 = tileX(bounds.getEast(), n)
  const y0 = tileY(bounds.getNorth(), n)
  const y1 = tileY(bounds.getSouth(), n)
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) return null
  const jobs = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(loadTile(z, x, y))
  return (await Promise.all(jobs)).flat()
}
