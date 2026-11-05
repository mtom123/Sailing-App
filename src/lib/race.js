import { bearing, haversine } from './geo.js'

/*
 * Regata: percorso (partenza e boe in ordine), VMG verso il prossimo punto e
 * lettura delle coordinate scritte a mano.
 */

const ROUNDED_M = 80 // a questa distanza il punto è passato: si punta al successivo

const TIMER_SHOWN_MS = 12 * 3600 * 1000 // dopo il via il tempo di gara resta a vista per mezza giornata

export const EMPTY_COURSE = { start: null, marks: [], next: 0, startAt: null }

/** Timer da mostrare: partenza impostata e non troppo vecchia. */
export const timerShown = (course, now = Date.now()) => !!course.startAt && now - course.startAt < TIMER_SHOWN_MS

/** Imposta o azzera il via. Con un via da aspettare si torna alla partenza, se c'è. */
export const setStartTime = (course, startAt) => ({ ...course, startAt, next: startAt && course.start ? 0 : course.next })

/** Ora "hh:mm" → istante della prossima volta che arriva (oggi o domani), null se non valida. */
export function startTimeOf(text, now = Date.now()) {
  const m = String(text).match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const d = new Date(now)
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** Conto alla rovescia "4:32" o "1:04:32"; dopo il via tempo di gara "+0:12". */
export function fmtClock(leftMs) {
  const s = Math.abs(leftMs <= 0 ? Math.floor(leftMs / 1000) : Math.ceil(leftMs / 1000))
  const pad = (n) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const text = h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`
  return leftMs <= 0 ? `+${text}` : text
}

// Partenza: un punto { lat, lon }, o una linea con l'altro estremo in end
function startPoint({ lat, lon, end }) {
  const point = { lat, lon, label: 'Partenza', short: 'P', kind: 'start' }
  if (!end) return point
  return { ...point, lat: (lat + end.lat) / 2, lon: (lon + end.lon) / 2, line: [{ lat, lon }, end], lineM: haversine(lat, lon, end.lat, end.lon) }
}

/** Punti in ordine di percorso: [{ lat, lon, label, short, kind, line?, lineM? }]. */
export function coursePoints(course) {
  const marks = course.marks.map((m, i) => ({ ...m, label: `Boa ${i + 1}`, short: String(i + 1), kind: 'mark' }))
  return course.start ? [startPoint(course.start), ...marks] : marks
}

/** Partenza segnata e non ancora passata. */
export const beforeStart = (course) => !!course.start && course.next === 0

/**
 * Da dove a dove va la rotta ideale: prima della partenza si pianifica dalla
 * partenza alle boe, senza il tratto dalla barca; poi dalla barca in avanti.
 * { from, heading, targets, departMs }, from null senza GPS, departMs l'ora
 * di partenza se c'è (vale il vento di quell'ora).
 */
export function racePlan(course, geo) {
  const points = coursePoints(course)
  if (beforeStart(course)) return { from: { lat: points[0].lat, lon: points[0].lon }, heading: null, targets: points.slice(1), departMs: course.startAt || null }
  return { from: geo.lat != null ? { lat: geo.lat, lon: geo.lon } : null, heading: geo.cog, targets: points.slice(course.next), departMs: null }
}

/** Il punto verso cui si naviga adesso, o null a percorso vuoto. */
export function courseTarget(course) {
  return coursePoints(course)[course.next] ?? null
}

/**
 * Dove porta un tocco sulla carta: { raceCourse, racePicking }, racePicking
 * false a scelta finita. picking è 'start', 'line' (poi { lineFrom } per il
 * secondo estremo), 'mark' o { move: indice }. Con 'edit' i punti si
 * trascinano e il tocco non fa niente.
 */
export function pickOnCourse(course, picking, p) {
  if (picking === 'mark') return { raceCourse: addCourseMark(course, p), racePicking: 'mark' }
  if (picking === 'line') return { raceCourse: course, racePicking: { lineFrom: p } }
  if (picking.lineFrom) return { raceCourse: setCourseStart(course, { ...picking.lineFrom, end: p }), racePicking: false }
  if (picking === 'start') return { raceCourse: setCourseStart(course, p), racePicking: false }
  return { raceCourse: moveCoursePoint(course, picking.move, p), racePicking: false }
}

export const addCourseMark = (course, p) => ({ ...course, marks: [...course.marks, p] })

// La prima partenza diventa il punto da raggiungere; cambiarla poi non tocca il percorso
export const setCourseStart = (course, p) => ({ ...course, start: p, next: course.start ? course.next : 0 })

/** Sposta un estremo (0 o 1) della linea di partenza. */
export function moveLineEnd(course, which, p) {
  const { start } = course
  return { ...course, start: which === 0 ? { ...start, ...p } : { ...start, end: p } }
}

/** Sposta un punto; la linea di partenza si sposta tutta, tenendo il centro su p. */
export function moveCoursePoint(course, index, p) {
  if (course.start && index === 0) {
    const { lat, lon, end } = course.start
    if (!end) return { ...course, start: p }
    const dLat = p.lat - (lat + end.lat) / 2
    const dLon = p.lon - (lon + end.lon) / 2
    return { ...course, start: { lat: lat + dLat, lon: lon + dLon, end: { lat: end.lat + dLat, lon: end.lon + dLon } } }
  }
  const at = index - (course.start ? 1 : 0)
  return { ...course, marks: course.marks.map((m, i) => (i === at ? p : m)) }
}

export function removeCoursePoint(course, index) {
  const next = index < course.next ? course.next - 1 : course.next
  const left = course.start && index === 0
    ? { ...course, start: null }
    : { ...course, marks: course.marks.filter((_, i) => i !== index - (course.start ? 1 : 0)) }
  return { ...left, next: Math.max(0, Math.min(next, coursePoints(left).length - 1)) }
}

// Dalla barca al punto, o al tratto più vicino della linea di partenza
function distanceTo(geo, point) {
  if (!point.line) return haversine(geo.lat, geo.lon, point.lat, point.lon)
  const [a, b] = point.line
  const k = Math.cos((geo.lat * Math.PI) / 180)
  const bx = (b.lon - a.lon) * k
  const by = b.lat - a.lat
  const t = Math.max(0, Math.min(1, ((geo.lon - a.lon) * k * bx + (geo.lat - a.lat) * by) / (bx * bx + by * by || 1)))
  return haversine(geo.lat, geo.lon, a.lat + by * t, a.lon + (b.lon - a.lon) * t)
}

/**
 * Punto passato → si punta al successivo. L'ultimo resta il traguardo.
 * Prima del via si resta sulla partenza, anche stando sulla linea.
 */
export function advanceCourse(course, geo, now = Date.now()) {
  if (beforeStart(course) && course.startAt > now) return course
  const points = coursePoints(course)
  let { next } = course
  while (next < points.length - 1 && distanceTo(geo, points[next]) < ROUNDED_M) next += 1
  return next === course.next ? course : { ...course, next }
}

/**
 * Coordinata da testo: "44.2667", "44 16.002 N", "44°16.002' N",
 * "44 16 00 N", con virgola o punto, emisfero N/S/E/O/W prima o dopo.
 * Ritorna gradi decimali, o null se non è valida.
 */
export function parseCoord(text, isLat) {
  const t = String(text || '').trim().toUpperCase().replace(/,/g, '.')
  if (!t) return null
  const hemi = t.match(/[NSEOW]/)?.[0]
  if (hemi && (isLat ? !'NS'.includes(hemi) : !'EOW'.includes(hemi))) return null
  const nums = t.match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length > 3) return null
  const [d, m = 0, s = 0] = nums.map(Number)
  if (m >= 60 || s >= 60) return null
  let v = d + m / 60 + s / 3600
  if (v > (isLat ? 90 : 180)) return null
  if (hemi === 'S' || hemi === 'O' || hemi === 'W' || t.startsWith('-')) v = -v
  return v
}

/**
 * Verso la boa: { distM, brg, vmg, etaMs }. VMG = velocità sul fondo
 * proiettata sulla direzione della boa; negativa se ci si allontana. Senza
 * rotta sul fondo (barca ferma) vmg è null. etaMs solo con VMG utile.
 */
export function raceStats(geo, mark) {
  if (!mark || geo.lat == null) return null
  const distM = haversine(geo.lat, geo.lon, mark.lat, mark.lon)
  const brg = bearing(geo.lat, geo.lon, mark.lat, mark.lon)
  const vmg = geo.sog != null && geo.cog != null ? geo.sog * Math.cos(((geo.cog - brg) * Math.PI) / 180) : null
  const etaMs = vmg != null && vmg > 0.2 ? (distM / 1852 / vmg) * 3600 * 1000 : null
  return { distM, brg, vmg, etaMs }
}
