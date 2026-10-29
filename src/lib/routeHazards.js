/**
 * Pericoli lungo la rotta: terra e fondali più bassi della profondità minima
 * (pescaggio + margine), e aggiramento automatico.
 *
 * - Terra: costa OpenStreetMap (waterMask.js) disegnata su un canvas in
 *   coordinate Web Mercator → test "in acqua?" immediato per ogni punto.
 * - Profondità: Shom dove c'è, altrimenti EMODnet (depthAt.js → prepareDepth).
 * - Aggiramento: A* su una griglia attorno alla tratta, con un margine dalla
 *   costa e dai bassi fondali, poi semplificato in pochi waypoint.
 *
 * Ausilio alla pianificazione: dati indicativi, non sostituisce le carte.
 */
import L from 'leaflet'
import { waterRings } from './waterMask.js'
import { prepareDepth } from './depthAt.js'

const MAX_RASTER = 1500 // px per lato del canvas dell'acqua (iPad: memoria)
const MAX_SAMPLES = 2500 // punti controllati per tratta
const MAX_CELLS = 250000 // celle della griglia per l'aggiramento
const SHORE_BUFFER_M = 40 // distanza minima da terra e bassi fondali nell'aggiramento

const project = (lat, lon) => L.CRS.EPSG3857.project(L.latLng(lat, lon))
const unproject = (x, y) => L.CRS.EPSG3857.unproject(L.point(x, y))

/**
 * Canvas dell'acqua sul riquadro [minX, minY, maxX, maxY] (Web Mercator, m)
 * a `res` metri per pixel. Restituisce isWater(x, y) o null se la costa non
 * si è potuta caricare.
 */
async function waterRaster(box, res) {
  const [minX, minY, maxX, maxY] = box
  const w = Math.max(1, Math.ceil((maxX - minX) / res))
  const h = Math.max(1, Math.ceil((maxY - minY) / res))
  const bounds = L.latLngBounds(unproject(minX, minY), unproject(maxX, maxY))
  // Dettaglio dei tasselli OSM adatto alla risoluzione, senza superarne il limite
  const lat = bounds.getCenter().lat
  let zoom = Math.round(Math.log2((156543 * Math.cos((lat * Math.PI) / 180)) / res)) + 1
  let rings = null
  for (; zoom >= 6 && !rings; zoom--) rings = await waterRings(bounds, Math.min(zoom, 15))
  if (!rings) return null

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  for (const ring of rings) {
    ring.forEach(([la, lo], i) => {
      const p = project(la, lo)
      const px = (p.x - minX) / res
      const py = (maxY - p.y) / res
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
  }
  ctx.fill('nonzero') // tasselli vicini si sovrappongono
  const alpha = ctx.getImageData(0, 0, w, h).data
  return (x, y) => {
    const c = Math.floor((x - minX) / res)
    const r = Math.floor((maxY - y) / res)
    if (c < 0 || r < 0 || c >= w || r >= h) return true // fuori: non sappiamo, non blocchiamo
    return alpha[(r * w + c) * 4 + 3] > 127
  }
}

const legBox = (a, b, padM) => {
  const pa = project(a.lat, a.lon)
  const pb = project(b.lat, b.lon)
  return [Math.min(pa.x, pb.x) - padM, Math.min(pa.y, pb.y) - padM, Math.max(pa.x, pb.x) + padM, Math.max(pa.y, pb.y) + padM]
}

/**
 * Controlla la tratta a → b ({lat, lon}). minDepth in metri.
 * { ok, hazards: [{ kind: 'land' | 'shallow', path: [lat, lon][], depth? }],
 *   minDepth: { depth, source } | null }
 */
export async function checkLeg(a, b, minDepth) {
  const pa = project(a.lat, a.lon)
  const pb = project(b.lat, b.lon)
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y)
  const step = Math.max(10, len / MAX_SAMPLES)
  const n = Math.max(2, Math.ceil(len / step) + 1)
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    pts.push([pa.x + (pb.x - pa.x) * t, pa.y + (pb.y - pa.y) * t])
  }
  const lls = pts.map(([x, y]) => unproject(x, y))

  const res = Math.max(5, len / MAX_RASTER)
  const [isWater, sample] = await Promise.all([
    waterRaster(legBox(a, b, 3 * res), res),
    prepareDepth(lls.filter((_, i) => i % 20 === 0 || i === lls.length - 1).map((ll) => [ll.lat, ll.lng])),
  ])

  const hazards = []
  let current = null
  let shallowest = null
  pts.forEach(([x, y], i) => {
    const ll = lls[i]
    // Il primo e l'ultimo punto sono i waypoint: lì decide chi li ha messi
    const ends = i === 0 || i === pts.length - 1
    const d = sample(ll.lat, ll.lng)
    if (d && (!shallowest || d.depth < shallowest.depth)) shallowest = d
    let kind = null
    if (!ends && isWater && !isWater(x, y)) kind = 'land'
    else if (!ends && d && d.depth < minDepth) kind = 'shallow'
    if (kind && current && current.kind === kind) {
      current.path.push([ll.lat, ll.lng])
      if (d) current.depth = Math.min(current.depth ?? Infinity, d.depth)
    } else if (kind) {
      current = { kind, path: [[ll.lat, ll.lng]], depth: d ? d.depth : undefined }
      hazards.push(current)
    } else {
      current = null
    }
  })
  // Un punto solo diventa un segmentino visibile
  for (const h of hazards) if (h.path.length === 1) h.path.push(h.path[0])
  return { ok: hazards.length === 0, hazards, minDepth: shallowest }
}

