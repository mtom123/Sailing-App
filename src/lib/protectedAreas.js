/**
 * Aree marine protette e zone vietate da OpenStreetMap, per controllare e
 * aggirare le rotte. Scaricate una volta da Overpass con
 * tools/protected-areas.mjs (il servizio pubblico è lento e a volte
 * sovraccarico) e pubblicate con l'app in public/protected-areas.json:
 * disponibili anche offline.
 *
 * - 'nogo': zone A / riserve integrali, o aree con divieto di accesso
 *   (seamark:restricted_area): la rotta non deve entrarci.
 * - 'protected': AMP e loro zone B/C, parchi e riserve marine: navigazione
 *   consentita con regole (velocità, ancoraggio): solo avvertenza.
 *
 * Dati OpenStreetMap: indicativi. Fanno fede decreti istitutivi e ordinanze
 * delle Capitanerie / Préfectures maritimes.
 */

const DATA_URL = `${import.meta.env?.BASE_URL ?? '/'}protected-areas.json`

// Aree che non regolano la navigazione da diporto (enormi, solo habitat o
// zone di adesione) e nomi che non sono aree in mare
const IGNORE =
  /pelagos|cetacei|cétacés|cetaceos|whale|natura 2000|\bzps\b|\bzsc\b|\bsic\b|zona speciale di conservazione|zona di protezione speciale|importanza comunitaria|aire d.adh[ée]sion|aire de coop[ée]ration|biosph|area contigua|ski lift/i
const NOGO_NAME = /\bzona\s*a\b|riserva integrale|réserve intégrale|zone a\b|reserva integral/i
const NOGO_RESTRICTION = /no_entry|entry_prohibited|no_navigation|restricted_entry/i
// Solo aree in mare: riserve e parchi a terra (boschi, laghi, grotte) no
const MARINE =
  /marin|\bmare\b|\bmer\b|\bsea\b|zona\s*[abc]\b|zone\s*[abc]\b|\bisol[ae]\b|\bîle|îlot|archip|arcipelago|port-cros|calanques|bouches|scandola|lavezzi|cerbicale|oasi blu/i

/** 'nogo' | 'protected' | 'military' | null */
export function classify(tags) {
  const name = tags.name || tags['seamark:name'] || ''
  const text = `${name} ${tags.protection_title || ''} ${tags.designation || ''}`
  if (IGNORE.test(text)) return null
  // Poligoni di tiro ed esercitazioni: attivi solo a date annunciate
  if (tags.military === 'danger_area' || tags['seamark:type'] === 'military_area') return 'military'
  const restriction = tags['seamark:restricted_area:restriction'] || ''
  if (tags['seamark:type'] === 'restricted_area') {
    return NOGO_RESTRICTION.test(restriction) ? 'nogo' : 'protected'
  }
  if (!MARINE.test(text)) return null
  return NOGO_NAME.test(name) ? 'nogo' : 'protected'
}

// Unisce i tratti (way) di una relazione in anelli chiusi
function assembleRings(segments) {
  const rings = []
  const open = segments.filter((s) => s.length > 1).map((s) => [...s])
  const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9
  while (open.length) {
    let ring = open.shift()
    let grown = true
    while (!same(ring[0], ring[ring.length - 1]) && grown) {
      grown = false
      for (let i = 0; i < open.length; i++) {
        const s = open[i]
        const end = ring[ring.length - 1]
        if (same(end, s[0])) ring = ring.concat(s.slice(1))
        else if (same(end, s[s.length - 1])) ring = ring.concat([...s].reverse().slice(1))
        else continue
        open.splice(i, 1)
        grown = true
        break
      }
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

/** Elemento Overpass (out geom) → { id, kind, name, rings, bbox } o null */
export function toArea(el) {
  const kind = classify(el.tags || {})
  if (!kind) return null
  let rings = []
  if (el.type === 'way' && el.geometry) rings = assembleRings([el.geometry.map((p) => [p.lat, p.lon])])
  else if (el.type === 'relation' && el.members) {
    rings = assembleRings(el.members.filter((m) => m.type === 'way' && m.geometry).map((m) => m.geometry.map((p) => [p.lat, p.lon])))
  }
  if (!rings.length) return null
  let s = 90
  let w = 180
  let n = -90
  let e = -180
  for (const ring of rings) {
    for (const [lat, lon] of ring) {
      s = Math.min(s, lat)
      n = Math.max(n, lat)
      w = Math.min(w, lon)
      e = Math.max(e, lon)
    }
  }
  const t = el.tags
  return {
    id: `${el.type}/${el.id}`,
    kind,
    name: t.name || t['seamark:name'] || { nogo: 'Zona vietata', military: 'Zona militare', protected: 'Area protetta' }[kind],
    rings,
    bbox: [s, w, n, e],
  }
}

let allPromise = null
function loadAll() {
  if (!allPromise) {
    allPromise = fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : { areas: [] }))
      .then((j) => j.areas || [])
      .catch(() => [])
  }
  return allPromise
}

/** Aree protette che toccano il riquadro [s, w, n, e] (gradi). */
export async function protectedAreas([s, w, n, e]) {
  const all = await loadAll()
  return all.filter((a) => a.bbox[0] <= n && a.bbox[2] >= s && a.bbox[1] <= e && a.bbox[3] >= w)
}

/** Punto dentro l'area (riquadro, poi anelli pari/dispari)? */
export function inArea(area, lat, lon) {
  const [s, w, n, e] = area.bbox
  return lat >= s && lat <= n && lon >= w && lon <= e && inRings(area.rings, lat, lon)
}

function inRings(rings, lat, lon) {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i]
      const [yj, xj] = ring[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/**
 * Funzione (lat, lon) → area più restrittiva che contiene il punto, o null.
 * Il nome di una zona generica ("Zona A") si completa con l'AMP che la
 * contiene ("Area naturale marina protetta Portofino · Zona A").
 */
export function areaLookup(areas) {
  const list = areas || []
  const named = (a, lat, lon) => {
    if (!/^\s*zon[ae]\s*[abc]\s*$/i.test(a.name)) return a
    const parent = list.find((p) => p !== a && p.kind === 'protected' && !/^\s*zon/i.test(p.name) && inArea(p, lat, lon))
    return parent ? { ...a, name: `${parent.name} · ${a.name}` } : a
  }
  return (lat, lon) => {
    let found = null
    for (const a of list) {
      if (!inArea(a, lat, lon)) continue
      if (a.kind === 'nogo') return named(a, lat, lon)
      // Tra le aree regolamentate, la zona (più specifica) prima del parco
      if (!found || /^\s*zon/i.test(a.name)) found = a
    }
    return found ? named(found, lat, lon) : null
  }
}
