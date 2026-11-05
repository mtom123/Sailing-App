/**
 * Archivio dei mark in IndexedDB: nessun tetto al numero, e salvarne uno non
 * riscrive tutti gli altri come farebbe localStorage. Le foto stanno a parte
 * ({ id, blob }), così l'elenco dei mark resta leggero.
 */

const DB_NAME = 'timone-marks'
const STORE = 'marks'
const PHOTOS = 'photos'

let dbPromise = null
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
      req.onupgradeneeded = () => {
        for (const name of [STORE, PHOTOS]) {
          if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' })
        }
      }
    })
    dbPromise.catch(() => (dbPromise = null))
  }
  return dbPromise
}

async function run(mode, fn, store = STORE) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const req = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const listMarks = async () => (await run('readonly', (s) => s.getAll())) || []
export const putMark = (mark) => run('readwrite', (s) => s.put(mark))
export const putMarks = (marks) =>
  run('readwrite', (s) => {
    marks.forEach((m) => s.put(m))
  })
export const deleteMark = (id) => run('readwrite', (s) => s.delete(id))

export const putPhoto = (photo) => run('readwrite', (s) => s.put(photo), PHOTOS)
export const getPhoto = (id) => run('readonly', (s) => s.get(id), PHOTOS)
export const deletePhotos = (ids) =>
  run(
    'readwrite',
    (s) => {
      ids.forEach((id) => s.delete(id))
    },
    PHOTOS
  )
