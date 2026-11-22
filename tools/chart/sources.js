/*
 * Fonti della carta TIMONE, scaricate una volta e tenute in tools/.cache:
 *   - EMODnet Bathymetry DTM (WCS, 1/16 di primo, ~115 m) ovunque
 *   - Regione Liguria, isobate multibeam (WFS M2112:L7174, ogni 1 m sotto costa)
 *   - OpenStreetMap (tasselli OpenFreeMap z14): la linea di costa
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'

const CACHE = resolve(process.env.CHART_CACHE || 'tools/.cache')

async function cached(name, url, { binary = false, retries = 8 } = {}) {
  const file = join(CACHE, name)
  if (existsSync(file)) return binary ? readFileSync(file) : readFileSync(file, 'utf8')
  mkdirSync(join(file, '..'), { recursive: true })
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url)
      if (r.status === 404 || r.status === 204) {
        writeFileSync(file, '')
        return binary ? Buffer.alloc(0) : ''
      }
      if (!r.ok) throw new Error(`${r.status} ${url}`)
      const body = binary ? Buffer.from(await r.arrayBuffer()) : await r.text()
      writeFileSync(file, body)
      return body
    } catch (e) {
      if (attempt >= retries) throw e
      await new Promise((ok) => setTimeout(ok, 2000 * attempt))
    }
  }
}

/** Esegue i lavori con al massimo `n` richieste insieme */
export async function pool(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

// ------------------------------------------------------------------- EMODnet

export const EMOD = 960 // celle per grado
const EBLOCK = 128

function parseWcs(text) {
  const num = (name) => Number(text.match(new RegExp(`"${name}",\\s*(-?[\\d.eE-]+)`))[1])
  const range = text.match(/GridEnvelope2D\[(-?\d+)\.\.(-?\d+),\s*(-?\d+)\.\.(-?\d+)\]/)
  const [x0, x1, y0, y1] = range.slice(1).map(Number)
  const width = x1 - x0 + 1
  const height = y1 - y0 + 1
  const firstLon = num('elt_0_2') + x0 * num('elt_0_0')
  const firstLat = num('elt_1_2') + y0 * num('elt_1_1')
  const body = text.slice(text.indexOf('Band 0:') + 7)
  const values = new Float32Array(width * height)
  let k = 0
  for (const token of body.split(/\s+/)) {
    if (!token) continue
    const v = Number(token)
    values[k++] = Number.isFinite(v) ? v : NaN
    if (k === values.length) break
  }
  return { i0: Math.round(firstLon * EMOD - 0.5), jTop: Math.round(firstLat * EMOD - 0.5), width, height, values }
}

/**
 * Griglia EMODnet della regione: indici globali i (lon) e j (lat) delle celle,
 * valori in metri (mare negativo), NaN dove non c'è dato.
 */
export async function emodnetGrid({ w, s, e, n }) {
  const bx0 = Math.floor((w * EMOD) / EBLOCK)
  const bx1 = Math.floor((e * EMOD) / EBLOCK)
  const by0 = Math.floor((s * EMOD) / EBLOCK)
  const by1 = Math.floor((n * EMOD) / EBLOCK)
  const jobs = []
  for (let bx = bx0; bx <= bx1; bx++) for (let by = by0; by <= by1; by++) jobs.push([bx, by])
  const c = (i) => i / EMOD
  let done = 0
  const blocks = await pool(jobs, 6, async ([bx, by]) => {
    const lon = `Long(${c(bx * EBLOCK + 0.01)},${c(bx * EBLOCK + EBLOCK - 0.01)})`
    const lat = `Lat(${c(by * EBLOCK + 0.01)},${c(by * EBLOCK + EBLOCK - 0.01)})`
    const url =
      `https://ows.emodnet-bathymetry.eu/wcs?service=WCS&version=2.0.1&request=GetCoverage&coverageId=emodnet__mean` +
      `&subset=${lon}&subset=${lat}&format=text/plain`
    const text = await cached(`emodnet/${bx}_${by}.txt`, url)
    if (++done % 50 === 0) process.stdout.write(`  EMODnet ${done}/${jobs.length}\r`)
    return parseWcs(text)
  })
  const iMin = bx0 * EBLOCK
  const jMin = by0 * EBLOCK
  const width = (bx1 - bx0 + 1) * EBLOCK
  const height = (by1 - by0 + 1) * EBLOCK
  const values = new Float32Array(width * height).fill(NaN) // riga 0 = sud
  for (const b of blocks) {
    for (let r = 0; r < b.height; r++) {
      const j = b.jTop - r - jMin
      if (j < 0 || j >= height) continue
      for (let col = 0; col < b.width; col++) {
        const i = b.i0 + col - iMin
        if (i < 0 || i >= width) continue
        values[j * width + i] = b.values[r * b.width + col]
      }
    }
  }
  const at = (i, j) => {
    const x = i - iMin
    const y = j - jMin
    if (x < 0 || y < 0 || x >= width || y >= height) return NaN
    return values[y * width + x]
  }
  /** Bilineare sui centri delle celle; NaN se manca un vertice */
  const sample = (lon, lat) => {
    const fx = lon * EMOD - 0.5
    const fy = lat * EMOD - 0.5
    const i = Math.floor(fx)
    const j = Math.floor(fy)
    const tx = fx - i
    const ty = fy - j
    const a = at(i, j)
    const b = at(i + 1, j)
    const c2 = at(i, j + 1)
    const d = at(i + 1, j + 1)
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d * tx) * ty
  }
  return { iMin, jMin, width, height, values, at, sample }
}

