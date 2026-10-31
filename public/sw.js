/*
 * TIMONE Service Worker — l'app e la carta anche senza rete.
 *
 * - Pagina (index.html): prima la rete, così ogni aggiornamento arriva subito
 *   (niente versioni vecchie bloccate come su Safari 15); senza rete la copia.
 * - File dell'app con hash nel nome (assets/): dalla copia, non cambiano mai.
 * - Carte raster viste navigando (Esri, OpenSeaMap, EMODnet): dalla copia,
 *   con un tetto di voci. Quelle scaricate per una rotta stanno in
 *   OFFLINE_CACHE, scritte dalla pagina e mai sfoltite qui.
 * - Dati geografici (costa OSM, griglie di profondità, isobate, aree e
 *   ordinanze): dalla copia se c'è, senza tetto (sono pochi e servono offline).
 * - Meteo Open-Meteo: prima la rete, l'ultima previsione resta per l'offline.
 */

const VERSION = 'v5'
const SHELL_CACHE = `timone-shell-${VERSION}`
const TILE_CACHE = 'timone-tiles'
const GEO_CACHE = 'timone-geo'
const METEO_CACHE = 'timone-meteo'
const OFFLINE_CACHE = 'timone-offline'
const KEEP = [SHELL_CACHE, TILE_CACHE, GEO_CACHE, METEO_CACHE, OFFLINE_CACHE]

const BASE = new URL('./', self.location).pathname

const TILE_HOSTS = [
  'server.arcgisonline.com',
  'tiles.openseamap.org',
  'tiles.emodnet-bathymetry.eu',
  'ows.emodnet-seabedhabitats.eu', // posidonia (immagini WMS)
  'services.data.shom.fr', // rilievo (immagini WMS)
]
// Dati: costa OSM, griglie di profondità (WCS), isobate e habitat (WFS).
// Le immagini WMS degli stessi server vanno con le carte
const GEO_HOSTS = ['tiles.openfreemap.org', 'ows.emodnet-bathymetry.eu', 'geoservizi.regione.liguria.it']
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

const trimming = {}
async function trimCache(name, max) {
  if (trimming[name]) return
  trimming[name] = true
  try {
    const cache = await caches.open(name)
    const keys = await cache.keys()
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
  } finally {
    trimming[name] = false
  }
}

const usable = (r) => r && (r.ok || r.type === 'opaque')

async function networkFirst(request, cacheName, { timeout, max, fallbackShell = false }) {
  const cache = await caches.open(cacheName)
  try {
    let response = await fetchWithTimeout(request, timeout)
    // Safari rifiuta le pagine arrivate dopo un reindirizzamento: copia pulita
    if (response.redirected) {
      response = new Response(await response.blob(), { status: response.status, statusText: response.statusText, headers: response.headers })
    }
    if (usable(response)) {
      cache.put(request, response.clone())
      if (max) trimCache(cacheName, max)
    }
    return response
  } catch (err) {
    const cached = await caches.match(request, { ignoreVary: true })
    if (cached) return cached
    if (fallbackShell) {
      const shell = (await caches.match(BASE)) || (await caches.match(`${BASE}index.html`))
      if (shell) return shell
      // Niente copia: ultima prova in rete senza tempo massimo
      return fetch(request)
    }
    throw err
  }
}

// Copia se c'è (in qualunque cache, comprese le rotte scaricate), sennò rete
async function cacheFirst(request, cacheName, { max, url = request.url } = {}) {
  const cached = await caches.match(url, { ignoreVary: true, ignoreSearch: false })
  if (cached) return cached
  // Carte richieste da <img>: si riscaricano in CORS per salvarle leggibili
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' }).catch(() => fetch(request))
  if (usable(response)) {
    const cache = await caches.open(cacheName)
    cache.put(url, response.clone())
    if (max) trimCache(cacheName, max)
  }
  return response
}

// Qualunque errore del service worker: la richiesta va in rete come se non
// ci fosse, così l'app non resta mai bloccata
const safely = (event, promise) => event.respondWith(promise.catch(() => fetch(event.request)))

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate' || url.pathname === BASE || url.pathname.endsWith('/index.html')) {
      safely(event, networkFirst(request, SHELL_CACHE, { timeout: 6000, fallbackShell: true }))
    } else if (url.pathname.startsWith(`${BASE}assets/`) || url.pathname.startsWith(`${BASE}isobaths-hd/`)) {
      safely(event, cacheFirst(request, url.pathname.includes('/assets/') ? SHELL_CACHE : GEO_CACHE))
    } else if (url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest')) {
      // Aree protette e ordinanze si aggiornano: rete, poi copia
      safely(event, networkFirst(request, GEO_CACHE, { timeout: 6000 }))
    }
    return
  }

  if (TILE_HOSTS.includes(url.hostname) || (GEO_HOSTS.includes(url.hostname) && isWmsImage(url))) {
    safely(event, cacheFirst(request, TILE_CACHE, { max: TILE_MAX }))
    return
  }
  if (GEO_HOSTS.includes(url.hostname)) {
    // Il TileJSON di OpenFreeMap porta la versione dei dati: rete, poi copia
    if (url.hostname === 'tiles.openfreemap.org' && url.pathname === '/planet') {
      safely(event, networkFirst(request, GEO_CACHE, { timeout: 5000 }))
    } else {
      safely(event, cacheFirst(request, GEO_CACHE))
    }
    return
  }
  if (METEO_HOSTS.includes(url.hostname)) {
    safely(event, networkFirst(request, METEO_CACHE, { timeout: 8000, max: METEO_MAX }))
  }
})
