/**
 * IndexedDB wrapper per cache persistente.
 *
 * Stores:
 * - grib: { key, grid, bounds, updatedAt, ttl } — cache GRIB per area
 * - tiles: { url, blob, ts } — cache tile mappe (solo se Service Worker non disponibile)
 * - routes: rotte salvate (backup localStorage)
 * - polars: polari custom uploaded dall'utente
 */

const DB_NAME = 'timone-cache'
const DB_VERSION = 1

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('grib')) {
        db.createObjectStore('grib', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('tiles')) {
        db.createObjectStore('tiles', { keyPath: 'url' })
      }
      if (!db.objectStoreNames.contains('routes')) {
        db.createObjectStore('routes', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('polars')) {
        db.createObjectStore('polars', { keyPath: 'key' })
      }
    }
  })
  return dbPromise
}

export async function cacheGet(store, key) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    return null
  }
}

export async function cacheSet(store, value) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    return false
  }
}

export async function cacheDelete(store, key) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    return false
  }
}

export async function cacheKeys(store) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).getAllKeys()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    return []
  }
}

export async function cacheClear(store) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).clear()
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    return false
  }
}

// Grib-specific helpers con TTL
const GRIB_TTL_MS = 6 * 3600 * 1000 // 6 ore

export async function gribGet(key) {
  const v = await cacheGet('grib', key)
  if (!v) return null
  if (Date.now() - v.updatedAt > GRIB_TTL_MS) {
    await cacheDelete('grib', key)
    return null
  }
  return v
}

export async function gribSet(key, grid, bounds) {
  return cacheSet('grib', {
    key,
    grid,
    bounds,
    updatedAt: Date.now(),
  })
}

// LRU eviction per grib (max 10 entries)
export async function gribEvict(max = 10) {
  const keys = await cacheKeys('grib')
  if (keys.length <= max) return
  // Get all and sort by updatedAt
  const db = await openDB()
  return new Promise((resolve) => {
    const tx = db.transaction('grib', 'readwrite')
    const store = tx.objectStore('grib')
    const allReq = store.getAll()
    allReq.onsuccess = () => {
      const items = allReq.result.sort((a, b) => b.updatedAt - a.updatedAt)
      const toDelete = items.slice(max)
      for (const item of toDelete) store.delete(item.key)
    }
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
  })
}

export default {
  cacheGet, cacheSet, cacheDelete, cacheKeys, cacheClear,
  gribGet, gribSet, gribEvict,
}
