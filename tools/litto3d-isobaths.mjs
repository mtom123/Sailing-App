/*
 * Isobate ad alta risoluzione dai rilievi Litto3D® del Shom.
 *
 * Legge i MNT a 5 m (dalles ASC da 1 km², Lambert-93) dagli archivi 7z
 * scaricati da diffusion.shom.fr, calcola le isobate ogni metro e scrive
 * tasselli JSON compatti che l'app carica solo dove servono
 * (src/lib/hdIsobathLayer.js).
 *
 * Uso:
 *   npm run litto3d -- <cartella o archivio> [...]   # scrive public/isobaths-hd/
 *
 * Uscita:
 *   public/isobaths-hd/index.json      elenco dei tasselli con il loro riquadro
 *   public/isobaths-hd/<x>_<y>.json    un tassello ogni 2 × 2 km:
 *     { lines: [[profondità, lat0, lon0, dlat1, dlon1, ...]],   (1e-5 gradi, a differenze)
 *       cov:   [[lat0, lon0, dlat1, dlon1, ...]] }             contorno dell'area rilevata
 *
 * Profondità riferite al livello medio del mare (IGN69), non allo zero
 * idrografico. Dati Shom, Licence Ouverte 2.0. Non per la navigazione.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { contours } from 'd3-contour'
import proj4 from 'proj4'

const OUT_DIR = resolve(process.env.OUT || 'public/isobaths-hd') // OUT=… per le prove
const L93 =
  '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
const toWgs84 = proj4(L93, 'WGS84')

const CELL = 5 // m, MNT5
const DALLE = 1000 // m
const TILE_KM = 2 // tasselli di uscita: 2 × 2 dalles
const LEVELS = [...Array.from({ length: 30 }, (_, i) => i + 1), 35, 40, 50] // m
const SIMPLIFY = 1.5 // m, Douglas-Peucker
const NODATA = -99999

// ---------------------------------------------------------------- lettura

function findInputs(paths) {
  const asc = []
  const archives = []
  const walk = (p) => {
    const s = statSync(p)
    if (s.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e))
    else if (/MNT5.*\.asc$/i.test(p)) asc.push(p)
    else if (/\.(7z|zip)$/i.test(p)) archives.push(p)
  }
  paths.forEach((p) => walk(resolve(p)))
  return { asc, archives }
}

// Solo i MNT a 5 m: il tar di macOS (libarchive) legge anche il 7z
// (con un filtro che non trova niente tar esce con errore: prima si elenca)
function extractMnt5(archive, dir) {
  const names = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter((n) => /MNT5.*\.asc$/i.test(n) || /\.(7z|zip)$/i.test(n))
  for (let i = 0; i < names.length; i += 200) {
    execFileSync('tar', ['-xf', archive, '-C', dir, ...names.slice(i, i + 200)])
  }
}

function readAsc(file) {
  const text = readFileSync(file, 'utf8')
  const header = {}
  let pos = 0
  for (let i = 0; i < 6; i++) {
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
    values[k++] = Number(t)
    if (k === values.length) break
  }
  if (cellsize !== CELL) throw new Error(`${file}: cella ${cellsize} m, attesi ${CELL}`)
  // Indici dei centri cella (x = 5·I, y = 5·J) della cella in basso a sinistra
  const xc = header.xllcenter ?? header.xllcorner + cellsize / 2
  const yc = header.yllcenter ?? header.yllcorner + cellsize / 2
  return { i0: Math.round(xc / CELL), j0: Math.round(yc / CELL), ncols, nrows, values, nodata: header.nodata_value ?? NODATA }
}

// ---------------------------------------------------------------- geometria

function simplify(points, tol) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  const tol2 = tol * tol
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-12
    let max = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      const ex = ax + t * dx - px
      const ey = ay + t * dy - py
      const d2 = ex * ex + ey * ey
      if (d2 > max) {
        max = d2
        idx = i
      }
    }
    if (max > tol2) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

// [x, y] Lambert-93 → [lat, lon] in interi da 1e-5 gradi, a differenze
function encode(points, prefix = []) {
  const out = [...prefix]
  let plat = 0
  let plon = 0
  points.forEach(([x, y], i) => {
    const [lon, lat] = toWgs84.forward([x, y])
    const ilat = Math.round(lat * 1e5)
    const ilon = Math.round(lon * 1e5)
    if (i === 0) out.push(ilat, ilon)
    else out.push(ilat - plat, ilon - plon)
    plat = ilat
    plon = ilon
  })
  return out
}

// ---------------------------------------------------------------- tasselli

// Le dalles sono sfalsate di qualche cella rispetto ai km tondi (Litto3D: centri
// sui multipli di 5 m, prima riga a +5 m): si lavora con gli indici dei centri
// e lo stesso sfalsamento per dalles e tasselli
const PER_DALLE = DALLE / CELL
const PER_TILE = (TILE_KM * DALLE) / CELL
let offI = 0
let offJ = 0
const dalleKey = (i, j) => `${Math.floor((i - offI) / PER_DALLE)},${Math.floor((j - offJ) / PER_DALLE)}`

function buildTile(dalles, tx, ty) {
  // Griglia del tassello più una cella oltre ogni bordo, presa dai vicini:
  // le linee di tasselli adiacenti si raccordano
  const w = PER_TILE + 2
  const h = PER_TILE + 2
  const iMin = offI + tx * PER_TILE - 1 // prima colonna (ovest)
  const jMax = offJ + (ty + 1) * PER_TILE // prima riga (nord)
  const values = new Float32Array(w * h).fill(NaN)
  let any = false
  for (let r = 0; r < h; r++) {
    const j = jMax - r
    for (let c = 0; c < w; c++) {
      const i = iMin + c
      const d = dalles.get(dalleKey(i, j))
      if (!d) continue
      const v = d.values[(d.nrows - 1 - (j - d.j0)) * d.ncols + (i - d.i0)]
      if (v === d.nodata || v === undefined) continue
      values[r * w + c] = v
      any = true
    }
  }
  if (!any) return null

  // d3-contour: valore della cella (c, r) in (c + 0.5, r + 0.5), e il centro
  // della cella (i, j) sta in (5·i, 5·j) Lambert-93
  const toL93 = ([x, y]) => [(iMin + x - 0.5) * CELL, (jMax - y + 0.5) * CELL]
  const missing = (c, r) => c < 0 || r < 0 || c >= w || r >= h || Number.isNaN(values[r * w + c])
  // Un punto è affidabile se le 4 celle intorno hanno un valore
  const valid = ([x, y]) => {
    const c = Math.floor(x - 0.5)
    const r = Math.floor(y - 0.5)
    return !missing(c, r) && !missing(c + 1, r) && !missing(c, r + 1) && !missing(c + 1, r + 1)
  }
  // Fuori dal tassello (la cella presa dai vicini) le linee si tagliano
  const inside = ([x, y]) => x >= 1 && x <= w - 1 && y >= 1 && y <= h - 1

  const filled = values.map((v) => (Number.isNaN(v) ? 9999 : v))
  const gen = contours().size([w, h]).smooth(true)
  const lines = []
  for (const depth of LEVELS) {
    for (const poly of gen.contour(filled, -depth).coordinates) {
      for (const ring of poly) {
        let run = []
        const flush = () => {
          if (run.length > 1) lines.push(encode(simplify(run.map(toL93), SIMPLIFY), [depth]))
          run = []
        }
        for (const p of ring) {
          if (valid(p) && inside(p)) run.push(p)
          else flush()
        }
        flush()
      }
    }
  }

  // Area rilevata: celle con un valore, contorno semplificato a ~10 m
  const mask = values.map((v) => (Number.isNaN(v) ? 0 : 1))
  const cov = []
  for (const poly of contours().size([w, h]).contour(mask, 0.5).coordinates) {
    for (const ring of poly) {
      const pts = simplify(ring.map(toL93), 10)
      if (pts.length >= 4) cov.push(encode(pts))
    }
  }

  const sw = toWgs84.forward([(offI + tx * PER_TILE) * CELL, (offJ + ty * PER_TILE) * CELL])
  const ne = toWgs84.forward([(offI + (tx + 1) * PER_TILE) * CELL, (offJ + (ty + 1) * PER_TILE) * CELL])
  return { lines, cov, bbox: [sw[1], sw[0], ne[1], ne[0]].map((v) => Math.round(v * 1e5) / 1e5) }
}

// ---------------------------------------------------------------- main

const inputs = process.argv.slice(2)
if (!inputs.length) {
  console.error('Uso: npm run litto3d -- <cartella o archivio Litto3D> [...]')
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'litto3d-'))
try {
  let { asc, archives } = findInputs(inputs)
  // Gli archivi possono contenere altri archivi (prepaquets)
  while (archives.length) {
    const dir = mkdtempSync(join(tmp, 'x-'))
    for (const a of archives) {
      console.log('Estraggo', a)
      extractMnt5(a, dir)
    }
    const found = findInputs([dir])
    asc = asc.concat(found.asc)
    archives = found.archives
  }
  console.log(`${asc.length} dalles MNT 5 m`)

  const grids = asc.map(readAsc)
  offI = ((grids[0].i0 % PER_DALLE) + PER_DALLE) % PER_DALLE
  offJ = ((grids[0].j0 % PER_DALLE) + PER_DALLE) % PER_DALLE
  const dalles = new Map()
  for (const d of grids) {
    if ((d.i0 - offI) % PER_DALLE || (d.j0 - offJ) % PER_DALLE) throw new Error('dalles non allineate tra loro')
    dalles.set(dalleKey(d.i0, d.j0), d)
  }

  const tiles = new Set()
  for (const d of grids) {
    const [x, y] = dalleKey(d.i0, d.j0).split(',').map(Number)
    tiles.add(`${Math.floor(x / TILE_KM)},${Math.floor(y / TILE_KM)}`)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const indexFile = join(OUT_DIR, 'index.json')
  let index = {}
  try {
    index = JSON.parse(readFileSync(indexFile, 'utf8')).tiles
  } catch {}
  let bytes = 0
  for (const key of tiles) {
    const [tx, ty] = key.split(',').map(Number)
    const tile = buildTile(dalles, tx, ty)
    const name = `${tx}_${ty}`
    if (!tile || !tile.lines.length) continue
    const json = JSON.stringify({ lines: tile.lines, cov: tile.cov })
    writeFileSync(join(OUT_DIR, `${name}.json`), json)
    index[name] = tile.bbox
    bytes += json.length
  }
  writeFileSync(
    indexFile,
    JSON.stringify({
      source: 'Shom – Litto3D®, Licence Ouverte 2.0. Profondità IGN69 (livello medio). Non per la navigazione.',
      levels: LEVELS,
      tiles: index,
    })
  )
  console.log(`${Object.keys(index).length} tasselli in ${OUT_DIR}, ${(bytes / 1e6).toFixed(1)} MB scritti ora`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
