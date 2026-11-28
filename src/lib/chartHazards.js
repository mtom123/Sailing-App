/*
 * Ostacoli della Carta TIMONE per il controllo e l'aggiramento delle rotte:
 * le stesse fasce di fondale e gli stessi segnali che si vedono sulla carta.
 *
 * - Bassi fondali: le fasce 'depare' (area con fondale ≤ d) fino alla prima
 *   fascia che arriva alla profondità minima (pescaggio + margine). È la
 *   linea di sicurezza disegnata sulla carta: per 2,9 m vale la fascia dei
 *   3 m, per 6,5 m quella degli 8 m. Vince il meno profondo.
 * - Quote sotto la profondità minima ('soundg').
 * - Pericoli Open Waters (OpenStreetMap seamark): scogli, relitti,
 *   ostruzioni, piattaforme e pali. Uno scoglio conta se la sua profondità
 *   dichiarata ('depth') manca o è sotto la minima; 'seabed_depth' è il
 *   fondale del modello lì attorno, non la quota sopra lo scoglio.
 *
 * Tasselli dall'archivio (anche offline) tramite chartCache.js; geometrie in
 * metri Web Mercator. Ausilio alla pianificazione: dati indicativi.
 */
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { cartaTile, chartInfo, seamapTile } from './chartCache.js'

const HALF = Math.PI * 6378137 // mezzo giro in metri Web Mercator
// Fasce dei fondali della carta (tools/chart-tiles.mjs, BANDS)
const BANDS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 100, 200, 500, 1000, 2000]
const DANGER_TYPES = new Set(['rock', 'wreck', 'obstruction', 'platform', 'pile'])
const DANGER_NAMES = { rock: 'scoglio', wreck: 'relitto', obstruction: 'ostruzione', platform: 'piattaforma', pile: 'palo' }
const MAX_TILES = 48
const MIN_Z = 9
const CACHE_MAX = 400

/** Fascia della carta che fa da linea di sicurezza per la profondità minima */
export const safetyBand = (minDepth) => BANDS.find((d) => d >= minDepth) ?? BANDS[BANDS.length - 1]

const tileSize = (z) => (2 * HALF) / 2 ** z
function tileRange([minX, minY, maxX, maxY], z) {
  const size = tileSize(z)
  const n = 2 ** z
  const clamp = (v) => Math.min(n - 1, Math.max(0, v))
  const x0 = clamp(Math.floor((minX + HALF) / size))
  const x1 = clamp(Math.floor((maxX + HALF) / size))
  const y0 = clamp(Math.floor((HALF - maxY) / size))
  const y1 = clamp(Math.floor((HALF - minY) / size))
  const out = []
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ x, y })
  return out
}

// Geometria di un elemento del tassello (z, x, y) in metri Web Mercator
function toMerc(feature, z, x, y) {
  const size = tileSize(z)
  const k = size / feature.extent
  const x0 = -HALF + x * size
  const y0 = HALF - y * size
  return feature.loadGeometry().map((ring) => ring.map((p) => [x0 + p.x * k, y0 - p.y * k]))
}

const bboxOf = (rings) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return [minX, minY, maxX, maxY]
}

// Contenuto utile di un tassello, già decodificato (per fascia di sicurezza)
const tileCache = new Map()
function remember(key, value) {
  tileCache.set(key, value)
  if (tileCache.size > CACHE_MAX) tileCache.delete(tileCache.keys().next().value)
  return value
}

