import L from 'leaflet'
import { haversine } from './geo.js'
import { loadBlock, blockIndex } from './depthGrid.js'
import { SHOM_SOURCE, HD_BASE } from './hdIsobathLayer.js'
import { LIGURIA_ISOBATH_SOURCE } from './liguriaIsobaths.js'
import { loadTile as loadWaterTile } from './waterMask.js'

/*
 * Carta per l'offline lungo una rotta (una fascia attorno ai tratti) o in
 * una zona disegnata col rettangolo, con
 * segnalamenti (OpenSeaMap), batimetria e isobate EMODnet, griglie di
 * profondità, costa OSM (che offline disegna anche la terra), isobate di
 * dettaglio Shom e Regione Liguria, aree protette e ordinanze.
 *
 * Le carte raster si salvano qui in OFFLINE_CACHE (mai sfoltita dal service
 * worker); i dati passano dai loro caricatori e il service worker li salva
 * nella sua cache dei dati. La carta di base Esri non si scarica in blocco
 * (le condizioni d'uso non lo permettono): offline la sostituisce la terra
 * dalla costa OSM, e restano le zone già viste navigando.
 */

const OFFLINE_CACHE = 'timone-offline'
const META_KEY = 'timone.offline'
const BUFFER_M = 1852 // un miglio per lato
const NEAR_M = 926 // al massimo dettaglio dei segnalamenti, mezzo miglio
const PARALLEL = 6
const rad = Math.PI / 180

// Tasselli raster dalla mappa (URL e parametri come quando si naviga)
let mapLayers = {}
export function setOfflineLayers(layers) {
  mapLayers = { ...mapLayers, ...layers }
}

const tileX = (lon, n) => Math.floor(((lon + 180) / 360) * n)
const tileY = (lat, n) => {
  const r = lat * rad
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)
}

// Punti lungo i tratti ogni `stepM` metri
function samples(points, stepM) {
  const out = []
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]
    const b = points[k]
    const steps = Math.max(1, Math.ceil(haversine(a.lat, a.lon, b.lat, b.lon) / stepM))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t })
    }
  }
  return out
}

const around = (p, m) => {
  const dLat = m / 111320
  const dLon = m / (111320 * Math.cos(p.lat * rad))
  return L.latLngBounds([p.lat - dLat, p.lon - dLon], [p.lat + dLat, p.lon + dLon])
}

/** Tasselli {x, y, z} entro `bufM` dai tratti, a zoom z (tasselli da tileSize px) */
export function corridorTiles(points, z, bufM, tileSize = 256) {
  const n = (2 ** z * 256) / tileSize
  const tileM = (40075016 * Math.cos(points[0].lat * rad)) / n
  const out = new Map()
  for (const p of samples(points, Math.max(50, Math.min(bufM, tileM / 2)))) {
    const b = around(p, bufM)
    for (let x = tileX(b.getWest(), n); x <= tileX(b.getEast(), n); x++) {
      for (let y = tileY(b.getNorth(), n); y <= tileY(b.getSouth(), n); y++) out.set(`${x}/${y}`, { x, y, z })
    }
  }
  return [...out.values()]
}

/** Tasselli {x, y, z} che coprono un rettangolo */
function boundsTiles(b, z, tileSize = 256) {
  const n = (2 ** z * 256) / tileSize
  const out = []
  for (let x = tileX(b.getWest(), n); x <= tileX(b.getEast(), n); x++) {
    for (let y = tileY(b.getNorth(), n); y <= tileY(b.getSouth(), n); y++) out.push({ x, y, z })
  }
  return out
}

// Un rettangolo in pezzi da `step` gradi (le fonti a blocchi ne vogliono di piccoli)
function splitBounds(b, step) {
  const out = []
  for (let lat = b.getSouth(); lat < b.getNorth(); lat += step) {
    for (let lon = b.getWest(); lon < b.getEast(); lon += step) {
      out.push(L.latLngBounds([lat, lon], [Math.min(lat + step, b.getNorth()), Math.min(lon + step, b.getEast())]))
    }
  }
  return out
}

const routeKey = (points) => points.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';')

