/*
 * Un riquadro di 0,05° della carta TIMONE: le fonti fuse in una griglia fine
 * (1/9600 di grado, ~8 × 12 m), poi fasce di profondità, isobate, quote e
 * zone senza dati come elementi per il tagliatore (coordinate Mercatore 0..1).
 *
 * Regole della fusione, dalla più forte:
 *   1. terra (costa OpenStreetMap): profondità 0 come bordo
 *   2. rilievi (isobate multibeam della Regione Liguria, griglie Litto3D): valgono loro
 *   3. EMODnet, ma solo lontano dalla riva e dai rilievi: sotto costa sbaglia
 *   4. il resto (fascia costiera, spazi tra le isobate) si interpola con
 *      l'equazione di Laplace tra i valori fissati: superficie liscia, senza scalini
 * Dove nessun dato è vicino (porti, darsene) la zona è "senza dati".
 */
import { contours } from 'd3-contour'
import { chaikin, splitOnFrame } from '../../src/lib/isobathVector.js'
import { clipLineSafe, lonLatToMerc } from './tiler.js'

export const FINE = 9600 // celle per grado
export const CHUNK = 480 // celle per lato del riquadro (0,05°)
const BUF = 48 // celle di contesto per lato (~500 m)
const W = CHUNK + 2 * BUF
const R_SHORE = 15 // celle: EMODnet più vicino di così alla riva non vale
const R_HD = 40 // celle: oltre questa distanza dai rilievi torna EMODnet
const R_NODATA = 30 // celle: più lontano di così da ogni dato = senza dati
const R_HARBOR = 45 // celle (~450 m) intorno a un porto: la riva non è a 0 m
const R_HARBOR_DATA = 12 // celle: lì vale solo ciò che è vicino a un dato vero

// Isobate: quelle del modello ovunque, le altre solo dove c'è il rilievo
export const MODEL_LEVELS = [2, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 1500, 2000, 2500]
export const SURVEY_LEVELS = [
  1, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 24, 25, 26, 28, 32, 34, 35, 40, 45,
]
export const BANDS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 100, 200, 500, 1000, 2000]

// ------------------------------------------------------------------ utilità

/** Distanza (in celle, chamfer 3-4) dalle celle con seed[k] = 1 */
function distance(seed, w, h) {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let k = 0; k < d.length; k++) d[k] = seed[k] ? 0 : INF
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      let v = d[k]
      if (x > 0) v = Math.min(v, d[k - 1] + 3)
      if (y > 0) {
        v = Math.min(v, d[k - w] + 3)
        if (x > 0) v = Math.min(v, d[k - w - 1] + 4)
        if (x < w - 1) v = Math.min(v, d[k - w + 1] + 4)
      }
      d[k] = v
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const k = y * w + x
      let v = d[k]
      if (x < w - 1) v = Math.min(v, d[k + 1] + 3)
      if (y < h - 1) {
        v = Math.min(v, d[k + w] + 3)
        if (x < w - 1) v = Math.min(v, d[k + w + 1] + 4)
        if (x > 0) v = Math.min(v, d[k + w - 1] + 4)
      }
      d[k] = v
    }
  }
  for (let k = 0; k < d.length; k++) d[k] /= 3
  return d
}

/** SOR di Laplace sulle celle non fissate (Neumann sul bordo della griglia) */
function relax(u, fixed, w, h, iterations, omega = 1.85) {
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = y * w + x
        if (fixed[k]) continue
        let s = 0
        let n = 0
        if (x > 0) (s += u[k - 1]), n++
        if (x < w - 1) (s += u[k + 1]), n++
        if (y > 0) (s += u[k - w]), n++
        if (y < h - 1) (s += u[k + w]), n++
        u[k] += omega * (s / n - u[k])
      }
    }
  }
}

