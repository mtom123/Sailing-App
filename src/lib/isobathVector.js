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

/**
 * @param grid  griglia unita (mergeBlocks)
 * @returns {{ lines: {depth, path: [lat, lon][]}[], bands: {color, opacity, rings: [lat, lon][][]}[] }}
 */
export function buildIsobaths(grid) {
  const { width, height, values } = grid
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
  return { lines, bands }
}
