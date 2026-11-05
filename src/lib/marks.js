import { haversine } from './geo.js'
import { SPECIES, isSighting } from './sightings.js'

/*
 * Mark personali sulla carta, come su Navionics: tipo, nome, note. Quelli di
 * ancoraggio tengono anche profondità, data e tipo di fondale. Gli avvistamenti
 * (sightings.js) sono mark con la specie come tipo, più quanti e l'ora.
 *
 * Mark: { id, type, lat, lon, name, notes, date, depth, depthSource, seabed,
 * count, time, updatedAt }. depth è il testo scritto ("9,1"), date è
 * "aaaa-mm-gg", time "hh:mm".
 */

export const MARK_TYPES = [
  { id: 'mark', label: 'Spilla', color: '#1E88FF' },
  { id: 'dot', label: 'Punto', color: '#1E88FF' },
  { id: 'anchor', label: 'Ancoraggio', color: '#F5A623' },
  { id: 'mob', label: 'Uomo a mare', color: '#F01426' },
  { id: 'fish', label: 'Pesce A', color: '#2EBD2E' },
  { id: 'fishB', label: 'Pesce B', color: '#FF8A00' },
  { id: 'fishC', label: 'Pesce C', color: '#3B5BDB' },
  { id: 'fishD', label: 'Pesce D', color: '#9B8CFF' },
  { id: 'danger', label: 'Pericolo', color: '#F01426' },
  { id: 'rock', label: 'Roccia', color: '#F01426' },
  { id: 'obstruction', label: 'Ostacolo', color: '#F01426' },
  { id: 'wreck', label: 'Relitto', color: '#F01426' },
  { id: 'dive', label: 'Area immersioni', color: '#FF8A00' },
  { id: 'can', label: 'Boa cilindrica', color: '#FF8A00' },
  { id: 'cone', label: 'Boa conica', color: '#FF8A00' },
  { id: 'fuel', label: 'Carburante', color: '#607D8B' },
  { id: 'star', label: 'Preferito', color: '#E0A800' },
]

export const SEABEDS = ['Sabbia', 'Fango', 'Alghe', 'Posidonia', 'Roccia', 'Ghiaia', 'Misto']

export const markType = (id) => MARK_TYPES.find((t) => t.id === id) ?? SPECIES.find((t) => t.id === id) ?? MARK_TYPES[0]

// Data di oggi sull'ora locale: toISOString è in UTC e sbaglia giorno di notte
const today = () => new Date().toLocaleDateString('sv')

export const newMark = (type, { lat, lon }) => ({ type, lat, lon, name: '', notes: '', date: today(), depth: '', depthSource: '', seabed: '' })

export const newSighting = (type, p) => ({
  ...newMark(type, p),
  name: markType(type).label,
  count: '1',
  time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
})

/** Scheda del pannello che apre questo mark. */
export const markDrawer = (mark) => (mark && isSighting(mark) ? 'sightings' : 'marks')

export const validDepth = (text) => text === '' || /^\d+([.,]\d+)?$/.test(text.trim())

export const fmtMarkDate = (date) => (date ? new Date(`${date}T12:00`).toLocaleDateString('it-IT') : '')

/** Riga di dettaglio di un ancoraggio: "9,1 m · Sabbia · 05/11/2026". */
export function markDetail(mark) {
  if (isSighting(mark)) {
    return [mark.count > 1 && `${mark.count} esemplari`, fmtMarkDate(mark.date), mark.time].filter(Boolean).join(' · ')
  }
  if (mark.type !== 'anchor') return mark.notes || fmtMarkDate(mark.date)
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
