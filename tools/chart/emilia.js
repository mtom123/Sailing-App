/*
 * Regione Emilia-Romagna, costa (dati aperti, mappegis.regione.emilia-romagna.it/moka/ckan/costa):
 *   - Isobate_anno_2018: isobate ogni 1 m del rilievo ARPAE 2018 (CC BY 4.0),
 *     shapefile in RDN2008 / UTM 32N
 *   - DTM_RER_topo_batimetrico_2012: modello terra-mare a 5 m (CC BY 3.0),
 *     griglia ESRI binaria (float32) in WGS84 / UTM 33N
 * Le cartelle estratte stanno in tools/.cache/emilia/{iso,dtm} (variabile EMILIA_DIR).
 *
 * Zero idrografico: le quote ARPAE sono ortometriche (livello medio mare Genova 1942).
 * Il livello medio locale a Porto Garibaldi è +0,093 m su Genova 1942 (ARPAE,
 * Ecoscienza 6/2019, luglio 2009–giugno 2019, corretto per la subsidenza) e la marea
 * astronomica minima a Ravenna è −0,645 m sul medio (ISPRA RMN, tabella 2024).
 * Lo zero delle carte sta quindi 0,55 m sotto lo zero IGM: tutti i fondali di
 * queste fonti diventano 0,55 m meno profondi (dalla parte della sicurezza).
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ER_ZH = 0.093 - 0.645 // quota IGM dello zero idrografico (m)
const DIR = resolve(process.env.EMILIA_DIR || 'tools/.cache/emilia')
const DTM = join(DIR, 'dtm/DTM_RER_topo_batimetrico_2012_costa_mare/dtm_2012')
const ISO = join(DIR, 'iso/Isobate_anno_2018')
const BBOX = [12.03, 43.93, 12.81, 44.89] // copertura indicativa (lon/lat)

let proj = null
async function projections() {
  if (proj) return proj
  const { default: proj4 } = await import('proj4')
  proj = {
    utm33: proj4('WGS84', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs'),
    utm32: proj4('WGS84', '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'),
  }
  return proj
}

const touches = (w, s, e, n) => w <= BBOX[2] && e >= BBOX[0] && s <= BBOX[3] && n >= BBOX[1]

// ------------------------------------------------------------- griglia 2012

let grid = null
function openGrid() {
  if (grid) return grid
  if (!existsSync(join(DTM, 'hdr.adf'))) return (grid = false)
  const hdr = readFileSync(join(DTM, 'hdr.adf'))
  const bnd = readFileSync(join(DTM, 'dblbnd.adf'))
  if (hdr.readInt32BE(16) !== 2) throw new Error('DTM Emilia: attesa griglia float')
  const cell = hdr.readDoubleBE(256)
  const perRow = hdr.readInt32BE(288)
  const bw = hdr.readInt32BE(296)
  const bh = hdr.readInt32BE(304)
  const x0 = bnd.readDoubleBE(0)
  const yTop = bnd.readDoubleBE(24)
  const ncols = Math.round((bnd.readDoubleBE(16) - x0) / cell)
  const nrows = Math.round((yTop - bnd.readDoubleBE(8)) / cell)
  const idx = readFileSync(join(DTM, 'w001001x.adf'))
  grid = { cell, perRow, bw, bh, x0, yTop, ncols, nrows, idx, fd: openSync(join(DTM, 'w001001.adf'), 'r'), blocks: new Map() }
  return grid
}

function block(g, b) {
  let a = g.blocks.get(b)
  if (a) return a
  const off = g.idx.readInt32BE(100 + 8 * b) * 2
  const words = g.idx.readInt32BE(104 + 8 * b)
  a = new Float32Array(g.bw * g.bh).fill(NaN)
  if (words >= g.bw * g.bh * 2) {
    const buf = Buffer.alloc(g.bw * g.bh * 4)
    readSync(g.fd, buf, 0, buf.length, off + 2)
    for (let i = 0; i < a.length; i++) {
      const v = buf.readFloatBE(i * 4)
      a[i] = v < -1e30 || !Number.isFinite(v) ? NaN : v
    }
  }
  g.blocks.set(b, a)
  if (g.blocks.size > 20000) g.blocks.delete(g.blocks.keys().next().value)
  return a
}

// celle della carta (fuse.js FINE): ogni cella prende la quota più alta (il fondo
// meno profondo) fra i punti del DTM che cadono al suo interno, così un molo o una
// scogliera più stretti della cella non spariscono
const CELL = 1 / 9600
const SUB = [-0.45, -0.15, 0.15, 0.45] // passo 0,3 celle ≈ 2,5 × 3,5 m < 5 m del DTM

/** sample(lon, lat) -> quota più alta nella cella della carta, sullo zero idrografico (mare negativo), o NaN; null fuori copertura */
export async function emiliaSampler(w, s, e, n) {
  if (!touches(w, s, e, n)) return null
  const g = openGrid()
  if (!g) return null
  const { utm33 } = await projections()
  const at = (lon, lat) => {
    const [x, y] = utm33.forward([lon, lat])
    const c = Math.floor((x - g.x0) / g.cell)
    const r = Math.floor((g.yTop - y) / g.cell)
    if (c < 0 || r < 0 || c >= g.ncols || r >= g.nrows) return NaN
    const a = block(g, Math.floor(r / g.bh) * g.perRow + Math.floor(c / g.bw))
    return a[(r % g.bh) * g.bw + (c % g.bw)]
  }
  const sample = (lon, lat) => {
    let best = -Infinity
    for (const dy of SUB) for (const dx of SUB) {
      const v = at(lon + dx * CELL, lat + dy * CELL)
      if (v > best) best = v
    }
    return best === -Infinity ? NaN : best - ER_ZH
  }
  sample.point = (lon, lat) => at(lon, lat) - ER_ZH // valore puntuale (controlli)
  return sample
}

