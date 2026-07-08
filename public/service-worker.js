/*
 * TIMONE Service Worker
 * Strategia: Network-First con fallback su cache.
 * - Tasselli mappa (OpenSeaMap, CARTO, EMODnet, OSM): cache dedicata con limite
 *   di voci, così le zone già navigate restano consultabili offline.
 * - API Open-Meteo: cache dati, l'ultima previsione scaricata resta disponibile.
 * - Shell applicativa (HTML/JS/CSS): cache per avvio offline completo.
 */

const VERSION = 'v2.2';
const SHELL_CACHE = `timone-shell-${VERSION}`;
const TILE_CACHE = `timone-tiles-${VERSION}`;
const DATA_CACHE = `timone-data-${VERSION}`;

// Percorso base ricavato dalla posizione del service worker: funziona sia
// alla radice del dominio sia in una sottocartella (GitHub Pages).
const BASE = new URL('./', self.location).pathname;
const SHELL_URLS = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`];

const TILE_HOSTS = [
  'tiles.openseamap.org',
  'basemaps.cartocdn.com',
  'tiles.emodnet-bathymetry.eu',
  'tile.openstreetmap.org',
];

const DATA_HOSTS = ['api.open-meteo.com', 'marine-api.open-meteo.com'];

const TILE_CACHE_MAX_ENTRIES = 3000;
const DATA_CACHE_MAX_ENTRIES = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, TILE_CACHE, DATA_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notifica tutti i clients che c'è una nuova versione → auto-reload
        return self.clients.matchAll({ type: 'window' })
      })
      .then((clients) => {
        for (const c of clients) {
          c.postMessage({ type: 'NEW_VERSION', version: VERSION })
        }
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

async function networkFirst(request, cacheName, { timeout, maxEntries }) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, timeout);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone());
      trimCache(cacheName, maxEntries);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

async function shellNetworkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request, 8000);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await cache.match(`${BASE}index.html`);
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(
      networkFirst(request, TILE_CACHE, {
        timeout: 5000,
        maxEntries: TILE_CACHE_MAX_ENTRIES,
      })
    );
    return;
  }

  if (DATA_HOSTS.some((h) => url.hostname === h)) {
    event.respondWith(
      networkFirst(request, DATA_CACHE, {
        timeout: 8000,
        maxEntries: DATA_CACHE_MAX_ENTRIES,
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(shellNetworkFirst(request));
  }
});
