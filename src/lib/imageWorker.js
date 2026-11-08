/**
 * Lettura dei pixel delle immagini scaricate, fuori dalla pagina.
 *
 * Sull'iPad leggere i pixel di un'immagine di un altro sito nella pagina
 * (drawImage + getImageData) teneva ferma la carta 6–8 s ogni volta
 * (registro "Blocchi della carta", 8/11/2026: 34 s per 9 tasselli Shom).
 * Qui il lavoro non blocca la carta. Lato pagina: imagePixels.js.
 *
 * Messaggi { id, kind, url }:
 * - 'shom': rilievo Shom con il nero (nessun rilievo) trasparente →
 *   { id, bitmap } (ImageBitmap) | { id, empty: true } (tassello vuoto)
 * - 'dem': altimetria Terrarium → { id, heights } (Float32Array, metri)
 * Errori: { id, error }; browser senza OffscreenCanvas: { id, unsupported: true }.
 */

// Tasselli Shom già visti o scaricati per una rotta: dalla copia, sennò rete
// e copia in SHOM_CACHE (come il service worker, che dal worker potrebbe non
// vedere le richieste). Tetto di voci come in sw.js
const SHOM_CACHE = 'timone-shom'
const SHOM_MAX = 3000
const TRIM_EVERY = 100
let stored = 0

async function trimShom(cache) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - SHOM_MAX; i++) await cache.delete(keys[i])
}

async function download(url, keep) {
  if (keep && self.caches) {
    const cached = await caches.match(url, { ignoreVary: true }).catch(() => null)
    if (cached) return cached.blob()
  }
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`${res.status}`)
  if (keep && self.caches) {
    try {
      const cache = await caches.open(SHOM_CACHE)
      await cache.put(url, res.clone())
      if (++stored % TRIM_EVERY === 0) trimShom(cache).catch(() => {})
    } catch {
      // spazio pieno: il tassello si mostra lo stesso
    }
  }
  return res.blob()
}

async function pixels(url, keep = false) {
  const image = await createImageBitmap(await download(url, keep))
  const { width, height } = image
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0)
  image.close()
  return { canvas, ctx, width, height }
}

const SHOM_TILE = 512

async function shom(id, url) {
  const { canvas, ctx, width, height } = await pixels(url, true)
  // Senza rete il service worker manda un tassello vuoto da 1 pixel
  if (width < SHOM_TILE || height < SHOM_TILE) {
    self.postMessage({ id, empty: true })
    return
  }
  const data = ctx.getImageData(0, 0, width, height)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] < 10 && px[i + 1] < 10 && px[i + 2] < 10) px[i + 3] = 0
  }
  ctx.putImageData(data, 0, 0)
  const bitmap = canvas.transferToImageBitmap()
  self.postMessage({ id, bitmap }, [bitmap])
}

async function dem(id, url) {
  const { ctx, width, height } = await pixels(url)
  const d = ctx.getImageData(0, 0, width, height).data
  const heights = new Float32Array(width * height)
  for (let i = 0; i < heights.length; i++) heights[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768
  self.postMessage({ id, heights }, [heights.buffer])
}

self.onmessage = async ({ data: { id, kind, url } }) => {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    self.postMessage({ id, unsupported: true })
    return
  }
  try {
    if (kind === 'shom') await shom(id, url)
    else if (kind === 'dem') await dem(id, url)
    else throw new Error(`lavoro sconosciuto: ${kind}`)
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) })
  }
}
