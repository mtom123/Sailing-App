import { bearing, haversine } from './geo.js'

/*
 * Regata: percorso (partenza e boe in ordine), VMG verso il prossimo punto e
 * lettura delle coordinate scritte a mano.
 */

const ROUNDED_M = 80 // a questa distanza il punto è passato: si punta al successivo

export const EMPTY_COURSE = { start: null, marks: [], next: 0 }

/** Punti in ordine di percorso: [{ lat, lon, label, short, kind }]. */
export function coursePoints(course) {
  const marks = course.marks.map((m, i) => ({ ...m, label: `Boa ${i + 1}`, short: String(i + 1), kind: 'mark' }))
  return course.start ? [{ ...course.start, label: 'Partenza', short: 'P', kind: 'start' }, ...marks] : marks
}

/** Il punto verso cui si naviga adesso, o null a percorso vuoto. */
export function courseTarget(course) {
  return coursePoints(course)[course.next] ?? null
}

/** Dove porta un tocco sulla carta: picking è 'start', 'mark' o { move: indice }. */
export function pickOnCourse(course, picking, p) {
  if (picking === 'start') return setCourseStart(course, p)
  if (picking === 'mark') return addCourseMark(course, p)
  return moveCoursePoint(course, picking.move, p)
}

export const addCourseMark = (course, p) => ({ ...course, marks: [...course.marks, p] })

// Una partenza nuova fa ricominciare il percorso
export const setCourseStart = (course, p) => ({ ...course, start: p, next: 0 })

export function moveCoursePoint(course, index, p) {
  if (course.start && index === 0) return { ...course, start: p }
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

/** Punto passato → si punta al successivo. L'ultimo resta il traguardo. */
export function advanceCourse(course, geo) {
  const points = coursePoints(course)
  let { next } = course
  while (next < points.length - 1 && haversine(geo.lat, geo.lon, points[next].lat, points[next].lon) < ROUNDED_M) next += 1
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
