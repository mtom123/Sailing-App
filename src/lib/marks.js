import { haversine } from './geo.js'
import { SPECIES, isSighting } from './sightings.js'

/*
 * Mark personali sulla carta, come su Navionics: tipo, nome, note. Quelli di
 * ancoraggio tengono anche profondità, data e tipo di fondale. Gli avvistamenti
 * (sightings.js) sono mark con la specie come tipo, più quanti e l'ora.
 *
 * Mark: { id, type, lat, lon, name, notes, date, depth, depthSource, seabed,
 * count, time, photos, updatedAt }. depth è il testo scritto ("9,1"), date è
 * "aaaa-mm-gg", time "hh:mm", photos gli id delle foto (markStore.js).
 */

export const MARK_TYPES = [
  { id: 'mark', label: 'Spilla', color: '#26C6DA' },
  { id: 'dot', label: 'Punto', color: '#26C6DA' },
  { id: 'anchor', label: 'Ancoraggio', color: '#FFCA28' },
  { id: 'mob', label: 'Uomo a mare', color: '#FF5252' },
  { id: 'fish', label: 'Pesce A', color: '#66BB6A' },
  { id: 'fishB', label: 'Pesce B', color: '#FFA726' },
  { id: 'fishC', label: 'Pesce C', color: '#42A5F5' },
  { id: 'fishD', label: 'Pesce D', color: '#B39DDB' },
  { id: 'danger', label: 'Pericolo', color: '#FF5252' },
  { id: 'rock', label: 'Roccia', color: '#FF5252' },
  { id: 'obstruction', label: 'Ostacolo', color: '#FF5252' },
  { id: 'wreck', label: 'Relitto', color: '#FF5252' },
  { id: 'dive', label: 'Area immersioni', color: '#FFA726' },
  { id: 'can', label: 'Boa cilindrica', color: '#FFA726' },
  { id: 'cone', label: 'Boa conica', color: '#FFA726' },
  { id: 'fuel', label: 'Carburante', color: '#B0BEC5' },
  { id: 'star', label: 'Preferito', color: '#FFCA28' },
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
  photos: [],
  time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
})

/** Scheda del pannello che apre questo mark. */
export const markDrawer = (mark) => (mark && isSighting(mark) ? 'sightings' : 'marks')

export const validDepth = (text) => text === '' || /^\d+([.,]\d+)?$/.test(text.trim())

export const fmtMarkDate = (date) => (date ? new Date(`${date}T12:00`).toLocaleDateString('it-IT') : '')

/** Riga di dettaglio di un ancoraggio: "9,1 m · Sabbia · 05/11/2026". */
export function markDetail(mark) {
  if (isSighting(mark)) {
    const photos = mark.photos?.length
    return [mark.count > 1 && `${mark.count} esemplari`, fmtMarkDate(mark.date), mark.time, photos && `${photos} foto`].filter(Boolean).join(' · ')
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
