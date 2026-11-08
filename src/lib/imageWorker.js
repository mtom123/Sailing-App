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
 * - 'fronts' ({ sst, chl, kmPerPx }): fronti termici e di clorofilla di un
 *   tassello → { id, bitmap } | { id, empty: true }
 * - 'raster' ({ w, h, layers }): poligoni e cerchi → { id, masks } (Uint8Array)
 * - 'tint' ({ rgb, alpha }): immagine ricolorata → { id, bitmap } | { id, empty: true }
 * - 'migrate': carte salvate in Cache Storage → archivio IndexedDB
 *   (tileStore.js) → { id, moved, skipped }
 * Errori: { id, error }; browser senza OffscreenCanvas: { id, unsupported: true }.
 */

import { setStoreMeta, storeGet, storeHas, storePut, storeTrim } from './tileStore.js'

// Tasselli già visti o scaricati per una rotta: dall'archivio (tileStore.js),
// sennò rete e copia nell'area data (il service worker dal worker potrebbe
// non vedere le richieste). Tetto per il rilievo Shom come in sw.js
const AREA_MAX = { shom: 3000, tiles: 4000 }
const TRIM_EVERY = 100
let stored = 0

// keep: area dell'archivio dove tenere la copia (null = nessuna)
async function download(url, keep) {
  if (keep) {
    const rec = await storeGet(url).catch(() => null)
    if (rec) return rec.blob
  }
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error(`${res.status}`)
  const blob = await res.blob()
  if (keep) {
    try {
      await storePut(url, blob, res.headers.get('Content-Type'), keep)
      if (AREA_MAX[keep] && ++stored % TRIM_EVERY === 0) storeTrim(keep, AREA_MAX[keep]).catch(() => {})
    } catch {
      // spazio pieno: il tassello si mostra lo stesso
    }
  }
  return blob
}

// ----------------------------------------------------- vecchie cache → archivio
// Le carte salvate in Cache Storage prima dell'archivio IndexedDB passano lì,
// poche alla volta (si riprende alla prossima apertura se l'app si chiude).
// Restano in Cache Storage i JSON letti "prima la rete" (aree, ordinanze,
// TileJSON della costa): il service worker li rilegge da lì
const LEGACY = [
  ['timone-offline', 'offline'],
  ['timone-tiles', 'tiles'],
  ['timone-shom', 'shom'],
  ['timone-geo', 'geo'],
]
const staysInCache = (url) => {
  const u = new URL(url)
  return (u.origin === self.location.origin && /\.(json|webmanifest)$/.test(u.pathname)) || (u.hostname === 'tiles.openfreemap.org' && u.pathname === '/planet')
}

async function migrate(id) {
  const result = { moved: 0, skipped: 0 }
  if (self.caches) {
    for (const [name, area] of LEGACY) {
      if (!(await caches.has(name))) continue
      const cache = await caches.open(name)
      const keys = await cache.keys()
      let kept = 0
      for (let i = 0; i < keys.length; i++) {
        const req = keys[i]
        if (name === 'timone-geo' && staysInCache(req.url)) {
          kept++
          continue
        }
        if (!(await storeHas(req.url))) {
          const res = await cache.match(req)
          // Le risposte opache (senza CORS) non si possono rileggere: si riscaricheranno
          if (res && res.ok && res.type !== 'opaque') {
            // Se non c'è spazio ci si ferma: le voci rimaste restano dove sono
            await storePut(req.url, await res.blob(), res.headers.get('Content-Type'), area)
            result.moved++
          } else result.skipped++
        }
        await cache.delete(req)
        // Respiro: la carta e il service worker usano lo stesso disco
        if (i % 25 === 24) await new Promise((resolve) => setTimeout(resolve, 40))
      }
      if (!kept) await caches.delete(name)
    }
  }
  await setStoreMeta('migrated', true)
  self.postMessage({ id, ...result })
}

