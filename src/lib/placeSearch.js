import { ANCHORAGES } from '../data/anchorages.js'

/*
 * Ricerca della lente sulla carta: coordinate scritte a mano (gradi decimali,
 * gradi e primi come sui plotter, gradi primi secondi), i miei marker e gli
 * ancoraggi dell'app senza rete, e i luoghi di OpenStreetMap (Nominatim) con
 * la rete, solo quando si preme Cerca (regole d'uso del servizio).
 */

const num = (t) => Number(t)

/**
 * Coordinate dal testo, o null. Esempi: "44.1755, 8.3275", "44,1755 8,3275",
 * "44°10.528'N 8°19.650'E", "N 44 10.528 E 008 19.650", "44°10'31.7\"N 8°19'39\"E",
 * "-33.9 151.2".
 */
export function parseCoords(text) {
  let s = String(text || '').toUpperCase().trim()
  if (!s) return null
  s = s.replace(/[°º˚'’′"”″]/g, ' ')
  // Virgola decimale (all'italiana) solo se non ci sono punti
  if (!s.includes('.')) s = s.replace(/(\d),(\d)/g, '$1.$2')
  s = s.replace(/[,;/]/g, ' ')
  if (!/^[\s\d.+\-NSEWO]+$/.test(s)) return null
  const tokens = s.match(/[NSEWO]|[+-]?\d+(?:\.\d+)?/g)
  if (!tokens) return null
  const halves = [[], []]
  const hemi = [null, null]
  let part = 0
  let started = false
  for (const t of tokens) {
    if (/^[NSEWO]$/.test(t)) {
      // La lettera chiude la sua metà se viene dopo i numeri, la apre se viene
      // prima ("N 44 10.5 E 8 19.6": la E apre la seconda metà)
      if (halves[part].length && hemi[part] === null) {
        hemi[part] = t
        part = 1
      } else if (halves[part].length) {
        part = 1
        hemi[1] = t
      } else hemi[part] = t
      continue
    }
    started = true
    halves[part].push(t)
  }
  if (!started) return null
  // Senza lettere i numeri sono tutti nella prima metà: si dividono a metà
  if (!halves[1].length) {
    const all = halves[0]
    if (all.length % 2 || all.length > 6) return null
    halves[0] = all.slice(0, all.length / 2)
    halves[1] = all.slice(all.length / 2)
  }
  const value = (parts) => {
    if (!parts.length || parts.length > 3) return null
    const neg = parts[0].startsWith('-')
    const [d, m = '0', sec = '0'] = parts.map((p) => p.replace(/^[+-]/, ''))
    if (num(m) >= 60 || num(sec) >= 60 || (parts.length > 1 && !/^\d+$/.test(d))) return null
    const v = num(d) + num(m) / 60 + num(sec) / 3600
    return neg ? -v : v
  }
  let a = value(halves[0])
  let b = value(halves[1])
  if (a == null || b == null) return null
  let [ha, hb] = hemi
  // Prima la longitudine ("E 8… N 44…"): si scambiano
  if ((ha && 'EWO'.includes(ha)) || (hb && 'NS'.includes(hb))) {
    ;[a, b] = [b, a]
    ;[ha, hb] = [hb, ha]
  }
  if (ha === 'S') a = -Math.abs(a)
  if (hb === 'W' || hb === 'O') b = -Math.abs(b)
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null
  return { lat: a, lon: b }
}

const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Marker e ancoraggi dell'app il cui nome contiene il testo (senza rete) */
export function searchLocal(text, marks = []) {
  const q = norm(text).trim()
  if (q.length < 2) return []
  const out = []
  for (const m of marks) {
    if (norm(m.name).includes(q)) out.push({ lat: m.lat, lon: m.lon, name: m.name, detail: 'Il mio marker', kind: 'mark' })
  }
  for (const a of ANCHORAGES) {
    if (norm(a.name).includes(q) || norm(a.region).includes(q)) out.push({ lat: a.lat, lon: a.lon, name: a.name, detail: a.region, kind: 'anchorage' })
  }
  return out.slice(0, 8)
}

/** Luoghi OpenStreetMap (Nominatim), vicino alla vista prima */
export async function searchOnline(text, view) {
  const params = new URLSearchParams({ q: text, format: 'jsonv2', limit: '8', 'accept-language': 'it' })
  if (view) params.set('viewbox', [view.west, view.north, view.east, view.south].map((v) => v.toFixed(3)).join(','))
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!r.ok) throw new Error(`Ricerca ${r.status}`)
  const list = await r.json()
  return list.map((p) => {
    const [name, ...rest] = String(p.display_name).split(', ')
    return { lat: Number(p.lat), lon: Number(p.lon), name, detail: rest.slice(0, 3).join(', '), kind: 'place' }
  })
}