/*
 * Piano di scaricamento: tiles(z, bufM, tileSize) → tasselli; views →
 * riquadri piccoli per le fonti a blocchi (griglie, isobate di dettaglio).
 */
function routePlan(points) {
  return {
    key: routeKey(points),
    tiles: (z, bufM, tileSize) => corridorTiles(points, z, bufM, tileSize),
    views: samples(points, 1000).map((p) => around(p, BUFFER_M)),
  }
}

function areaPlan(bounds) {
  return {
    key: `area:${bounds.toBBoxString()}`,
    tiles: (z, bufM, tileSize) => boundsTiles(bounds, z, tileSize),
    views: splitBounds(bounds, 0.05),
  }
}

function readMeta() {
  try {
    return JSON.parse(localStorage.getItem(META_KEY)) || {}
  } catch {
    return {}
  }
}

export const OFFLINE_EVENT = 'timone-offline' // sulla window, a ogni nuovo scaricamento

/**
 * Zone già scaricate, per mostrarle sulla carta: { kind: 'route', points,
 * bufferM } (fascia attorno ai tratti) o { kind: 'area', bounds }
 */
export function offlineZones() {
  const zones = []
  for (const key of Object.keys(readMeta())) {
    if (key.startsWith('area:')) {
      const [w, so, e, n] = key.slice(5).split(',').map(Number)
      if ([w, so, e, n].every(Number.isFinite)) zones.push({ kind: 'area', bounds: L.latLngBounds([so, w], [n, e]) })
    } else {
      const points = key.split(';').map((p) => {
        const [lat, lon] = p.split(',').map(Number)
        return { lat, lon }
      })
      if (points.length >= 2 && points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))) {
        zones.push({ kind: 'route', points, bufferM: BUFFER_M })
      }
    }
  }
  return zones
}

/** Scaricamento già fatto per questa rotta: { at, bytes, items, failed } o null */
export function offlineInfo(points) {
  return points.length >= 2 ? readMeta()[routeKey(points)] || null : null
}

// URL dei tasselli raster del piano, per ogni strato presente sulla carta
function rasterUrls(plan) {
  const urls = []
  const { seamarks, bathy, isobathsWms } = mapLayers
  const template = (layer, t) => L.Util.template(layer._url, { ...layer.options, ...t, s: 'a', r: '' })
  if (seamarks) {
    for (let z = 10; z <= 16; z++) {
      for (const t of plan.tiles(z, z === 16 ? NEAR_M : BUFFER_M)) urls.push(template(seamarks, t))
    }
  }
  if (bathy) {
    for (let z = 8; z <= 13; z++) for (const t of plan.tiles(z, BUFFER_M)) urls.push(template(bathy, t))
  }
  // WMS: l'URL (con il riquadro) lo calcola lo strato, se è sulla carta
  if (isobathsWms?._map) {
    for (let z = 9; z <= 11; z++) {
      for (const t of plan.tiles(z, BUFFER_M, 512)) {
        const c = L.point(t.x, t.y)
        c.z = z
        urls.push(isobathsWms.getTileUrl(c))
      }
    }
  }
  return urls
}

// Caricamenti dei dati: costa, griglie, isobate di dettaglio, aree e ordinanze
async function dataJobs(plan) {
  const jobs = []
  for (let z = 8; z <= 14; z++) {
    for (const t of plan.tiles(z, BUFFER_M)) jobs.push(() => loadWaterTile(t.z, t.x, t.y))
  }
  const blocks = new Map()
  const shom = new Set()
  const liguria = new Set()
  for (const view of plan.views) {
    for (let bx = blockIndex(view.getWest()); bx <= blockIndex(view.getEast()); bx++) {
      for (let by = blockIndex(view.getSouth()); by <= blockIndex(view.getNorth()); by++) blocks.set(`${bx},${by}`, [bx, by])
    }
  }
  // Le isobate di dettaglio bastano a passi di ~3 km
  for (let i = 0; i < plan.views.length; i += plan.views.length > 50 ? 3 : 1) {
    const view = plan.views[i]
    for (const name of await SHOM_SOURCE.names(view)) shom.add(name)
    for (const name of await LIGURIA_ISOBATH_SOURCE.names(view)) liguria.add(name)
  }
  for (const [bx, by] of blocks.values()) jobs.push(() => loadBlock(bx, by))
  for (const name of shom) {
    jobs.push(() => SHOM_SOURCE.load(name))
    jobs.push(() => fetch(`${HD_BASE}${name}.bin`).then((r) => r.arrayBuffer()))
  }
  for (const name of liguria) jobs.push(() => LIGURIA_ISOBATH_SOURCE.load(name))

  const base = import.meta.env.BASE_URL
  jobs.push(() => fetch(`${base}protected-areas.json`).then((r) => r.json()))
  jobs.push(() => fetch(`${base}ordinances.json`).then((r) => r.json()))
  return jobs
}