async function pixels(url, keep = null) {
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
  const { canvas, ctx, width, height } = await pixels(url, 'shom')
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

// ---------------------------------------------------------------- fronti
// Temperatura e clorofilla Copernicus chieste in grigio (cmap:gray): la
// somma R+G+B del colore dà la posizione nella scala (tabella della legenda
// del servizio, 256 livelli), quindi il valore. Dove il valore cambia in
// fretta (gradiente per km) c'è un fronte: lì si concentra il pesce.
const GRAY_SUMS = [
  0,0,0,0,3,3,6,6,9,9,12,15,15,18,21,24,27,30,33,36,39,43,46,49,52,55,58,61,64,67,70,73,76,79,82,85,87,90,93,96,99,102,105,108,110,113,115,118,121,124,127,129,132,135,138,140,143,145,148,151,154,157,159,162,165,167,170,172,175,178,181,184,186,189,192,194,197,199,202,205,208,211,213,216,218,221,224,226,229,232,235,238,240,242,245,248,251,253,256,259,262,265,268,270,272,275,278,281,283,286,289,292,295,298,301,302,305,308,311,314,317,320,322,325,328,331,334,337,340,342,344,347,350,353,356,359,362,365,368,371,374,376,379,382,385,388,391,394,397,400,403,406,409,412,415,418,421,424,427,430,433,436,439,442,445,448,451,454,457,460,463,466,470,473,476,479,482,485,488,491,494,497,500,503,507,510,513,517,520,524,527,530,533,536,539,543,546,549,554,557,560,563,566,569,573,576,581,584,587,590,593,597,600,605,608,611,614,618,622,626,629,632,636,640,644,647,650,654,659,662,665,669,673,677,680,684,688,692,695,700,704,707,711,715,719,723,727,731,734,739,743,746,751,755,759,763,
]
// somma R+G+B → posizione 0..1 nella scala (la più vicina)
const GRAY_POS = (() => {
  const pos = new Float32Array(766)
  for (let sum = 0, i = 0; sum < 766; sum++) {
    while (i < 255 && Math.abs(GRAY_SUMS[i + 1] - sum) <= Math.abs(GRAY_SUMS[i] - sum)) i++
    pos[sum] = i / 255
  }
  return pos
})()

// Soglie tarate sui dati di novembre 2026 tra Liguria e Tirreno (sopra il
// 90° percentile dei cambi): sotto lo, niente; da hi in su, colore pieno
const FRONT_SCALES = {
  sst: { lo: 0.1, hi: 0.2, decode: (t) => 283 + t * 20 }, // K per km, scala 283–303 K
  chl: { lo: 0.025, hi: 0.1, decode: (t) => Math.log10(0.02) + t * 2 }, // decadi per km, 0,02–2 mg/m³
}
const T = 256
const STEP = 2 // pixel: il gradiente si misura su 4 pixel (~3,6 km a zoom 7)

// Tassello in grigio → valori (NaN dove non c'è mare o dato), levigati 3×3
async function grid(url, decode) {
  if (!url) return null
  const { ctx, width, height } = await pixels(url, 'tiles').catch(() => ({}))
  if (!ctx || width !== T || height !== T) return null
  const px = ctx.getImageData(0, 0, T, T).data
  const raw = new Float32Array(T * T)
  for (let i = 0; i < raw.length; i++) {
    raw[i] = px[i * 4 + 3] < 255 ? NaN : decode(GRAY_POS[px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]])
  }
  const out = new Float32Array(T * T).fill(NaN)
  for (let y = 1; y < T - 1; y++) {
    for (let x = 1; x < T - 1; x++) {
      if (Number.isNaN(raw[y * T + x])) continue
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = raw[(y + dy) * T + x + dx]
          if (!Number.isNaN(v)) {
            sum += v
            n++
          }
        }
      }
      out[y * T + x] = sum / n
    }
  }
  return out
}

// Forza del fronte 0..1 in ogni pixel
function strength(values, kmPerPx, { lo, hi }) {
  const s = new Float32Array(T * T)
  if (!values) return s
  const base = 2 * STEP * kmPerPx
  for (let y = STEP; y < T - STEP; y++) {
    for (let x = STEP; x < T - STEP; x++) {
      const gx = (values[y * T + x + STEP] - values[y * T + x - STEP]) / base
      const gy = (values[(y + STEP) * T + x] - values[(y - STEP) * T + x]) / base
      const g = Math.hypot(gx, gy)
      if (g > lo) s[y * T + x] = Math.min(1, (g - lo) / (hi - lo))
    }
  }
  return s
}

