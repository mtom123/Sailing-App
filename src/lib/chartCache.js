/*
 * Carta TIMONE anche senza rete: tutto ciò che la carta MapLibre chiede
 * (stile, simboli, caratteri, tasselli della base Open Waters e i fondali
 * TIMONE dal file PMTiles su R2) passa dal protocollo timone:// e si salva
 * nell'archivio IndexedDB di tileStore.js.
 *
 * - Navigando: ogni risorsa vista si salva (tasselli nell'area 'chart', con
 *   tetto; stile, simboli e caratteri in 'geo', senza tetto).
 * - "Scarica zona offline" e le rotte (offlinePack.js) scaricano in blocco i
 *   tasselli della zona nell'area 'offline', mai sfoltita.
 * - Senza rete si legge l'archivio; i fondali TIMONE di una versione vecchia
 *   della carta valgono finché non c'è rete per aggiornarli.
 *
 * Modulo leggero (niente MapLibre): lo usa anche offlinePack.js.
 */
import { PMTiles } from 'pmtiles'
import { setStoreMeta, storeAdopt, storeGet, storeMeta, storePut, storeTrim } from './tileStore.js'

export const CHART_PMTILES = 'https://carta.martinomotti.com/carta.pmtiles'
export const BASE_STYLE = 'https://tiles.openwaters.io/seamap/style.json'
export const SCHEME = 'timone://'
const CARTA = 'timone-carta' // chiave dei fondali TIMONE: timone-carta/z/x/y
const CHART_AREA = 'chart'
const CHART_MAX = 8000 // tasselli visti navigando (le zone scaricate non contano)
const TILE_MAX_AGE = 30 * 86400000 // tasselli della base più vecchi: si riprovano in rete
const NET_TIMEOUT_MS = 6000

const pmtiles = new PMTiles(CHART_PMTILES)

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false
function withTimeout(promise, ms, controller) {
  let t
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      t = setTimeout(() => {
        controller?.abort()
        reject(new Error('tempo scaduto'))
      }, ms)
    }),
  ]).finally(() => clearTimeout(t))
}

// ----------------------------------------------------- versione della carta

let headerPromise = null
/** { version, minzoom, maxzoom, bounds, attribution }: dalla rete, sennò l'ultima nota */
export function chartInfo() {
  if (!headerPromise) {
    headerPromise = (async () => {
      try {
        if (!online()) throw new Error('offline')
        const [h, md] = await withTimeout(Promise.all([pmtiles.getHeader(), pmtiles.getMetadata()]), NET_TIMEOUT_MS)
        const info = {
          version: h.etag || md?.version || '',
          minzoom: h.minZoom,
          maxzoom: h.maxZoom,
          bounds: [h.minLon, h.minLat, h.maxLon, h.maxLat],
          attribution: md?.attribution || '',
        }
        setStoreMeta('carta-info', info).catch(() => {})
        return info
      } catch {
        const old = await storeMeta('carta-info').catch(() => null)
        if (old) return old
        headerPromise = null // senza rete e senza copia: si riprova la prossima volta
        throw new Error('carta TIMONE non disponibile')
      }
    })()
  }
  return headerPromise
}

// --------------------------------------------------------------- archivio

let puts = 0
async function save(key, blob, type, area, pack) {
  await storePut(key, blob, type, area, pack)
  if (area === CHART_AREA && ++puts % 200 === 0) storeTrim(CHART_AREA, CHART_MAX).catch(() => {})
}

/**
 * Risorsa per URL (o chiave dei fondali TIMONE) come ArrayBuffer.
 * kind: 'tile' (prima l'archivio), 'doc' (prima la rete: stile, TileJSON).
 * Ritorna null se non c'è né in rete né in archivio (tassello vuoto).
 */
async function resource(key, kind, signal) {
  const entry = await storeGet(key).catch(() => null)
  const carta = key.startsWith(`${CARTA}/`)
  const version = carta ? (await chartInfo().catch(() => null))?.version : null
  if (entry && kind !== 'doc' && online()) {
    const fresh = carta ? entry.type === `carta;${version}` : Date.now() - entry.at < TILE_MAX_AGE
    if (fresh) return entry.blob.arrayBuffer()
  }
  if (entry && !online()) return entry.blob.arrayBuffer()
  try {
    const buf = await fetchNet(key, signal)
    if (buf) {
      const area = kind === 'tile' ? CHART_AREA : 'geo'
      save(key, new Blob([buf]), carta ? `carta;${version}` : kind === 'doc' ? 'application/json' : 'application/octet-stream', area).catch(() => {})
    }
    return buf
  } catch (err) {
    if (entry) return entry.blob.arrayBuffer() // rete giù o lenta: la copia
    if (signal?.aborted) throw err
    return null
  }
}