export function closeEmilia() {
  if (grid) closeSync(grid.fd)
  grid = null
}

// ------------------------------------------------------------- isobate 2018

let lines = null
async function loadLines() {
  if (lines) return lines
  lines = []
  if (!existsSync(`${ISO}.shp`)) return lines
  const cache = join(DIR, 'isobate-2018-lonlat.json')
  let raw
  if (existsSync(cache)) raw = JSON.parse(readFileSync(cache, 'utf8'))
  else {
    const { utm32 } = await projections()
    const dbf = readFileSync(`${ISO}.dbf`)
    const nrec = dbf.readUInt32LE(4)
    const hl = dbf.readUInt16LE(8)
    const rl = dbf.readUInt16LE(10)
    const fields = []
    for (let p = 32; dbf[p] !== 0x0d; p += 32) fields.push({ name: dbf.toString('latin1', p, p + 11).replace(/\0.*$/, ''), len: dbf[p + 16] })
    let qOff = 1
    for (const f of fields) {
      if (f.name === 'QUOTA') break
      qOff += f.len
    }
    const qLen = fields.find((f) => f.name === 'QUOTA').len
    const shp = readFileSync(`${ISO}.shp`)
    raw = []
    let p = 100
    for (let i = 0; i < nrec && p < shp.length; i++) {
      const len = shp.readInt32BE(p + 4) * 2
      const c = p + 8
      p = c + len
      const type = shp.readInt32LE(c)
      if (![3, 13, 23].includes(type)) continue
      const quota = Number(dbf.toString('latin1', hl + i * rl + qOff, hl + i * rl + qOff + qLen))
      const nParts = shp.readInt32LE(c + 36)
      const nPts = shp.readInt32LE(c + 40)
      const parts = []
      for (let k = 0; k < nParts; k++) parts.push(shp.readInt32LE(c + 44 + 4 * k))
      parts.push(nPts)
      const pt0 = c + 44 + 4 * nParts
      for (let k = 0; k < nParts; k++) {
        const pts = []
        for (let j = parts[k]; j < parts[k + 1]; j++) {
          const [lon, lat] = utm32.inverse([shp.readDoubleLE(pt0 + 16 * j), shp.readDoubleLE(pt0 + 16 * j + 8)])
          pts.push([Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7])
        }
        if (pts.length >= 2) raw.push({ quota, pts })
      }
    }
    writeFileSync(cache, JSON.stringify(raw))
  }
  for (const { quota, pts } of raw) {
    const depth = Math.round((ER_ZH - quota) * 100) / 100 // sotto lo zero idrografico
    if (!(depth > 0)) continue
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
    // draw: false — si usano come dati (bruciate nella griglia), non si disegnano:
    // con lo zero idrografico non cadono su metri interi
    lines.push({ depth, pts, bbox: [w, s, e, n], draw: false, over: true })
  }
  return lines
}

/** Isobate 2018 che toccano il riquadro */
export async function emiliaLinesIn(w, s, e, n) {
  if (!touches(w, s, e, n)) return []
  const all = await loadLines()
  return all.filter(({ bbox }) => bbox[0] <= e && bbox[2] >= w && bbox[1] <= n && bbox[3] >= s)
}