async function fronts(id, { sst, chl, kmPerPx }) {
  const [vt, vc] = await Promise.all([grid(sst, FRONT_SCALES.sst.decode), grid(chl, FRONT_SCALES.chl.decode)])
  if (!vt && !vc) {
    self.postMessage({ id, empty: true })
    return
  }
  const st = strength(vt, kmPerPx, FRONT_SCALES.sst)
  const sc = strength(vc, kmPerPx, FRONT_SCALES.chl)
  const canvas = new OffscreenCanvas(T, T)
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(T, T)
  const out = img.data
  for (let i = 0; i < T * T; i++) {
    const a = st[i]
    const b = sc[i]
    if (!a && !b) continue
    // Giallo: fronte termico e di clorofilla insieme; arancio solo termico; verde solo clorofilla
    const [r, g, bl] = a && b ? [255, 214, 0] : a ? [255, 90, 40] : [40, 225, 150]
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = bl
    out[i * 4 + 3] = Math.round(70 + 175 * Math.max(a, b))
  }
  ctx.putImageData(img, 0, 0)
  const bitmap = canvas.transferToImageBitmap()
  self.postMessage({ id, bitmap }, [bitmap])
}

// Immagine ricolorata: ogni pixel visibile prende il colore rgb, con
// trasparenza alpha (0..1) moltiplicata per la sua
async function tint(id, url, { rgb, alpha }) {
  const { canvas, ctx, width, height } = await pixels(url, 'tiles')
  const data = ctx.getImageData(0, 0, width, height)
  const px = data.data
  let any = false
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue
    any = true
    px[i] = rgb[0]
    px[i + 1] = rgb[1]
    px[i + 2] = rgb[2]
    px[i + 3] = Math.round(px[i + 3] * alpha)
  }
  if (!any) {
    self.postMessage({ id, empty: true })
    return
  }
  ctx.putImageData(data, 0, 0)
  const bitmap = canvas.transferToImageBitmap()
  self.postMessage({ id, bitmap }, [bitmap])
}

// Disegno di poligoni e cerchi → maschere sì/no (Uint8Array w×h), per la
// fascia costiera: sull'iPad rileggere nella pagina quel che si era appena
// disegnato costava 5–15 s (Blocchi della carta, 8/11/2026).
// layers: [{ rings: [Float32Array x,y,…], stroke?: larghezza } | { circles: Float32Array x,y,r,… }]
function raster(id, { w, h, layers }) {
  const canvas = new OffscreenCanvas(Math.max(1, w), Math.max(1, h))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  const masks = []
  for (const layer of layers) {
    ctx.clearRect(0, 0, w, h)
    ctx.beginPath()
    if (layer.rings) {
      for (const ring of layer.rings) {
        for (let i = 0; i < ring.length; i += 2) {
          if (i === 0) ctx.moveTo(ring[i], ring[i + 1])
          else ctx.lineTo(ring[i], ring[i + 1])
        }
        ctx.closePath()
      }
      ctx.fill('nonzero')
      if (layer.stroke) {
        ctx.lineWidth = layer.stroke
        ctx.stroke()
      }
    } else if (layer.circles) {
      const c = layer.circles
      for (let i = 0; i < c.length; i += 3) {
        ctx.moveTo(c[i] + c[i + 2], c[i + 1])
        ctx.arc(c[i], c[i + 1], c[i + 2], 0, 2 * Math.PI)
      }
      ctx.fill()
    }
    const px = ctx.getImageData(0, 0, w, h).data
    const mask = new Uint8Array(w * h)
    for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3] > 127 ? 1 : 0
    masks.push(mask)
  }
  self.postMessage({ id, masks }, masks.map((m) => m.buffer))
}

self.onmessage = async ({ data: { id, kind, url, ...rest } }) => {
  if (kind === 'migrate') {
    migrate(id).catch((err) => self.postMessage({ id, error: String(err?.message || err) }))
    return
  }
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    self.postMessage({ id, unsupported: true })
    return
  }
  try {
    if (kind === 'shom') await shom(id, url)
    else if (kind === 'dem') await dem(id, url)
    else if (kind === 'fronts') await fronts(id, rest)
    else if (kind === 'tint') await tint(id, url, rest)
    else if (kind === 'raster') raster(id, rest)
    else throw new Error(`lavoro sconosciuto: ${kind}`)
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) })
  }
}
