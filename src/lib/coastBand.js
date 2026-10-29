/**
 * Fascia di rispetto dalla costa delle ordinanze di sicurezza balneare.
 *
 * Italia, in stagione balneare (di solito maggio-settembre): ancoraggio e
 * navigazione vietati entro 200 m dalle spiagge (300 m in molti tratti
 * della Sicilia) e 100 m dalle coste alte e rocciose, salvo i corridoi di
 * lancio. Le distanze cambiano da Capitaneria a Capitaneria: sono
 * impostazioni (BAND_DEFAULTS i valori di partenza).
 * Francia e Corsica: "bande des 300 mètres", velocità massima 5 nodi.
 *
 * Calcolata nell'app sul riquadro richiesto, su una griglia Web Mercator:
 * - costa: celle di terra accanto al mare OpenStreetMap (waterMask.js);
 * - spiagge: landcover "beach" degli stessi tasselli;
 * - costa a picco: altimetria Terrarium (AWS Open Data), il terreno sale
 *   di CLIFF_RISE_M entro CLIFF_PROBE_M dalla riva. Dove la costa non è né
 *   spiaggia né a picco vale la distanza delle spiagge (prudenza);
 * - porti e marine (punti OSM): niente fascia attorno;
 * - la fascia è l'unione dei cerchi di raggio "distanza" attorno a ogni
 *   cella di costa; la linea è il suo bordo in mare (d3-contour).
 *
 * Indicativa: fa fede l'ordinanza della Capitaneria / Préfecture maritime.
 */
import L from 'leaflet'
import { contours } from 'd3-contour'
import { coastFeatures } from './waterMask.js'
import { chaikin, splitOnFrame } from './isobathVector.js'
import { ruleAt, ruleTiming } from '../data/coastRules.js'

export const BAND_DEFAULTS = { beach: 200, beachSicily: 300, cliff: 100 }
export const FRANCE_BAND_M = 300
export const MIN_ZOOM = 14 // spiagge e porti ci sono solo nei tasselli z14
const HARBOR_FREE_M = 250 // attorno a un porto o una marina niente fascia
const BEACH_NEAR_M = 25 // riva a meno di così da una spiaggia OSM: spiaggia
const CLIFF_RISE_M = 20 // quota raggiunta entro CLIFF_PROBE_M dalla riva: costa a picco
const CLIFF_PROBE_M = 60
const DEM_Z = 13 // ~14 m per pixel: l'altimetria sorgente è più grossolana
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'

const project = (lat, lon) => L.CRS.EPSG3857.project(L.latLng(lat, lon))
const unproject = (x, y) => L.CRS.EPSG3857.unproject(L.point(x, y))
// Metri Web Mercator per metro reale alla latitudine data
const mercPerM = (lat) => 1 / Math.cos((lat * Math.PI) / 180)

// ------------------------------------------------------------ regione