/** Laplace a due livelli: prima a 1/4 della risoluzione, poi fine */
function solve(u, fixed, w, h) {
  const F = 4
  const cw = Math.ceil(w / F)
  const ch = Math.ceil(h / F)
  const cu = new Float32Array(cw * ch)
  const cf = new Uint8Array(cw * ch)
  const sum = new Float32Array(cw * ch)
  const cnt = new Uint16Array(cw * ch)
  const all = new Float32Array(cw * ch)
  const allN = new Uint16Array(cw * ch)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      const c = Math.floor(y / F) * cw + Math.floor(x / F)
      all[c] += u[k]
      allN[c]++
      if (fixed[k]) {
        sum[c] += u[k]
        cnt[c]++
      }
    }
  }
  for (let c = 0; c < cu.length; c++) {
    if (cnt[c]) {
      cf[c] = 1
      cu[c] = sum[c] / cnt[c]
    } else cu[c] = all[c] / allN[c]
  }
  relax(cu, cf, cw, ch, 300)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      if (!fixed[k]) u[k] = cu[Math.floor(y / F) * cw + Math.floor(x / F)]
    }
  }
  relax(u, fixed, w, h, 120)
}

/** Sutherland per un tratto della griglia: punti in coordinate della griglia → [lon, lat] */
function makeProjector(iSub0, jSubTop) {
  return ([X, Y]) => lonLatToMerc((iSub0 + X) / FINE, (jSubTop + 1 - Y) / FINE)
}

// Douglas–Peucker in coordinate della griglia
function simplifyGrid(pts, tol) {
  const n = pts.length
  if (n < 3) return pts
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack = [0, n - 1]
  const t2 = tol * tol
  while (stack.length) {
    const b = stack.pop()
    const a = stack.pop()
    const [ax, ay] = pts[a]
    const dx = pts[b][0] - ax
    const dy = pts[b][1] - ay
    const len2 = dx * dx + dy * dy
    let max = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      let px = pts[i][0] - ax
      let py = pts[i][1] - ay
      if (len2 > 0) {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2))
        px -= t * dx
        py -= t * dy
      }
      const d = px * px + py * py
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > t2 && idx > 0) {
      keep[idx] = 1
      stack.push(a, idx, idx, b)
    }
  }
  return pts.filter((_, i) => keep[i])
}

// ------------------------------------------------------------- acqua (OSM)

/**
 * Celle d'acqua secondo i tasselli OpenFreeMap z14 (pari-dispari sugli anelli).
 * getTile(x, y) -> { extent, rings } | null; null = si decide con EMODnet.
 */
function waterMask(iStart, jTop, getTile, em, harborSeed) {
  const water = new Uint8Array(W * W)
  const Z = 2 ** 14
  const mx = new Float64Array(W)
  for (let c = 0; c < W; c++) mx[c] = lonLatToMerc((iStart + c + 0.5) / FINE, 0)[0] * Z
  for (let r = 0; r < W; r++) {
    const lat = (jTop - r + 0.5) / FINE
    const my = lonLatToMerc(0, lat)[1] * Z
    const ty = Math.floor(my)
    let c = 0
    while (c < W) {
      const tx = Math.floor(mx[c])
      let end = c
      while (end < W && Math.floor(mx[end]) === tx) end++
      const tile = getTile(tx, ty)
      if (tile && tile.harbors?.length && !tile.harborsDone) {
        // porti del tassello nella griglia (una volta per tassello)
        tile.harborsDone = new Set()
      }
      if (tile && tile.harbors?.length && !tile.harborsDone.has(`${iStart},${jTop}`)) {
        tile.harborsDone.add(`${iStart},${jTop}`)
        for (const [hx, hy] of tile.harbors) {
          const merc = [(tx + hx / tile.extent) / Z, (ty + hy / tile.extent) / Z]
          const lon = merc[0] * 360 - 180
          const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * merc[1]))) * 180) / Math.PI
          const hc = Math.floor(lon * FINE - iStart)
          const hr = Math.floor(jTop + 1 - lat * FINE)
          if (hc >= 0 && hr >= 0 && hc < W && hr < W) harborSeed[hr * W + hc] = 1
        }
      }
      if (!tile) {
        for (let k = c; k < end; k++) water[r * W + k] = em[r * W + k] < 0 ? 1 : 0
      } else {
        const py = (my - ty) * tile.extent
        const xs = []
        for (const ring of tile.rings) {
          for (let i = 0, n = ring.length; i < n; i++) {
            const a = ring[i]
            const b = ring[(i + 1) % n]
            if (a[1] > py !== b[1] > py) xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]))
          }
        }
        xs.sort((p, q) => p - q)
        let idx = 0
        for (let k = c; k < end; k++) {
          const px = (mx[k] - tx) * tile.extent
          while (idx < xs.length && xs[idx] < px) idx++
          water[r * W + k] = idx % 2
        }
      }
      c = end
    }
  }
  return water
}

