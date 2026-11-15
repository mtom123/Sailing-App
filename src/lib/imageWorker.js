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
 * - 'fineZones' ({ key, bbox, lines?, water, zones }): griglia fine dalle
 *   isobate → { id, fine, zones: [{ color, rings }], cov } | { id, missing }
 * - 'fineDepth' ({ key, bbox, lat, lon }): profondità nella griglia fine → { id, depth }
 * - 'tint' ({ rgb, alpha }): immagine ricolorata → { id, bitmap } | { id, empty: true }
 * - 'migrate': carte salvate in Cache Storage → archivio IndexedDB
 *   (tileStore.js) → { id, moved, skipped }
 * Errori: { id, error }; browser senza OffscreenCanvas: { id, unsupported: true }.
 */

import { contours } from 'd3-contour'
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

// ------------------------------------------------ fondali fini dalle isobate
// Griglia di profondità a ~10 m ricostruita dalle isobate (es. Regione
// Liguria, ogni 5 m) e dalla costa: in ogni cella d'acqua la profondità si
// interpola tra le due isobate più vicine (o la riva, profondità 0), in base
// alle distanze. Poi colorata con le fasce di profondità dell'utente.
// Calcolata una volta per blocco (key) e tenuta; ricolorarla costa poco.
const GRID_STEP = 1e-4 // gradi (~8 × 11 m)
// Isobate più distanti di 2 × questo non si considerano lo stesso rilievo
const SURVEY_GAP_M = 300
const fineGrids = new Map() // key -> { w, h, depth: Float32Array } (NaN = terra o fuori)
const MAX_FINE = 12

function chamfer(dist, w, h) {
  // Distanza chamfer 3-4 (in unità di cella ×3) in due passate
  const INF = 1e9
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let d = dist[i]
      if (d === 0) continue
      if (x > 0) d = Math.min(d, dist[i - 1] + 3)
      if (y > 0) {
        d = Math.min(d, dist[i - w] + 3)
        if (x > 0) d = Math.min(d, dist[i - w - 1] + 4)
        if (x < w - 1) d = Math.min(d, dist[i - w + 1] + 4)
      }
      dist[i] = d
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      let d = dist[i]
      if (d === 0) continue
      if (x < w - 1) d = Math.min(d, dist[i + 1] + 3)
      if (y < h - 1) {
        d = Math.min(d, dist[i + w] + 3)
        if (x < w - 1) d = Math.min(d, dist[i + w + 1] + 4)
        if (x > 0) d = Math.min(d, dist[i + w - 1] + 4)
      }
      dist[i] = d
    }
  }
  return INF
}

