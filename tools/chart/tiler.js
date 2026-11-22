/*
 * Tasselli vettoriali (Mapbox Vector Tile 2.1) senza programmi esterni.
 *
 * Le geometrie entrano in coordinate Mercatore normalizzate (0..1, y verso
 * sud) e scendono per quadranti da z0 a maxZoom come in geojson-vt: ogni
 * tassello ritaglia le geometrie del padre (con un bordo), poi semplifica
 * alla tolleranza del suo zoom e codifica. Ogni elemento ha minzoom/maxzoom:
 * a zoom bassi restano solo le isobate principali, come sulle carte vere.
 *
 * Elemento: { layer, type: 1 punto | 2 linea | 3 poligono, props, minzoom, maxzoom,
 *             geom: punto [x, y] | linea [[x, y]…] | poligono [[anello]…] }
 */
import Pbf from 'pbf'

export const EXTENT = 4096
const BUFFER = 64 // unità del tassello oltre il bordo, per le linee spesse e le etichette

export const lonLatToMerc = (lon, lat) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]
}

// ------------------------------------------------------------------ ritaglio

// Taglia un tratto aperto nel canale [k1, k2] dell'asse (0 = x, 1 = y): più pezzi
export function clipLineSafe(pts, axis, k1, k2) {
  const out = []
  let part = []
  const flush = () => {
    if (part.length > 1) out.push(part)
    part = []
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const ak = a[axis]
    const bk = b[axis]
    const at = (k) => {
      const t = (k - ak) / (bk - ak)
      return axis === 0 ? [k, a[1] + (b[1] - a[1]) * t] : [a[0] + (b[0] - a[0]) * t, k]
    }
    const aIn = ak >= k1 && ak <= k2
    const bIn = bk >= k1 && bk <= k2
    if (aIn) {
      part.push(a)
      if (!bIn) {
        part.push(at(bk < k1 ? k1 : k2))
        flush()
      }
    } else {
      // a fuori: il segmento entra (o attraversa tutto il canale)
      if (bIn) {
        part.push(at(ak < k1 ? k1 : k2))
      } else if ((ak < k1 && bk > k2) || (ak > k2 && bk < k1)) {
        const first = ak < k1 ? k1 : k2
        const second = ak < k1 ? k2 : k1
        out.push([at(first), at(second)])
      }
    }
  }
  const last = pts[pts.length - 1]
  if (last[axis] >= k1 && last[axis] <= k2) part.push(last)
  flush()
  return out
}

// Sutherland–Hodgman su un asse per un anello chiuso (primo = ultimo)
function clipRing(ring, axis, k1, k2) {
  let pts = ring
  for (const [k, keepAbove] of [
    [k1, true],
    [k2, false],
  ]) {
    const out = []
    const n = pts.length
    if (n < 3) return []
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const aIn = keepAbove ? a[axis] >= k : a[axis] <= k
      const bIn = keepAbove ? b[axis] >= k : b[axis] <= k
      if (aIn) out.push(a)
      if (aIn !== bIn) {
        const t = (k - a[axis]) / (b[axis] - a[axis])
        out.push(axis === 0 ? [k, a[1] + (b[1] - a[1]) * t] : [a[0] + (b[0] - a[0]) * t, k])
      }
    }
    if (out.length < 3) return []
    out.push(out[0])
    pts = out
  }
  return pts
}

function bboxOf(f) {
  if (f.bbox) return f.bbox
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const add = (p) => {
    if (p[0] < x0) x0 = p[0]
    if (p[0] > x1) x1 = p[0]
    if (p[1] < y0) y0 = p[1]
    if (p[1] > y1) y1 = p[1]
  }
  if (f.type === 1) add(f.geom)
  else if (f.type === 2) f.geom.forEach(add)
  else f.geom.forEach((poly) => poly[0].forEach(add))
  f.bbox = [x0, y0, x1, y1]
  return f.bbox
}