async function cartaPart(z, x, y, band, minDepth) {
  const key = `c${z}/${x}/${y}@${band}/${minDepth}`
  if (tileCache.has(key)) return tileCache.get(key)
  const buf = await cartaTile(z, x, y).catch(() => null)
  if (buf == null) return { have: false, areas: [], points: [] } // non salvato e niente rete: riprova poi
  const areas = []
  const points = []
  if (buf.byteLength) {
    const vt = new VectorTile(new Pbf(new Uint8Array(buf)))
    const depare = vt.layers.depare
    for (let i = 0; depare && i < depare.length; i++) {
      const f = depare.feature(i)
      const d = Number(f.properties.d)
      if (!(d <= band)) continue
      const rings = toMerc(f, z, x, y)
      areas.push({ rings, bbox: bboxOf(rings), depth: d, kind: 'shallow' })
    }
    const soundg = vt.layers.soundg
    for (let i = 0; soundg && i < soundg.length; i++) {
      const f = soundg.feature(i)
      const d = Number(f.properties.d)
      if (!(d < minDepth)) continue
      for (const [px, py] of toMerc(f, z, x, y)[0] || []) points.push({ x: px, y: py, depth: d, kind: 'shallow' })
    }
  }
  return remember(key, { have: true, areas, points })
}

async function seamapPart(z, x, y, minDepth) {
  const key = `s${z}/${x}/${y}@${minDepth}`
  if (tileCache.has(key)) return tileCache.get(key)
  const tile = await seamapTile(z, x, y).catch(() => null)
  if (!tile) return { areas: [], points: [] }
  const pkey = `s${tile.z}/${tile.x}/${tile.y}@${minDepth}`
  if (tileCache.has(pkey)) return tileCache.get(pkey)
  const areas = []
  const points = []
  if (tile.data.byteLength) {
    const vt = new VectorTile(new Pbf(new Uint8Array(tile.data)))
    const layer = vt.layers.seamark
    for (let i = 0; layer && i < layer.length; i++) {
      const f = layer.feature(i)
      const p = f.properties
      if (!DANGER_TYPES.has(p.type)) continue
      // reti e panne galleggianti sono ostacoli anche loro; quota dichiarata sopra il pericolo
      const depth = p.depth != null ? Number(p.depth) : null
      if (depth != null && depth >= minDepth) continue
      const name = p.name ? `${DANGER_NAMES[p.type]} ${p.name}` : DANGER_NAMES[p.type]
      const geom = toMerc(f, tile.z, tile.x, tile.y)
      if (f.type === 3) areas.push({ rings: geom, bbox: bboxOf(geom), depth, kind: 'danger', name })
      else for (const line of geom) for (const [px, py] of line) points.push({ x: px, y: py, depth, kind: 'danger', name })
    }
  }
  const part = { areas, points }
  remember(pkey, part)
  return remember(key, part)
}

/**
 * Ostacoli della carta nel riquadro [minX, minY, maxX, maxY] (metri Web
 * Mercator) per la profondità minima: { have, band, areas: [{ rings, bbox,
 * depth, kind: 'shallow'|'danger', name? }], points: [{ x, y, depth, kind,
 * name? }] }. have: false se la carta non c'è (niente rete e niente archivio).
 * Zoom il più fine possibile con al massimo MAX_TILES tasselli.
 */
export async function chartObstacles(box, minDepth) {
  const info = await chartInfo().catch(() => null)
  if (!info) return { have: false, band: safetyBand(minDepth), areas: [], points: [] }
  const zMax = Math.min(info.maxzoom ?? 14, 14)
  let z = zMax
  let tiles = tileRange(box, z)
  while (z > MIN_Z && tiles.length > MAX_TILES) tiles = tileRange(box, --z)
  const band = safetyBand(minDepth)
  const parts = await Promise.all(tiles.map(({ x, y }) => Promise.all([cartaPart(z, x, y, band, minDepth), seamapPart(z, x, y, minDepth)])))
  const [minX, minY, maxX, maxY] = box
  const inBox = (b) => b[0] <= maxX && b[2] >= minX && b[1] <= maxY && b[3] >= minY
  const areas = []
  const points = []
  const seen = new Set() // i tasselli padre dei segnali si ripetono
  let have = false
  for (const [carta, sea] of parts) {
    have ||= carta.have
    for (const a of carta.areas) if (inBox(a.bbox)) areas.push(a)
    for (const p of carta.points) points.push(p)
    if (seen.has(sea)) continue
    seen.add(sea)
    for (const a of sea.areas) if (inBox(a.bbox)) areas.push(a)
    for (const p of sea.points) if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) points.push(p)
  }
  return { have, band, areas, points, z }
}