// ----------------------------------------------------------- Regione Liguria

/*
 * Isobate di dettaglio del Piano di tutela dell'ambiente marino e costiero
 * (WFS M2113:L7175, dati aperti): ambito 08 Loano–Finale (multibeam 2012),
 * 15 Tigullio (2008), 16-17-18 Sestri Levante–La Spezia–Magra (2019).
 * Tutto lo strato in una volta (a pagine da 5000), poi si cerca per riquadro.
 */
let liguriaLines = null
async function loadLiguria() {
  if (liguriaLines) return liguriaLines
  const file = join(CACHE, 'liguria-L7175.json')
  if (!existsSync(file)) {
    const all = []
    for (let start = 0; ; start += 5000) {
      const url =
        'https://geoservizi.regione.liguria.it/geoserver/M2113/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=M2113:L7175' +
        `&outputFormat=application/json&srsName=EPSG:4326&count=5000&startIndex=${start}&sortBy=ID1`
      const r = await fetch(url)
      if (!r.ok) throw new Error(`Liguria WFS ${r.status}`)
      const page = await r.json()
      all.push(...page.features)
      if (page.features.length < 5000) break
    }
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features: all }))
  }
  const json = JSON.parse(readFileSync(file, 'utf8'))
  liguriaLines = []
  for (const f of json.features) {
    const depth = -Number(f.properties.VALUE)
    if (!(depth > 0) || !f.geometry) continue
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const raw of parts) {
      if (raw.length < 2) continue
      const pts = raw.map((p) => [p[0], p[1]])
      let w = Infinity
      let s = Infinity
      let e = -Infinity
      let n = -Infinity
      for (const [x, y] of pts) {
        if (x < w) w = x
        if (x > e) e = x
        if (y < s) s = y
        if (y > n) n = y
      }
      liguriaLines.push({ depth, pts, bbox: [w, s, e, n] })
    }
  }
  return liguriaLines
}

/** Isobate del rilievo che toccano il riquadro: [{ depth, pts: [[lon, lat]…] }] */
export async function liguriaIn(w, s, e, n) {
  const lines = await loadLiguria()
  return lines.filter(({ bbox }) => bbox[0] <= e && bbox[2] >= w && bbox[1] <= n && bbox[3] >= s)
}

