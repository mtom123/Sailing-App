/**
 * Livello Leaflet delle ordinanze recenti delle Capitanerie (ordinances.js):
 * rosso le esercitazioni militari e i poligoni di tiro, arancio quelle per
 * chi naviga, grigio quelle solo portuali. Tocca per la scheda e il PDF.
 */
import L from 'leaflet'
import { concernsSailing, isMilitary, loadOrdinances, ordinanceHTML } from './ordinances.js'

const MIN_ZOOM = 8

export const OrdinancesLayer = L.Layer.extend({
  initialize(options) {
    L.setOptions(this, options)
    this._gen = 0
  },

  setInteractive(interactive) {
    if (this.options.interactive === interactive) return
    this.options.interactive = interactive
    if (this._map) this._update()
  },

  onAdd(map) {
    this._renderer = L.canvas({ padding: 0.2 })
    this._group = L.layerGroup().addTo(map)
    map.on('moveend', this._update, this)
    this._update()
  },

  onRemove(map) {
    map.off('moveend', this._update, this)
    this._gen++
    this._group.remove()
  },

  async _update() {
    const map = this._map
    if (!map) return
    const gen = ++this._gen
    if (map.getZoom() < MIN_ZOOM) {
      this._group.clearLayers()
      return
    }
    const { ordinances } = await loadOrdinances()
    if (gen !== this._gen || !this._map) return
    const b = map.getBounds().pad(0.2)
    this._group.clearLayers()
    const interactive = !!this.options.interactive
    for (const o of ordinances) {
      if (!o.points.some(([la, lo]) => b.contains([la, lo]))) continue
      const color = isMilitary(o) ? '#FF5252' : concernsSailing(o) ? '#F5A623' : '#8FA0AE'
      const style = { renderer: this._renderer, color, weight: 2, fillColor: color, fillOpacity: 0.25, interactive }
      const shape =
        o.points.length >= 3
          ? L.polygon(o.points, { ...style, dashArray: '4 4', fillOpacity: 0.12 })
          : o.points.length === 2
            ? L.polyline(o.points, { ...style, dashArray: '4 4' })
            : L.circleMarker(o.points[0], { ...style, radius: 6 })
      if (interactive) shape.bindPopup(ordinanceHTML(o))
      shape.addTo(this._group)
    }
  },
})
