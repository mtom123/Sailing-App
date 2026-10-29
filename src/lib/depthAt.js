/**
 * Profondità in un punto, dalla fonte migliore disponibile:
 *  - rilievi Litto3D del Shom (griglia a 10 m, public/isobaths-hd/*.bin),
 *  - altrimenti il modello EMODnet (celle da ~115 m, depthGrid.js).
 * Interpolazione bilineare tra i quattro centri cella vicini.
 */
import { loadBlock, blockIndex, CELLS_PER_DEGREE } from './depthGrid.js'
import { loadIndex, HD_BASE } from './hdIsobathLayer.js'

// Lambert-93 (EPSG:2154): conica conforme secante, ellissoide GRS80
const A = 6378137
const E = 0.08181919104281579
const rad = Math.PI / 180
const tFn = (phi) => Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2)
const mFn = (phi) => Math.cos(phi) / Math.sqrt(1 - E * E * Math.sin(phi) ** 2)
const P1 = 49 * rad
const P2 = 44 * rad
const N = (Math.log(mFn(P1)) - Math.log(mFn(P2))) / (Math.log(tFn(P1)) - Math.log(tFn(P2)))
const F = mFn(P1) / (N * Math.pow(tFn(P1), N))
const RHO0 = A * F * Math.pow(tFn(46.5 * rad), N)

/** [x, y] Lambert-93 di un punto WGS84 (differenza con RGF93 trascurabile). */
export function toLambert93(lat, lon) {
  const rho = A * F * Math.pow(tFn(lat * rad), N)
  const theta = N * (lon - 3) * rad
  return [700000 + rho * Math.sin(theta), 6600000 + RHO0 - rho * Math.cos(theta)]
}

// Bilineare su una griglia: get(c, r) → valore o null; c, r frazionari
function bilinear(get, c, r) {
  const c0 = Math.floor(c)
  const r0 = Math.floor(r)
  const fc = c - c0
  const fr = r - r0
  let sum = 0
  let wsum = 0
  for (const [dc, dr, w] of [
    [0, 0, (1 - fc) * (1 - fr)],
    [1, 0, fc * (1 - fr)],
    [0, 1, (1 - fc) * fr],
    [1, 1, fc * fr],
  ]) {
    const v = get(c0 + dc, r0 + dr)
    if (v == null || w === 0) continue
    sum += v * w
    wsum += w
  }
  return wsum > 0 ? sum / wsum : null
}

const hdGrids = new Map() // nome -> Promise<Int16Array>
function loadHdGrid(name) {
  if (!hdGrids.has(name)) {
    const p = fetch(`${HD_BASE}${name}.bin`)
      .then((r) => {
        if (!r.ok) throw new Error(`griglia HD ${r.status}`)
        return r.arrayBuffer()
      })
      .then((buf) => new Int16Array(buf))
    p.catch(() => hdGrids.delete(name))
    hdGrids.set(name, p)
  }
  return hdGrids.get(name)
}

async function hdDepth(lat, lon) {
  const index = await loadIndex()
  if (!index.grid) return null
  const { cell, size, nodata } = index.grid
  const [x, y] = toLambert93(lat, lon)
  for (const t of index.list) {
    // Il riquadro lat/lon del tassello è approssimato (in Lambert-93 è un
    // quadrato, qui leggermente ruotato): decide la posizione nella griglia
    if (!t.origin || !t.bounds.pad(0.1).contains([lat, lon])) continue
    const [x0, y0] = t.origin
    const c = (x - x0) / cell
    const r = (y0 - y) / cell
    if (c < -0.5 || r < -0.5 || c > size - 0.5 || r > size - 0.5) continue
    const grid = await loadHdGrid(t.name)
    const get = (cc, rr) => {
      if (cc < 0 || rr < 0 || cc >= size || rr >= size) return null
      const v = grid[rr * size + cc]
      return v === nodata ? null : v / 10
    }
    const v = bilinear(get, c, r)
    if (v != null) return v
  }
  return null
}

async function emodnetDepth(lat, lon) {
  const block = await loadBlock(blockIndex(lon), blockIndex(lat))
  // Centro della cella (I, J) in ((I + 0.5) / 960, (J + 0.5) / 960); righe da nord
  const c = lon * CELLS_PER_DEGREE - 0.5 - block.i0
  const r = block.jTop + 0.5 - lat * CELLS_PER_DEGREE
  const get = (cc, rr) => (cc < 0 || rr < 0 || cc >= block.width || rr >= block.height ? null : block.values[rr * block.width + cc])
  return bilinear(get, c, r)
}

/**
 * { depth: metri sotto il livello del mare, source: 'Shom' | 'EMODnet' },
 * oppure null a terra o senza dati.
 */
export async function depthAt(lat, lon) {
  let v = null
  let source = 'Shom'
  try {
    v = await hdDepth(lat, lon)
  } catch {
    v = null
  }
  if (v == null) {
    source = 'EMODnet'
    try {
      v = await emodnetDepth(lat, lon)
    } catch {
      v = null
    }
  }
  if (v == null || v >= 0) return null
  return { depth: -v, source }
}