function inPoly(poly, lat, lon) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]
    const [yj, xj] = poly[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const inBox = ([s, w, n, e], lat, lon) => lat >= s && lat <= n && lon >= w && lon <= e

// Sicilia con Eolie, Egadi, Ustica, Pantelleria e Pelagie; sullo Stretto
// il confine passa a metà tra Messina e la Calabria
const SICILY = [
  [38.85, 11.9],
  [38.85, 15.4],
  [38.32, 15.7],
  [38.26, 15.675],
  [38.19, 15.6],
  [38.11, 15.59],
  [37.9, 15.6],
  [35.4, 15.6],
  [35.4, 11.9],
]
// Adriatico: a ovest la costa italiana, a est Slovenia, Croazia, Albania
const ADRIATIC = [
  [46.0, 13.85],
  [45.6, 13.8],
  [45.2, 13.0],
  [43.0, 15.0],
  [42.0, 17.0],
  [41.0, 19.0],
  [39.5, 19.5],
]
function eastOf(line, lat, lon) {
  for (let i = 0; i < line.length - 1; i++) {
    const [la0, lo0] = line[i]
    const [la1, lo1] = line[i + 1]
    if (lat <= la0 && lat >= la1) return lon > lo0 + ((lo1 - lo0) * (lat - la0)) / (la1 - la0)
  }
  return false
}

/** 'italy' | 'sicily' | 'france' | null (regole non note) */
export function bandRegion(lat, lon) {
  if (inBox([35.75, 14.15, 36.1, 14.6], lat, lon)) return null // Malta
  if (inPoly(SICILY, lat, lon)) return 'sicily'
  if (inBox([41.3, 8.5, 43.05, 9.6], lat, lon)) return 'france' // Corsica
  if (inBox([42.43, 3.0, 44.5, 7.53], lat, lon)) return 'france' // Provenza, Costa Azzurra
  if (!inBox([36.4, 6.6, 47.1, 18.6], lat, lon)) return null
  if (lat < 37.6 && lon < 11.6) return null // Tunisia
  if (eastOf(ADRIATIC, lat, lon)) return null
  return 'italy'
}

/**
 * Regola e distanza della fascia in metri per un punto di costa: in Italia
 * dall'ordinanza della Capitaneria (coastRules.js), dove manca dalle
 * impostazioni (cfg). Coste basse e scogliere basse contano come spiagge.
 */
export function bandRule(lat, lon, region, kind, cfg = BAND_DEFAULTS) {
  if (region === 'france') return { rule: FRANCE_RULE, dM: FRANCE_BAND_M }
  const rule = ruleAt(lat, lon, region)
  // Campo vuoto nelle impostazioni (0): vale il valore di partenza
  const fallback =
    kind === 'cliff'
      ? cfg.cliff || BAND_DEFAULTS.cliff
      : (region === 'sicily' ? cfg.beachSicily : cfg.beach) || BAND_DEFAULTS[region === 'sicily' ? 'beachSicily' : 'beach']
  const dM = (kind === 'cliff' ? rule.cliff : rule.beach) ?? fallback
  return { rule, dM }
}

// Francia e Corsica: bande des 300 mètres, 5 nodi (non vieta l'ancoraggio)
const FRANCE_RULE = {
  id: 'france',
  name: 'Préfecture maritime de la Méditerranée (bande des 300 m)',
  season: ['01-01', '12-31'],
  hours: null,
  speed: { kn: 5, beach: FRANCE_BAND_M, cliff: FRANCE_BAND_M },
  source: null,
  edition: null,
}

// ------------------------------------------------------------ altimetria

const demTiles = new Map() // "x/y" -> Promise<Float32Array 256×256>
function loadDem(x, y) {
  const key = `${x}/${y}`
  if (!demTiles.has(key)) {
    const p = new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = c.height = 256
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0)
        const d = ctx.getImageData(0, 0, 256, 256).data
        const h = new Float32Array(256 * 256)
        for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768
        resolve(h)
      }
      img.onerror = () => reject(new Error('altimetria non disponibile'))
      img.src = `${DEM_URL}/${DEM_Z}/${x}/${y}.png`
    })
    p.catch(() => demTiles.delete(key))
    demTiles.set(key, p)
  }
  return demTiles.get(key)
}

// (lat, lon) → quota in metri sul riquadro; 0 dove l'altimetria manca
async function elevation(bounds) {
  const n = 2 ** DEM_Z
  const fx = (lon) => ((lon + 180) / 360) * n
  const fy = (lat) => {
    const r = (lat * Math.PI) / 180
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  }
  const grids = new Map()
  const jobs = []
  for (let x = Math.floor(fx(bounds.getWest())); x <= Math.floor(fx(bounds.getEast())); x++) {
    for (let y = Math.floor(fy(bounds.getNorth())); y <= Math.floor(fy(bounds.getSouth())); y++) {
      jobs.push(loadDem(x, y).then((h) => grids.set(`${x}/${y}`, h), () => {}))
    }
  }
  await Promise.all(jobs)
  return (lat, lon) => {
    const X = fx(lon)
    const Y = fy(lat)
    const h = grids.get(`${Math.floor(X)}/${Math.floor(Y)}`)
    if (!h) return 0
    const px = Math.min(255, Math.floor((X - Math.floor(X)) * 256))
    const py = Math.min(255, Math.floor((Y - Math.floor(Y)) * 256))
    return h[py * 256 + px]
  }
}

// ------------------------------------------------------------ costa

const DIRS8 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
]

/**
 * Costa del riquadro (L.LatLngBounds) su una griglia da `res` metri Mercator:
 * { w, h, res, minX, maxY, m, sea: Uint8Array, coast: [{ c, r, region, kind,
 * dM, dPx }] }, o null se servono troppi tasselli.
 */