// Ritaglia una lista di elementi nel canale [k1, k2] dell'asse
function clip(features, axis, k1, k2) {
  const out = []
  for (const f of features) {
    const b = bboxOf(f)
    const lo = b[axis]
    const hi = b[axis + 2]
    if (lo >= k1 && hi <= k2) {
      out.push(f)
      continue
    }
    if (hi < k1 || lo > k2) continue
    if (f.type === 1) continue // punto fuori (già escluso dal riquadro)
    if (f.type === 2) {
      for (const part of clipLineSafe(f.geom, axis, k1, k2)) out.push({ ...f, geom: part, bbox: null })
    } else {
      const polys = []
      for (const poly of f.geom) {
        const outer = clipRing(poly[0], axis, k1, k2)
        if (!outer.length) continue
        const rings = [outer]
        for (let r = 1; r < poly.length; r++) {
          const hole = clipRing(poly[r], axis, k1, k2)
          if (hole.length) rings.push(hole)
        }
        polys.push(rings)
      }
      if (polys.length) out.push({ ...f, geom: polys, bbox: null })
    }
  }
  return out
}

// ------------------------------------------------------------ semplificazione

// Douglas–Peucker (quadrato della tolleranza), in coordinate qualsiasi
function simplify(pts, tol2) {
  const n = pts.length
  if (n < 3) return pts
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  const stack = [0, n - 1]
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
    if (max > tol2 && idx > 0) {
      keep[idx] = 1
      stack.push(a, idx, idx, b)
    }
  }
  const out = []
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i])
  return out
}

// ----------------------------------------------------------------- codifica

const zigzag = (n) => (n << 1) ^ (n >> 31)
const command = (id, count) => (id & 7) | (count << 3)

function encodeGeometry(type, parts) {
  const out = []
  let cx = 0
  let cy = 0
  if (type === 1) {
    out.push(command(1, parts.length))
    for (const [x, y] of parts) {
      out.push(zigzag(x - cx), zigzag(y - cy))
      cx = x
      cy = y
    }
    return out
  }
  for (const pts of parts) {
    const n = type === 3 ? pts.length - 1 : pts.length // l'anello non ripete il primo punto
    out.push(command(1, 1), zigzag(pts[0][0] - cx), zigzag(pts[0][1] - cy))
    cx = pts[0][0]
    cy = pts[0][1]
    out.push(command(2, n - 1))
    for (let i = 1; i < n; i++) {
      out.push(zigzag(pts[i][0] - cx), zigzag(pts[i][1] - cy))
      cx = pts[i][0]
      cy = pts[i][1]
    }
    if (type === 3) out.push(command(7, 1))
  }
  return out
}

function writeValue(v, pbf) {
  if (typeof v === 'string') pbf.writeStringField(1, v)
  else if (typeof v === 'boolean') pbf.writeBooleanField(7, v)
  else if (Number.isInteger(v)) {
    if (v < 0) pbf.writeSVarintField(6, v)
    else pbf.writeVarintField(5, v)
  } else pbf.writeDoubleField(3, v)
}

/** layers: Map nome -> [{ type, props, parts (intere, coordinate del tassello) }] */
export function encodeTile(layers) {
  const pbf = new Pbf()
  for (const [name, feats] of layers) {
    if (!feats.length) continue
    const keys = []
    const keyIdx = new Map()
    const values = []
    const valIdx = new Map()
    pbf.writeMessage(
      3,
      (_, p) => {
        p.writeVarintField(15, 2)
        p.writeStringField(1, name)
        for (const f of feats) {
          const tags = []
          for (const [k, v] of Object.entries(f.props)) {
            if (v === undefined || v === null) continue
            if (!keyIdx.has(k)) {
              keyIdx.set(k, keys.length)
              keys.push(k)
            }
            const vk = `${typeof v}:${v}`
            if (!valIdx.has(vk)) {
              valIdx.set(vk, values.length)
              values.push(v)
            }
            tags.push(keyIdx.get(k), valIdx.get(vk))
          }
          p.writeMessage(2, (_, fp) => {
            fp.writePackedVarint(2, tags)
            fp.writeVarintField(3, f.type)
            fp.writePackedVarint(4, encodeGeometry(f.type, f.parts))
          })
        }
        for (const k of keys) p.writeStringField(3, k)
        for (const v of values) p.writeMessage(4, writeValue, v)
        p.writeVarintField(5, EXTENT)
      },
      null,
    )
  }
  return pbf.finish()
}