// Per ogni cella la cella di partenza più vicina (seed: indice, -1 nessuna)
// e il quadrato della distanza, in due passate (propagazione dei vicini).
// Colonna e riga di ogni indice da tabelle: niente divisioni nel ciclo
const XY = { w: 0, h: 0, x: null, y: null }
function nearestSeed(seed, dist2, w, h, box = [0, 0, w - 1, h - 1]) {
  const n2 = w * h
  if (XY.w !== w || XY.h !== h) {
    XY.x = new Int16Array(n2)
    XY.y = new Int16Array(n2)
    for (let i = 0; i < n2; i++) {
      XY.x[i] = i % w
      XY.y[i] = (i / w) | 0
    }
    XY.w = w
    XY.h = h
  }
  const X = XY.x
  const Y = XY.y
  // Solo nel riquadro dei seed allargato (box: x0, y0, x1, y1)
  const [bx0, by0, bx1, by1] = box
  for (let i = 0; i < n2; i++) dist2[i] = seed[i] >= 0 ? 0 : 1e18
  const pass = (i, j, x, y) => {
    const s = seed[j]
    if (s < 0) return
    const dx = X[s] - x
    const dy = Y[s] - y
    const d = dx * dx + dy * dy
    if (d < dist2[i]) {
      dist2[i] = d
      seed[i] = s
    }
  }
  for (let y = by0; y <= by1; y++) {
    const row = y * w
    for (let x = bx0; x <= bx1; x++) {
      const i = row + x
      if (dist2[i] === 0) continue
      if (x > 0) pass(i, i - 1, x, y)
      if (y > 0) {
        pass(i, i - w, x, y)
        if (x > 0) pass(i, i - w - 1, x, y)
        if (x < w - 1) pass(i, i - w + 1, x, y)
      }
    }
    for (let x = Math.min(w - 2, bx1); x >= bx0; x--) if (dist2[row + x] !== 0) pass(row + x, row + x + 1, x, y)
  }
  for (let y = by1; y >= by0; y--) {
    const row = y * w
    for (let x = bx1; x >= bx0; x--) {
      const i = row + x
      if (dist2[i] === 0) continue
      if (x < w - 1) pass(i, i + 1, x, y)
      if (y < h - 1) {
        pass(i, i + w, x, y)
        if (x < w - 1) pass(i, i + w + 1, x, y)
        if (x > 0) pass(i, i + w - 1, x, y)
      }
    }
    for (let x = Math.max(1, bx0); x <= bx1; x++) if (dist2[row + x] !== 0) pass(row + x, row + x - 1, x, y)
  }
}

// Pezzetti d'isobata isolati (più corti di FRAG_M e senza un'altra linea
// della stessa profondità entro FRAG_M): bordi del rilievo, non fondale. A
// Finale tre pezzetti da 5, 6 e 7 m impilati facevano 5,5 m su un'area larga
// 300 m. Le isobate tratteggiate (pezzetti vicini tra loro) restano
const FRAG_M = 40
function dropFragments(lines) {
  const M = 111000
  const lenM = (p) => {
    let L = 0
    for (let q = 1; q < p.length; q++) {
      const dy = (p[q][0] - p[q - 1][0]) * M
      const dx = (p[q][1] - p[q - 1][1]) * M * Math.cos((p[q][0] * Math.PI) / 180)
      L += Math.hypot(dx, dy)
    }
    return L
  }
  // Punti di ogni profondità in caselle di ~FRAG_M
  const cell = FRAG_M / M
  const buckets = new Map()
  lines.forEach((l, idx) => {
    for (const [lat, lon] of l.path) {
      const k = `${l.depth}|${Math.floor(lat / cell)}|${Math.floor(lon / cell)}`
      let b = buckets.get(k)
      if (!b) buckets.set(k, (b = []))
      b.push(idx, lat, lon)
    }
  })
  const near = (idx, l) => {
    for (const [lat, lon] of l.path) {
      const cy = Math.floor(lat / cell)
      const cx = Math.floor(lon / cell)
      for (let a = -1; a <= 1; a++)
        for (let c = -1; c <= 1; c++) {
          const b = buckets.get(`${l.depth}|${cy + a}|${cx + c}`)
          if (!b) continue
          for (let t = 0; t < b.length; t += 3) {
            if (b[t] === idx) continue
            const dy = (b[t + 1] - lat) * M
            const dx = (b[t + 2] - lon) * M * Math.cos((lat * Math.PI) / 180)
            if (Math.hypot(dx, dy) < FRAG_M) return true
          }
        }
    }
    return false
  }
  return lines.filter((l, idx) => lenM(l.path) >= FRAG_M || near(idx, l))
}

