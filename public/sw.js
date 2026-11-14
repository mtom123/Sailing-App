/*
 * TIMONE Service Worker — l'app e la carta anche senza rete.
 *
 * - Pagina (index.html): prima la rete, così ogni aggiornamento arriva subito
 *   (niente versioni vecchie bloccate come su Safari 15); senza rete la copia.
 * - File dell'app con hash nel nome (assets/): dalla copia se risponde subito.
 * - Carte raster viste navigando (Esri, OpenSeaMap, EMODnet, rilievo Shom) e
 *   dati geografici (costa OSM, griglie di profondità, isobate): dalla copia
 *   nell'archivio IndexedDB "timone-store", non in Cache Storage (vedi sotto);
 *   le carte viste con un tetto di voci. Quelle scaricate per rotte e zone le
 *   scrive la pagina (offlinePack.js) e non si sfoltiscono.
 * - Aree protette, ordinanze, meteo: prima la rete, l'ultima copia in Cache
 *   Storage, dove restano solo pagina e poche voci.
 */

const VERSION = 'v6'
const SHELL_CACHE = `timone-shell-${VERSION}`
const TILE_CACHE = 'timone-tiles'
const GEO_CACHE = 'timone-geo'
const METEO_CACHE = 'timone-meteo'
// Rilievo Shom: tasselli grandi (512 px), in una cache tutta loro così le
// altre carte non li fanno uscire. La scrive anche imageWorker.js, che li
// scarica fuori dalla pagina
const SHOM_CACHE = 'timone-shom'
const SHOM_HOST = 'services.data.shom.fr'
const SHOM_MAX = 3000
const OFFLINE_CACHE = 'timone-offline'
const KEEP = [SHELL_CACHE, TILE_CACHE, GEO_CACHE, METEO_CACHE, OFFLINE_CACHE, SHOM_CACHE]

const BASE = new URL('./', self.location).pathname

const TILE_HOSTS = [
  'server.arcgisonline.com',
  'tiles.openseamap.org',
  'tiles.emodnet-bathymetry.eu',
  'ows.emodnet-seabedhabitats.eu', // posidonia (immagini WMS)
]
// Dati: costa OSM, griglie di profondità (WCS), isobate e habitat (WFS).
// Le immagini WMS degli stessi server vanno con le carte
const GEO_HOSTS = ['tiles.openfreemap.org', 'ows.emodnet-bathymetry.eu', 'geoservizi.regione.liguria.it']
// Temperatura e clorofilla: solo le immagini, l'elenco dei giorni va letto fresco
const SEA_HOST = 'wmts.marine.copernicus.eu'
const isSeaTile = (url) => url.hostname === SEA_HOST && url.searchParams.get('REQUEST') === 'GetTile'
const isWmsImage = (url) => /getmap/i.test(url.searchParams.get('request') || url.searchParams.get('REQUEST') || '')
const METEO_HOSTS = ['api.open-meteo.com', 'marine-api.open-meteo.com']