// ---------------------------------------------------------- costa (OSM / OFM)

let ofmTemplate = null
async function ofmUrl(z, x, y) {
  if (!ofmTemplate) {
    const tj = JSON.parse(await cached('ofm-tilejson.json', 'https://tiles.openfreemap.org/planet'))
    ofmTemplate = tj.tiles[0]
  }
  return ofmTemplate.replace('{z}', z).replace('{x}', x).replace('{y}', y)
}

/**
 * Acqua del tassello z14 (x, y): anelli in coordinate del tassello (0..extent),
 * null se il tassello non esiste. Tutte le classi d'acqua tranne le piscine.
 */
export async function waterTile(x, y, z = 14) {
  const raw = await cached(`ofm/${z}/${x}/${y}.pbf`, await ofmUrl(z, x, y), { binary: true })
  if (!raw.length) return null
  const buf = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw
  const vt = new VectorTile(new Pbf(buf))
  const layer = vt.layers.water
  const rings = []
  let extent = 4096
  if (layer) {
    extent = layer.extent
    for (let k = 0; k < layer.length; k++) {
      const f = layer.feature(k)
      if (f.type !== 3 || f.properties.class === 'swimming_pool') continue
      for (const ring of f.loadGeometry()) rings.push(ring.map((p) => [p.x, p.y]))
    }
  }
  // porti e marine: lì la riva è una banchina, non una spiaggia a 0 m
  const harbors = []
  const poi = vt.layers.poi
  if (poi) {
    for (let k = 0; k < poi.length; k++) {
      const f = poi.feature(k)
      if (f.properties.class !== 'harbor') continue
      const g = f.loadGeometry()[0]?.[0]
      if (g) harbors.push([g.x, g.y])
    }
  }
  return { extent, rings, harbors }
}

// ------------------------------------------------- Litto3D (griglie già in TIMONE)

/*
 * Quote a 10 m dai rilievi Litto3D® del Shom già elaborati da litto3d-isobaths.mjs
 * (public/isobaths-hd/<x>_<y>.bin, Lambert-93, decimetri, righe da nord).
 * Restituisce sample(lon, lat) -> quota (mare negativo) o NaN, oppure null
 * se nessuna griglia tocca il riquadro.
 */
let littoIndex = null
export async function litto3dSampler(w, s, e, n) {
  const dir = resolve('public/isobaths-hd')
  if (!littoIndex) {
    littoIndex = existsSync(join(dir, 'index.json')) ? JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) : { tiles: {}, grids: {} }
    littoIndex.cache = new Map()
  }
  const { default: proj4 } = await import('proj4')
  const L93 =
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
  const toL93 = proj4('WGS84', L93)
  const hits = Object.entries(littoIndex.tiles).filter(([name, b]) => littoIndex.grids[name] && b[0] <= n && b[2] >= s && b[1] <= e && b[3] >= w)
  if (!hits.length) return null
  const { cell, size, nodata } = littoIndex.grid
  const grids = new Map()
  for (const [name] of hits) {
    if (!littoIndex.cache.has(name)) {
      const buf = readFileSync(join(dir, `${name}.bin`))
      littoIndex.cache.set(name, new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2))
    }
    grids.set(name, { values: littoIndex.cache.get(name), origin: littoIndex.grids[name] })
  }
  return (lon, lat) => {
    const [x, y] = toL93.forward([lon, lat])
    const name = `${Math.floor(x / 2000)}_${Math.floor(y / 2000)}`
    const g = grids.get(name)
    if (!g) return NaN
    const c = Math.round((x - g.origin[0]) / cell)
    const r = Math.round((g.origin[1] - y) / cell)
    if (c < 0 || r < 0 || c >= size || r >= size) return NaN
    const v = g.values[r * size + c]
    return v === nodata ? NaN : v / 10
  }
}

// ------------------------------------------- Litto3D a 5 m (lastre ASC originali)

