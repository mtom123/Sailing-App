/*
 * Isobate di dettaglio delle Baleari (Ibiza, Formentera, Menorca) dalla
 * Ecocartografía del litoral del MITECO (2008): isobate ogni metro da -1 m
 * fino a -70/-110 m, in KML dentro gli zip pubblicati dal Ministero.
 *
 * Uso:  npm run baleari -- <cartella con i .kml>
 * (i doc.kml estratti dai .kmz degli zip MITECO, uno per isola; il nome
 * dello zip di Menorca ha una lettera accentata: meglio estrarlo con
 * zipfile di Python. Fuori dal progetto: i dati grezzi non si pubblicano)
 *
 * Legge ogni doc.kml (Placemark con ELEVATION negativa e LineString lon,lat),
 * semplifica le linee (Douglas-Peucker in metri: ~2 m sotto costa, di più
 * sui fondali profondi), le divide nei blocchi di 0,05° usati anche per la
 * Liguria (nome "i,j" con i = floor(lon/0,05), j = floor(lat/0,05); una linea
 * che attraversa più blocchi si spezza, e il segmento di confine va in
 * entrambi) e scrive in public/isobaths-baleari/:
 *   index.json   { source, cells: { "i,j": [s, w, n, e] } }
 *   i_j.json     { lines: [[depth, lat0, lon0, dlat1, dlon1, ...]],
 *                  cov:   [[lat0, lon0, dlat1, dlon1, ...]] }  (1e-5 gradi)
 * come i tasselli Shom (tools/litto3d-isobaths.mjs). `cov` è l'inviluppo
 * delle isobate del blocco: lì le isobate e le fasce EMODnet si nascondono.
 *
 * Fonte: © MITECO – Ecocartografía del litoral (2008), riuso dei dati
 * pubblici del Governo spagnolo. Non per la navigazione.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const CELL = 0.05
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../public/isobaths-baleari')
// Tolleranza della semplificazione (metri) secondo la profondità: sotto costa
// conta ogni dettaglio, al largo le linee servono solo a dare l'andamento
const tolerance = (depth) => (depth <= 20 ? 2 : depth <= 40 ? 4 : 8)
// Oltre i 50 m solo un'isobata ogni 5 m: per l'ancoraggio non serve di più
const keepDepth = (depth) => depth <= 50 || depth % 5 === 0

const dir = process.argv[2]
if (!dir) {
  console.error('Uso: node tools/baleari-isobaths.mjs <cartella con i .kml>')
  process.exit(1)
}

function kmlTexts() {
  const out = []
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f)
    if (/\.kml$/i.test(f)) out.push([f, fs.readFileSync(p, 'utf8')])
  }
  return out
}

const M_LAT = 110574
function simplify(points, tolM) {
  // points [lon, lat]; distanze in metri locali
  if (points.length < 3) return points
  const k = Math.cos((points[0][1] * Math.PI) / 180) * 111320
  const xy = points.map(([lon, lat]) => [lon * k, lat * M_LAT])
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = xy[a]
    const [bx, by] = xy[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-12
    let max = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py)
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > tolM) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

function hull(points) {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
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

// [lon, lat][] → [lat0, lon0, dlat, dlon, ...] in 1e-5 gradi, punti doppi tolti
function encode(points, head = []) {
  const out = [...head]
  let plat = 0
  let plon = 0
  let n = 0
  for (const [lon, lat] of points) {
    const ilat = Math.round(lat * 1e5)
    const ilon = Math.round(lon * 1e5)
    if (n && ilat === plat && ilon === plon) continue
    out.push(ilat - plat, ilon - plon)
    plat = ilat
    plon = ilon
    n++
  }
  return n >= 2 ? out : null
}

const cellOf = ([lon, lat]) => `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`

const cells = new Map() // "i,j" -> { lines: [], pts: [] }
const cellData = (name) => {
  if (!cells.has(name)) cells.set(name, { lines: [], pts: [] })
  return cells.get(name)
}

// Spezza la linea per blocchi: il segmento che passa il confine va in entrambi
function addLine(depth, points) {
  let start = 0
  let cur = cellOf(points[0])
  const push = (from, to, name) => {
    const piece = points.slice(from, to + 1)
    if (piece.length < 2) return
    const enc = encode(piece, [depth])
    if (!enc) return
    const c = cellData(name)
    c.lines.push(enc)
    for (let k = 0; k < piece.length; k += 3) c.pts.push(piece[k])
    c.pts.push(piece[piece.length - 1])
  }
  for (let k = 1; k < points.length; k++) {
    const name = cellOf(points[k])
    if (name === cur) continue
    push(start, k, cur) // fino al primo punto nel blocco nuovo
    start = k - 1 // il blocco nuovo riparte dall'ultimo punto del vecchio
    cur = name
  }
  push(start, points.length - 1, cur)
}

const stats = { placemarks: 0, lines: 0, ptsIn: 0, ptsOut: 0, skipped: 0 }
const levels = new Set()
const RE = /<Placemark[\s\S]*?<\/Placemark>/g
for (const [file, text] of kmlTexts()) {
  let count = 0
  for (const m of text.matchAll(RE)) {
    const pm = m[0]
    const elev = /ELEVATION:<\/td>\s*<td>\s*(-?[\d.]+)/.exec(pm)
    if (!elev) continue
    const depth = Math.round(-Number(elev[1]))
    stats.placemarks++
    count++
    if (!(depth > 0) || !keepDepth(depth)) {
      stats.skipped++
      continue
    }
    levels.add(depth)
    for (const c of pm.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)) {
      const pts = c[1]
        .trim()
        .split(/\s+/)
        .map((t) => t.split(',').map(Number))
        .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
        .map(([lon, lat]) => [lon, lat])
      if (pts.length < 2) continue
      stats.ptsIn += pts.length
      const simple = simplify(pts, tolerance(depth))
      stats.ptsOut += simple.length
      stats.lines++
      addLine(depth, simple)
    }
  }
  console.log(`${file}: ${count} isobate`)
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const index = {
  source: '© MITECO – Ecocartografía del litoral (2008). Profondità in metri. Non per la navigazione.',
  levels: [...levels].sort((a, b) => a - b),
  cells: {},
}
let bytes = 0
for (const [name, c] of [...cells.entries()].sort()) {
  const [i, j] = name.split(',').map(Number)
  // Inviluppo tagliato al blocco (i segmenti di confine escono di poco)
  const clamp = ([lon, lat]) => [
    Math.min((i + 1) * CELL, Math.max(i * CELL, lon)),
    Math.min((j + 1) * CELL, Math.max(j * CELL, lat)),
  ]
  const ring = c.pts.length >= 3 ? encode(hull(c.pts).map(clamp)) : null
  const cov = ring && ring.length >= 6 ? [ring] : []
  // Prima le isobate basse: nel disegno restano sopra quelle profonde
  c.lines.sort((a, b) => a[0] - b[0])
  const json = JSON.stringify({ lines: c.lines, cov })
  fs.writeFileSync(path.join(OUT, `${i}_${j}.json`), json)
  bytes += json.length
  index.cells[name] = [j * CELL, i * CELL, (j + 1) * CELL, (i + 1) * CELL].map((v) => Math.round(v * 1e5) / 1e5)
}
const indexJson = JSON.stringify(index)
fs.writeFileSync(path.join(OUT, 'index.json'), indexJson)
bytes += indexJson.length

let gz = 0
try {
  gz = Number(execFileSync('sh', ['-c', `cat "${OUT}"/*.json | gzip -9 | wc -c`]).toString().trim())
} catch {
  // senza gzip si riporta solo il peso pieno
}
console.log(
  `${stats.placemarks} isobate lette (${stats.skipped} saltate), ${stats.lines} linee, ` +
    `${stats.ptsIn} → ${stats.ptsOut} punti; ${cells.size} blocchi, ` +
    `${(bytes / 1e6).toFixed(2)} MB${gz ? ` (${(gz / 1e6).toFixed(2)} MB compressi)` : ''}`,
)
