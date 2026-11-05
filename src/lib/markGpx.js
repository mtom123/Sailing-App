import { markDetail, markType, newMark } from './marks.js'
import { isSighting } from './sightings.js'

/*
 * Mark da e verso GPX. Il nome, le note e il simbolo sono quelli standard che
 * leggono anche Navionics e gli altri plotter; i dettagli di TIMONE vanno in
 * un'estensione, così un file salvato qui torna identico.
 */

const NS = 'https://mtom123.github.io/Sailing-App/gpx/1'
const FIELDS = ['id', 'type', 'notes', 'date', 'time', 'count', 'depth', 'depthSource', 'seabed']
// Simboli GPX comuni: quelli usati qui e quelli che arrivano da altri programmi
const SYMBOLS = {
  mark: 'Waypoint',
  dot: 'Dot',
  anchor: 'Anchor',
  mob: 'Man Overboard',
  fish: 'Fishing Area',
  fishB: 'Fishing Area',
  fishC: 'Fishing Area',
  fishD: 'Fishing Area',
  danger: 'Danger Area',
  rock: 'Rock',
  obstruction: 'Obstruction',
  wreck: 'Wreck',
  dive: 'Diver Down Flag 1',
  can: 'Buoy, Can',
  cone: 'Buoy, Cone',
  fuel: 'Gas Station',
  star: 'Flag',
}

const xml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Fuori da TIMONE le note dell'ancoraggio devono dire anche profondità e fondale
const description = (m) => (m.type === 'anchor' || isSighting(m) ? [markDetail(m), m.notes] : [m.notes]).filter(Boolean).join('\n')

export function marksToGpx(marks) {
  const points = marks.map((m) => {
    const extra = FIELDS.filter((f) => m[f]).map((f) => `<timone:${f}>${xml(m[f])}</timone:${f}>`).join('')
    const time = m.date ? `<time>${m.date}T12:00:00Z</time>` : ''
    return `<wpt lat="${m.lat}" lon="${m.lon}">${time}<name>${xml(m.name)}</name><desc>${xml(description(m))}</desc><sym>${SYMBOLS[m.type] ?? SYMBOLS.mark}</sym><extensions>${extra}</extensions></wpt>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TIMONE" xmlns="http://www.topografix.com/GPX/1/1" xmlns:timone="${NS}">\n${points.join('\n')}\n</gpx>\n`
}

const typeOfSymbol = (sym) => {
  const s = sym.toLowerCase()
  if (s.includes('anchor')) return 'anchor'
  if (s.includes('overboard')) return 'mob'
  if (s.includes('wreck')) return 'wreck'
  if (s.includes('rock')) return 'rock'
  if (s.includes('obstruction')) return 'obstruction'
  if (s.includes('danger') || s.includes('hazard')) return 'danger'
  if (s.includes('fish')) return 'fish'
  if (s.includes('div')) return 'dive'
  if (s.includes('can')) return 'can'
  if (s.includes('cone') || s.includes('nun')) return 'cone'
  if (s.includes('gas') || s.includes('fuel')) return 'fuel'
  return 'mark'
}

/** Mark di un file GPX; lancia un errore se il file non è un GPX. */
export function gpxToMarks(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'gpx') throw new Error('Non è un file GPX')
  const child = (el, name) => el.getElementsByTagNameNS('*', name)[0]?.textContent.trim() ?? ''
  const marks = []
  for (const wpt of doc.getElementsByTagNameNS('*', 'wpt')) {
    const lat = Number(wpt.getAttribute('lat'))
    const lon = Number(wpt.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    const own = wpt.getElementsByTagNameNS(NS, 'type').length > 0
    const type = own ? markType(wpt.getElementsByTagNameNS(NS, 'type')[0].textContent).id : typeOfSymbol(child(wpt, 'sym'))
    const mark = { ...newMark(type, { lat, lon }), name: child(wpt, 'name') }
    if (own) {
      for (const f of FIELDS) {
        const el = wpt.getElementsByTagNameNS(NS, f)[0]
        mark[f] = el ? el.textContent : f === 'id' ? undefined : ''
      }
      mark.type = type
    } else {
      mark.notes = child(wpt, 'desc') || child(wpt, 'cmt')
      mark.date = child(wpt, 'time').slice(0, 10) || mark.date
    }
    marks.push(mark)
  }
  return marks
}

/** Mark nuovi rispetto a quelli già presenti: stesso id, o stesso nome nello stesso punto. */
export function newMarksOnly(found, existing) {
  const key = (m) => `${m.name}|${m.lat.toFixed(5)}|${m.lon.toFixed(5)}`
  const ids = new Set(existing.map((m) => m.id))
  const keys = new Set(existing.map(key))
  return found.filter((m) => {
    if (ids.has(m.id) || keys.has(key(m))) return false
    keys.add(key(m))
    return true
  })
}

export const marksFileName = () => `timone-mark-${new Date().toLocaleDateString('sv')}.gpx`
