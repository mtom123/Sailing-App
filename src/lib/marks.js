import { haversine } from './geo.js'

/*
 * Mark personali sulla carta, come su Navionics: tipo, nome, note. Quelli di
 * ancoraggio tengono anche profondità, data e tipo di fondale.
 *
 * Mark: { id, type, lat, lon, name, notes, date, depth, depthSource, seabed,
 * updatedAt }. depth è il testo scritto ("9,1"), date è "aaaa-mm-gg".
 */

export const MARK_TYPES = [
  { id: 'mark', label: 'Segnaposto', glyph: '📍', color: '#FFFFFF' },
  { id: 'anchor', label: 'Ancoraggio', glyph: '⚓\uFE0F', color: '#4FC3F7' },
  { id: 'danger', label: 'Pericolo', glyph: '⚠️', color: '#FF5252' },
  { id: 'fish', label: 'Pesca', glyph: '🐟', color: '#69F0AE' },
  { id: 'dive', label: 'Immersione', glyph: '🤿', color: '#B388FF' },
  { id: 'fuel', label: 'Carburante', glyph: '⛽', color: '#FFB74D' },
  { id: 'star', label: 'Preferito', glyph: '⭐', color: '#FFD54F' },
]

export const SEABEDS = ['Sabbia', 'Fango', 'Alghe', 'Posidonia', 'Roccia', 'Ghiaia', 'Misto']

export const markType = (id) => MARK_TYPES.find((t) => t.id === id) ?? MARK_TYPES[0]

// Data di oggi sull'ora locale: toISOString è in UTC e sbaglia giorno di notte
const today = () => new Date().toLocaleDateString('sv')

export const newMark = (type, { lat, lon }) => ({ type, lat, lon, name: '', notes: '', date: today(), depth: '', depthSource: '', seabed: '' })

export const validDepth = (text) => text === '' || /^\d+([.,]\d+)?$/.test(text.trim())

export const fmtMarkDate = (date) => (date ? new Date(`${date}T12:00`).toLocaleDateString('it-IT') : '')

/** Riga di dettaglio di un ancoraggio: "9,1 m · Sabbia · 05/11/2026". */
export function markDetail(mark) {
  if (mark.type !== 'anchor') return mark.notes
  return [mark.depth && `${mark.depth} m`, mark.seabed, fmtMarkDate(mark.date)].filter(Boolean).join(' · ')
}

/** Mark filtrati per tipo e testo, i più vicini prima (senza GPS gli ultimi modificati). */
export function searchMarks(marks, { type, text }, geo) {
  const q = text.trim().toLowerCase()
  const found = marks.filter(
    (m) => (!type || m.type === type) && (!q || `${m.name} ${m.notes} ${m.seabed}`.toLowerCase().includes(q))
  )
  if (geo.lat == null) return found.sort((a, b) => b.updatedAt - a.updatedAt)
  return found
    .map((m) => ({ ...m, distM: haversine(geo.lat, geo.lon, m.lat, m.lon) }))
    .sort((a, b) => a.distM - b.distM)
}