async function analyze(bounds, res, cfg, maxTiles) {
  const [features, elev] = await Promise.all([coastFeatures(bounds, maxTiles), elevation(bounds)])
  if (!features) return null
  const sw = project(bounds.getSouth(), bounds.getWest())
  const ne = project(bounds.getNorth(), bounds.getEast())
  const minX = sw.x
  const maxY = ne.y
  const w = Math.max(1, Math.ceil((ne.x - sw.x) / res))
  const h = Math.max(1, Math.ceil((ne.y - sw.y) / res))
  const m = mercPerM(bounds.getCenter().lat)
  const toPx = ([lat, lon]) => {
    const p = project(lat, lon)
    return [(p.x - minX) / res, (maxY - p.y) / res]
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  const trace = (rings) => {
    ctx.beginPath()
    for (const ring of rings) {
      ring.forEach((ll, i) => {
        const [px, py] = toPx(ll)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
    }
  }
  trace(features.sea)
  ctx.fill('nonzero') // tasselli vicini si sovrappongono
  const seaA = ctx.getImageData(0, 0, w, h).data
  const sea = new Uint8Array(w * h)
  for (let i = 0; i < sea.length; i++) sea[i] = seaA[i * 4 + 3] > 127 ? 1 : 0

  // Spiagge allargate di BEACH_NEAR_M: il poligono OSM non sempre tocca la riva
  ctx.clearRect(0, 0, w, h)
  trace(features.beaches)
  ctx.fill('nonzero')
  ctx.lineWidth = (2 * BEACH_NEAR_M * m) / res
  ctx.stroke()
  const beachA = ctx.getImageData(0, 0, w, h).data

  const harbors = features.harbors.map(toPx)
  const harborR2 = ((HARBOR_FREE_M * m) / res) ** 2
  const probe = (CLIFF_PROBE_M * m) / res
  const coast = []
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const i = r * w + c
      if (sea[i]) continue
      const shore = (c > 0 && sea[i - 1]) || (c < w - 1 && sea[i + 1]) || (r > 0 && sea[i - w]) || (r < h - 1 && sea[i + w])
      if (!shore) continue
      const x = minX + (c + 0.5) * res
      const y = maxY - (r + 0.5) * res
      const ll = unproject(x, y)
      const region = bandRegion(ll.lat, ll.lng)
      if (!region) continue
      if (harbors.some(([hx, hy]) => (hx - c - 0.5) ** 2 + (hy - r - 0.5) ** 2 < harborR2)) continue
      let kind = 'low'
      if (beachA[i * 4 + 3] > 127) kind = 'beach'
      else {
        // Quota attorno alla riva (in mare è ≤ 0, non conta)
        cliff: for (const t of [0.5, 1]) {
          for (const [dx, dy] of DIRS8) {
            const q = unproject(x + dx * probe * t * res, y - dy * probe * t * res)
            if (elev(q.lat, q.lng) >= CLIFF_RISE_M) {
              kind = 'cliff'
              break cliff
            }
          }
        }
      }
      const { rule, dM } = bandRule(ll.lat, ll.lng, region, kind, cfg)
      coast.push({ c, r, region, kind, rule, dM, dPx: (dM * m) / res })
    }
  }
  return { w, h, res, minX, maxY, m, sea, coast }
}

// Cella di costa che "comanda" il punto (x, y) della griglia: quella con
// distanza − raggio minima. Celle in secchi per non scorrerle tutte.
function governor(coast) {
  const B = Math.max(8, Math.ceil(Math.max(0, ...coast.map((p) => p.dPx))) + 2)
  const buckets = new Map()
  for (const p of coast) {
    const k = `${Math.floor(p.c / B)},${Math.floor(p.r / B)}`
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(p)
  }
  return (x, y) => {
    const bx = Math.floor(x / B)
    const by = Math.floor(y / B)
    let best = null
    let bestM = Infinity
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const p of buckets.get(`${bx + i},${by + j}`) || []) {
          const mg = Math.hypot(p.c + 0.5 - x, p.r + 0.5 - y) - p.dPx
          if (mg < bestM) {
            bestM = mg
            best = p
          }
        }
      }
    }
    return best
  }
}

/**
 * Linee della fascia sul riquadro (L.LatLngBounds) a `res` metri Mercator
 * per cella: [{ region: 'italy' | 'france', dM, rule, path: [lat, lon][] }], o
 * null se il riquadro è troppo grande per i dati disponibili.
 */
