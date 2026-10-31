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

// Quota Shom (m, negativa in mare) da una griglia già caricata, o null
function hdValue(index, grids, lat, lon) {
  if (!index.grid) return null
  const { cell, size, nodata } = index.grid
  const [x, y] = toLambert93(lat, lon)
  for (const t of index.list) {
    // Il riquadro lat/lon del tassello è approssimato (in Lambert-93 è un
    // quadrato, qui leggermente ruotato): decide la posizione nella griglia
    const grid = grids.get(t.name)
    if (!grid || !t.origin) continue
    const [x0, y0] = t.origin
    const c = (x - x0) / cell
    const r = (y0 - y) / cell
    if (c < -0.5 || r < -0.5 || c > size - 0.5 || r > size - 0.5) continue
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

// Quota EMODnet da un blocco già caricato, o null
function emodnetValue(blocks, lat, lon) {
  const block = blocks.get(`${blockIndex(lon)},${blockIndex(lat)}`)
  if (!block) return null
  // Centro della cella (I, J) in ((I + 0.5) / 960, (J + 0.5) / 960); righe da nord
  const c = lon * CELLS_PER_DEGREE - 0.5 - block.i0
  const r = block.jTop + 0.5 - lat * CELLS_PER_DEGREE
  const get = (cc, rr) => (cc < 0 || rr < 0 || cc >= block.width || rr >= block.height ? null : block.values[rr * block.width + cc])
  return bilinear(get, c, r)
}

// EMODnet vicino alla costa e nei porti non vale per la barca: le celle da
// ~115 m mescolano mare, moli e banchine (in porto a 9 m dava 0,3 m). È
// affidabile solo se tutte le celle attorno (±2, circa 230 m) sono mare
// più profondo di RELIABLE_MIN_M.
const RELIABLE_RADIUS = 2
const RELIABLE_MIN_M = 5

function emodnetCell(blocks, lat, lon) {
  const block = blocks.get(`${blockIndex(lon)},${blockIndex(lat)}`)
  if (!block) return null
  const c = Math.round(lon * CELLS_PER_DEGREE - 0.5 - block.i0)
  const r = Math.round(block.jTop + 0.5 - lat * CELLS_PER_DEGREE)
  return c < 0 || r < 0 || c >= block.width || r >= block.height ? null : block.values[r * block.width + c]
}

function emodnetReliable(blocks, lat, lon) {
  for (let dy = -RELIABLE_RADIUS; dy <= RELIABLE_RADIUS; dy++) {
    for (let dx = -RELIABLE_RADIUS; dx <= RELIABLE_RADIUS; dx++) {
      const v = emodnetCell(blocks, lat + dy / CELLS_PER_DEGREE, lon + dx / CELLS_PER_DEGREE)
      if (v == null || v > -RELIABLE_MIN_M) return false
    }
  }
  return true
}

/**
 * Carica i dati che coprono i punti dati ([lat, lon][]) e restituisce un
 * campionatore sincrono (lat, lon) → { depth, source } | null, per controllare
 * migliaia di punti senza attese (controllo e aggiramento delle rotte).
 * Fuori dai dati caricati risponde null.
 */
export async function prepareDepth(points) {
  const index = await loadIndex()
  const blockKeys = new Map()
  const hdNames = new Set()
  for (const [lat, lon] of points) {
    blockKeys.set(`${blockIndex(lon)},${blockIndex(lat)}`, [blockIndex(lon), blockIndex(lat)])
    for (const t of index.list) if (t.origin && t.bounds.pad(0.1).contains([lat, lon])) hdNames.add(t.name)
  }
  const blocks = new Map()
  const grids = new Map()
  await Promise.all([
    ...[...blockKeys].map(([key, [bx, by]]) =>
      loadBlock(bx, by)
        .then((b) => blocks.set(key, b))
        .catch(() => {})
    ),
    ...[...hdNames].map((name) =>
      loadHdGrid(name)
        .then((g) => grids.set(name, g))
        .catch(() => {})
    ),
  ])
  return (lat, lon) => {
    let v = hdValue(index, grids, lat, lon)
    let source = 'Shom'
    if (v == null) {
      v = emodnetValue(blocks, lat, lon)
      source = 'EMODnet'
    }
    if (v == null || v >= 0) return null
    return { depth: -v, source, reliable: source === 'Shom' || emodnetReliable(blocks, lat, lon) }
  }
}

/**
 * { depth: metri sotto il livello del mare, source: 'Shom' | 'EMODnet',
 * reliable: false per EMODnet vicino alla costa o in porto }, oppure null a
 * terra o senza dati.
 */
export async function depthAt(lat, lon) {
  // Anche i blocchi vicini, per giudicare le celle attorno
  const d = (RELIABLE_RADIUS + 1) / CELLS_PER_DEGREE
  const sample = await prepareDepth([[lat, lon], [lat - d, lon - d], [lat - d, lon + d], [lat + d, lon - d], [lat + d, lon + d]])
  return sample(lat, lon)
}
