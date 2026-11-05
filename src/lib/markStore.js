/**
 * Archivio dei mark in IndexedDB: nessun tetto al numero, e salvarne uno non
 * riscrive tutti gli altri come farebbe localStorage.
 */

const DB_NAME = 'timone-marks'
const STORE = 'marks'

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

export const listMarks = async () => (await run('readonly', (s) => s.getAll())) || []
export const putMark = (mark) => run('readwrite', (s) => s.put(mark))
export const deleteMark = (id) => run('readwrite', (s) => s.delete(id))
