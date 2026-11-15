import L from 'leaflet'
import { ANCHORAGES } from '../data/anchorages.js'
import { coastFeatures } from './waterMask.js'

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

// Metri locali attorno a (lat0, lon0)
const M = 111320
const toXY = (lat0, lon0) => ([lat, lon]) => [(lon - lon0) * M * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * M]

// Dentro l'acqua? Regola nonzero sugli anelli insieme (come li disegna la carta)
function inWater(rings, xy, p) {
  let wn = 0
  const [px, py] = p
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = xy(ring[i])
      const [bx, by] = xy(ring[i + 1])
      const side = (bx - ax) * (py - ay) - (px - ax) * (by - ay)
      if (ay <= py) {
        if (by > py && side > 0) wn++
      } else if (by <= py && side < 0) wn--
    }
  }
  return wn !== 0
}

/**
 * Un paese o un capo cercato cade a terra (Gaeta: in centro città). Si porta
 * il punto in mare: il porto più vicino entro 2 km se c'è, poi il punto di
 * mare più vicino (costa OpenStreetMap), 40 m oltre la riva. Senza rete o
 * senza costa vicina resta dov'è.
 */
export async function seaPoint(lat, lon) {
  const d = 0.02
  const f = await coastFeatures(L.latLngBounds([lat - d, lon - d * 1.3], [lat + d, lon + d * 1.3])).catch(() => null)
  if (!f?.sea?.length) return null
  const xy = toXY(lat, lon)
  const rings = f.sea
  let start = [0, 0]
  let via = 'costa'
  let best = Infinity
  for (const h of f.harbors) {
    const [x, y] = xy(h)
    const dist = Math.hypot(x, y)
    if (dist < 2000 && dist < best) {
      best = dist
      start = [x, y]
      via = 'porto'
    }
  }
  const back = ([x, y]) => [lat + y / M, lon + x / (M * Math.cos((lat * Math.PI) / 180))]
  if (inWater(rings, xy, start)) return via === 'porto' ? { ...toLL(back(start)), via } : null
  // Punto della riva più vicino
  let near = null
  let nd = Infinity
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [ax, ay] = xy(ring[i])
      const [bx, by] = xy(ring[i + 1])
      const dx = bx - ax
      const dy = by - ay
      const len2 = dx * dx + dy * dy || 1e-9
      const t = Math.max(0, Math.min(1, ((start[0] - ax) * dx + (start[1] - ay) * dy) / len2))
      const qx = ax + t * dx
      const qy = ay + t * dy
      const dd = Math.hypot(qx - start[0], qy - start[1])
      if (dd < nd) {
        nd = dd
        near = [qx, qy]
      }
    }
  }
  if (!near || nd > 5000) return null
  // 40 m oltre la riva, nella direzione da terra verso il mare
  const ux = (near[0] - start[0]) / (nd || 1)
  const uy = (near[1] - start[1]) / (nd || 1)
  for (const step of [40, 80, 15, 150]) {
    const p = [near[0] + ux * step, near[1] + uy * step]
    if (inWater(rings, xy, p)) return { ...toLL(back(p)), via }
  }
  return { ...toLL(back(near)), via }
}
const toLL = ([lat, lon]) => ({ lat, lon })

// Gradi [primi [secondi]] → gradi decimali, o null
function dms(parts) {
  if (!parts.length || parts.length > 3) return null
  const [d, m = '0', sec = '0'] = parts
  if (Number(m) >= 60 || Number(sec) >= 60 || (parts.length > 1 && !/^\d+$/.test(d))) return null
  return Number(d) + Number(m) / 60 + Number(sec) / 3600
}

/**
 * Zona da un avviso ai naviganti o da un'ordinanza: tre o più punti, con le
 * lettere N/E (prima o dopo i numeri) o separati da punto e virgola.
 * Le parole prima del primo numero diventano il nome.
 * Esempio: "Esercitazione 41°10,0'N 013°30,0'E 41°12'N 13°35'E 41°08'N 13°36'E"
 * → { name: 'Esercitazione', points: [[lat, lon], …] }, o null.
 */
export function parseZone(text) {
  const raw = String(text || '')
  const name = raw
    .split(/[\d°]/)[0]
    .replace(/[^\p{L}\s'’-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^(n|s|e|w|o|p|pt|punto|punti|lat|long|lon|latitudine|longitudine|dal|da|tra)$/i.test(w))
    .join(' ')
  let s = raw.toUpperCase().replace(/[°º˚'’′"”″]/g, ' ')
  if (!s.includes('.')) s = s.replace(/(\d),(\d)/g, '$1.$2')
  // Etichette dei vertici ("1)", "punto 2", "P3") e parole: restano numeri e lettere N S E W O isolate
  s = s.replace(/\b\d{1,2}\)/g, ' ').replace(/\b(PUNTO|PUNTI|PT|P)\.?\s*\d{1,2}\b(?!\.)(?!\s+\d+\s+[NSEWO]\b)/g, ' ')
  s = s.replace(/[A-Z]+/g, (w) => (/^[NSEWO]$/.test(w) ? ` ${w} ` : ' '))

  let points = null
  const tokens = s.match(/[NSEWO]|\d+(?:\.\d+)?/g) || []
  if (tokens.some((t) => /[NSEWO]/.test(t))) {
    // Gruppi di numeri con la loro lettera
    const groups = []
    const before = /[NSEWO]/.test(tokens[0])
    let cur = before ? null : []
    for (const t of tokens) {
      const letter = /[NSEWO]/.test(t)
      if (before) {
        if (letter) {
          if (cur?.nums.length) groups.push(cur)
          cur = { h: t, nums: [] }
        } else cur?.nums.push(t)
      } else if (letter) {
        if (cur.length) groups.push({ h: t, nums: cur })
        cur = []
      } else cur.push(t)
    }
    if (before && cur?.nums.length) groups.push(cur)
    if (groups.length >= 6 && groups.length % 2 === 0) {
      points = []
      for (let i = 0; i < groups.length; i += 2) {
        let [a, b] = [groups[i], groups[i + 1]]
        if ('EWO'.includes(a.h)) [a, b] = [b, a]
        if (!'NS'.includes(a.h) || !'EWO'.includes(b.h)) return null
        let lat = dms(a.nums)
        let lon = dms(b.nums)
        if (lat == null || lon == null) return null
        if (a.h === 'S') lat = -lat
        if (b.h !== 'E') lon = -lon
        points.push([lat, lon])
      }
    }
  } else {
    // Senza lettere: un punto per pezzo, separati da punto e virgola o a capo
    const chunks = raw.split(/[;\n]/).map((c) => c.trim()).filter((c) => /\d/.test(c))
    if (chunks.length >= 3) {
      points = chunks.map((c) => parseCoords(c.replace(/^[^\d+-]*/, '')))
      if (points.some((p) => !p)) return null
      points = points.map((p) => [p.lat, p.lon])
    }
  }
  if (!points || points.length < 3) return null
  if (points.some(([la, lo]) => Math.abs(la) > 90 || Math.abs(lo) > 180)) return null
  // Il primo punto ripetuto in fondo per chiudere la zona
  const [f, l] = [points[0], points[points.length - 1]]
  if (points.length > 3 && f[0] === l[0] && f[1] === l[1]) points = points.slice(0, -1)
  return { name, points }
}