// bbox [s, w, n, e]; lines [{ depth, path: [[lat, lon]] }]; water: anelli [[lat, lon]] (mare)
function buildFineGrid({ bbox, lines, water }) {
  const [s, wLon, n, e] = bbox
  const w = Math.max(2, Math.round((e - wLon) / GRID_STEP))
  const h = Math.max(2, Math.round((n - s) / GRID_STEP))
  const toPx = (lat, lon) => [((lon - wLon) / (e - wLon)) * w, ((n - lat) / (n - s)) * h]
  // Mare secondo la costa OSM
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  for (const ring of water) {
    ring.forEach(([lat, lon], i) => {
      const [x, y] = toPx(lat, lon)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
  }
  ctx.fill('nonzero')
  const px = ctx.getImageData(0, 0, w, h).data
  const sea = new Uint8Array(w * h)
  for (let i = 0; i < sea.length; i++) sea[i] = px[i * 4 + 3] > 127 ? 1 : 0

  lines = dropFragments(lines)
  // Livelli: 0 = riva, poi le profondità delle isobate presenti
  const levels = [0, ...[...new Set(lines.map((l) => l.depth))].sort((a, b) => a - b)]
  const byLevel = levels.map(() => [])
  for (const line of lines) byLevel[levels.indexOf(line.depth)].push(line.path)
  const INF = 1e9
  const n2 = w * h
  // Celle toccate da un'isobata (qualsiasi livello): per l'area del rilievo
  const onLine = new Uint8Array(n2)
  // Celle di partenza di un livello (riva: la terra), per nearestSeed
  // Oltre questa distanza (celle, ~1 km) un livello non conta per la cella
  const REACH = 90
  const seedsOf = (k, out) => {
    out.fill(-1)
    if (k === 0) {
      for (let i = 0; i < n2; i++) if (!sea[i]) out[i] = i
      return [0, 0, w - 1, h - 1]
    }
    let mx0 = w
    let my0 = h
    let mx1 = -1
    let my1 = -1
    for (const path of byLevel[k]) {
      for (let q = 1; q < path.length; q++) {
        const [x0, y0] = toPx(path[q - 1][0], path[q - 1][1])
        const [x1, y1] = toPx(path[q][0], path[q][1])
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2))
        for (let m = 0; m <= steps; m++) {
          const x = Math.floor(x0 + ((x1 - x0) * m) / steps)
          const y = Math.floor(y0 + ((y1 - y0) * m) / steps)
          if (x >= 0 && y >= 0 && x < w && y < h) {
            out[y * w + x] = y * w + x
            onLine[y * w + x] = 1
            if (x < mx0) mx0 = x
            if (x > mx1) mx1 = x
            if (y < my0) my0 = y
            if (y > my1) my1 = y
          }
        }
      }
    }
    if (mx1 < 0) return null
    return [Math.max(0, mx0 - REACH), Math.max(0, my0 - REACH), Math.min(w - 1, mx1 + REACH), Math.min(h - 1, my1 + REACH)]
  }
  // Un livello alla volta (con le Baleari, un'isobata ogni metro, i campi
  // tutti insieme sarebbero decine di MB). Per ogni cella si tengono i TOP
  // livelli più vicini, riva compresa, con il punto più vicino di ciascuno;
  // poi si interpola tra il più vicino e il primo che sta DALL'ALTRA PARTE
  // della cella. Prima si prendevano i livelli accanto (5 → 4 o 6) anche se
  // erano dalla stessa parte: tra la riva e l'isobata dei 5 m veniva 5,5 m
  // invece di salire verso la riva (Finale, 14/11/2026)
  const TOP = 4
  // La riva si tiene sempre a parte: è il riferimento quando le isobate
  // vicine stanno tutte dalla stessa parte
  const shoreS = new Int32Array(n2).fill(-1)
  const shoreD = new Float32Array(n2).fill(INF)
  const topK = new Int16Array(n2 * TOP).fill(-1)
  const topS = new Int32Array(n2 * TOP).fill(-1)
  const topD = new Float32Array(n2 * TOP).fill(INF)
  const seed = new Int32Array(n2)
  const dist2 = new Float32Array(n2)
  for (let k = 0; k < levels.length; k++) {
    const box = seedsOf(k, seed)
    if (!box) continue
    nearestSeed(seed, dist2, w, h, box)
    if (k === 0) {
      shoreS.set(seed)
      shoreD.set(dist2)
    }
    for (let y = box[1]; y <= box[3]; y++) for (let i = y * w + box[0]; i <= y * w + box[2]; i++) {
      if (!sea[i] || seed[i] < 0) continue
      const d = dist2[i]
      if (d > REACH * REACH) continue
      const o = i * TOP
      if (d >= topD[o + TOP - 1]) continue
      let t = TOP - 1
      while (t > 0 && topD[o + t - 1] > d) {
        topD[o + t] = topD[o + t - 1]
        topK[o + t] = topK[o + t - 1]
        topS[o + t] = topS[o + t - 1]
        t--
      }
      topD[o + t] = d
      topK[o + t] = k
      topS[o + t] = seed[i]
    }
  }
  // Area del rilievo: isobate e riva, con gli spazi tra loro riempiti
  // (chiusura morfologica di raggio SURVEY_GAP: dilatazione poi erosione), ma
  // senza andare oltre la fine delle linee. "Entro 400 m da un'isobata"
  // prolungava le profondità oltre il bordo del rilievo (Finale, 14/11/2026)
  const R = Math.round((SURVEY_GAP_M / (GRID_STEP * 111000)) * 3)
  const grow = new Float32Array(n2).fill(INF)
  for (let i = 0; i < n2; i++) {
    if (onLine[i]) grow[i] = 0
    else if (!sea[i]) {
      // Riva: terra accanto al mare
      const x = i % w
      if ((x > 0 && sea[i - 1]) || (x < w - 1 && sea[i + 1]) || (i >= w && sea[i - w]) || (i < n2 - w && sea[i + w])) grow[i] = 0
    }
  }
  chamfer(grow, w, h)
  const shrink = new Float32Array(n2).fill(INF)
  for (let i = 0; i < n2; i++) if (grow[i] > R) shrink[i] = 0
  chamfer(shrink, w, h)
  // …e comunque vicino a un'isobata: una caletta fuori dal rilievo, chiusa
  // dalla sola riva, non conta
  const nearLine = new Float32Array(n2).fill(INF)
  for (let i = 0; i < n2; i++) if (onLine[i]) nearLine[i] = 0
  chamfer(nearLine, w, h)
  const covered = new Uint8Array(n2)
  for (let i = 0; i < n2; i++) covered[i] = shrink[i] > R && nearLine[i] <= R ? 1 : 0

  const depth = new Float32Array(n2).fill(NaN)
  for (let i = 0; i < n2; i++) {
    if (!sea[i] || !covered[i]) continue
    // Il livello più vicino e il primo dall'altra parte della cella
    const o = i * TOP
    const k1 = topK[o]
    if (k1 < 0) continue
    if (topD[o] === 0) {
      depth[i] = levels[k1]
      continue
    }
    const cx = i % w
    const cy = (i - cx) / w
    const ax = (topS[o] % w) - cx
    const ay = Math.floor(topS[o] / w) - cy
    const la = Math.hypot(ax, ay)
    // Dall'altra parte: angolo tra le due direzioni oltre ~110°
    const opposite = (s2) => {
      const bx = (s2 % w) - cx
      const by = Math.floor(s2 / w) - cy
      return ax * bx + ay * by < -0.35 * la * Math.hypot(bx, by)
    }
    let k2 = -1
    let d2sq = INF
    for (let t = 1; t < TOP && topK[o + t] >= 0; t++) {
      if (opposite(topS[o + t])) {
        k2 = topK[o + t]
        d2sq = topD[o + t]
        break
      }
    }
    if (k2 < 0 && k1 !== 0 && shoreS[i] >= 0 && opposite(shoreS[i])) {
      k2 = 0
      d2sq = shoreD[i]
    }
    if (k2 < 0) {
      // Nessun livello dall'altra parte: oltre l'ultima linea, si resta al suo valore
      depth[i] = levels[k1]
      continue
    }
    const d1 = Math.sqrt(topD[o])
    const d2 = Math.sqrt(d2sq)
    depth[i] = levels[k1] + ((levels[k2] - levels[k1]) * d1) / (d1 + d2)
  }
  // Contorno esatto dell'area con la profondità di dettaglio (lat, lon): lì e
  // solo lì si tolgono le fasce EMODnet. Il contorno convesso delle isobate
  // era molto più grande e lasciava buchi a spigolo (Finale Ligure, 14/11/2026)
  const has = new Float64Array(n2)
  for (let i = 0; i < n2; i++) has[i] = Number.isNaN(depth[i]) ? 0 : 1
  const cov = contours()
    .size([w, h])
    .thresholds([0.5])(has)[0]
    .coordinates.flat()
    .map((ring) => ring.map(([x, y]) => [n - (y / h) * (n - s), wLon + (x / w) * (e - wLon)]))
  return { w, h, depth, cov }
}


