import L from 'leaflet'
import { ensurePane } from './isobathLayer.js'
import { OFFLINE_EVENT, offlineZones } from './offlinePack.js'

/*
 * Zone scaricate per l'offline, velate di verde chiaro: le fasce attorno
 * alle rotte (tratti larghi un miglio per lato, con i waypoint arrotondati)
 * e i rettangoli. Le forme sono piene e la trasparenza è del piano intero:
 * dove si sovrappongono il colore resta uguale invece di scurirsi.
 */

const PANE = 'offlineZonePane'
const COLOR = '#3DDC84'
const OPACITY = 0.3

// Quadrilatero largo bufM per lato attorno al tratto a→b
function legQuad(a, b, bufM) {
  const mLat = 111320
  const mLon = 111320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const dx = (b.lon - a.lon) * mLon
  const dy = (b.lat - a.lat) * mLat
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * bufM
  const oy = (dx / len) * bufM
  const off = (p, s) => [p.lat + (s * oy) / mLat, p.lon + (s * ox) / mLon]
  return [off(a, 1), off(b, 1), off(b, -1), off(a, -1)]
}

export const OfflineZonesLayer = L.Layer.extend({
  onAdd(map) {
    ensurePane(map, PANE, 236) // sopra la terra scurita, sotto rilievo e isobate
    map.getPane(PANE).style.opacity = OPACITY
    this._renderer = L.canvas({ pane: PANE, padding: 0.25 })
    this._group = L.layerGroup().addTo(map)
    this._onChange = () => this._draw()
    window.addEventListener(OFFLINE_EVENT, this._onChange)
    this._draw()
  },

  onRemove() {
    window.removeEventListener(OFFLINE_EVENT, this._onChange)
    this._group.remove()
    this._renderer.remove()
  },

  _draw() {
    this._group.clearLayers()
    const style = { renderer: this._renderer, stroke: false, fillColor: COLOR, fillOpacity: 1, interactive: false }
    for (const zone of offlineZones()) {
      if (zone.kind === 'area') {
        L.rectangle(zone.bounds, style).addTo(this._group)
        continue
      }
      const { points, bufferM } = zone
      for (let i = 1; i < points.length; i++) L.polygon(legQuad(points[i - 1], points[i], bufferM), style).addTo(this._group)
      for (const p of points) L.circle([p.lat, p.lon], { ...style, radius: bufferM }).addTo(this._group)
    }
  },
})
