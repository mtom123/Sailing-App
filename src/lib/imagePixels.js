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

function run(kind, url, extra = {}) {
  if (unsupported) return Promise.resolve(null)
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
      else job.resolve(data.bitmap || data.heights || null)
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
    worker.postMessage({ id, kind, url, ...extra })
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
