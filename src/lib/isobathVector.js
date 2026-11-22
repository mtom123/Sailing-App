/**
 * Isobate e fasce di acque basse calcolate nell'app dalla griglia EMODnet
 * (vedi depthGrid.js), come geometrie vettoriali: restano nitide a ogni zoom.
 */
import { contours } from 'd3-contour'
import { CELLS_PER_DEGREE } from './depthGrid.js'
import { ISOBATH_LEVELS, SHALLOW_BANDS } from './isobaths.js'

const EPS = 1e-6

// d3-contour: il valore della cella (c, r) sta in (c + 0.5, r + 0.5).
// Con i bordi delle celle sui multipli di 1/960°: lon = (iMin + x) / 960,
// lat = (jMax + 1 - y) / 960 (righe da nord a sud).
function projector(grid) {
  return ([x, y]) => [(grid.jMax + 1 - y) / CELLS_PER_DEGREE, (grid.iMin + x) / CELLS_PER_DEGREE]
}

// Chaikin: arrotonda gli spigoli della griglia da ~115 m
export function chaikin(points, closed, iterations = 2) {
  let pts = points
  for (let it = 0; it < iterations; it++) {
    const out = closed ? [] : [pts[0]]
    const n = pts.length - 1
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[i + 1]
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1])
      out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1])
    }
    if (closed) out.push(out[0])
    else out.push(pts[pts.length - 1])
    pts = out
  }
  return pts
}

/**
 * Divide un anello chiuso in tratti aperti togliendo i segmenti sul bordo
 * della griglia: lì d3-contour chiude il poligono, ma non è un'isobata.
 */
export function splitOnFrame(ring, width, height) {
  const onFrame = ([x, y]) => x <= EPS || y <= EPS || x >= width - EPS || y >= height - EPS
  const n = ring.length - 1 // l'ultimo punto ripete il primo
  const frameSeg = (i) => onFrame(ring[i]) && onFrame(ring[(i + 1) % n])
  let start = -1
  for (let i = 0; i < n; i++) if (frameSeg(i)) { start = i; break }
  if (start === -1) return [{ points: ring, closed: true }]

  const runs = []
  let run = []
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n
    if (frameSeg((i - 1 + n) % n)) {
      if (run.length > 1) runs.push({ points: run, closed: false })
      run = [ring[i]]
    } else {
      run.push(ring[i])
    }
  }
  if (run.length > 1) runs.push({ points: run, closed: false })
  return runs
}

// Sotto costa EMODnet ha spesso una striscia di celle a ~0 m o senza dato
// (che qui vale +1) larga 2–3 celle IN MARE: a Finale arrivava a 250 m dalla
// spiaggia, dove ci sono 15–30 m. Trattata come riva, metteva lì le isobate
// da 2, 5 e 10 m. Quelle celle, se toccano il mare, prendono il valore del
// mare accanto (fino a COAST_GAP celle): le isobate basse tornano vicino alla
// terra vera (quota > 1,5 m), e la costa OSM taglia il resto
const COAST_GAP = 3
const UNCERTAIN_CELLS = 2
export function fillCoastalGaps({ width, height, values }) {
  const out = Float32Array.from(values)
  const unknown = (v) => v > -0.5 && v <= 1.5
  let filled = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i++) if (out[i] <= -0.5) filled[i] = 1
  for (let step = 0; step < COAST_GAP; step++) {
    const next = Uint8Array.from(filled)
    let changed = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        if (filled[i] || !unknown(values[i])) continue
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= height) continue
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if ((!dx && !dy) || xx < 0 || xx >= width) continue
            const j = yy * width + xx
            if (filled[j]) {
              sum += out[j]
              n++
            }
          }
        }
        if (n) {
          out[i] = sum / n
          next[i] = 1
          changed++
        }
      }
    }
    filled = next
    if (!changed) break
  }
  return out
}

/**
 * @param grid  griglia unita (mergeBlocks)
 * @returns {{ lines: {depth, path: [lat, lon][]}[], bands: {color, opacity, rings: [lat, lon][][]}[] }}
 */
export function buildIsobaths(grid) {
  const { width, height } = grid
  const values = fillCoastalGaps(grid)
  const toLatLng = projector(grid)
  const gen = contours().size([width, height])
  const ringsAt = new Map()
  const rings = (depth) => {
    if (!ringsAt.has(depth)) {
      const geom = gen.contour(values, -depth)
      ringsAt.set(depth, geom.coordinates.flat())
    }
    return ringsAt.get(depth)
  }

  const lines = []
  for (const depth of ISOBATH_LEVELS) {
    for (const ring of rings(depth)) {
      for (const { points, closed } of splitOnFrame(ring, width, height)) {
        lines.push({ depth, path: chaikin(points, closed).map(toLatLng) })
      }
    }
  }

  // Fascia tra due profondità = (fondale ≥ -giù) meno (fondale ≥ -su):
  // gli anelli dei due livelli insieme, riempiti con la regola evenodd
  const bands = []
  let upper = 0
  for (const [depth, color, opacity] of SHALLOW_BANDS) {
    const ringsBand = [...rings(depth), ...rings(upper)].map((r) => chaikin(r, true).map(toLatLng))
    if (ringsBand.length) bands.push({ color, opacity, rings: ringsBand })
    upper = depth
  }
  // Fascia costiera incerta: entro UNCERTAIN_CELLS celle (~230 m) da celle di
  // terra, a 0 m o senza dato. Lì la griglia da ~115 m "spalma" il fondale
  // verso lo zero (Capo San Donato: 1–2 m per 300 m fuori dal porto): niente
  // colori di profondità, ma un tratteggio "dato incerto"
  const near = new Float64Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!(grid.values[y * width + x] > -0.5)) continue
      for (let dy = -UNCERTAIN_CELLS; dy <= UNCERTAIN_CELLS; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= height) continue
        for (let dx = -UNCERTAIN_CELLS; dx <= UNCERTAIN_CELLS; dx++) {
          const xx = x + dx
          if (xx >= 0 && xx < width && dx * dx + dy * dy <= UNCERTAIN_CELLS * UNCERTAIN_CELLS + 1) near[yy * width + xx] = 1
        }
      }
    }
  }
  const uncertainRings = gen
    .contour(near, 0.5)
    .coordinates.flat()
    .map((r) => chaikin(r, true).map(toLatLng))

  // Anelli lisci (lat, lon) dell'area meno profonda di `depth` (terra compresa),
  // per le fasce personali: calcolati alla prima richiesta e tenuti
  const smooth = new Map()
  const ringsLatLng = (depth) => {
    if (!smooth.has(depth)) smooth.set(depth, rings(depth).map((r) => chaikin(r, true).map(toLatLng)))
    return smooth.get(depth)
  }
  return { lines, bands, ringsLatLng, uncertainRings }
}