// Fasce come contorni vettoriali (lat, lon): nitide a ogni zoom. Un'immagine
// a celle di ~10 m ingrandita era sfocata da vicino (Baleari, 14/11/2026).
// Fascia [da, a) = (profondità ≥ da) meno (profondità ≥ a): gli anelli dei due
// livelli insieme, da riempire con la regola evenodd
async function fineZones(id, { key, bbox, lines, water, zones }) {
  let grid = fineGrids.get(key)
  if (!grid) {
    if (!lines) {
      self.postMessage({ id, missing: true })
      return
    }
    grid = buildFineGrid({ bbox, lines, water })
    fineGrids.set(key, grid)
    if (fineGrids.size > MAX_FINE) fineGrids.delete(fineGrids.keys().next().value)
  }
  const { w, h, depth } = grid
  const [s, wLon, n, e] = bbox
  if (!grid.values) {
    // Fuori dal rilievo e a terra: sotto ogni soglia
    const values = new Float64Array(w * h)
    for (let i = 0; i < values.length; i++) values[i] = Number.isNaN(depth[i]) ? -1e6 : depth[i]
    grid.values = values
    grid.rings = new Map()
  }
  const gen = contours().size([w, h]).smooth(true)
  const round = (v) => Math.round(v * 1e6) / 1e6
  const ringsAt = (t) => {
    if (!grid.rings.has(t)) {
      const rings = gen
        .contour(grid.values, t)
        .coordinates.flat()
        .map((ring) => ring.map(([x, y]) => [round(n - (y / h) * (n - s)), round(wLon + (x / w) * (e - wLon))]))
      grid.rings.set(t, rings)
    }
    return grid.rings.get(t)
  }
  const out = []
  for (const z of zones) {
    if (!z.on || !(z.to > z.from) || z.from < 0) continue
    const rings = [...ringsAt(z.from), ...ringsAt(z.to)]
    if (rings.length) out.push({ color: z.color, rings })
  }
  self.postMessage({ id, fine: true, zones: out, cov: grid.cov })
}

/** Profondità della griglia fine nel punto, o null (per il puntatore) */
function fineDepth(id, { key, bbox, lat, lon }) {
  const grid = fineGrids.get(key)
  if (!grid) return self.postMessage({ id, depth: null })
  const [s, wLon, n, e] = bbox
  const x = Math.floor(((lon - wLon) / (e - wLon)) * grid.w)
  const y = Math.floor(((n - lat) / (n - s)) * grid.h)
  const v = x >= 0 && y >= 0 && x < grid.w && y < grid.h ? grid.depth[y * grid.w + x] : NaN
  self.postMessage({ id, depth: Number.isNaN(v) ? null : v })
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
    else if (kind === 'fineZones') await fineZones(id, rest)
    else if (kind === 'fineDepth') fineDepth(id, rest)
    else throw new Error(`lavoro sconosciuto: ${kind}`)
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) })
  }
}
