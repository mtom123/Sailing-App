/**
 * Pixel delle immagini scaricate, letti in un worker (imageWorker.js): sulla
 * pagina dell'iPad la stessa lettura bloccava la carta per secondi.
 *
 * Se il browser non permette i canvas nei worker le funzioni danno null:
 * chi le usa rinuncia al dato (rilievo, coste a picco) invece di leggere i
 * pixel nella pagina.
 */

let worker = null
let unsupported = false
let nextId = 0
const pending = new Map() // id -> { resolve, reject }

function runTransfer(kind, extra, transfer) {
  return run(kind, null, extra, transfer)
}

function run(kind, url, extra = {}, transfer = []) {
  // Il trasferimento dell'archivio non disegna: va anche senza canvas nei worker
  if (unsupported && kind !== 'migrate') return Promise.resolve(null)
  if (!worker) {
    try {
      worker = new Worker(new URL('./imageWorker.js', import.meta.url), { type: 'module' })
    } catch {
      unsupported = true
      return Promise.resolve(null)
    }
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id)
      if (!job) return
      pending.delete(data.id)
      if (data.unsupported) unsupported = true
      if (data.error) job.reject(new Error(data.error))
      else if ('depth' in data) job.resolve(data.depth)
      else if (data.missing) job.resolve('missing')
      else job.resolve(data.bitmap || data.heights || data.masks || data.blob || null)
    }
    worker.onerror = () => {
      unsupported = true
      for (const job of pending.values()) job.resolve(null)
      pending.clear()
    }
  }
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, kind, url, ...extra }, transfer)
  })
}

/** Tassello del rilievo Shom col nero trasparente → ImageBitmap, o null */
export const shomTileBitmap = (url) => run('shom', url)

/** Tassello Terrarium → Float32Array di quote in metri, o null */
export const demHeights = (url) => run('dem', url)

/**
 * Fronti di un tassello: URL dei tasselli in grigio di temperatura e
 * clorofilla (uno dei due può mancare) e km per pixel → ImageBitmap, o null
 */
export const frontsBitmap = ({ sst, chl, kmPerPx }) => run('fronts', null, { sst, chl, kmPerPx })

/**
 * Sposta le carte salvate in Cache Storage nell'archivio IndexedDB
 * (tileStore.js), nel worker e poche alla volta. Si risolve a fine lavoro.
 */
export const migrateStore = () => run('migrate', null)

/** Immagine con ogni pixel visibile del colore rgb ([r, g, b]) → ImageBitmap, o null */
export const tintedBitmap = (url, rgb, alpha) => run('tint', url, { rgb, alpha })

/**
 * Poligoni e cerchi disegnati nel worker → una maschera sì/no (Uint8Array
 * w×h) per strato, o null se il browser non lo permette.
 * layers: [{ rings: [Float32Array x,y,…], stroke? } | { circles: Float32Array x,y,r,… }]
 */
export function rasterMasks(w, h, layers) {
  const transfer = layers.flatMap((l) => (l.rings ? l.rings.map((r) => r.buffer) : [l.circles.buffer]))
  return runTransfer('raster', { w, h, layers }, transfer)
}

/**
 * Fasce di profondità dalla griglia fine ricostruita dalle isobate, per un
 * blocco: → Blob PNG, null (nessuna fascia) o 'missing' (il worker non ha
 * più la griglia: rimandare con lines e water)
 */
export const fineZonesImage = (job) => run('fineZones', null, job)

/** Profondità della griglia fine del blocco nel punto, o null */
export const fineDepthAt = (key, bbox, lat, lon) => run('fineDepth', null, { key, bbox, lat, lon })

