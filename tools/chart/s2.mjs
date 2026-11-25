#!/usr/bin/env node
/**
 * Sentinel-2 L2A (AWS Open Data, catalogo Element84 earth-search): ritaglia le bande
 * di un riquadro lon/lat leggendo solo i tasselli necessari dei COG (HTTP Range).
 *
 *   node tools/chart/s2.mjs fetch <w,s,e,n> <scena> [<scena>…]
 *   node tools/chart/s2.mjs search <w,s,e,n> <da> <a> [nuvole%]
 *
 * Uscita: tools/.cache/s2/<scena>/<banda>.u16 (uint16 little-endian, riga per riga)
 * più meta.json con { epsg, x0, y0, res, w, h } per banda (UTM, angolo in alto a sinistra).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import proj4 from 'proj4'

const STAC = 'https://earth-search.aws.element84.com/v1'
const OUT = process.env.S2_DIR || 'tools/.cache/s2'
export const BANDS = { blue: 'B02', green: 'B03', red: 'B04', nir: 'B08', scl: 'SCL' }

// il server dà ~60 KB/s per connessione: i tratti lunghi si chiedono a pezzi in parallelo
const PIECE = 256 * 1024
async function range(url, a, b) {
  if (b - a + 1 > PIECE) {
    const parts = []
    for (let p = a; p <= b; p += PIECE) parts.push(range1(url, p, Math.min(b, p + PIECE - 1)))
    return Buffer.concat(await Promise.all(parts))
  }
  return range1(url, a, b)
}
// al massimo MAXC richieste aperte insieme
const MAXC = 24
let open = 0
const queue = []
async function slot(fn) {
  if (open >= MAXC) await new Promise((ok) => queue.push(ok))
  open++
  try {
    return await fn()
  } finally {
    open--
    queue.shift()?.()
  }
}
const range1 = (url, a, b) => slot(() => range1x(url, a, b))
async function range1x(url, a, b) {
  for (let t = 0; ; t++) {
    try {
      const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } })
      if (r.status !== 206) throw new Error(`HTTP ${r.status}`)
      return Buffer.from(await r.arrayBuffer())
    } catch (e) {
      if (t >= 8) throw e
      await new Promise((ok) => setTimeout(ok, 1000 * (t + 1)))
    }
  }
}

/** intestazione TIFF (solo la prima immagine, piena risoluzione) */
async function cogHeader(url) {
  let b = await range(url, 0, 65535)
  if (b.toString('latin1', 0, 2) !== 'II' || b.readUInt16LE(2) !== 42) throw new Error('atteso TIFF little-endian classico')
  const ifd = b.readUInt32LE(4)
  const n = b.readUInt16LE(ifd)
  const size = { 3: 2, 4: 4, 12: 8, 2: 1 }
  const tags = {}
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12
    const tag = b.readUInt16LE(e)
    const type = b.readUInt16LE(e + 2)
    const cnt = b.readUInt32LE(e + 4)
    const bytes = size[type] * cnt
    const off = bytes <= 4 ? e + 8 : b.readUInt32LE(e + 8)
    if (off + bytes > b.length) b = Buffer.concat([b, await range(url, b.length, off + bytes + 1024)])
    const v = []
    for (let k = 0; k < cnt; k++) {
      if (type === 3) v.push(b.readUInt16LE(off + 2 * k))
      else if (type === 4) v.push(b.readUInt32LE(off + 4 * k))
      else if (type === 12) v.push(b.readDoubleLE(off + 8 * k))
    }
    tags[tag] = type === 2 ? b.toString('latin1', off, off + cnt) : v
  }
  const t = (k) => tags[k]?.[0]
  if (t(259) !== 8 || ![8, 16].includes(t(258))) throw new Error(`compressione ${t(259)} / bit ${t(258)} non gestiti`)
  return {
    width: t(256),
    height: t(257),
    tw: t(322),
    th: t(323),
    offsets: tags[324],
    counts: tags[325],
    predictor: t(317) || 1,
    bits: t(258),
    res: tags[33550][0],
    x0: tags[33922][3],
    y0: tags[33922][4],
    epsg: tags[34735][tags[34735].indexOf(3072) + 3],
  }
}