const TILE_MAX = 4000
const METEO_MAX = 120

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([BASE, `${BASE}manifest.webmanifest`]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  // Via le cache delle versioni precedenti (anche v2/v3), restano le nostre
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('timone-') && !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Rete con tempo massimo. La richiesta passa a fetch così com'è: su iPad
// (WebKit) ricostruirla con altre opzioni fa fallire le pagine ("navigate")
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    fetch(request).then(
      (r) => {
        clearTimeout(timer)
        resolve(r)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

// Cache aperte una volta sola (riaprirle a ogni tassello costa su iPad).
// Non quella delle rotte scaricate: la scrive la pagina e la si rilegge
const opened = {}
const openCache = (name) => (name === OFFLINE_CACHE ? caches.open(name) : (opened[name] ||= caches.open(name)))

// Tetto di voci: l'elenco completo (migliaia) si rilegge al massimo ogni
// due minuti, non a ogni tassello nuovo
const TRIM_EVERY_MS = 120000
const lastTrim = {}
async function trimCache(name, max) {
  const now = Date.now()
  if (now - (lastTrim[name] || 0) < TRIM_EVERY_MS) return
  lastTrim[name] = now
  const cache = await openCache(name)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

// ------------------------------------------------ archivio carte (IndexedDB)
// Carte e dati non stanno più in Cache Storage: sull'iPad il primo accesso
// dopo un avvio a freddo costava ~10 s e cresceva con le voci. Stesso schema
// di src/lib/tileStore.js (cambiare insieme). Voce: { url, area, at, type,
// blob, packs }; aree 'tiles' e 'shom' con tetto, 'geo' e 'offline' senza.
const STORE_DB = 'timone-store'
const STORE_VERSION = 1
let storeDbPromise = null
function storeDb() {
  if (!storeDbPromise) {
    storeDbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(STORE_DB, STORE_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('entries')) {
          const s = db.createObjectStore('entries', { keyPath: 'url' })
          s.createIndex('area_at', ['area', 'at'])
          s.createIndex('packs', 'packs', { multiEntry: true })
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('archivio bloccato'))
    })
    storeDbPromise.catch(() => {
      storeDbPromise = null
    })
  }
  return storeDbPromise
}
const idbDone = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

async function storeResponse(url) {
  const db = await storeDb()
  const rec = await idbDone(db.transaction('entries').objectStore('entries').get(url))
  return rec ? new Response(rec.blob, { headers: { 'Content-Type': rec.type || 'application/octet-stream' } }) : null
}

async function storeSave(url, response, area, max) {
  // Le risposte "opache" (senza CORS) non si possono leggere: non si salvano
  if (!response.ok || response.type === 'opaque') return
  const type = response.headers.get('Content-Type')
  const blob = await response.blob()
  const db = await storeDb()
  const tx = db.transaction('entries', 'readwrite')
  const store = tx.objectStore('entries')
  const old = await idbDone(store.get(url))
  store.put({ url, area: old?.area === 'offline' ? 'offline' : area, at: Date.now(), type: type || old?.type, blob, packs: old?.packs || [] })
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
  if (max) trimStore(area, max)
}

async function trimStore(area, max) {
  const now = Date.now()
  if (now - (lastTrim[area] || 0) < TRIM_EVERY_MS) return
  lastTrim[area] = now
  const db = await storeDb()
  const tx = db.transaction('entries', 'readwrite')
  const index = tx.objectStore('entries').index('area_at')
  const range = IDBKeyRange.bound([area, -Infinity], [area, Infinity])
  let extra = (await idbDone(index.count(range))) - max
  if (extra <= 0) return
  const req = index.openCursor(range) // dalle più vecchie
  req.onsuccess = () => {
    const cursor = req.result
    if (!cursor || extra-- <= 0) return
    cursor.delete()
    cursor.continue()
  }
}

// Finché le carte salvate prima non sono passate nel nuovo archivio (lo fa
// imageWorker.js, a carta ferma) si cercano anche nelle vecchie cache
let legacyDone = false
async function legacyMigrated() {
  if (legacyDone) return true
  try {
    const db = await storeDb()
    legacyDone = !!(await idbDone(db.transaction('meta').objectStore('meta').get('migrated')))?.value
  } catch {
    // archivio non leggibile: si guarda anche nelle vecchie cache
  }
  return legacyDone
}

const usable = (r) => r && (r.ok || r.type === 'opaque')

// Lavoro che finisce dopo la risposta (salvare la copia): il service worker
// resta acceso fino alla fine
function keepAlive(event, promise) {
  const done = promise.catch(() => {})
  try {
    event?.waitUntil(done)
  } catch {
    // evento già chiuso: si salva se c'è tempo
  }
}

// File dell'app (nome con hash, non cambiano): dalla copia se risponde
// subito; se l'archivio è lento (avvio a freddo) dalla rete, e la copia
// solo se la rete manca
const ASSET_WAIT_MS = 300
const SLOW = Symbol('slow')
async function shellAsset(request, event) {
  const cacheP = openCache(SHELL_CACHE)
  const hit = cacheP.then((cache) => cache.match(request.url, { ignoreVary: true })).catch(() => undefined)
  const first = await Promise.race([hit, new Promise((resolve) => setTimeout(() => resolve(SLOW), ASSET_WAIT_MS))])
  if (first && first !== SLOW) return first
  try {
    const response = await fetch(request)
    if (usable(response)) {
      const copy = response.clone()
      keepAlive(event, cacheP.then((cache) => cache.put(request, copy)))
    }
    return response
  } catch (err) {
    const cached = await hit
    if (cached) return cached
    throw err
  }
}

// Tempi dell'ultima apertura della pagina, chiesti dall'app per il registro
// "Tempi di apertura" (startLog.js)
let lastNav = null
const since = (t0) => Math.round(performance.now() - t0)

async function networkFirst(request, cacheName, { timeout, max, fallbackShell = false, timing = null, event = null }) {
  const t0 = performance.now()
  // L'archivio si apre intanto, senza aspettarlo: dopo un avvio a freddo il
  // primo accesso agli archivi costava all'iPad ~10 s (Tempi di apertura,
  // 8/11/2026: openMs 9816, rete 2 ms). Con la rete la pagina non lo aspetta
  const cacheP = openCache(cacheName)
  if (timing) cacheP.then(() => (timing.openMs = since(t0)), () => {})
  try {
    const t1 = performance.now()
    let response = await fetchWithTimeout(request, timeout)
    if (timing) {
      timing.netMs = since(t1)
      timing.net = 'ok'
    }
    // Safari rifiuta le pagine arrivate dopo un reindirizzamento: copia pulita
    if (response.redirected) {
      response = new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers })
    }
    if (usable(response)) {
      const copy = response.clone()
      keepAlive(
        event,
        cacheP
          .then((cache) => cache.put(request, copy))
          .then(() => max && trimCache(cacheName, max))
      )
    }
    return response
  } catch (err) {
    if (timing) timing.net = err?.message === 'timeout' ? 'timeout' : 'error'
    const t2 = performance.now()
    const cached = await caches.match(request, { ignoreVary: true })
    if (timing) timing.matchMs = since(t2)
    if (cached) return cached
    if (fallbackShell) {
      const shell = (await caches.match(BASE)) || (await caches.match(`${BASE}index.html`))
      if (timing) timing.matchMs = since(t2)
      if (shell) return shell
      // Niente copia: ultima prova in rete senza tempo massimo
      return fetch(request)
    }
    throw err
  }
}