async function fetchNet(key, signal) {
  if (!online()) throw new Error('offline')
  if (key.startsWith(`${CARTA}/`)) {
    const [z, x, y] = key.slice(CARTA.length + 1).split('/').map(Number)
    const r = await pmtiles.getZxy(z, x, y, signal)
    return r ? r.data : new ArrayBuffer(0) // fuori carta: tassello vuoto, ma noto
  }
  const controller = new AbortController()
  signal?.addEventListener('abort', () => controller.abort())
  const res = await withTimeout(fetch(key, { signal: controller.signal, credentials: 'omit' }), NET_TIMEOUT_MS, controller)
  if (res.status === 404 || res.status === 204) return new ArrayBuffer(0)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.arrayBuffer()
}

// ---------------------------------------------------- protocollo di MapLibre

// Simboli e caratteri: pochi file, servono sempre, mai sfoltiti
const isAsset = (key) => /\/sprites\/|\/fonts\//.test(key)
/**
 * Indirizzo vero dalla richiesta di MapLibre: per i simboli MapLibre analizza
 * timone://https://… come indirizzo e perde i due punti ("https//"); i
 * caratteri arrivano con gli spazi nel nome
 */
export const chartKey = (url) => url.slice(SCHEME.length).replace(/^(https?)\/\/(?!\/)/, '$1://').replace(/ /g, '%20')

/** addProtocol('timone', chartProtocol): risponde a ogni richiesta della carta */
export async function chartProtocol(params, abortController) {
  const key = chartKey(params.url)
  const doc = params.type === 'json' && !/\.pbf($|\?)/.test(key) && !isAsset(key)
  const buf = await resource(key, doc ? 'doc' : isAsset(key) ? 'asset' : 'tile', abortController?.signal)
  if (buf == null) {
    if (params.type === 'json' || params.type === 'image') throw new Error(`non disponibile: ${key}`)
    return { data: new ArrayBuffer(0) } // tassello mancante offline: vuoto
  }
  if (params.type === 'json') return { data: JSON.parse(new TextDecoder().decode(buf)) }
  if (params.type === 'string') return { data: new TextDecoder().decode(buf) }
  return { data: buf }
}

// ------------------------------------------------------------------ stile

const wrap = (url) => (url.startsWith(SCHEME) ? url : SCHEME + url)
async function docJson(url) {
  const buf = await resource(url, 'doc')
  if (!buf) throw new Error(`non disponibile: ${url}`)
  return JSON.parse(new TextDecoder().decode(buf))
}

/**
 * Stile della base Open Waters con ogni indirizzo riscritto su timone://, i
 * TileJSON già risolti (così anche i tasselli passano dall'archivio) e la
 * sorgente dei fondali TIMONE. Funziona offline se è già stato salvato.
 */
export async function chartStyle() {
  const style = await docJson(BASE_STYLE)
  const lost = new Set()
  for (const [id, src] of Object.entries(style.sources)) {
    if (src.url) {
      const tj = await docJson(src.url).catch(() => null)
      if (!tj?.tiles?.length) {
        // TileJSON mai salvato e niente rete: via la sorgente e i suoi strati
        lost.add(id)
        delete style.sources[id]
        continue
      }
      src.tiles = tj.tiles
      for (const k of ['minzoom', 'maxzoom', 'bounds', 'attribution', 'tileSize', 'encoding']) if (tj[k] != null && src[k] == null) src[k] = tj[k]
      delete src.url
    }
    if (src.tiles) src.tiles = src.tiles.map(wrap)
  }
  if (lost.size) style.layers = style.layers.filter((l) => !lost.has(l.source))
  if (Array.isArray(style.sprite)) style.sprite = style.sprite.map((s) => ({ ...s, url: wrap(s.url) }))
  else if (style.sprite) style.sprite = wrap(style.sprite)
  if (style.glyphs) style.glyphs = wrap(style.glyphs)
  return style
}

/** Sorgente vettoriale dei fondali TIMONE per lo stile */
export async function cartaSource() {
  const info = await chartInfo()
  return {
    type: 'vector',
    tiles: [`${SCHEME}${CARTA}/{z}/{x}/{y}`],
    minzoom: info.minzoom ?? 5,
    maxzoom: info.maxzoom ?? 14,
    bounds: info.bounds,
    attribution: info.attribution || '',
  }
}

