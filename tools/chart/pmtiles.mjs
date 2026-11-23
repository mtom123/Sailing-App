#!/usr/bin/env node
/**
 * Impacchetta i tasselli z/x/y.pbf in un unico file PMTiles v3 (specifica
 * github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md), senza dipendenze.
 *
 *   node tools/chart/pmtiles.mjs <cartella z/x/y> <uscita.pmtiles> [w,s,e,n]
 *
 * - tasselli compressi gzip (il lettore li decomprime nel browser)
 * - ordinati per TileID di Hilbert, tasselli identici scritti una volta sola
 * - directory radice nei primi 16 KiB, foglie se serve
 * - alla fine rilegge OGNI tassello dal file e lo confronta con l'originale
 */
import { createHash } from 'node:crypto'
import { closeSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

const [, , SRC, OUT, BBOX] = process.argv
if (!SRC || !OUT) throw new Error('uso: pmtiles.mjs <cartella> <uscita.pmtiles> [w,s,e,n]')
const bbox = BBOX ? BBOX.split(',').map(Number) : null

// ------------------------------------------------------------------ Hilbert

const tzValues = [0]
for (let z = 1; z <= 26; z++) tzValues.push(tzValues[z - 1] + 4 ** (z - 1))
export function zxyToTileId(z, x, y) {
  const n = 2 ** z
  let rx
  let ry
  let d = 0
  let tx = x
  let ty = y
  for (let s = n / 2; s >= 1; s /= 2) {
    rx = (tx & s) > 0 ? 1 : 0
    ry = (ty & s) > 0 ? 1 : 0
    d += s * s * ((3 * rx) ^ ry)
    if (ry === 0) {
      if (rx === 1) {
        tx = s - 1 - tx
        ty = s - 1 - ty
      }
      ;[tx, ty] = [ty, tx]
    }
  }
  return tzValues[z] + d
}

// ------------------------------------------------------------------ varint

function writeVarint(arr, v) {
  while (v >= 0x80) {
    arr.push((v % 0x80) | 0x80)
    v = Math.floor(v / 0x80)
  }
  arr.push(v)
}
function readVarint(buf, pos) {
  let v = 0
  let mul = 1
  for (;;) {
    const b = buf[pos.p++]
    v += (b & 0x7f) * mul
    if (b < 0x80) return v
    mul *= 0x80
  }
}

function serializeDir(entries) {
  const a = []
  writeVarint(a, entries.length)
  let last = 0
  for (const e of entries) {
    writeVarint(a, e.tileId - last)
    last = e.tileId
  }
  for (const e of entries) writeVarint(a, e.runLength)
  for (const e of entries) writeVarint(a, e.length)
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    if (i > 0 && e.offset === entries[i - 1].offset + entries[i - 1].length) writeVarint(a, 0)
    else writeVarint(a, e.offset + 1)
  }
  return gzipSync(Buffer.from(a), { level: 9 })
}
function deserializeDir(buf) {
  const b = gunzipSync(buf)
  const pos = { p: 0 }
  const n = readVarint(b, pos)
  const es = []
  let last = 0
  for (let i = 0; i < n; i++) {
    last += readVarint(b, pos)
    es.push({ tileId: last })
  }
  for (const e of es) e.runLength = readVarint(b, pos)
  for (const e of es) e.length = readVarint(b, pos)
  for (let i = 0; i < n; i++) {
    const v = readVarint(b, pos)
    es[i].offset = v === 0 && i > 0 ? es[i - 1].offset + es[i - 1].length : v - 1
  }
  return es
}