/**
 * Riempie le aree su una griglia (righe dall'alto, celle da res metri,
 * origine minX/maxY), con la regola nonzero per elemento: i buchi restano
 * buchi. mask[i] = value dove l'area copre il centro della cella.
 */
export function fillAreas(areas, mask, { minX, maxY, res, w, h }, value = 1) {
  for (const { rings, bbox } of areas) {
    const r0 = Math.max(0, Math.floor((maxY - bbox[3]) / res))
    const r1 = Math.min(h - 1, Math.ceil((maxY - bbox[1]) / res))
    if (r1 < r0) continue
    const rows = Array.from({ length: r1 - r0 + 1 }, () => [])
    for (const ring of rings) {
      if (ring.length < 3) continue
      let [xa, ya] = ring[ring.length - 1]
      xa = (xa - minX) / res
      ya = (maxY - ya) / res
      for (const [X, Y] of ring) {
        const xb = (X - minX) / res
        const yb = (maxY - Y) / res
        if (ya !== yb) {
          const first = Math.max(r0, Math.ceil(Math.min(ya, yb) - 0.5))
          const last = Math.min(r1, Math.ceil(Math.max(ya, yb) - 0.5) - 1)
          const slope = (xb - xa) / (yb - ya)
          const dir = yb > ya ? 1 : -1
          for (let r = first; r <= last; r++) rows[r - r0].push([xa + (r + 0.5 - ya) * slope, dir])
        }
        xa = xb
        ya = yb
      }
    }
    for (let k = 0; k < rows.length; k++) {
      const crossings = rows[k].sort((p, q) => p[0] - q[0])
      const r = r0 + k
      let winding = 0
      for (let i = 0; i < crossings.length - 1; i++) {
        winding += crossings[i][1]
        if (!winding) continue
        const from = Math.max(0, Math.ceil(crossings[i][0] - 0.5))
        const to = Math.min(w, Math.ceil(crossings[i + 1][0] - 0.5))
        if (to > from) mask.fill(value, r * w + from, r * w + to)
      }
    }
  }
}

/** Il punto (metri Web Mercator) è dentro l'area? Regola nonzero sugli anelli */
export function inChartArea(area, x, y) {
  const [minX, minY, maxX, maxY] = area.bbox
  if (x < minX || x > maxX || y < minY || y > maxY) return false
  let winding = 0
  for (const ring of area.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yj <= y) {
        if (yi > y && (xi - xj) * (y - yj) - (x - xj) * (yi - yj) > 0) winding++
      } else if (yi <= y && (xi - xj) * (y - yj) - (x - xj) * (yi - yj) < 0) winding--
    }
  }
  return winding !== 0
}

/**
 * Distanza (in celle, approssimata con la smussatura 3-4) dalla cella
 * bloccata più vicina, per tutta la griglia: due passate, costo lineare.
 */
export function distanceCells(blocked, w, h) {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) d[i] = blocked[i] ? 0 : INF
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c
      if (!d[i]) continue
      let v = d[i]
      if (c > 0) v = Math.min(v, d[i - 1] + 3)
      if (r > 0) {
        v = Math.min(v, d[i - w] + 3)
        if (c > 0) v = Math.min(v, d[i - w - 1] + 4)
        if (c < w - 1) v = Math.min(v, d[i - w + 1] + 4)
      }
      d[i] = v
    }
  }
  for (let r = h - 1; r >= 0; r--) {
    for (let c = w - 1; c >= 0; c--) {
      const i = r * w + c
      if (!d[i]) continue
      let v = d[i]
      if (c < w - 1) v = Math.min(v, d[i + 1] + 3)
      if (r < h - 1) {
        v = Math.min(v, d[i + w] + 3)
        if (c < w - 1) v = Math.min(v, d[i + w + 1] + 4)
        if (c > 0) v = Math.min(v, d[i + w - 1] + 4)
      }
      d[i] = v
    }
  }
  for (let i = 0; i < w * h; i++) d[i] /= 3
  return d
}