export async function coastBandLines(bounds, res, cfg = BAND_DEFAULTS) {
  const a = await analyze(bounds, res, cfg, 48)
  if (!a) return null
  const { w, h, sea, coast, minX, maxY } = a
  const toLatLng = ([x, y]) => {
    const ll = unproject(minX + x * res, maxY - y * res)
    return [ll.lat, ll.lng]
  }
  // Vertice a ridosso della terra: lì il bordo è la costa, non la fascia
  // (d3-contour: il valore della cella c sta in c + 0.5)
  const nearLand = ([x, y]) => {
    const c0 = Math.floor(x - 0.5)
    const r0 = Math.floor(y - 0.5)
    for (let r = r0; r <= r0 + 1; r++) {
      for (let c = c0; c <= c0 + 1; c++) {
        if (r >= 0 && c >= 0 && r < h && c < w && !sea[r * w + c]) return true
      }
    }
    return false
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const lines = []
  // Italia e Francia separate: regole diverse anche dove si vedono insieme (Bocche di Bonifacio)
  for (const group of ['italy', 'france']) {
    const pts = coast.filter((p) => (group === 'france') === (p.region === 'france'))
    if (!pts.length) continue
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    for (const p of pts) {
      ctx.moveTo(p.c + 0.5 + p.dPx, p.r + 0.5)
      ctx.arc(p.c + 0.5, p.r + 0.5, p.dPx, 0, 2 * Math.PI)
    }
    ctx.fill()
    const bandA = ctx.getImageData(0, 0, w, h).data
    const values = new Float64Array(w * h)
    for (let i = 0; i < values.length; i++) values[i] = !sea[i] || bandA[i * 4 + 3] > 127 ? 1 : 0
    const rings = contours().size([w, h]).thresholds([0.5])(values)[0].coordinates.flat()
    const gov = governor(pts)

    for (const ring of rings) {
      for (const { points } of splitOnFrame(ring, w, h)) {
        // Tratti in mare aperto, divisi dove cambia la distanza che li genera
        let run = []
        let runD = null
        let runRule = null
        const flush = () => {
          if (run.length > 2) lines.push({ region: group, dM: runD, rule: runRule, path: chaikin(run, false).map(toLatLng) })
          run = []
        }
        for (const pt of points) {
          if (nearLand(pt)) {
            flush()
            continue
          }
          const g = gov(pt[0], pt[1])
          const d = g ? g.dM : runD
          if (run.length && d !== runD) {
            const last = run[run.length - 1]
            flush()
            run = [last]
          }
          runD = d
          if (g) runRule = g.rule
          run.push(pt)
        }
        flush()
      }
    }
  }
  return lines
}

/**
 * Il punto è dentro la fascia? { region, inside, kind: 'beach' | 'cliff' |
 * 'low', limitM, distanceM, rule } per la costa che conta di più; null se in quel
 * mare le regole non sono note, il punto è a terra o non c'è costa vicina;
 * undefined se i dati non sono disponibili.
 */
export async function bandAt(lat, lon, cfg = BAND_DEFAULTS) {
  const region = bandRegion(lat, lon)
  if (!region) return null
  const m = mercPerM(lat)
  const half = (Math.max(cfg.beach, cfg.beachSicily, cfg.cliff, FRANCE_BAND_M) + 100) * m
  const p = project(lat, lon)
  const bounds = L.latLngBounds(unproject(p.x - half, p.y - half), unproject(p.x + half, p.y + half))
  const res = 4 * m // ~4 m
  let a
  try {
    a = await analyze(bounds, res, cfg, 9)
  } catch {
    return undefined
  }
  if (!a) return undefined
  const x = (p.x - a.minX) / res
  const y = (a.maxY - p.y) / res
  const i = Math.floor(y) * a.w + Math.floor(x)
  if (!a.sea[i]) return null
  const g = governor(a.coast)(x, y)
  if (!g) return null
  const dist = Math.hypot(g.c + 0.5 - x, g.r + 0.5 - y)
  return {
    region: g.region,
    inside: dist < g.dPx,
    kind: g.kind,
    limitM: g.dM,
    distanceM: Math.round((dist * res) / m),
    rule: g.rule,
  }
}

const KIND_LABEL = { beach: 'spiaggia', cliff: 'costa a picco', low: 'costa' }

/**
 * Testo per un risultato di bandAt: { text, detail, inside, warn } o null.
 * warn: in Italia dentro la fascia mentre il divieto è in vigore (stagione
 * e orario dell'ordinanza); detail: ufficio, stagione, orario, velocità.
 */
export function bandText(b, now = new Date()) {
  if (!b) return null
  const from = `${b.distanceM} m da ${KIND_LABEL[b.kind]}`
  const rule = b.rule || {}
  if (b.region === 'france') {
    return b.inside
      ? { text: `${from}: dentro i 300 m, max 5 nodi`, detail: rule.name, inside: true, warn: false, france: true }
      : { text: `${from}: fuori dai 300 m`, detail: rule.name, inside: false, warn: false, france: true }
  }
  const t = ruleTiming(rule, now)
  const when = `${t.season}${t.hours ? `, ${t.hours}` : ''}`
  const speed = rule.speed ? ` · entro ${b.kind === 'cliff' ? rule.speed.cliff : rule.speed.beach} m max ${rule.speed.kn} nodi` : ''
  const detail = `${rule.name} · ${when}${speed}`
  if (!b.inside) return { text: `${from}: fuori dalla fascia di ${b.limitM} m`, detail, inside: false, warn: false }
  if (!t.inSeason) return { text: `${from}, limite ${b.limitM} m: fuori stagione balneare (${t.season})`, detail, inside: true, warn: false }
  if (!t.inHours) return { text: `${from}, limite ${b.limitM} m: divieto solo ${t.hours}`, detail, inside: true, warn: false }
  return {
    text: `${from}, limite ${b.limitM} m: ancoraggio e transito vietati (solo corridoi di lancio, max 3 nodi)`,
    detail,
    inside: true,
    warn: true,
  }
}