// Tassello che manca e non può arrivare: trasparente, subito. Senza rete sull'iPad
// la carta smetteva di disegnarsi fino a un minuto, con il codice che girava e
// i tasselli che fallivano. Solo per le immagini della carta: lo scaricamento
// offline passa da fetch e deve vedere gli errori veri
const TILE_WAIT_MS = 8000
const BLANK_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0)
)
const blankTile = () => new Response(BLANK_PNG, { headers: { 'Content-Type': 'image/png' } })

// Copia se c'è (archivio IndexedDB; finché non è finito il trasferimento
// anche le vecchie cache), sennò rete e copia nell'archivio
const AREA = { [TILE_CACHE]: 'tiles', [SHOM_CACHE]: 'shom', [GEO_CACHE]: 'geo' }
// Le vecchie cache dopo un avvio a freddo rispondono in ~10 s sull'iPad: con la
// rete non si aspettano oltre questo, e il tassello arriva dalla rete
const LEGACY_WAIT_MS = 300

async function legacyLookup(url, cacheName) {
  const lookIn = cacheName === SHOM_CACHE ? [OFFLINE_CACHE, SHOM_CACHE, TILE_CACHE] : [OFFLINE_CACHE, cacheName]
  for (const name of lookIn) {
    const cached = await (await openCache(name)).match(url, { ignoreVary: true }).catch(() => null)
    if (cached) return cached
  }
  return null
}