// ------------------------------------------------------- per le rotte

/** Tassello dei fondali TIMONE (vettoriale, già decompresso): ArrayBuffer o null */
export function cartaTile(z, x, y) {
  return resource(`${CARTA}/${z}/${x}/${y}`, 'tile')
}

let seamapSource = null
/**
 * Tassello dei segnali Open Waters (scogli, relitti, ostruzioni):
 * { data: ArrayBuffer, z, x, y } (oltre lo zoom massimo della sorgente, il
 * tassello padre che lo contiene) o null
 */
export async function seamapTile(z, x, y) {
  if (!seamapSource) {
    seamapSource = chartStyle()
      .then((style) => {
        const src = style.sources.seamap
        return src?.tiles?.[0] ? { url: src.tiles[0].slice(SCHEME.length), maxzoom: src.maxzoom ?? 14 } : null
      })
      .catch(() => {
        seamapSource = null
        return null
      })
  }
  const src = await seamapSource
  if (!src) return null
  // oltre il suo zoom massimo la sorgente non ha tasselli: si legge il padre
  const dz = Math.max(0, z - src.maxzoom)
  const t = { z: z - dz, x: x >> dz, y: y >> dz }
  const data = await resource(src.url.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y), 'tile')
  return data ? { data, ...t } : null
}

// ------------------------------------------------- scaricamento delle zone

// Sorgenti vettoriali della base che la carta disegna (gli strati nascosti di
// Open Waters, come i suoi fondali, non servono); il rilievo della terra no
const OFFLINE_SOURCES = ['versatiles-shortbread', 'seamap']
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic', 'Noto Sans Medium Italic', 'Noto Sans SemiBold']

/**
 * Lavori per scaricare la carta TIMONE di una zona: tiles(z) → [{x, y, z}]
 * (tasselli 256 px allo zoom z di Leaflet), zMax lo zoom più alto da
 * scaricare. Ogni lavoro ritorna i byte scaricati (0 se c'era già).
 */
export async function chartDownloadJobs(tiles, zMax, pack, signal) {
  const style = await chartStyle()
  const templates = []
  for (const id of OFFLINE_SOURCES) {
    const src = style.sources[id]
    if (src?.tiles?.[0]) templates.push({ url: src.tiles[0], max: src.maxzoom ?? 14 })
  }
  const info = await chartInfo()
  templates.push({ url: `${SCHEME}${CARTA}/{z}/{x}/{y}`, min: info.minzoom ?? 5, max: info.maxzoom ?? 14 })
  // MapLibre allo zoom Z di Leaflet usa tasselli da 512 px dello zoom Z − 1,
  // cioè proprio la griglia dei tasselli da 512 px di Leaflet allo zoom Z
  const keys = new Set()
  for (const { url, min = 0, max } of templates) {
    for (let z = 7; z <= Math.min(max, zMax - 1); z++) {
      if (z < min) continue
      for (const t of tiles(z + 1, 512)) keys.add(url.replace('{z}', z).replace('{x}', t.x).replace('{y}', t.y).slice(SCHEME.length))
    }
  }
  // stile, TileJSON, simboli e caratteri: pochi file, sempre
  const docs = [BASE_STYLE]
  for (const s of Array.isArray(style.sprite) ? style.sprite : [{ url: style.sprite }]) {
    if (!s.url) continue
    const base = s.url.slice(SCHEME.length)
    for (const ext of ['.json', '.png', '@2x.json', '@2x.png']) docs.push(base + ext)
  }
  if (style.glyphs) for (const f of FONTS) docs.push(style.glyphs.slice(SCHEME.length).replace('{fontstack}', encodeURIComponent(f)).replace('{range}', '0-255'))

  const job = (key, area) => async () => {
    if (await storeAdopt(key, pack)) return 0
    const buf = await fetchNet(key, signal)
    if (buf == null) return 0
    const carta = key.startsWith(`${CARTA}/`)
    await storePut(key, new Blob([buf]), carta ? `carta;${info.version}` : 'application/octet-stream', area, pack)
    return buf.byteLength
  }
  return [...docs.map((k) => job(k, 'offline')), ...[...keys].map((k) => job(k, 'offline'))]
}

/** Quanti tasselli della carta TIMONE scaricherebbe una zona (per la stima) */
export function chartTileCount(tiles, zMax) {
  let n = 0
  for (let z = 7; z <= Math.min(14, zMax - 1); z++) n += tiles(z + 1, 512).length
  return n * (OFFLINE_SOURCES.length + 1)
}