/** finestra di pixel [c0, r0, c1, r1) → Uint16Array */
async function cogWindow(url, h, c0, r0, c1, r1) {
  const out = new Uint16Array((c1 - c0) * (r1 - r0))
  const tx0 = Math.floor(c0 / h.tw)
  const tx1 = Math.floor((c1 - 1) / h.tw)
  const ty0 = Math.floor(r0 / h.th)
  const ty1 = Math.floor((r1 - 1) / h.th)
  const across = Math.ceil(h.width / h.tw)
  const jobs = []
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty])
  await Promise.all(
    jobs.map(async ([tx, ty]) => {
      const i = ty * across + tx
      if (!h.counts[i]) return
      const raw = inflateSync(await range(url, h.offsets[i], h.offsets[i] + h.counts[i] - 1))
      const px = h.bits === 16 ? new Uint16Array(raw.buffer, raw.byteOffset, h.tw * h.th) : new Uint8Array(raw.buffer, raw.byteOffset, h.tw * h.th)
      const mask = h.bits === 16 ? 0xffff : 0xff
      if (h.predictor === 2) for (let y = 0; y < h.th; y++) for (let x = 1; x < h.tw; x++) px[y * h.tw + x] = (px[y * h.tw + x] + px[y * h.tw + x - 1]) & mask
      for (let y = 0; y < h.th; y++) {
        const r = ty * h.th + y
        if (r < r0 || r >= r1) continue
        for (let x = 0; x < h.tw; x++) {
          const c = tx * h.tw + x
          if (c < c0 || c >= c1) continue
          out[(r - r0) * (c1 - c0) + (c - c0)] = px[y * h.tw + x]
        }
      }
    }),
  )
  return out
}

async function item(id) {
  const r = await fetch(`${STAC}/collections/sentinel-2-l2a/items/${id}`)
  if (!r.ok) throw new Error(`STAC ${id}: ${r.status}`)
  return r.json()
}

export async function fetchScene(id, [w, s, e, n]) {
  const it = await item(id)
  const dir = join(OUT, id)
  mkdirSync(dir, { recursive: true })
  const meta = { id, datetime: it.properties.datetime, sun_elevation: it.properties['view:sun_elevation'], bands: {} }
  let bytes = 0
  await Promise.all(Object.entries(BANDS).map(async ([name, code]) => {
    const url = it.assets[name].href
    const h = await cogHeader(url)
    const p = proj4('WGS84', `+proj=utm +zone=${h.epsg - 32600} +datum=WGS84 +units=m +no_defs`)
    const xs = []
    const ys = []
    for (const [lon, lat] of [[w, s], [w, n], [e, s], [e, n]]) {
      const [x, y] = p.forward([lon, lat])
      xs.push(x)
      ys.push(y)
    }
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - h.x0) / h.res))
    const c1 = Math.min(h.width, Math.ceil((Math.max(...xs) - h.x0) / h.res))
    const r0 = Math.max(0, Math.floor((h.y0 - Math.max(...ys)) / h.res))
    const r1 = Math.min(h.height, Math.ceil((h.y0 - Math.min(...ys)) / h.res))
    const a = await cogWindow(url, h, c0, r0, c1, r1)
    writeFileSync(join(dir, `${code}.u16`), Buffer.from(a.buffer))
    bytes += a.byteLength
    meta.bands[code] = { epsg: h.epsg, res: h.res, x0: h.x0 + c0 * h.res, y0: h.y0 - r0 * h.res, w: c1 - c0, h: r1 - r0 }
  }))
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 1))
  return bytes
}

export async function search(bbox, from, to, cloud = 2) {
  const [w, s, e, n] = bbox
  const r = await fetch(`${STAC}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: ['sentinel-2-l2a'],
      intersects: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      datetime: `${from}T00:00:00Z/${to}T23:59:59Z`,
      query: { 'eo:cloud_cover': { lt: cloud } },
      limit: 100,
    }),
  })
  return (await r.json()).features.map((f) => ({ id: f.id, date: f.properties.datetime.slice(0, 10), cloud: f.properties['eo:cloud_cover'], tile: f.properties['s2:mgrs_tile'], sun: f.properties['view:sun_elevation'] }))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, bb, ...rest] = process.argv.slice(2)
  const bbox = bb.split(',').map(Number)
  if (cmd === 'search') console.log(JSON.stringify(await search(bbox, rest[0], rest[1], Number(rest[2] || 2)), null, 1))
  else if (cmd === 'fetch') {
    let tot = 0
    await Promise.all(
      rest.map(async (id) => {
        if (existsSync(join(OUT, id, 'meta.json'))) return console.log(`${id}: già scaricata`)
        const b = await fetchScene(id, bbox).catch((e) => (console.log(`${id}: ERRORE ${e.cause?.code || e.message}`), 0))
        tot += b
        console.log(`${id}: ${(b / 1e6).toFixed(1)} MB`)
      }),
    )
    console.log(`totale ${(tot / 1e6).toFixed(1)} MB`)
  }
}