// ------------------------------------------------------------------ tasselli

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z)
const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}
const tiles = []
let minZ = 99
let maxZ = 0
for (const zs of readdirSync(SRC)) {
  if (!/^\d+$/.test(zs)) continue
  const z = Number(zs)
  for (const xs of readdirSync(join(SRC, zs))) {
    const x = Number(xs)
    for (const f of readdirSync(join(SRC, zs, xs))) {
      if (!f.endsWith('.pbf')) continue
      const y = Number(f.slice(0, -4))
      if (bbox) {
        // un tassello di margine, perché le etichette sporgono
        if (x < lon2x(bbox[0], z) - 1 || x > lon2x(bbox[2], z) + 1) continue
        if (y < lat2y(bbox[3], z) - 1 || y > lat2y(bbox[1], z) + 1) continue
      }
      tiles.push({ z, x, y, id: zxyToTileId(z, x, y), file: join(SRC, zs, xs, f) })
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }
}
tiles.sort((a, b) => a.id - b.id)
console.log(`${tiles.length} tasselli, z${minZ}–${maxZ}`)

// dati: gzip, deduplicati per contenuto
const byHash = new Map()
const chunks = []
let dataLen = 0
const entries = []
for (const t of tiles) {
  const raw = readFileSync(t.file)
  const h = createHash('sha256').update(raw).digest('hex')
  let ref = byHash.get(h)
  if (!ref) {
    const gz = gzipSync(raw, { level: 9 })
    ref = { offset: dataLen, length: gz.length }
    byHash.set(h, ref)
    chunks.push(gz)
    dataLen += gz.length
  }
  const prev = entries[entries.length - 1]
  if (prev && prev.offset === ref.offset && prev.tileId + prev.runLength === t.id) prev.runLength++
  else entries.push({ tileId: t.id, offset: ref.offset, length: ref.length, runLength: 1 })
}

// directory: radice + foglie finché la radice sta nei 16 KiB
let root
let leaves = Buffer.alloc(0)
let leafSize = 4096
for (;;) {
  if (leafSize === 4096) {
    root = serializeDir(entries)
    if (root.length <= 16384 - 127) break
  }
  const rootEntries = []
  const parts = []
  let off = 0
  for (let i = 0; i < entries.length; i += leafSize) {
    const slice = entries.slice(i, i + leafSize)
    const ser = serializeDir(slice)
    rootEntries.push({ tileId: slice[0].tileId, offset: off, length: ser.length, runLength: 0 })
    parts.push(ser)
    off += ser.length
  }
  root = serializeDir(rootEntries)
  leaves = Buffer.concat(parts)
  if (root.length <= 16384 - 127) break
  leafSize *= 2
}

// metadati
const meta = JSON.parse(readFileSync(join(SRC, 'meta.json'), 'utf8'))
const metadata = gzipSync(
  Buffer.from(
    JSON.stringify({
      name: 'TIMONE carta',
      version: meta.version,
      attribution: meta.attribution,
      bands: meta.bands,
      vector_layers: [
        { id: 'depare', fields: { d: 'Number' } },
        { id: 'depcnt', fields: { d: 'Number', q: 'Number' } },
        { id: 'soundg', fields: { d: 'Number', q: 'Number' } },
        { id: 'nodata', fields: {} },
      ],
    }),
  ),
)

const b = bbox || meta.bounds
const header = Buffer.alloc(127)
header.write('PMTiles', 0, 'ascii')
header.writeUInt8(3, 7)
const rootOff = 127
const metaOff = rootOff + root.length
const leafOff = metaOff + metadata.length
const dataOff = leafOff + leaves.length
const u64 = [rootOff, root.length, metaOff, metadata.length, leafOff, leaves.length, dataOff, dataLen, tiles.length, entries.length, chunks.length]
u64.forEach((v, i) => header.writeBigUInt64LE(BigInt(v), 8 + i * 8))
header.writeUInt8(1, 96) // clustered
header.writeUInt8(2, 97) // directory gzip
header.writeUInt8(2, 98) // tasselli gzip
header.writeUInt8(1, 99) // MVT
header.writeUInt8(minZ, 100)
header.writeUInt8(maxZ, 101)
header.writeInt32LE(Math.round(b[0] * 1e7), 102)
header.writeInt32LE(Math.round(b[1] * 1e7), 106)
header.writeInt32LE(Math.round(b[2] * 1e7), 110)
header.writeInt32LE(Math.round(b[3] * 1e7), 114)
header.writeUInt8(Math.min(maxZ, 8), 118)
header.writeInt32LE(Math.round(((b[0] + b[2]) / 2) * 1e7), 119)
header.writeInt32LE(Math.round(((b[1] + b[3]) / 2) * 1e7), 123)
writeFileSync(OUT, Buffer.concat([header, root, metadata, leaves, ...chunks]))
console.log(
  `${OUT}: ${((dataOff + dataLen) / 1e6).toFixed(1)} MB, ${entries.length} voci, ${chunks.length} tasselli distinti, radice ${root.length} B, foglie ${(leaves.length / 1024).toFixed(0)} KiB`,
)

// ------------------------------------------------------------- verifica completa

const fd = openSync(OUT, 'r')
const readAt = (off, len) => {
  const buf = Buffer.alloc(len)
  readSync(fd, buf, 0, len, off)
  return buf
}
const H = readAt(0, 127)
if (H.toString('ascii', 0, 7) !== 'PMTiles' || H[7] !== 3) throw new Error('intestazione sbagliata')
const hv = (i) => Number(H.readBigUInt64LE(8 + i * 8))
const rootDir = deserializeDir(readAt(hv(0), hv(1)))
function find(dir, id) {
  let lo = 0
  let hi = dir.length - 1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (dir[m].tileId < id) lo = m + 1
    else if (dir[m].tileId > id) hi = m - 1
    else return dir[m]
  }
  if (hi >= 0) {
    const e = dir[hi]
    if (e.runLength === 0 || id - e.tileId < e.runLength) return e
  }
  return null
}
const leafCache = new Map()
let bad = 0
for (const t of tiles) {
  let e = find(rootDir, t.id)
  if (e && e.runLength === 0) {
    if (!leafCache.has(e.offset)) leafCache.set(e.offset, deserializeDir(readAt(hv(4) + e.offset, e.length)))
    e = find(leafCache.get(e.offset), t.id)
  }
  if (!e) {
    bad++
    continue
  }
  const got = gunzipSync(readAt(hv(6) + e.offset, e.length))
  if (!got.equals(readFileSync(t.file))) bad++
}
closeSync(fd)
if (bad) throw new Error(`${bad} tasselli non corrispondono!`)
console.log(`verifica: tutti i ${tiles.length} tasselli riletti e identici all'originale`)