// ------------------------------------------------------------------- tassello

const ringArea = (pts) => {
  let s = 0
  for (let i = 0; i < pts.length - 1; i++) s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
  return s / 2
}

function dedupe(pts) {
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const q = out[out.length - 1]
    if (p[0] !== q[0] || p[1] !== q[1]) out.push(p)
  }
  return out
}

function buildTile(z, x, y, features, tolerance) {
  const scale = EXTENT * 2 ** z
  const ox = x * EXTENT
  const oy = y * EXTENT
  const q = (p) => [Math.round(p[0] * scale - ox), Math.round(p[1] * scale - oy)]
  const tol = tolerance / scale
  const tol2 = tol * tol
  const layers = new Map()
  for (const f of features) {
    if (z < f.minzoom || z > f.maxzoom) continue
    let parts
    if (f.type === 1) parts = [q(f.geom)]
    else if (f.type === 2) {
      const pts = dedupe(simplify(f.geom, tol2).map(q))
      if (pts.length < 2) continue
      // tratti più corti di 2 unità: invisibili
      const last = pts[pts.length - 1]
      if (pts.length === 2 && Math.abs(last[0] - pts[0][0]) + Math.abs(last[1] - pts[0][1]) < 2) continue
      parts = [pts]
    } else {
      parts = []
      for (const poly of f.geom) {
        const rings = []
        for (let r = 0; r < poly.length; r++) {
          let ring = dedupe(simplify(poly[r], tol2).map(q))
          if (ring.length < 4) {
            if (r === 0) break
            continue
          }
          const a = ringArea(ring)
          if (Math.abs(a) < 4) {
            if (r === 0) break
            continue
          }
          // esterno ad area positiva (y verso il basso), buchi negativi
          if ((r === 0) !== a > 0) ring = ring.reverse()
          rings.push(ring)
        }
        if (rings.length) parts.push(...rings)
      }
      if (!parts.length) continue
    }
    if (!layers.has(f.layer)) layers.set(f.layer, [])
    layers.get(f.layer).push({ type: f.type, props: f.props, parts })
  }
  let any = false
  for (const v of layers.values()) if (v.length) any = true
  return any ? encodeTile(layers) : null
}

/**
 * Scende da (z, x, y) fino a maxZoom; onTile(z, x, y, bytes) per ogni tassello non vuoto.
 * tolerance: unità del tassello (su 4096) per la semplificazione.
 */
export function tilePyramid(features, { minZoom = 0, maxZoom = 14, tolerance = 2, onTile }) {
  const walk = (z, x, y, feats) => {
    if (!feats.length) return
    if (z >= minZoom) {
      const bytes = buildTile(z, x, y, feats, z === maxZoom ? tolerance / 2 : tolerance)
      if (bytes) onTile(z, x, y, bytes)
    }
    if (z === maxZoom) return
    const children = feats.filter((f) => f.maxzoom > z)
    if (!children.length) return
    const n = 2 ** (z + 1)
    const pad = BUFFER / EXTENT / n
    for (let dx = 0; dx < 2; dx++) {
      const cx = 2 * x + dx
      const left = clip(children, 0, cx / n - pad, (cx + 1) / n + pad)
      if (!left.length) continue
      for (let dy = 0; dy < 2; dy++) {
        const cy = 2 * y + dy
        walk(z + 1, cx, cy, clip(left, 1, cy / n - pad, (cy + 1) / n + pad))
      }
    }
  }
  walk(0, 0, 0, features)
}