/*
 * Lastre MNT5 del Shom (1 km², 200 × 200 celle da 5 m, Lambert-93), lette da
 * una cartella (variabile LITTO3D_DIR; di base la cartella Shom nel Dropbox).
 * Più fedeli delle griglie a 10 m di public/isobaths-hd, che restano dove
 * le lastre non ci sono.
 */
const LITTO_DIR =
  process.env.LITTO3D_DIR || join(homedir(), 'Library/CloudStorage/Dropbox/documentazione barca best shot/cartografia shom/mnt5')
let ascIndex = null // "I_J" (km dell'angolo in basso a sinistra) -> file

function indexAsc() {
  if (ascIndex) return ascIndex
  ascIndex = new Map()
  if (!existsSync(LITTO_DIR)) return ascIndex
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/MNT5.*\.asc$/i.test(e.name)) {
        // nome: …_FRA_<x km angolo nord-ovest>_<y km angolo nord-ovest>_MNT5_…
        const m = e.name.match(/_FRA_(\d{4})_(\d{4})_MNT5/i)
        if (m) ascIndex.set(`${Number(m[1])}_${Number(m[2]) - 1}`, p)
      }
    }
  }
  walk(LITTO_DIR)
  return ascIndex
}

const ascCache = new Map()
function readAsc(file) {
  if (ascCache.has(file)) return ascCache.get(file)
  const text = readFileSync(file, 'utf8')
  const header = {}
  let pos = 0
  for (let line = 0; line < 6; line++) {
    const end = text.indexOf('\n', pos)
    const [k, v] = text.slice(pos, end).trim().split(/\s+/)
    header[k.toLowerCase()] = Number(v)
    pos = end + 1
  }
  const { ncols, nrows, cellsize } = header
  const values = new Float32Array(ncols * nrows)
  let k = 0
  for (const t of text.slice(pos).split(/\s+/)) {
    if (!t) continue
    const v = Number(t)
    values[k++] = v <= -99998 ? NaN : v
    if (k === values.length) break
  }
  const xc = header.xllcenter ?? header.xllcorner + cellsize / 2
  const yc = header.yllcenter ?? header.yllcorner + cellsize / 2
  // centro della prima cella (nord-ovest)
  const grid = { x0: xc, yTop: yc + (nrows - 1) * cellsize, ncols, nrows, cell: cellsize, values }
  ascCache.set(file, grid)
  if (ascCache.size > 400) ascCache.delete(ascCache.keys().next().value)
  return grid
}

export function litto3dAscCount() {
  return indexAsc().size
}

/** sample(lon, lat) -> quota (mare negativo) dalle lastre a 5 m, o NaN; null se nessuna lastra vicina */
export async function litto3dAscSampler(w, s, e, n) {
  const index = indexAsc()
  if (!index.size) return null
  const { default: proj4 } = await import('proj4')
  const L93 =
    '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
  const toL93 = proj4('WGS84', L93)
  const corners = [
    [w, s],
    [w, n],
    [e, s],
    [e, n],
  ].map((p) => toL93.forward(p))
  const xs = corners.map((c) => c[0] / 1000)
  const ys = corners.map((c) => c[1] / 1000)
  let any = false
  for (let i = Math.floor(Math.min(...xs)); i <= Math.floor(Math.max(...xs)) && !any; i++)
    for (let j = Math.floor(Math.min(...ys)); j <= Math.floor(Math.max(...ys)); j++) if (index.has(`${i}_${j}`)) any = true
  if (!any) return null
  return (lon, lat) => {
    const [x, y] = toL93.forward([lon, lat])
    const file = index.get(`${Math.floor(x / 1000)}_${Math.floor(y / 1000)}`)
    if (!file) return NaN
    const g = readAsc(file)
    const c = Math.round((x - g.x0) / g.cell)
    const r = Math.round((g.yTop - y) / g.cell)
    if (c < 0 || r < 0 || c >= g.ncols || r >= g.nrows) return NaN
    return g.values[r * g.ncols + c]
  }
}
