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
const tiles = new Map() // "z/x/y" -> Promise<{ ocean, ring: [lat, lon][] }[]>

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

// Anche per scaricare la costa lungo una rotta (offlinePack.js)
export function loadTile(z, x, y) {
  const key = `${z}/${x}/${y}`
  if (!tiles.has(key)) {
    const p = tileTemplate()
      .then((tpl) => fetch(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y)))
      .then((r) => {
        if (!r.ok) throw new Error(`OpenFreeMap ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => {
        const layers = new VectorTile(new Pbf(new Uint8Array(buf))).layers
        const rings = (f) => {
          const g = f.toGeoJSON(x, y, z).geometry
          const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
          return polys.flat().map((ring) => ring.map(([lon, lat]) => [lat, lon]))
        }
        // Acqua; spiagge e porti (solo nei tasselli z14) per la fascia costiera
        const tile = { water: [], beaches: [], harbors: [] }
        const each = (name, fn) => {
          const l = layers[name]
          if (l) for (let i = 0; i < l.length; i++) fn(l.feature(i))
        }
        each('water', (f) => {
          const ocean = f.properties.class === 'ocean'
          for (const ring of rings(f)) tile.water.push({ ocean, ring })
        })
        each('landcover', (f) => {
          if (f.properties.subclass === 'beach') tile.beaches.push(...rings(f))
        })
        each('poi', (f) => {
          if (f.properties.class !== 'harbor') return
          const [lon, lat] = f.toGeoJSON(x, y, z).geometry.coordinates
          tile.harbors.push([lat, lon])
        })
        return tile
      })
    p.catch(() => tiles.delete(key))
    tiles.set(key, p)
  }
  return tiles.get(key)
}

const ringCache = new Map() // ultimi insiemi di anelli, per chiave di tasselli

const tileX = (lon, n) => Math.floor(((lon + 180) / 360) * n)
const tileY = (lat, n) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
}

/**
 * Anelli dei poligoni d'acqua che coprono `bounds` (L.LatLngBounds), al
 * dettaglio adatto allo zoom della mappa. Gli anelli di tasselli vicini si
 * sovrappongono un po' (buffer): vanno riempiti con la regola nonzero.
 * Con `oceanOnly` solo il mare (senza laghi, stagni e fiumi).
 * Risolve null se servirebbero troppi tasselli.
 */
export async function waterRings(bounds, mapZoom, { oceanOnly = false } = {}) {
  // Tasselli da 512 px: un livello sotto lo zoom della mappa
  const z = Math.max(0, Math.min(MAX_TILE_ZOOM, Math.round(mapZoom) - 1))
  const n = 2 ** z
  const x0 = tileX(bounds.getWest(), n)
  const x1 = tileX(bounds.getEast(), n)
  const y0 = tileY(bounds.getNorth(), n)
  const y1 = tileY(bounds.getSouth(), n)
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) return null
  // Stessi tasselli → stesso array: chi disegna può saltare il ridisegno
  const key = `${z}/${x0}-${x1}/${y0}-${y1}/${oceanOnly ? 'o' : 'a'}`
  const hit = ringCache.get(key)
  if (hit) return hit
  const jobs = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(loadTile(z, x, y))
  const rings = (await Promise.all(jobs))
    .flatMap((t) => t.water)
    .filter((r) => !oceanOnly || r.ocean)
    .map((r) => r.ring)
  ringCache.set(key, rings)
  if (ringCache.size > 8) ringCache.delete(ringCache.keys().next().value)
  return rings
}

/**
 * Mare, spiagge (anelli) e porti/marine (punti) che coprono `bounds`, dai
 * tasselli z14: gli unici con spiagge e porti. Null se servono più di
 * maxTiles tasselli.
 */
export async function coastFeatures(bounds, maxTiles = 36) {
  const z = MAX_TILE_ZOOM
  const n = 2 ** z
  const x0 = tileX(bounds.getWest(), n)
  const x1 = tileX(bounds.getEast(), n)
  const y0 = tileY(bounds.getNorth(), n)
  const y1 = tileY(bounds.getSouth(), n)
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > maxTiles) return null
  const jobs = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(loadTile(z, x, y))
  const loaded = await Promise.all(jobs)
  return {
    sea: loaded.flatMap((t) => t.water.filter((r) => r.ocean).map((r) => r.ring)),
    beaches: loaded.flatMap((t) => t.beaches),
    harbors: loaded.flatMap((t) => t.harbors),
  }
}