async function downloadPlan(plan, { onProgress = () => {}, signal } = {}) {
  navigator.storage?.persist?.().catch(() => {}) // Safari: non cancellare i dati da solo
  const cache = await caches.open(OFFLINE_CACHE)
  const urls = [...new Set(rasterUrls(plan))]
  const jobs = [
    ...urls.map((url) => async () => {
      if (await caches.match(url)) return 0
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal })
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()
      await cache.put(url, new Response(blob, { headers: { 'Content-Type': res.headers.get('Content-Type') || 'image/png' } }))
      return blob.size
    }),
    ...(await dataJobs(plan)),
  ]

  const state = { done: 0, total: jobs.length, bytes: 0, failed: 0 }
  onProgress({ ...state })
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      if (signal?.aborted) return
      const job = jobs[next++]
      try {
        const size = await job()
        if (typeof size === 'number') state.bytes += size
      } catch {
        if (signal?.aborted) return
        state.failed++
      }
      state.done++
      onProgress({ ...state })
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  if (signal?.aborted) throw new DOMException('Annullato', 'AbortError')

  const summary = { at: Date.now(), bytes: state.bytes, items: state.total, failed: state.failed }
  const meta = readMeta()
  meta[plan.key] = summary
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // spazio pieno: il riepilogo si perde, i dati restano
  }
  window.dispatchEvent(new Event(OFFLINE_EVENT))
  return summary
}

/**
 * Scarica la fascia attorno alla rotta. onProgress({ done, total, bytes,
 * failed }); `signal` per annullare. Ritorna il riepilogo salvato.
 */
export function downloadCorridor(points, opts) {
  if (points.length < 2) throw new Error('Servono almeno 2 punti')
  return downloadPlan(routePlan(points), opts)
}

/** Scarica la zona del rettangolo (L.LatLngBounds), come la fascia di una rotta */
export function downloadArea(bounds, opts) {
  return downloadPlan(areaPlan(bounds), opts)
}

// Media vista sulle rotte scaricate: pochi KB a tassello, più i dati
const AVG_TILE_BYTES = 4500
const AVG_DATA_BYTES = 60000

/**
 * Quanto pesa una zona prima di scaricarla: { tiles, mb, tooBig }. Oltre
 * MAX_TILES tasselli la zona è troppo grande per un iPad in mare.
 */
export const MAX_AREA_TILES = 12000
export function estimateArea(bounds) {
  const plan = areaPlan(bounds)
  let tiles = 0
  for (let z = 10; z <= 16; z++) tiles += plan.tiles(z, 0).length
  for (let z = 8; z <= 13; z++) tiles += plan.tiles(z, 0).length
  let data = 0
  for (let z = 8; z <= 14; z++) data += plan.tiles(z, 0).length
  const mb = (tiles * AVG_TILE_BYTES + data * AVG_DATA_BYTES) / 1e6
  return { tiles, mb, tooBig: tiles > MAX_AREA_TILES }
}

/** Spazio usato dall'app (MB) e disponibile, se il browser lo dice */
export async function storageUsage() {
  const est = await navigator.storage?.estimate?.().catch(() => null)
  return est ? { usedMb: est.usage / 1e6, quotaMb: est.quota / 1e6 } : null
}

/** Cancella tutte le carte scaricate per le rotte */
export async function clearOffline() {
  await caches.delete(OFFLINE_CACHE)
  localStorage.removeItem(META_KEY)
  window.dispatchEvent(new Event(OFFLINE_EVENT))
}
