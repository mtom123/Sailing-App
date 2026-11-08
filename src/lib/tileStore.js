/**
 * Archivio delle carte e dei dati in IndexedDB, al posto della Cache Storage.
 *
 * Sull'iPad il primo accesso alla Cache Storage dopo un avvio a freddo
 * costava ~10 s con qualche migliaio di voci (Tempi di apertura, 8/11/2026)
 * e cresceva con le carte scaricate. IndexedDB non prepara niente all'avvio:
 * legge solo la voce chiesta. In Cache Storage restano pagina, meteo e i
 * pochi JSON (centinaia di voci, non migliaia).
 *
 * Una voce per URL: { url, area, at, type, blob, packs }.
 * - area: 'tiles' (carte viste, con tetto), 'shom' (rilievo, con tetto),
 *   'geo' (costa, profondità, isobate: senza tetto), 'offline' (scaricate per
 *   rotte e zone: mai sfoltite).
 * - packs: chiavi degli scaricamenti che usano la voce.
 *
 * Lo stesso schema è scritto in public/sw.js (il service worker non passa da
 * Vite): cambiando qui, cambiare anche lì. Funziona nella pagina e nei worker.
 */

export const STORE_DB = 'timone-store'
export const STORE_VERSION = 1
const ENTRIES = 'entries'
const META = 'meta'

let dbPromise = null
export function storeDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(STORE_DB, STORE_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(ENTRIES)) {
          const s = db.createObjectStore(ENTRIES, { keyPath: 'url' })
          s.createIndex('area_at', ['area', 'at'])
          s.createIndex('packs', 'packs', { multiEntry: true })
        }
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('archivio bloccato'))
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
const finished = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('annullata'))
  })

/** Voce per URL, o undefined */
export async function storeGet(url) {
  const db = await storeDb()
  return done(db.transaction(ENTRIES).objectStore(ENTRIES).get(url))
}

export async function storeHas(url) {
  const db = await storeDb()
  return (await done(db.transaction(ENTRIES).objectStore(ENTRIES).count(url))) > 0
}

/**
 * Salva blob per URL nell'area. Una voce già 'offline' resta 'offline' (le
 * carte scaricate non si sfoltiscono); pack aggiunge lo scaricamento.
 */
export async function storePut(url, blob, type, area, pack = null) {
  const db = await storeDb()
  const tx = db.transaction(ENTRIES, 'readwrite')
  const store = tx.objectStore(ENTRIES)
  const old = await done(store.get(url))
  const packs = new Set(old?.packs || [])
  if (pack) packs.add(pack)
  store.put({
    url,
    area: old?.area === 'offline' || area === 'offline' ? 'offline' : area,
    at: Date.now(),
    type: type || old?.type || 'application/octet-stream',
    blob,
    packs: [...packs],
  })
  return finished(tx)
}

/** Aggiunge uno scaricamento a una voce che c'è già (e la rende 'offline') */
export async function storeAdopt(url, pack) {
  const db = await storeDb()
  const tx = db.transaction(ENTRIES, 'readwrite')
  const store = tx.objectStore(ENTRIES)
  const old = await done(store.get(url))
  if (old) store.put({ ...old, area: 'offline', packs: [...new Set([...(old.packs || []), pack])] })
  await finished(tx)
  return !!old
}

/** Toglie tutte le voci di un'area (es. 'offline' per "cancella carte scaricate") */
export async function storeClearArea(area) {
  const db = await storeDb()
  const tx = db.transaction(ENTRIES, 'readwrite')
  const range = IDBKeyRange.bound([area, -Infinity], [area, Infinity])
  const req = tx.objectStore(ENTRIES).index('area_at').openCursor(range)
  req.onsuccess = () => {
    const cursor = req.result
    if (!cursor) return
    cursor.delete()
    cursor.continue()
  }
  return finished(tx)
}

/** Numero di voci per area: { tiles, shom, geo, offline } */
export async function storeCounts() {
  const db = await storeDb()
  const index = db.transaction(ENTRIES).objectStore(ENTRIES).index('area_at')
  const out = {}
  for (const area of ['tiles', 'shom', 'geo', 'offline']) {
    out[area] = await done(index.count(IDBKeyRange.bound([area, -Infinity], [area, Infinity])))
  }
  return out
}

export async function storeMeta(key) {
  const db = await storeDb()
  return (await done(db.transaction(META).objectStore(META).get(key)))?.value
}

export async function setStoreMeta(key, value) {
  const db = await storeDb()
  const tx = db.transaction(META, 'readwrite')
  tx.objectStore(META).put({ key, value })
  return finished(tx)
}

/** Tiene al massimo max voci nell'area, togliendo le più vecchie */
export async function storeTrim(area, max) {
  const db = await storeDb()
  const tx = db.transaction(ENTRIES, 'readwrite')
  const index = tx.objectStore(ENTRIES).index('area_at')
  const range = IDBKeyRange.bound([area, -Infinity], [area, Infinity])
  let extra = (await done(index.count(range))) - max
  if (extra > 0) {
    const req = index.openCursor(range)
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor || extra-- <= 0) return
      cursor.delete()
      cursor.continue()
    }
  }
  return finished(tx)
}

