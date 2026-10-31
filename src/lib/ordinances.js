/**
 * Ordinanze recenti delle Capitanerie di porto (public/ordinances.json,
 * scaricato da tools/ordinances.mjs a ogni rilascio): interdizioni
 * temporanee, esercitazioni militari, lavori, eventi. Posizioni indicative
 * (un punto o pochi vertici): fa fede il testo dell'ordinanza.
 */
import L from 'leaflet'

const DATA_URL = `${import.meta.env?.BASE_URL ?? '/'}ordinances.json`

// Esercitazioni, poligoni di tiro, brillamenti, bonifiche belliche
const MILITARY = /militar|esercitazion|poligono|\btiro\b|brillament|bellic|ordigno/i
// Ordinanze che riguardano chi naviga (non solo il porto)
const AT_SEA = /Navigazione|Balneazione|Immersione|Pesca/

export const isMilitary = (o) => MILITARY.test(o.title)
export const concernsSailing = (o) => isMilitary(o) || o.types.some((t) => AT_SEA.test(t))

let dataPromise = null
export function loadOrdinances() {
  if (!dataPromise) {
    dataPromise = fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : { ordinances: [] }))
      .catch(() => ({ ordinances: [] }))
  }
  return dataPromise
}

// Distanza in metri dal punto p ai punti/vertici dell'ordinanza
const ll = (p) => L.latLng(p[0], p[1])
function distanceTo(o, lat, lon) {
  const p = L.latLng(lat, lon)
  return Math.min(...o.points.map((q) => p.distanceTo(ll(q))))
}

/** Ordinanze entro radiusM dal punto, le più vicine prima */
export async function ordinancesNear(lat, lon, radiusM = 1500) {
  const { ordinances } = await loadOrdinances()
  const dLat = radiusM / 111000
  return ordinances
    .filter((o) => o.points.some(([la]) => Math.abs(la - lat) < dLat * 2))
    .map((o) => ({ ...o, distanceM: distanceTo(o, lat, lon) }))
    .filter((o) => o.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
}

/** Ordinanze per chi naviga entro radiusM dalla tratta a → b ({lat, lon}) */
export async function ordinancesAlongLeg(a, b, radiusM = 700) {
  const { ordinances } = await loadOrdinances()
  const crs = L.CRS.EPSG3857
  const pa = crs.project(L.latLng(a.lat, a.lon))
  const pb = crs.project(L.latLng(b.lat, b.lon))
  const m = 1 / Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180) // metri Mercator per metro
  const r = radiusM * m
  return ordinances.filter(
    (o) =>
      concernsSailing(o) &&
      o.points.some((q) => {
        const p = crs.project(ll(q))
        return L.LineUtil.pointToSegmentDistance(p, pa, pb) <= r
      })
  )
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** HTML della scheda di un'ordinanza */
export function ordinanceHTML(o) {
  const date = new Date(o.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
  return `<div style="min-width:180px;max-width:260px">
    <div style="font-weight:600;color:var(--color-paper);font-size:12px;margin-bottom:3px">${esc(o.title)}</div>
    <div style="font-size:11px;color:var(--color-fog)">${esc(o.office)}</div>
    <div style="font-size:11px;color:var(--color-fog)">Ord. ${esc(o.n)} · ${date}${o.types.length ? ` · ${esc(o.types.join(', '))}` : ''}</div>
    ${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:4px;font-size:11px;color:var(--color-phos)">Apri l'ordinanza (PDF)</a>` : ''}
  </div>`
}