// -------------------------------------------------------- riquadro fine

/**
 * ctx: {
 *   emod: griglia EMODnet (sample(lon, lat)),
 *   getWaterTile(x, y): tassello d'acqua z14 già caricato o null,
 *   surveyLines: [{ depth, pts: [[lon, lat]…] }] nel riquadro (con contesto),
 *   surveyGrid(lon, lat): quota del rilievo a griglia (Litto3D) o NaN,
 * }
 */
export function fineChunk(ci, cj, ctx) {
  const iStart = ci * CHUNK - BUF
  const jTop = (cj + 1) * CHUNK - 1 + BUF
  const N = W * W
  const em = new Float32Array(N)
  const hd = new Float32Array(N).fill(NaN)
  for (let r = 0; r < W; r++) {
    const lat = (jTop - r + 0.5) / FINE
    for (let c = 0; c < W; c++) {
      const lon = (iStart + c + 0.5) / FINE
      em[r * W + c] = ctx.emod.sample(lon, lat)
      if (ctx.surveyGrid) {
        const v = ctx.surveyGrid(lon, lat)
        if (Number.isFinite(v)) hd[r * W + c] = v
      }
    }
  }
  const harborSeed = new Uint8Array(N)
  const water = waterMask(iStart, jTop, ctx.getWaterTile, em, harborSeed)

  // isobate del rilievo bruciate nella griglia
  const lineSeed = new Uint8Array(N)
  for (const { depth, pts } of ctx.surveyLines || []) {
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = pts[i][0] * FINE - iStart
      const y0 = jTop + 1 - pts[i][1] * FINE
      const x1 = pts[i + 1][0] * FINE - iStart
      const y1 = jTop + 1 - pts[i + 1][1] * FINE
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2))
      for (let s = 0; s <= steps; s++) {
        const x = Math.floor(x0 + ((x1 - x0) * s) / steps)
        const y = Math.floor(y0 + ((y1 - y0) * s) / steps)
        if (x < 0 || y < 0 || x >= W || y >= W) continue
        const k = y * W + x
        if (water[k]) {
          hd[k] = -depth
          lineSeed[k] = 1
        }
      }
    }
  }

  const land = new Uint8Array(N)
  const hdSeed = new Uint8Array(N)
  let anyWater = false
  for (let k = 0; k < N; k++) {
    land[k] = water[k] ? 0 : 1
    if (water[k]) anyWater = true
    if (water[k] && Number.isFinite(hd[k])) hdSeed[k] = 1
  }
  if (!anyWater) return null
  const dShore = distance(land, W, W)
  const dHd = distance(hdSeed, W, W)

  // valori fissati e incognite
  const u = new Float32Array(N)
  const fixed = new Uint8Array(N)
  const dataSeed = new Uint8Array(N)
  for (let k = 0; k < N; k++) {
    if (land[k]) {
      fixed[k] = 1
      u[k] = 0
    } else if (hdSeed[k]) {
      fixed[k] = 1
      u[k] = hd[k]
      dataSeed[k] = 1
    } else if (dHd[k] > R_HD && dShore[k] > R_SHORE && em[k] < -0.5) {
      fixed[k] = 1
      u[k] = em[k]
      dataSeed[k] = 1
    } else u[k] = Number.isFinite(em[k]) ? Math.min(0, em[k]) : 0
  }
  solve(u, fixed, W, W)
  const dData = distance(dataSeed, W, W)

  // Le isobate bruciate nelle celle lasciano scalini: dove ci sono, la superficie
  // si liscia (per fasce e quote) e le isobate restano quelle originali
  const dLine = distance(lineSeed, W, W)
  for (let pass = 0; pass < 3; pass++) {
    const src = Float32Array.from(u)
    for (let y = 1; y < W - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const k = y * W + x
        if (land[k] || dLine[k] > R_HD) continue
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const j = k + dy * W + dx
            if (!land[j]) {
              sum += src[j]
              n++
            }
          }
        u[k] = sum / n
      }
    }
  }
  const surveyDepths = new Set((ctx.surveyLines || []).map((l) => l.depth))

  // qualità: 2 rilievo, 1 modello, 0 senza dati o terra
  const dHarbor = distance(harborSeed, W, W)
  const quality = new Uint8Array(N)
  for (let k = 0; k < N; k++) {
    if (land[k]) continue
    if (dData[k] > R_NODATA) continue
    if (dHarbor[k] <= R_HARBOR && dData[k] > R_HARBOR_DATA) continue
    quality[k] = dHd[k] <= R_HD ? 2 : 1
  }

  // sotto-griglia del riquadro con una cella in più per lato
  const S = CHUNK + 2
  const o = BUF - 1
  const lineVals = new Float64Array(S * S)
  const bandVals = new Float64Array(S * S)
  const noData = new Float64Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = (y + o) * W + (x + o)
      const v = land[k] ? 1 : u[k]
      lineVals[y * S + x] = v
      bandVals[y * S + x] = !land[k] && !quality[k] ? -99999 : v
      noData[y * S + x] = !land[k] && !quality[k] ? 1 : 0
    }
  }
  const proj = makeProjector(iStart + o, jTop - o)
  // qualità al vertice; 0 dove la linea originale del rilievo prende il suo posto
  const qAt = ([X, Y], d) => {
    const x = Math.min(S - 1, Math.max(0, Math.floor(X)))
    const y = Math.min(S - 1, Math.max(0, Math.floor(Y)))
    const k = (y + o) * W + (x + o)
    if (dLine[k] <= R_HD && surveyDepths.has(d)) return 0
    return quality[k]
  }
  const gen = contours().size([S, S])
  const features = []

  // isobate
  const levels = [...MODEL_LEVELS.map((d) => [d, false]), ...SURVEY_LEVELS.map((d) => [d, true])]
  for (const [d, surveyOnly] of levels) {
    const geom = gen.contour(lineVals, -d)
    for (const poly of geom.coordinates) {
      for (const ring of poly) {
        for (const { points: open } of splitOnFrame(ring, S, S)) {
          // tratti per qualità; il vertice di passaggio sta in entrambi
          let run = []
          let runQ = -1
          const flush = () => {
            if (run.length >= 2 && runQ >= (surveyOnly ? 2 : 1)) {
              const pts = simplifyGrid(chaikin(run, false, 1), 0.2).map(proj)
              features.push({ layer: 'depcnt', type: 2, props: { d, q: runQ === 2 ? 1 : 0 }, geom: pts })
            }
          }
          for (let i = 0; i < open.length; i++) {
            const p = open[i]
            const qp = qAt(p, d)
            if (qp !== runQ) {
              const prev = run[run.length - 1]
              flush()
              run = prev ? [prev] : []
              runQ = qp
            }
            run.push(p)
          }
          flush()
        }
      }
    }
  }

  // isobate originali del rilievo, tagliate al riquadro (ognuna una volta sola)
  const lon0 = (ci * CHUNK) / FINE
  const lon1 = ((ci + 1) * CHUNK) / FINE
  const lat0 = (cj * CHUNK) / FINE
  const lat1 = ((cj + 1) * CHUNK) / FINE
  for (const { depth, pts } of ctx.surveyLines || []) {
    for (const a of clipLineSafe(pts, 0, lon0, lon1)) {
      for (const b of clipLineSafe(a, 1, lat0, lat1)) {
        const line = simplifyGrid(chaikin(b, false, 1), 0.00001).map(([lon, lat]) => lonLatToMerc(lon, lat))
        if (line.length >= 2) features.push({ layer: 'depcnt', type: 2, props: { d: depth, q: 1 }, geom: line })
      }
    }
  }

  // fasce: area con fondale ≤ d (terra compresa, la copre la terra della carta)
  for (const d of BANDS) {
    const geom = gen.contour(bandVals, -d)
    const polys = geom.coordinates
      .map((poly) => poly.map((ring) => simplifyGrid(ring, 0.2).map(proj)))
      .filter((poly) => poly[0].length >= 4)
    if (polys.length) features.push({ layer: 'depare', type: 3, props: { d }, geom: polys })
  }

  // zone senza dati (porti, darsene non rilevate)
  const nd = gen.contour(noData, 0.5)
  const ndPolys = nd.coordinates.map((poly) => poly.map((ring) => simplifyGrid(ring, 0.3).map(proj))).filter((p) => p[0].length >= 4)
  if (ndPolys.length) features.push({ layer: 'nodata', type: 3, props: {}, geom: ndPolys })

  // quote: in ogni blocco (20 celle col rilievo, 48 col modello) la più bassa
  // della sua metà centrale, così restano distanziate ma non a griglia
  const soundings = []
  for (const [step, want, minDepth] of [
    [20, 2, 0.3],
    [48, 1, 1],
  ]) {
    const q0 = step / 4
    for (let by = 0; by < CHUNK; by += step) {
      for (let bx = 0; bx < CHUNK; bx += step) {
        let best = -1
        let bestDepth = Infinity
        for (let y = BUF + by + q0; y < BUF + by + step - q0; y++) {
          for (let x = BUF + bx + q0; x < BUF + bx + step - q0; x++) {
            const k = y * W + x
            if (quality[k] !== want || dShore[k] < 3) continue
            const depth = -u[k]
            if (depth >= minDepth && depth < bestDepth) {
              bestDepth = depth
              best = k
            }
          }
        }
        if (best < 0) continue
        const x = best % W
        const y = (best - x) / W
        soundings.push({ geom: lonLatToMerc((iStart + x + 0.5) / FINE, (jTop - y + 0.5) / FINE), depth: bestDepth, q: want === 2 ? 1 : 0 })
      }
    }
  }
  return { features, soundings }
}

