/*
 * Carta TIMONE: fondali calcolati una volta qui, letti dall'app come tasselli
 * vettoriali statici (public/carta/{z}/{x}/{y}.pbf) e disegnati da MapLibre.
 *
 * Strati dei tasselli:
 *   depare  fasce: area con fondale ≤ d (d in BANDS), da disegnare dalla più profonda
 *   depcnt  isobate: d (m), q = 1 rilievo, 0 modello (EMODnet / interpolato)
 *   soundg  quote: d (m), q
 *   nodata  zone d'acqua senza dati affidabili (porti non rilevati)
 *
 * Uso:
 *   node --max-old-space-size=8192 tools/chart-tiles.mjs [zona …]   (zone in AREAS, di base tutte)
 * Le fonti scaricate restano in tools/.cache: la seconda volta è tutto locale.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { CHUNK, FINE, BANDS, coarseChunk, fineChunk } from './chart/fuse.js'
import { EMOD, emodnetGrid, liguriaIn, litto3dAscCount, litto3dAscSampler, litto3dSampler, pool, waterTile } from './chart/sources.js'
import { lonLatToMerc, tilePyramid } from './chart/tiler.js'

const AREAS = {
  finale: { w: 8.3, s: 44.1, e: 8.45, n: 44.2 }, // prova veloce
  // Alto Tirreno e Costa Azzurra: da Marsiglia a Piombino ed Elba, Liguria e Corsica
  tirreno: { w: 4.85, s: 41.3, e: 10.6, n: 44.45 },
}
// i tasselli z/x/y restano sul Mac (verifiche); online va il file unico PMTiles su R2
const OUT = resolve(process.env.OUT || 'tools/.cache/carta')
const MIN_ZOOM = 5
const MAX_ZOOM = 14

console.log(`Litto3D: ${litto3dAscCount()} lastre a 5 m`)
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['tirreno']
const t0 = Date.now()
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s]`, ...a)

// --------------------------------------------------------------- zoom

function contourMinZoom(d) {
  if (d === 1000 || d === 2000) return 5
  if (d === 200 || d === 500) return 6
  if (d >= 100) return 8
  if (d === 50) return 8
  if (d === 10 || d === 20 || d === 30) return 10
  if (d === 5 || d === 2) return 11
  if (d % 5 === 0 || d === 1 || d === 3) return 12
  return 13
}
function bandMinZoom(d) {
  if (d >= 100) return MIN_ZOOM
  if (d >= 20) return 8
  if (d >= 10) return 9
  if (d >= 5) return 10
  return 11
}

// ---------------------------------------------------------------- lavoro

const features = []
const soundings = []
const done = new Set() // riquadri già fatti (le zone possono sovrapporsi)
let bounds = [Infinity, Infinity, -Infinity, -Infinity]

for (const name of names) {
  const a = AREAS[name]
  if (!a) throw new Error(`zona sconosciuta: ${name}`)
  log(name, 'EMODnet…')
  const emod = await emodnetGrid({ w: a.w - 0.1, s: a.s - 0.1, e: a.e + 0.1, n: a.n + 0.1 })
  bounds = [Math.min(bounds[0], a.w), Math.min(bounds[1], a.s), Math.max(bounds[2], a.e), Math.max(bounds[3], a.n)]

  const ci0 = Math.floor((a.w * FINE) / CHUNK)
  const ci1 = Math.ceil((a.e * FINE) / CHUNK) - 1
  const cj0 = Math.floor((a.s * FINE) / CHUNK)
  const cj1 = Math.ceil((a.n * FINE) / CHUNK) - 1
  const fine = []
  const coarse = []
  const E = (CHUNK * EMOD) / FINE // celle EMODnet per riquadro
  for (let ci = ci0; ci <= ci1; ci++) {
    for (let cj = cj0; cj <= cj1; cj++) {
      const key = `${ci},${cj}`
      if (done.has(key)) continue
      done.add(key)
      // fine se c'è costa o fondale sotto i 100 m (con 5 celle di margine)
      let shallow = false
      let sea = false
      for (let i = ci * E - 5; i < (ci + 1) * E + 5 && !shallow; i++)
        for (let j = cj * E - 5; j < (cj + 1) * E + 5; j++) {
          const v = emod.at(i, j)
          if (!Number.isFinite(v) || v > -100) shallow = true
          if (v < 0) sea = true
          if (shallow) break
        }
      if (shallow) fine.push([ci, cj])
      else if (sea) coarse.push([ci, cj])
    }
  }
  log(name, `${fine.length} riquadri sotto costa, ${coarse.length} al largo`)

  for (const [ci, cj] of coarse) {
    const r = coarseChunk(ci, cj, emod)
    features.push(...r.features)
    soundings.push(...r.soundings)
  }

  let n = 0
  for (const [ci, cj] of fine) {
    const pad = 0.006 // gradi di contesto (> 48 celle)
    const w = (ci * CHUNK) / FINE - pad
    const e = ((ci + 1) * CHUNK) / FINE + pad
    const s = (cj * CHUNK) / FINE - pad
    const nn = ((cj + 1) * CHUNK) / FINE + pad

    // costa: tasselli z14
    const Z = 2 ** 14
    const [mx0, my0] = lonLatToMerc(w, nn)
    const [mx1, my1] = lonLatToMerc(e, s)
    const jobs = []
    for (let x = Math.floor(mx0 * Z); x <= Math.floor(mx1 * Z); x++) for (let y = Math.floor(my0 * Z); y <= Math.floor(my1 * Z); y++) jobs.push([x, y])
    const tiles = new Map()
    await pool(jobs, 6, async ([x, y]) => tiles.set(`${x},${y}`, await waterTile(x, y)))

    // rilievo della Regione Liguria
    const surveyLines = await liguriaIn(w, s, e, nn)
    // Litto3D: lastre a 5 m dove ci sono, sennò le griglie a 10 m già in TIMONE
    const fine5 = await litto3dAscSampler(w, s, e, nn)
    const coarse10 = await litto3dSampler(w, s, e, nn)
    const surveyGrid =
      fine5 && coarse10
        ? (lon, lat) => {
            const v = fine5(lon, lat)
            return Number.isFinite(v) ? v : coarse10(lon, lat)
          }
        : fine5 || coarse10

    const r = fineChunk(ci, cj, {
      emod,
      getWaterTile: (x, y) => tiles.get(`${x},${y}`) ?? null,
      surveyLines,
      surveyGrid,
    })
    if (r) {
      features.push(...r.features)
      soundings.push(...r.soundings)
    }
    if (++n % 10 === 0) log(name, `${n}/${fine.length} riquadri, ${features.length} elementi`)
  }
}

// ----------------------------------------------------------- zoom degli elementi

for (const f of features) {
  f.maxzoom = MAX_ZOOM
  if (f.layer === 'depcnt') f.minzoom = contourMinZoom(f.props.d)
  else if (f.layer === 'depare') f.minzoom = bandMinZoom(f.props.d)
  else f.minzoom = 11
}

// quote: una ogni 48 pixel fino a z13 (prima i rilievi, poi le più basse), tutte a z14
soundings.sort((p, q) => q.q - p.q || p.depth - q.depth)
const minz = new Array(soundings.length).fill(MAX_ZOOM)
for (let z = 9; z < MAX_ZOOM; z++) {
  const cell = 48 / (256 * 2 ** z)
  const taken = new Set()
  const key = (p) => `${Math.floor(p.geom[0] / cell)},${Math.floor(p.geom[1] / cell)}`
  soundings.forEach((p, i) => minz[i] < z && taken.add(key(p)))
  soundings.forEach((p, i) => {
    if (minz[i] < z) return
    const k = key(p)
    if (taken.has(k)) return
    taken.add(k)
    minz[i] = z
  })
}
soundings.forEach((p, i) => {
  const d = p.q && p.depth < 31 ? Math.round(p.depth * 10) / 10 : Math.round(p.depth)
  features.push({ layer: 'soundg', type: 1, props: { d, q: p.q }, geom: p.geom, minzoom: minz[i], maxzoom: MAX_ZOOM })
})
log(`${features.length} elementi, ${soundings.length} quote: taglio i tasselli…`)

// ---------------------------------------------------------------- tasselli

const tmp = `${OUT}.new`
let count = 0
let bytes = 0
const perZoom = {}
tilePyramid(features, {
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  tolerance: 2,
  onTile: (z, x, y, data) => {
    const dir = join(tmp, String(z), String(x))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${y}.pbf`), data)
    count++
    bytes += data.length
    perZoom[z] = (perZoom[z] || 0) + 1
  },
})
writeFileSync(
  join(tmp, 'meta.json'),
  JSON.stringify({
    version: new Date().toISOString(),
    minzoom: MIN_ZOOM,
    maxzoom: MAX_ZOOM,
    bounds: bounds.map((v) => Math.round(v * 1e4) / 1e4),
    areas: names,
    bands: BANDS,
    attribution:
      'Fondali: EMODnet Bathymetry (CC BY 4.0), Litto3D® Shom-IGN (Licence Ouverte), Regione Liguria (rilievi multibeam, dati aperti), costa © OpenStreetMap (ODbL)',
  }),
)
// la carta vecchia va nel Cestino, la nuova al suo posto
if (existsSync(OUT)) renameSync(OUT, join(homedir(), '.Trash', `carta-${Date.now()}`))
renameSync(tmp, OUT)
log(`${count} tasselli, ${(bytes / 1e6).toFixed(1)} MB`, JSON.stringify(perZoom))