// ---------------------------------------------------------------- A*

class Heap {
  constructor() {
    this.items = []
  }
  push(node, f) {
    const a = this.items
    a.push([f, node])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][0] <= a[i][0]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top[1]
  }
  get size() {
    return this.items.length
  }
}

/**
 * Percorso da a a b che resta in acqua con almeno minDepth metri, lontano
 * SHORE_BUFFER_M da terra e bassi fondali. Restituisce i punti intermedi da
 * inserire ([lat, lon][], vuoto se la tratta è già sicura) oppure null se
 * non si trova un passaggio nella zona attorno alla tratta.
 */
export async function detourLeg(a, b, minDepth) {
  const pa = project(a.lat, a.lon)
  const pb = project(b.lat, b.lon)
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y)
  const box = legBox(a, b, Math.max(600, 0.35 * len))
  const [minX, minY, maxX, maxY] = box
  const res = Math.max(10, Math.sqrt(((maxX - minX) * (maxY - minY)) / MAX_CELLS))
  const w = Math.ceil((maxX - minX) / res)
  const h = Math.ceil((maxY - minY) / res)
  const cx = (c) => minX + (c + 0.5) * res
  const cy = (r) => maxY - (r + 0.5) * res

  // Dati sulla zona: costa al dettaglio della griglia, profondità su una rete di punti
  const probe = []
  const probeStep = Math.max(1, Math.round(800 / res))
  for (let r = 0; r < h; r += probeStep) {
    for (let c = 0; c < w; c += probeStep) {
      const ll = unproject(cx(c), cy(r))
      probe.push([ll.lat, ll.lng])
    }
  }
  const [isWater, sample] = await Promise.all([waterRaster(box, res), prepareDepth(probe)])

  // Celle bloccate: terra o fondale troppo basso (profondità sconosciuta in acqua: passa)
  const blocked = new Uint8Array(w * h)
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const x = cx(c)
      const y = cy(r)
      if (isWater && !isWater(x, y)) {
        blocked[r * w + c] = 1
        continue
      }
      const ll = unproject(x, y)
      const d = sample(ll.lat, ll.lng)
      if (d && d.depth < minDepth) blocked[r * w + c] = 1
    }
  }
  // Margine: si allargano gli ostacoli di qualche cella
  const k = Math.max(1, Math.round(SHORE_BUFFER_M / res))
  const unsafe = new Uint8Array(w * h)
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (!blocked[r * w + c]) continue
      for (let dr = -k; dr <= k; dr++) {
        const rr = r + dr
        if (rr < 0 || rr >= h) continue
        for (let dc = -k; dc <= k; dc++) {
          const cc = c + dc
          if (cc >= 0 && cc < w) unsafe[rr * w + cc] = 1
        }
      }
    }
  }

  const toCell = (p) => [Math.min(w - 1, Math.max(0, Math.floor((p.x - minX) / res))), Math.min(h - 1, Math.max(0, Math.floor((maxY - p.y) / res)))]
  // Waypoint vicino a riva o in un basso: si parte dalla cella libera più vicina
  const nearestFree = ([c0, r0]) => {
    if (!unsafe[r0 * w + c0]) return [c0, r0]
    for (let rad = 1; rad < 60; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue
          const c = c0 + dc
          const r = r0 + dr
          if (c >= 0 && r >= 0 && c < w && r < h && !unsafe[r * w + c]) return [c, r]
        }
      }
    }
    return null
  }
  const s = nearestFree(toCell(pa))
  const g = nearestFree(toCell(pb))
  if (!s || !g) return null

  const start = s[1] * w + s[0]
  const goal = g[1] * w + g[0]
  // Float64: con Float32 l'arrotondamento faceva sembrare "migliore" un costo
  // già noto e la stessa cella tornava in coda senza fine
  const gScore = new Float64Array(w * h).fill(Infinity)
  const came = new Int32Array(w * h).fill(-1)
  const closed = new Uint8Array(w * h) // ogni cella si espande una volta sola
  const heur = (i) => {
    const dx = Math.abs((i % w) - g[0])
    const dy = Math.abs(Math.floor(i / w) - g[1])
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
  }
  const open = new Heap()
  gScore[start] = 0
  open.push(start, heur(start))
  const DIRS = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ]
  let found = false
  while (open.size) {
    const cur = open.pop()
    if (closed[cur]) continue
    closed[cur] = 1
    if (cur === goal) {
      found = true
      break
    }
    const c = cur % w
    const r = Math.floor(cur / w)
    for (const [dc, dr, cost] of DIRS) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue
      const ni = nr * w + nc
      if (unsafe[ni] || closed[ni]) continue
      const t = gScore[cur] + cost
      if (t < gScore[ni]) {
        gScore[ni] = t
        came[ni] = cur
        open.push(ni, t + heur(ni))
      }
    }
  }
  if (!found) return null

  const path = []
  for (let i = goal; i !== -1; i = came[i]) path.push([i % w, Math.floor(i / w)])
  path.reverse()

  // Semplificazione in due passate, sempre con il controllo "visibile in
  // linea retta senza celle pericolose":
  // 1. alla Douglas-Peucker: se gli estremi non si vedono si tiene il punto
  //    del percorso più lontano dalla congiungente e si ripete sulle due metà;
  // 2. si tolgono i punti il cui precedente vede direttamente il successivo.
  const clear = ([c0, r0], [c1, r1]) => {
    const n = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0)) * 2
    for (let i = 0; i <= n; i++) {
      const c = Math.round(c0 + ((c1 - c0) * i) / (n || 1))
      const r = Math.round(r0 + ((r1 - r0) * i) / (n || 1))
      if (unsafe[r * w + c]) return false
    }
    return true
  }
  const marks = new Uint8Array(path.length)
  marks[0] = marks[path.length - 1] = 1
  const stack = [[0, path.length - 1]]
  while (stack.length) {
    const [i, j] = stack.pop()
    if (j <= i + 1 || clear(path[i], path[j])) continue
    const [c0, r0] = path[i]
    const [c1, r1] = path[j]
    const len2 = (c1 - c0) ** 2 + (r1 - r0) ** 2 || 1
    let far = i + 1
    let max = -1
    for (let k = i + 1; k < j; k++) {
      const [c, r] = path[k]
      const d = Math.abs((c1 - c0) * (r0 - r) - (c0 - c) * (r1 - r0)) / Math.sqrt(len2)
      if (d > max) {
        max = d
        far = k
      }
    }
    marks[far] = 1
    stack.push([i, far], [far, j])
  }
  let keep = path.filter((_, k) => marks[k])
  for (let changed = true; changed; ) {
    changed = false
    for (let k = 1; k < keep.length - 1; k++) {
      if (clear(keep[k - 1], keep[k + 1])) {
        keep = [...keep.slice(0, k), ...keep.slice(k + 1)]
        changed = true
        break
      }
    }
  }
  // Senza i due estremi (sono i waypoint esistenti, o i loro vicini liberi)
  return keep.slice(1, -1).map(([c, r]) => {
    const ll = unproject(cx(c), cy(r))
    return [ll.lat, ll.lng]
  })
}
