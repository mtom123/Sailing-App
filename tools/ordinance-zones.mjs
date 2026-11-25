/*
 * Divieti di ancoraggio delle ordinanze delle Capitanerie che non sono su
 * OpenStreetMap né sulle carte aperte → public/ordinance-zones.json
 *
 * Le ordinanze descrivono le zone a parole ("dalla testata del molo alla
 * punta del pennello"): qui i punti citati si agganciano alla linea di costa
 * OpenStreetMap e la zona si chiude lungo la riva. Ogni zona porta il testo,
 * la stagione e la fonte; dove l'ordinanza non dà il limite (approx) lo dice.
 *
 * Prima prova: Sestri Levante, Ordinanza di sicurezza balneare n. 53/2026 del
 * Circondario marittimo di Santa Margherita Ligure, art. 29–31. La fascia dei
 * 200 m / 100 m riservata ai bagnanti (art. 5) è già in src/data/coastRules.js.
 *
 * Uso: node tools/ordinance-zones.mjs
 * I dati OSM si scaricano una volta in tools/.cache/regole/.
 * Il file si unisce alle aree protette (src/lib/protectedAreas.js).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as turf from '@turf/turf'

const OUT = resolve('public/ordinance-zones.json')
const CACHE = resolve('tools/.cache/regole')
const UA = 'TIMONE sailing app (github.com/mtom123/Sailing-App)'
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

const SML_53_2026 = {
  label: 'Ordinanza di sicurezza balneare n. 53/2026, Circondario marittimo di Santa Margherita Ligure',
  url: 'https://cdn.levantenews.it/wp-content/uploads/2026/04/ORDINANZA-3.pdf',
}
// L'ordinanza vale per la stagione balneare; l'art. 5 la fissa dal 1° maggio al 30 settembre
const SML_SEASON = ['05-01', '09-30']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function cachedJson(name, fetcher) {
  const file = `${CACHE}/${name}`
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const data = await fetcher()
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(file, JSON.stringify(data))
  return data
}
async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = SERVERS[attempt % SERVERS.length]
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(180000),
      })
      if (r.ok) return r.json()
      console.warn(`  ${url} → ${r.status}, riprovo`)
    } catch (err) {
      console.warn(`  ${url} → ${err.message}, riprovo`)
    }
    await sleep(4000 * (attempt + 1))
  }
  throw new Error('Overpass non risponde')
}
const osmFull = (type, id) =>
  fetch(`https://api.openstreetmap.org/api/0.6/${type}/${id}/full.json`, { headers: { 'User-Agent': UA } }).then((r) => {
    if (!r.ok) throw new Error(`OSM ${type} ${id}: ${r.status}`)
    return r.json()
  })

// Linea di costa OSM più lunga del riquadro, come [lon, lat]
async function coastline(name, [s, w, n, e]) {
  const j = await cachedJson(name, () => overpass(`[out:json][timeout:120];way["natural"="coastline"](${s},${w},${n},${e});out geom;`))
  const ways = j.elements.filter((el) => el.tags?.natural === 'coastline' && el.geometry)
  ways.sort((a, b) => b.geometry.length - a.geometry.length)
  return ways[0].geometry.map((p) => [p.lon, p.lat])
}

// Vertice di costa più vicino a [lat, lon] (entro maxM metri, sennò errore)
function snap(coast, [lat, lon], maxM = 25, from = 0, to = coast.length) {
  let best = -1
  let bestD = Infinity
  for (let i = from; i < to; i++) {
    const d = turf.distance(coast[i], [lon, lat], { units: 'meters' })
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (bestD > maxM) throw new Error(`nessun punto di costa entro ${maxM} m da ${lat}, ${lon} (il più vicino a ${Math.round(bestD)} m)`)
  return best
}

// Zona chiusa da una linea in mare tra due punti di costa, lungo la riva tra i due
function bayPolygon(coast, a, b) {
  const [i, j] = a < b ? [a, b] : [b, a]
  const ring = coast.slice(i, j + 1)
  const poly = turf.polygon([[...ring, ring[0]]])
  const kinks = turf.kinks(poly).features.length
  if (kinks) throw new Error(`il contorno si incrocia (${kinks} punti)`)
  return poly
}

const round = (v) => Math.round(v * 1e6) / 1e6
// Il limite in mare della zona (la linea dell'ordinanza), come [[lat, lon], …]:
// la carta lo disegna ben visibile, il bordo lungo la riva no
const limitLine = (coast, a, b) => [coast[a], coast[b]].map(([lo, la]) => [round(la), round(lo)])
function toArea(geom, base) {
  const polys = geom.geometry.type === 'Polygon' ? [geom.geometry.coordinates] : geom.geometry.coordinates
  // la più grande se la differenza lascia schegge
  const rings = polys
    .map((p) => p.map((r) => r.map(([lo, la]) => [round(la), round(lo)])))
    .sort((p, q) => turf.area(turf.polygon(q.map((r) => r.map(([la, lo]) => [lo, la])))) - turf.area(turf.polygon(p.map((r) => r.map(([la, lo]) => [lo, la])))))[0]
  const flat = rings.flat()
  const lats = flat.map((p) => p[0])
  const lons = flat.map((p) => p[1])
  return { ...base, rings, bbox: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)] }
}
const m2 = (g) => `${Math.round(turf.area(g) / 100) / 100} ha`

const areas = []

// ------------------------------------------------------------ Sestri Levante
{
  const coast = await coastline('coast-sestri.json', [44.235, 9.36, 44.295, 9.47])

  // Art. 30 — Baia delle Favole: testata del molo foraneo → punta del pennello alla foce del Gromolo
  const moleHead = snap(coast, [44.27246, 9.38495], 10)
  const groyneTip = snap(coast, [44.27405, 9.39256], 10)
  const favole = bayPolygon(coast, groyneTip, moleHead)
  areas.push(
    toArea(favole, {
      id: 'ucm-sml/sestri-favole',
      kind: 'restricted',
      name: 'Divieto di ancoraggio – Baia delle Favole',
      note: 'Vietati gli ormeggi all’ancora e alla ruota dentro la linea tra la testata del molo foraneo del porto e la punta del pennello alla foce del torrente Gromolo.',
      limit: [limitLine(coast, moleHead, groyneTip)],
      season: SML_SEASON,
      source: { ...SML_53_2026, article: 'art. 30' },
    })
  )
  console.log(`Baia delle Favole: ${m2(favole)}`)

  // Art. 29 — Baia di Portobello o del Silenzio. L'ordinanza non dà il limite:
  // la linea dalla punta di ponente alla testata della scogliera di levante,
  // su cui sta anche la scogliera staccata dell'imboccatura
  const westPoint = snap(coast, [44.267245, 9.392309], 10)
  const eastBreakwater = snap(coast, [44.266572, 9.394987], 10)
  const silenzio = bayPolygon(coast, westPoint, eastBreakwater)
  areas.push(
    toArea(silenzio, {
      id: 'ucm-sml/sestri-silenzio',
      kind: 'restricted',
      name: 'Divieto di ancoraggio – Baia del Silenzio',
      note: 'Vietati gli ormeggi all’ancora e alla ruota nella baia di Portobello o del Silenzio.',
      approx: 'L’ordinanza non traccia il limite verso il largo: qui è la linea delle scogliere all’imboccatura.',
      limit: [limitLine(coast, westPoint, eastBreakwater)],
      season: SML_SEASON,
      source: { ...SML_53_2026, article: 'art. 29' },
    })
  )
  console.log(`Baia del Silenzio: ${m2(silenzio)}`)

  // Art. 31 — fascia da 200 a 400 m dalla riva della Baia delle Favole. La
  // spiaggia è la relazione OSM 11314896; la riva sono i vertici di costa
  // che la toccano
  const rel = await cachedJson('rel-11314896.json', () => osmFull('relation', 11314896))
  const nodes = new Map(rel.elements.filter((e) => e.type === 'node').map((e) => [e.id, [e.lon, e.lat]]))
  const beachRings = rel.elements
    .filter((e) => e.type === 'way')
    .map((w) => w.nodes.map((id) => nodes.get(id)))
    .filter((r) => r.length >= 4 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1])
  const beach = turf.featureCollection(beachRings.map((r) => turf.polygon([r])))
  const touches = (p) => beach.features.some((f) => turf.booleanPointInPolygon(p, f) || turf.pointToLineDistance(p, turf.polygonToLine(f), { units: 'meters' }) < 25)
  const shore = []
  for (let i = 0; i <= moleHead; i++) if (touches(coast[i])) shore.push(i)
  if (!shore.length) throw new Error('riva della Baia delle Favole non trovata')
  const shoreLine = turf.lineString(coast.slice(shore[0], shore.at(-1) + 1))
  // il mare a ponente di questo tratto di costa (fino al molo)
  const top = Math.max(0, shore[0] - 200)
  const seaRing = [...coast.slice(top, moleHead + 1), [9.33, coast[moleHead][1]], [9.33, coast[top][1]], coast[top]]
  const sea = turf.polygon([seaRing])
  const outer = turf.buffer(shoreLine, 400, { units: 'meters', steps: 16 })
  const inner = turf.buffer(shoreLine, 200, { units: 'meters', steps: 16 })
  let band = turf.difference(turf.featureCollection([outer, inner]))
  band = turf.intersect(turf.featureCollection([band, sea]))
  band = turf.difference(turf.featureCollection([band, favole]))
  areas.push(
    toArea(band, {
      id: 'ucm-sml/sestri-favole-fascia',
      kind: 'restricted',
      name: 'Divieto di ancoraggio e pesca – fascia 200–400 m, Baia delle Favole',
      note: 'Oltre i 200 m riservati ai bagnanti, fino a 400 m dalla costa: vietati ancoraggio e pesca, vietata la navigazione alle unità da diporto a motore oltre 6 m (salvo i corridoi di lancio). In mare la segnano gavitelli gialli o arancio.',
      approx: 'Fascia calcolata dalla riva OpenStreetMap: in mare fanno fede i gavitelli.',
      season: SML_SEASON,
      source: { ...SML_53_2026, article: 'art. 31' },
    })
  )
  console.log(`Fascia 200–400 m Baia delle Favole: ${m2(band)} (riva ${Math.round(turf.length(shoreLine, { units: 'meters' }))} m)`)
}

writeFileSync(
  OUT,
  JSON.stringify({
    source: 'Ordinanze delle Capitanerie di porto (testi citati in ogni zona). Riva da OpenStreetMap (ODbL). Fanno fede i testi ufficiali e i segnali in mare.',
    generated: new Date().toISOString().slice(0, 10),
    areas,
  })
)
console.log(`${areas.length} zone in ${OUT}`)
