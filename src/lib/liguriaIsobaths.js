/**
 * Isobate di dettaglio della Regione Liguria, dai rilievi multibeam costieri
 * del Piano di tutela dell'ambiente marino e costiero (WFS M2112, dati
 * aperti): ogni 1–5 m dalla riva fino a ~50 m. Sotto costa sono molto più
 * fedeli della griglia EMODnet (~115 m), che nelle baie dà fondali troppo
 * profondi. Fonte per HdIsobathLayer: blocchi di 0,05° caricati via WFS,
 * semplificati e tenuti in memoria; la copertura di ogni blocco (inviluppo
 * delle isobate) nasconde lì le isobate EMODnet.
 */
import L from 'leaflet'
import { LIGURIA_BOUNDS } from './seagrass.js'

const WFS = 'https://geoservizi.regione.liguria.it/geoserver/M2112/wfs'
const LAYER = 'M2112:L7174'
const CELL = 0.05 // gradi: ~4 × 5,5 km
const MAX_CELLS = 12
const TOLERANCE = 0.00002 // gradi, ~2 m
const AREA = L.latLngBounds(LIGURIA_BOUNDS)

const cells = new Map() // "i,j" -> Promise<{ lines, cov }>

// Douglas-Peucker in gradi (le linee arrivano con un vertice ogni ~5 m)
function simplify(points) {
  if (points.length < 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ay, ax] = points[a]
    const [by, bx] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-18
    let max = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [py, px] = points[i]
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py)
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > TOLERANCE) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

// Inviluppo convesso (monotone chain) dei punti [lat, lon]: area rilevata
function hull(points) {
  const pts = [...points].sort((p, q) => p[1] - q[1] || p[0] - q[0])
  const cross = (o, a, b) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function loadCell(name) {
  if (!cells.has(name)) {
    const [i, j] = name.split(',').map(Number)
    const bbox = [i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL].map((v) => v.toFixed(4)).join(',')
    const url =
      `${WFS}?service=WFS&version=1.0.0&request=GetFeature&typeName=${LAYER}` +
      `&outputFormat=application/json&srsName=EPSG:4326&bbox=${bbox},EPSG:4326`
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Regione Liguria WFS ${r.status}`)
        return r.json()
      })
      .then((json) => {
        const lines = []
        const all = []
        for (const f of json.features || []) {
          const depth = -Number(f.properties.VALUE)
          if (!(depth > 0)) continue
          const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
          for (const part of parts) {
            const path = simplify(part.map(([lon, lat]) => [lat, lon]))
            if (path.length < 2) continue
            lines.push({ depth, path })
            for (let k = 0; k < path.length; k += 4) all.push(path[k])
          }
        }
        return { lines, cov: all.length >= 3 ? [hull(all)] : [] }
      })
    p.catch(() => cells.delete(name))
    cells.set(name, p)
  }
  return cells.get(name)
}

/** Fonte per HdIsobathLayer: blocchi della Liguria nella vista */
export const LIGURIA_ISOBATH_SOURCE = {
  names(view) {
    if (!AREA.intersects(view)) return Promise.resolve([])
    const i0 = Math.floor(Math.max(view.getWest(), AREA.getWest()) / CELL)
    const i1 = Math.floor(Math.min(view.getEast(), AREA.getEast()) / CELL)
    const j0 = Math.floor(Math.max(view.getSouth(), AREA.getSouth()) / CELL)
    const j1 = Math.floor(Math.min(view.getNorth(), AREA.getNorth()) / CELL)
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_CELLS) return Promise.resolve([])
    const names = []
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) names.push(`${i},${j}`)
    return Promise.resolve(names)
  },
  load: loadCell,
}
