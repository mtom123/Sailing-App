import L from 'leaflet'
import { ensurePane } from './isobathLayer.js'
import { OFFLINE_EVENT, offlineZones } from './offlinePack.js'

/*
 * Zone scaricate per l'offline: verde il dettaglio (fasce attorno alle
 * rotte, larghe un miglio per lato con i waypoint arrotondati, e rettangoli
 * a tutti gli zoom), azzurro la base larga (fino a zoom 14). Le forme sono
 * piene e la trasparenza è del piano intero: dove si sovrappongono il
 * colore resta uguale invece di scurirsi.
 */

const STYLES = {
  wide: { pane: 'offlineWideZonePane', zIndex: 236, color: '#4A9EFF', opacity: 0.2 },
  detail: { pane: 'offlineZonePane', zIndex: 237, color: '#3DDC84', opacity: 0.3 },
}

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
    // Sopra la terra scurita, sotto rilievo e isobate
    this._renderers = {}
    for (const [level, st] of Object.entries(STYLES)) {
      ensurePane(map, st.pane, st.zIndex)
      map.getPane(st.pane).style.opacity = st.opacity
      this._renderers[level] = L.canvas({ pane: st.pane, padding: 0.25 })
    }
    this._group = L.layerGroup().addTo(map)
    this._onChange = () => this._draw()
    window.addEventListener(OFFLINE_EVENT, this._onChange)
    this._draw()
  },

  onRemove() {
    window.removeEventListener(OFFLINE_EVENT, this._onChange)
    this._group.remove()
    for (const r of Object.values(this._renderers)) r.remove()
  },

  _draw() {
    this._group.clearLayers()
    for (const zone of offlineZones()) {
      const level = zone.level === 'wide' ? 'wide' : 'detail'
      const style = { renderer: this._renderers[level], stroke: false, fillColor: STYLES[level].color, fillOpacity: 1, interactive: false }
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
