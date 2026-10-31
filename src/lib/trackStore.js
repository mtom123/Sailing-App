/**
 * Archivio delle tracce in IndexedDB (database a parte dalla cache): resta
 * tra un avvio e l'altro e regge tracce lunghe, che in localStorage non
 * starebbero. La traccia in registrazione si salva con id CURRENT, così non
 * si perde se l'app si chiude o si ricarica.
 *
 * Traccia: { id, name, start, end, status?, segments: [[[lat, lon, ts, sog]]] }
 * (ogni pausa apre un nuovo tratto), più stats calcolate al salvataggio.
 */

const DB_NAME = 'timone-tracks'
const STORE = 'tracks'
export const CURRENT = '__current__'

let dbPromise = null
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
    })
    dbPromise.catch(() => (dbPromise = null))
  }
  return dbPromise
}

async function run(mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const getTrack = (id) => run('readonly', (s) => s.get(id))
export const putTrack = (track) => run('readwrite', (s) => s.put(track))
export const deleteTrack = (id) => run('readwrite', (s) => s.delete(id))

/** Tracce salvate senza i punti (per l'elenco), le più recenti prima */
export async function listTracks() {
  const all = (await run('readonly', (s) => s.getAll())) || []
  return all
    .filter((t) => t.id !== CURRENT)
    .map(({ segments, ...rest }) => rest)
    .sort((a, b) => b.start - a.start)
}
