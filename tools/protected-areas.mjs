/*
 * Aree marine protette e zone vietate da OpenStreetMap → public/protected-areas.json
 *
 * Interroga Overpass sul tratto di Mediterraneo indicato, tiene solo le
 * aree utili per la navigazione (classify in src/lib/protectedAreas.js:
 * zone A vietate, AMP e zone B/C regolamentate, zone militari),
 * semplifica i contorni (~3 m) e scrive un file che l'app usa anche offline.
 *
 * Uso:
 *   npm run protected-areas                        # Provenza, Corsica, Italia
 *   npm run protected-areas -- 35.4 5.0 45.8 18.6  # sud ovest nord est
 *
 * Dati © OpenStreetMap contributors (ODbL). Indicativi: fanno fede decreti
 * e ordinanze.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { classify, toArea } from '../src/lib/protectedAreas.js'

const OUT = resolve('public/protected-areas.json')
// I server pubblici a volte sono pieni (502) o lentissimi: si prova il successivo
const SERVERS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const UA = 'TIMONE sailing app (github.com/mtom123/Sailing-App)'
const STEP = 4 // gradi
const TOLERANCE = 0.00003 // gradi, ~3 m

const [S, W, N, E] = process.argv.slice(2).map(Number).length === 4 ? process.argv.slice(2).map(Number) : [35.4, 5.0, 45.8, 18.6]

// Due fasi: prima solo i tag di tutte le aree (leggero), poi la geometria
// delle sole aree che servono (classify): così non si scaricano i grandi
// parchi a terra
const FILTERS = [
  'nwr["boundary"="protected_area"]',
  'nwr["leisure"="nature_reserve"]',
  'nwr["seamark:type"~"restricted_area|military_area"]',
  'nwr["military"="danger_area"]',
]
const tagsQuery = (b) => `[out:json][timeout:300];(${FILTERS.map((f) => `${f}(${b});`).join('')});out tags;`
const geomQuery = (type, ids) => `[out:json][timeout:300];${type}(id:${ids.join(',')});out geom;`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function overpass(query, what) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = SERVERS[attempt % SERVERS.length]
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(400000), // a volte la connessione resta appesa
      })
      if (r.ok) return (await r.json()).elements
      console.warn(`  ${url} → ${r.status}, riprovo`)
    } catch (err) {
      console.warn(`  ${url} → ${err.message}, riprovo`)
    }
    await sleep(5000 * (attempt + 1))
  }
  throw new Error(`${what}: non scaricato`)
}

// Douglas-Peucker in gradi (sulle distanze piccole basta)
function simplify(points) {
  if (points.length < 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ay, ax] = points[a]
    const [by, bx] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-18
    let max = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [py, px] = points[i]
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py)
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > TOLERANCE) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

const round = (v) => Math.round(v * 1e5) / 1e5

// 1. Tag, a riquadri di 4° (il servizio pubblico regge meglio richieste piccole)
const wanted = new Map() // "type/id" -> tag
for (let lat = S; lat < N; lat += STEP) {
  for (let lon = W; lon < E; lon += STEP) {
    const b = `${lat.toFixed(2)},${lon.toFixed(2)},${Math.min(N, lat + STEP).toFixed(2)},${Math.min(E, lon + STEP).toFixed(2)}`
    process.stdout.write(`tag ${b} … `)
    const elements = await overpass(tagsQuery(b), `tag ${b}`)
    let kept = 0
    for (const el of elements) {
      if (el.type === 'node' || !classify(el.tags || {})) continue
      const id = `${el.type}/${el.id}`
      if (!wanted.has(id)) kept++
      wanted.set(id, el.tags)
    }
    console.log(`${elements.length} aree, ${kept} utili`)
  }
}

// 2. Geometria delle aree utili, a gruppi
const areas = new Map()
const BATCH = 40
for (const type of ['way', 'relation']) {
  const ids = [...wanted.keys()].filter((k) => k.startsWith(`${type}/`)).map((k) => k.split('/')[1])
  for (let i = 0; i < ids.length; i += BATCH) {
    process.stdout.write(`geometria ${type} ${i + 1}-${Math.min(ids.length, i + BATCH)}/${ids.length} … `)
    const elements = await overpass(geomQuery(type, ids.slice(i, i + BATCH)), `${type} ${i}`)
    let added = 0
    for (const el of elements) {
      const area = toArea(el)
      if (!area) continue
      area.rings = area.rings.map((r) => simplify(r).map(([la, lo]) => [round(la), round(lo)])).filter((r) => r.length >= 4)
      area.bbox = area.bbox.map(round)
      if (area.rings.length) {
        areas.set(area.id, area)
        added++
      }
    }
    console.log(`${added} aree`)
    await sleep(1000)
  }
}

const list = [...areas.values()]
writeFileSync(
  OUT,
  JSON.stringify({
    source: '© OpenStreetMap contributors (ODbL). Indicativo: fanno fede decreti e ordinanze.',
    generated: new Date().toISOString().slice(0, 10),
    bbox: [S, W, N, E],
    areas: list,
  })
)
const count = (k) => list.filter((a) => a.kind === k).length
console.log(`${list.length} aree (${count('nogo')} vietate, ${count('military')} militari) in ${OUT}`)
