/**
 * Baretti sulla spiaggia: bar, caffè, ristoranti, gelaterie e stabilimenti
 * di OpenStreetMap (dai tasselli z14 di OpenFreeMap, gli stessi della costa)
 * vicini all'acqua o su una spiaggia. Contatti e orari si leggono da
 * OpenStreetMap quando si apre la scheda (spesso mancano: per questo le note
 * dell'utente).
 */
import { coastFeatures } from './waterMask.js'

export const BAR_KIND = {
  bar: 'Bar',
  pub: 'Pub',
  cafe: 'Caffè',
  restaurant: 'Ristorante',
  ice_cream: 'Gelateria',
  fast_food: 'Chiosco',
  beach_resort: 'Stabilimento balneare',
  nightclub: 'Locale notturno',
}

const NEAR_WATER_M = 70 // dal bordo del mare
const NEAR_BEACH_M = 30 // dal bordo di una spiaggia
const BEACHY_NAME = /\b(bagni|bagno|lido|beach|spiaggia|chiringuito|stabilimento|playa|plage)\b/i
const BEACHY_NAME_M = 250

const M = 111320

const CUISINE = {
  regional: 'regionale',
  italian: 'italiana',
  seafood: 'pesce',
  fish: 'pesce',
  pizza: 'pizza',
  burger: 'hamburger',
  sandwich: 'panini',
  ice_cream: 'gelato',
  coffee_shop: 'caffetteria',
  mediterranean: 'mediterranea',
  ligurian: 'ligure',
  sushi: 'sushi',
  vegetarian: 'vegetariana',
}

// Distanza (m) dal punto ai lati degli anelli che passano lì vicino
function distToRings(rings, lat, lon, maxM) {
  const kx = M * Math.cos((lat * Math.PI) / 180)
  const dLat = maxM / M
  const dLon = maxM / kx
  let best = Infinity
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]
      const b = ring[i + 1]
      if (Math.max(a[0], b[0]) < lat - dLat || Math.min(a[0], b[0]) > lat + dLat) continue
      if (Math.max(a[1], b[1]) < lon - dLon || Math.min(a[1], b[1]) > lon + dLon) continue
      const ax = (a[1] - lon) * kx
      const ay = (a[0] - lat) * M
      const bx = (b[1] - lon) * kx
      const by = (b[0] - lat) * M
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1e-9)))
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return best
}

/** Baretti in `bounds` (L.LatLngBounds) con la distanza dall'acqua, o null se l'area è troppo grande */
export async function beachBarsIn(bounds) {
  const f = await coastFeatures(bounds, 16)
  if (!f) return null
  const seen = new Set()
  const out = []
  for (const b of f.bars) {
    if (seen.has(b.id)) continue // lo stesso punto arriva da più tasselli
    seen.add(b.id)
    const water = distToRings(f.sea, b.lat, b.lon, BEACHY_NAME_M)
    const beach = distToRings(f.beaches, b.lat, b.lon, NEAR_BEACH_M)
    if (water <= NEAR_WATER_M || beach <= NEAR_BEACH_M || (BEACHY_NAME.test(b.name) && water <= BEACHY_NAME_M)) {
      out.push({ ...b, waterM: Number.isFinite(water) ? Math.round(water) : null })
    }
  }
  return out
}

// id dei tasselli OpenMapTiles = id OSM × 10 + tipo (1 nodo, 2 via, 3 relazione)
export function osmRef(id) {
  const n = Number(id)
  const type = { 1: 'node', 2: 'way', 3: 'relation' }[n % 10]
  return type ? { type, id: Math.floor(n / 10) } : null
}

const details = new Map()
/** Tag OpenStreetMap del baretto (telefono, sito, orari…), o null senza rete */
export function barDetails(id) {
  const ref = osmRef(id)
  if (!ref) return Promise.resolve(null)
  const key = `${ref.type}/${ref.id}`
  if (!details.has(key)) {
    const p = fetch(`https://api.openstreetmap.org/api/0.6/${key}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.elements?.[0]?.tags ?? null)
      .catch(() => null)
    p.then((t) => t || details.delete(key))
    details.set(key, p)
  }
  return details.get(key)
}

/** Contatti e caratteristiche leggibili dai tag OSM */
export function barInfo(tags) {
  if (!tags) return null
  const first = (...keys) => keys.map((k) => tags[k]).find(Boolean)
  const web = first('website', 'contact:website', 'url')
  const insta = first('contact:instagram', 'instagram')
  const fb = first('contact:facebook', 'facebook')
  return {
    phone: first('phone', 'contact:phone', 'contact:mobile', 'mobile'),
    email: first('email', 'contact:email'),
    website: web && !/^https?:/i.test(web) ? `https://${web}` : web,
    instagram: insta ? (/^https?:/i.test(insta) ? insta : `https://instagram.com/${insta.replace(/^@/, '')}`) : null,
    facebook: fb ? (/^https?:/i.test(fb) ? fb : `https://facebook.com/${fb}`) : null,
    hours: tags.opening_hours,
    cuisine: tags.cuisine
      ?.split(';')
      .map((c) => CUISINE[c.trim()] || c.trim().replace(/_/g, ' '))
      .join(', '),
    outdoor: tags.outdoor_seating === 'yes',
    wheelchair: tags.wheelchair === 'yes',
    description: first('description:it', 'description'),
    checked: tags.check_date || tags['survey:date'],
  }
}

// Caratteristiche che solo chi ci va in barca sa: le segna l'utente
export const BAR_FLAGS = [
  { key: 'tender', label: 'Approdo tender' },
  { key: 'buoys', label: 'Gavitelli / boe' },
  { key: 'shuttle', label: 'Navetta dalla rada' },
  { key: 'book', label: 'Si prenota' },
  { key: 'food', label: 'Si mangia' },
]
