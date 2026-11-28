/**
 * Livello Leaflet dei club gemellati e con reciprocità dello YCI
 * (yciClubs.js): il guidone di ogni club su una targhetta bianca, con la
 * punta sulla sede. Tocca per la scheda: tipo di accordo, sede, sito.
 * Pochi punti: sempre tutti, a ogni zoom.
 */
import L from 'leaflet'
import { CLUB_ACCESS, CLUB_KIND, YCI_CLUBS } from './yciClubs.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Targhetta 44×30 con il guidone e una punta in basso sulla sede.
// Bordo blu per lo YCI, oro per i gemellati, grigio per la reciprocità
const BORDER = { home: '#1f4e8c', twin: '#c9a227', reciprocal: '#8a96a3' }
const icon = (club) =>
  L.divIcon({
    className: '',
    html: `<div style="position:relative;width:44px;height:36px">
      <div style="width:44px;height:30px;box-sizing:border-box;background:#fff;border:2px solid ${BORDER[club.kind]};border-radius:5px;box-shadow:0 1px 4px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;overflow:hidden">
        <img src="${club.img}" alt="" draggable="false" style="max-width:38px;max-height:24px;object-fit:contain;pointer-events:none">
      </div>
      <div style="position:absolute;left:17px;top:28px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${BORDER[club.kind]}"></div>
    </div>`,
    iconSize: [44, 36],
    iconAnchor: [22, 35],
    popupAnchor: [0, -32],
  })

function card(club) {
  const site = club.url
    ? `<a href="${esc(club.url)}" target="_blank" rel="noopener" style="color:var(--color-phos)">${esc(club.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`
    : ''
  const access = CLUB_ACCESS[club.kind]
  return `<div style="display:flex;flex-direction:column;gap:5px">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="flex:none;width:52px;height:36px;background:#fff;border-radius:4px;display:flex;align-items:center;justify-content:center"><img src="${club.img}" alt="" style="max-width:48px;max-height:32px;object-fit:contain"></div>
      <div style="font-weight:700;color:var(--color-paper);font-size:calc(13px*var(--fs));line-height:1.2">${esc(club.name)}</div>
    </div>
    <div style="font-size:calc(11px*var(--fs));color:${BORDER[club.kind]};font-weight:600">${CLUB_KIND[club.kind]}</div>
    <div style="font-size:calc(11px*var(--fs));color:var(--color-paper)">${esc(club.place)}${club.approx ? ' <span style="color:var(--color-fog)">(posizione indicativa)</span>' : ''}</div>
    ${access ? `<div style="font-size:calc(10px*var(--fs));color:var(--color-fog);line-height:1.35">${access}</div>` : ''}
    ${site ? `<div style="font-size:calc(11px*var(--fs))">${site}</div>` : ''}
  </div>`
}

export const YciClubsLayer = L.Layer.extend({
  initialize(options) {
    L.setOptions(this, options)
  },

  setInteractive(interactive) {
    if (this.options.interactive === interactive) return
    this.options.interactive = interactive
    if (this._map) this._draw()
  },

  onAdd() {
    this._group = L.layerGroup().addTo(this._map)
    this._draw()
  },

  onRemove() {
    this._group.remove()
  },

  _draw() {
    this._group.clearLayers()
    const interactive = !!this.options.interactive
    for (const club of YCI_CLUBS) {
      const m = L.marker([club.lat, club.lon], { icon: icon(club), title: club.name, interactive, zIndexOffset: 450, keyboard: false })
      if (interactive) m.bindPopup(card(club), { maxWidth: 290, minWidth: 230 })
      m.addTo(this._group)
    }
  },
})