// ------------------------------------------------------ riquadro al largo

const EMOD_CELLS = 960
/** Riquadro solo EMODnet (fondali oltre 100 m, niente costa): griglia nativa */
export function coarseChunk(ci, cj, emod) {
  const n = (CHUNK * EMOD_CELLS) / FINE // 48 celle EMODnet
  const i0 = ci * n - 1
  const jTopE = (cj + 1) * n // riga nord con una cella in più
  const S = n + 2
  const vals = new Float64Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = emod.at(i0 + x, jTopE - y)
      vals[y * S + x] = Number.isFinite(v) ? v : -99999
    }
  }
  const proj = ([X, Y]) => lonLatToMerc((i0 + X) / EMOD_CELLS, (jTopE + 1 - Y) / EMOD_CELLS)
  const gen = contours().size([S, S])
  const features = []
  for (const d of MODEL_LEVELS) {
    const geom = gen.contour(vals, -d)
    for (const poly of geom.coordinates)
      for (const ring of poly)
        for (const { points: open, closed } of splitOnFrame(ring, S, S)) {
          if (open.length < 2) continue
          features.push({ layer: 'depcnt', type: 2, props: { d, q: 0 }, geom: chaikin(open, closed, 2).map(proj) })
        }
  }
  for (const d of BANDS) {
    const geom = gen.contour(vals, -d)
    if (geom.coordinates.length)
      features.push({ layer: 'depare', type: 3, props: { d }, geom: geom.coordinates.map((poly) => poly.map((ring) => ring.map(proj))) })
  }
  const soundings = []
  for (let y = 6; y < n; y += 12)
    for (let x = 6; x < n; x += 12) {
      const v = emod.at(i0 + 1 + x, jTopE - 1 - y)
      if (Number.isFinite(v) && v < -1)
        soundings.push({ geom: lonLatToMerc((i0 + 1 + x + 0.5) / EMOD_CELLS, (jTopE - 1 - y + 0.5) / EMOD_CELLS), depth: -v, q: 0 })
    }
  return { features, soundings }
}
