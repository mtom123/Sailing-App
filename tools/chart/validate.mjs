#!/usr/bin/env node
/**
 * Validazione della carta TIMONE.
 *
 *   node --max-old-space-size=12000 tools/chart/validate.mjs [n riquadri per regione] [seme]
 *
 * A. Validazione incrociata (hold-out) sui rilievi Litto3D: in riquadri scelti a caso
 *    si nasconde ~25% delle lastre da 1 km, si rifà la fusione senza di esse e si
 *    confronta la superficie della carta con il rilievo nascosto. Misura quanto sbaglia
 *    il modello dove il rilievo manca, e quanto sbaglia EMODnet da solo sotto costa.
 * B. Validazione incrociata sulle isobate della Regione Liguria (~30% delle linee nascoste).
 * C. Fedeltà dei tasselli pubblicati: quote e isobate di public/carta confrontate col
 *    rilievo d'origine (errori di costruzione: unità, coordinate, semplificazione).
 *
 * Gli errori sono "carta − vero" in metri di fondale: positivo = la carta dice più
 * profondo del vero (direzione pericolosa). Intervalli di confidenza al 95% con
 * bootstrap sui riquadri (le celle vicine non sono indipendenti).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import proj4 from 'proj4'
import { CHUNK, FINE, fineChunk } from './fuse.js'
import { emodnetGrid, liguriaIn, litto3dAscSampler, litto3dSampler, pool, waterTile } from './sources.js'
import { lonLatToMerc } from './tiler.js'

const N_PER_REGION = Number(process.argv[2] || 20)
let seed = Number(process.argv[3] || 42)
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const OUT = process.env.OUT || 'tools/.cache/validazione.json'
const BUF = 48
const PARTS = process.env.PARTS || 'ABC'

const L93 = '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
const toL93 = proj4('WGS84', L93)
const dalle = (lon, lat) => {
  const [x, y] = toL93.forward([lon, lat])
  return `${Math.floor(x / 1000)}_${Math.floor(y / 1000)}`
}

const REGIONS = {
  'Corsica nord (Capo Corso, Balagne, Bastia)': { w: 8.5, s: 42.3, e: 9.6, n: 43.05 },
  'Corsica ovest (Ajaccio, Propriano)': { w: 8.5, s: 41.55, e: 8.95, n: 42.3 },
  'Corsica sud-est (Bonifacio, Porto-Vecchio, piana)': { w: 8.95, s: 41.3, e: 9.6, n: 42.3 },
  'Costa Azzurra (Menton–Fréjus)': { w: 6.7, s: 43.3, e: 7.55, n: 43.8 },
  'Provenza (Saint-Tropez–Hyères–Tolone)': { w: 5.85, s: 42.95, e: 6.7, n: 43.3 },
  'Provenza ovest (Marsiglia–Camargue)': { w: 4.85, s: 43.1, e: 5.85, n: 43.45 },
}
const LIGURIA = { 'Liguria (rilievi Regione)': { w: 7.9, s: 43.85, e: 10.1, n: 44.45 } }

// ------------------------------------------------------------------ statistica

function stats(errs) {
  const n = errs.length
  if (!n) return { n: 0 }
  let s = 0
  let s2 = 0
  let deep05 = 0
  let deep1 = 0
  const abs = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const e = errs[i]
    s += e
    s2 += e * e
    abs[i] = Math.abs(e)
    if (e > 0.5) deep05++
    if (e > 1) deep1++
  }
  abs.sort()
  const q = (p) => abs[Math.min(n - 1, Math.floor(p * n))]
  return {
    n,
    media: s / n,
    rmse: Math.sqrt(s2 / n),
    mediana_abs: q(0.5),
    p95_abs: q(0.95),
    p99_abs: q(0.99),
    max_abs: abs[n - 1],
    piu_profondo_05: deep05 / n,
    piu_profondo_1: deep1 / n,
  }
}

// bootstrap sui riquadri: groups = [[err…] per riquadro]
function bootstrap(groups, f, B = 400) {
  const vals = []
  for (let b = 0; b < B; b++) {
    const pick = []
    for (let i = 0; i < groups.length; i++) pick.push(groups[Math.floor(rand() * groups.length)])
    const v = f(pick.flat())
    if (Number.isFinite(v)) vals.push(v)
  }
  vals.sort((a, b) => a - b)
  return [vals[Math.floor(0.025 * vals.length)], vals[Math.floor(0.975 * vals.length)]]
}

const DEPTH_BINS = [
  [0, 2],
  [2, 5],
  [5, 10],
  [10, 20],
  [20, 50],
  [50, 1e9],
]
const DIST_BINS = [
  [0, 10],
  [10, 25],
  [25, 40],
  [40, 1e9],
] // celle (~8–12 m)

function summarize(rows) {
  // rows: { g: riquadro, truth, pred, emod, dist }
  const byChunk = new Map()
  for (const r of rows) {
    if (!byChunk.has(r.g)) byChunk.set(r.g, [])
    byChunk.get(r.g).push(r)
  }
  const groupsOf = (filter, key) => [...byChunk.values()].map((g) => g.filter(filter).map(key)).filter((g) => g.length)
  const block = (filter) => {
    const pred = groupsOf(filter, (r) => r.pred - r.truth)
    const emod = groupsOf(filter, (r) => r.emod - r.truth)
    const sp = stats(pred.flat())
    const se = stats(emod.flat())
    if (sp.n) {
      sp.rmse_ic95 = bootstrap(pred, (e) => stats(e).rmse)
      sp.media_ic95 = bootstrap(pred, (e) => stats(e).media)
      sp.riquadri = pred.length
    }
    if (se.n) se.rmse_ic95 = bootstrap(emod, (e) => stats(e).rmse)
    return { carta: sp, emodnet_da_solo: se }
  }
  const out = { tutto: block(() => true), per_profondita: {}, per_distanza_dal_dato: {} }
  for (const [a, b] of DEPTH_BINS) out.per_profondita[`${a}–${b > 1e8 ? '…' : b} m`] = block((r) => r.truth >= a && r.truth < b)
  for (const [a, b] of DIST_BINS)
    out.per_distanza_dal_dato[`${Math.round(a * 10)}–${b > 1e8 ? '…' : Math.round(b * 10)} m`] = block((r) => r.dist >= a && r.dist < b)
  return out
}

// --------------------------------------------------------------- contesto riquadro

async function chunkContext(ci, cj, emod) {
  const pad = 0.006
  const w = (ci * CHUNK) / FINE - pad
  const e = ((ci + 1) * CHUNK) / FINE + pad
  const s = (cj * CHUNK) / FINE - pad
  const nn = ((cj + 1) * CHUNK) / FINE + pad
  const Z = 2 ** 14
  const [mx0, my0] = lonLatToMerc(w, nn)
  const [mx1, my1] = lonLatToMerc(e, s)
  const jobs = []
  for (let x = Math.floor(mx0 * Z); x <= Math.floor(mx1 * Z); x++) for (let y = Math.floor(my0 * Z); y <= Math.floor(my1 * Z); y++) jobs.push([x, y])
  const tiles = new Map()
  await pool(jobs, 6, async ([x, y]) => tiles.set(`${x},${y}`, await waterTile(x, y)))
  const surveyLines = await liguriaIn(w, s, e, nn)
  const fine5 = await litto3dAscSampler(w, s, e, nn)
  const coarse10 = await litto3dSampler(w, s, e, nn)
  return { emod, getWaterTile: (x, y) => tiles.get(`${x},${y}`) ?? null, surveyLines, fine5, coarse10 }
}

function chunksIn(a) {
  const out = []
  for (let ci = Math.floor((a.w * FINE) / CHUNK); ci < Math.ceil((a.e * FINE) / CHUNK); ci++)
    for (let cj = Math.floor((a.s * FINE) / CHUNK); cj < Math.ceil((a.n * FINE) / CHUNK); cj++) out.push([ci, cj])
  return out
}
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ------------------------------------------------------------- A. hold-out Litto3D

async function holdoutLitto(name, a, emod) {
  const rows = []
  let used = 0
  for (const [ci, cj] of shuffle(chunksIn(a))) {
    if (used >= N_PER_REGION) break
    const ctx = await chunkContext(ci, cj, emod)
    if (!ctx.fine5) continue
    // lastre del riquadro con dati; ne nascondo ~25% (almeno una)
    const keys = new Set()
    const core = []
    for (let r = BUF; r < BUF + CHUNK; r += 4)
      for (let c = BUF; c < BUF + CHUNK; c += 4) {
        const lon = (ci * CHUNK - BUF + c + 0.5) / FINE
        const lat = ((cj + 1) * CHUNK - 1 + BUF - r + 0.5) / FINE
        const t = ctx.fine5(lon, lat)
        if (Number.isFinite(t) && t < -0.3) {
          keys.add(dalle(lon, lat))
          core.push([r, c, lon, lat, t])
        }
      }
    if (keys.size < 3 || core.length < 200) continue
    const list = shuffle([...keys])
    const hidden = new Set(list.slice(0, Math.max(1, Math.round(list.length * 0.25))))
    let grid = null
    fineChunk(ci, cj, {
      emod,
      getWaterTile: ctx.getWaterTile,
      surveyLines: ctx.surveyLines,
      surveyGrid: (lon, lat) => {
        if (hidden.has(dalle(lon, lat))) return NaN
        const v = ctx.fine5(lon, lat)
        return Number.isFinite(v) ? v : ctx.coarse10 ? NaN : NaN
      },
      onGrid: (g) => (grid = g),
    })
    if (!grid) continue
    used++
    const g = `${ci},${cj}`
    for (const [r, c, lon, lat, t] of core) {
      if (!hidden.has(dalle(lon, lat))) continue
      const k = r * grid.W + c
      if (!grid.water[k]) continue
      rows.push({ g, truth: -t, pred: -grid.u[k], emod: -grid.em[k], dist: grid.dHd[k] })
    }
    process.stdout.write(`\r  ${name}: ${used}/${N_PER_REGION} riquadri, ${rows.length} punti   `)
  }
  console.log()
  return rows
}

// ------------------------------------------------------- B. hold-out isobate Liguria

async function holdoutLiguria(name, a, emod) {
  const rows = []
  let used = 0
  for (const [ci, cj] of shuffle(chunksIn(a))) {
    if (used >= N_PER_REGION) break
    const ctx = await chunkContext(ci, cj, emod)
    if (!ctx.surveyLines || ctx.surveyLines.length < 6) continue
    const hidden = new Set()
    ctx.surveyLines.forEach((l, i) => rand() < 0.3 && hidden.add(i))
    if (!hidden.size) continue
    let grid = null
    fineChunk(ci, cj, {
      emod,
      getWaterTile: ctx.getWaterTile,
      surveyLines: ctx.surveyLines.filter((_, i) => !hidden.has(i)),
      surveyGrid: null,
      onGrid: (gr) => (grid = gr),
    })
    if (!grid) continue
    used++
    const g = `${ci},${cj}`
    const iStart = ci * CHUNK - BUF
    const jTop = (cj + 1) * CHUNK - 1 + BUF
    for (const i of hidden) {
      const { depth, pts } = ctx.surveyLines[i]
      for (const [lon, lat] of pts) {
        const c = Math.floor(lon * FINE - iStart)
        const r = Math.floor(jTop + 1 - lat * FINE)
        if (r < BUF || c < BUF || r >= BUF + CHUNK || c >= BUF + CHUNK) continue
        const k = r * grid.W + c
        if (!grid.water[k]) continue
        rows.push({ g, truth: depth, pred: -grid.u[k], emod: -grid.em[k], dist: grid.dHd[k] })
      }
    }
    process.stdout.write(`\r  ${name}: ${used}/${N_PER_REGION} riquadri, ${rows.length} punti   `)
  }
  console.log()
  return rows
}

// -------------------------------------------------- C. fedeltà dei tasselli pubblicati

function readTile(z, x, y) {
  const p = join('public/carta', String(z), String(x), `${y}.pbf`)
  if (!existsSync(p)) return null
  let buf = readFileSync(p)
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf)
  return new VectorTile(new Pbf(new Uint8Array(buf))) // copia: vedi sources.js
}

// distanza orizzontale (m) dal vertice dell'isobata d al punto più vicino dove il rilievo passa per d
function horizontalOffset(truth, lon, lat, d, t0) {
  if (Math.abs(t0 - d) < 0.05) return 0
  const s0 = Math.sign(t0 - d)
  const mLat = 111320
  const mLon = 111320 * Math.cos((lat * Math.PI) / 180)
  let best = Infinity
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * 2 * Math.PI
    for (let r = 2.5; r <= 100 && r < best; r += 2.5) {
      const v = truth(lon + (r * Math.cos(a)) / mLon, lat + (r * Math.sin(a)) / mLat)
      if (!Number.isFinite(v)) break
      if (Math.sign(-v - d) !== s0) {
        best = r
        break
      }
    }
  }
  return best
}

async function tileFidelity(name, a) {
  const z = 14
  const Z = 2 ** z
  const [mx0, my0] = lonLatToMerc(a.w, a.n)
  const [mx1, my1] = lonLatToMerc(a.e, a.s)
  const all = []
  for (let x = Math.floor(mx0 * Z); x <= Math.floor(mx1 * Z); x++) for (let y = Math.floor(my0 * Z); y <= Math.floor(my1 * Z); y++) all.push([x, y])
  const snd = []
  const cnt = []
  let used = 0
  for (const [x, y] of shuffle(all)) {
    if (used >= N_PER_REGION * 3) break
    const t = readTile(z, x, y)
    if (!t) continue
    const lon = ((x + 0.5) / Z) * 360 - 180
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / Z))) * 180) / Math.PI
    const truth = await litto3dAscSampler(lon - 0.02, lat - 0.02, lon + 0.02, lat + 0.02)
    if (!truth) continue
    let any = false
    const g = `${x},${y}`
    for (const [layer, out] of [
      ['soundg', snd],
      ['depcnt', cnt],
    ]) {
      const L = t.layers[layer]
      if (!L) continue
      for (let i = 0; i < L.length; i++) {
        const f = L.feature(i).toGeoJSON(x, y, z)
        if (!f.properties.q) continue
        const d = f.properties.d
        const pts = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates.flat()
        for (const [plon, plat] of pts) {
          const v = truth(plon, plat)
          if (!Number.isFinite(v)) continue
          const row = { g, truth: -v, pred: d, emod: NaN, dist: 0 }
          if (layer === 'depcnt') row.horiz = horizontalOffset(truth, plon, plat, d, -v)
          out.push(row)
          any = true
        }
      }
    }
    if (any) used++
  }
  const s = (rows) => {
    const groups = [...rows.reduce((m, r) => m.set(r.g, [...(m.get(r.g) || []), r.pred - r.truth]), new Map()).values()]
    const st = stats(groups.flat())
    if (st.n) st.rmse_ic95 = bootstrap(groups, (e) => stats(e).rmse)
    return st
  }
  const h = cnt.map((r) => r.horiz).filter((x) => x !== undefined)
  const fin = h.filter(Number.isFinite).sort((a, b) => a - b)
  const q = (p) => fin[Math.min(fin.length - 1, Math.floor(p * fin.length))]
  const horiz = { n: h.length, mediana_m: q(0.5), p90_m: q(0.9), p95_m: q(0.95), p99_m: q(0.99), oltre_100m_pct: (100 * (h.length - fin.length)) / h.length, entro_5m_pct: (100 * fin.filter((x) => x <= 5).length) / h.length, entro_10m_pct: (100 * fin.filter((x) => x <= 10).length) / h.length }
  console.log(`  ${name}: ${used} tasselli, ${snd.length} quote, ${cnt.length} vertici di isobate`)
  return { tasselli: used, quote: s(snd), isobate: s(cnt), isobate_spostamento_orizzontale: horiz }
}

// --------------------------------------------------------------------- lavoro

const report = { data: new Date().toISOString(), seme: Number(process.argv[3] || 42), riquadri_per_regione: N_PER_REGION, A: {}, B: {}, C: {} }
const emod = await emodnetGrid({ w: 4.75, s: 41.2, e: 10.7, n: 44.55 })
for (const [name, a] of PARTS.includes('A') ? Object.entries(REGIONS) : []) {
  console.log(`A ${name}`)
  report.A[name] = summarize(await holdoutLitto(name, a, emod))
  writeFileSync(OUT, JSON.stringify(report, null, 1))
}
for (const [name, a] of PARTS.includes('B') ? Object.entries(LIGURIA) : []) {
  console.log(`B ${name}`)
  report.B[name] = summarize(await holdoutLiguria(name, a, emod))
  writeFileSync(OUT, JSON.stringify(report, null, 1))
}
for (const [name, a] of PARTS.includes('C') ? Object.entries(REGIONS) : []) {
  console.log(`C ${name}`)
  report.C[name] = await tileFidelity(name, a)
  writeFileSync(OUT, JSON.stringify(report, null, 1))
}
console.log(`fatto: ${OUT}`)