async function cacheFirst(request, cacheName, { max, url = request.url, event = null } = {}) {
  const area = AREA[cacheName]
  const stored = await storeResponse(url).catch(() => null)
  if (stored) return stored
  const offline = self.navigator.onLine === false
  const legacy = (await legacyMigrated()) ? null : legacyLookup(url, cacheName).catch(() => null)
  if (legacy) {
    const first = offline ? await legacy : await Promise.race([legacy, new Promise((resolve) => setTimeout(() => resolve(SLOW), LEGACY_WAIT_MS))])
    if (first && first !== SLOW) return first
  }
  const mapImage = cacheName === TILE_CACHE && request.destination === 'image'
  // Senza rete un tassello che manca è trasparente, subito: sull'iPad la carta
  // smetteva di disegnarsi aspettando richieste che non potevano arrivare
  if (mapImage && offline) return blankTile()
  // Carte richieste da <img>: si riscaricano in CORS per salvarle leggibili
  const fresh = fetch(url, { mode: 'cors', credentials: 'omit' })
    .catch(() => fetch(request))
    .then((response) => {
      if (usable(response)) keepAlive(event, storeSave(url, response.clone(), area, max))
      return response
    })
  // Rete mancata: la vecchia copia se c'è (anche lenta), sennò per le immagini
  // un tassello trasparente. Con la rete non si dà mai il tassello vuoto prima
  // del tempo: Leaflet non lo richiederebbe più (buchi a blocchi, 8/11/2026)
  return fresh.catch(async (err) => {
    const old = legacy && (await legacy)
    if (old) return old
    if (mapImage) return blankTile()
    throw err
  })
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'nav-timing') event.ports?.[0]?.postMessage(lastNav)
})

// Qualunque errore del service worker: la richiesta va in rete come se non
// ci fosse, così l'app non resta mai bloccata
const safely = (event, promise) => event.respondWith(promise.catch(() => fetch(event.request)))

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate' || url.pathname === BASE || url.pathname.endsWith('/index.html')) {
      // swUpMs: da quanto era acceso il service worker (pochi ms = appena avviato da iOS)
      lastNav = { at: Date.now(), swUpMs: Math.round(performance.now()) }
      safely(event, networkFirst(request, SHELL_CACHE, { timeout: 6000, fallbackShell: true, timing: lastNav, event }))
    } else if (url.pathname.startsWith(`${BASE}assets/`)) {
      safely(event, shellAsset(request, event))
    } else if (url.pathname.startsWith(`${BASE}isobaths-hd/`) || url.pathname.startsWith(`${BASE}isobaths-baleari/`)) {
      // Isobate di dettaglio pubblicate con l'app (Shom, Baleari): non cambiano
      safely(event, cacheFirst(request, GEO_CACHE, { event }))
    } else if (url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest')) {
      // Aree protette e ordinanze si aggiornano: rete, poi copia
      safely(event, networkFirst(request, GEO_CACHE, { timeout: 6000, event }))
    }
    return
  }

  if (url.hostname === SHOM_HOST) {
    safely(event, cacheFirst(request, SHOM_CACHE, { max: SHOM_MAX, event }))
    return
  }
  if (TILE_HOSTS.includes(url.hostname) || isSeaTile(url) || (GEO_HOSTS.includes(url.hostname) && isWmsImage(url))) {
    safely(event, cacheFirst(request, TILE_CACHE, { max: TILE_MAX, event }))
    return
  }
  if (GEO_HOSTS.includes(url.hostname)) {
    // Il TileJSON di OpenFreeMap porta la versione dei dati: rete, poi copia
    if (url.hostname === 'tiles.openfreemap.org' && url.pathname === '/planet') {
      safely(event, networkFirst(request, GEO_CACHE, { timeout: 5000, event }))
    } else {
      safely(event, cacheFirst(request, GEO_CACHE, { event }))
    }
    return
  }
  if (METEO_HOSTS.includes(url.hostname)) {
    safely(event, networkFirst(request, METEO_CACHE, { timeout: 8000, max: METEO_MAX, event }))
  }
})
