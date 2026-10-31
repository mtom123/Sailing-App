/**
 * Livello Leaflet delle aree protette e zone militari (protectedAreas.js),
 * con i contorni veri da OpenStreetMap: magenta le zone vietate (zone A),
 * arancio le aree marine protette e le loro zone B/C, rosso tratteggiato i
 * poligoni militari. Ridisegnato a ogni spostamento, da MIN_ZOOM.
 */
import L from 'leaflet'
import { protectedAreas } from './protectedAreas.js'

const MIN_ZOOM = 9
const STYLE = {
  nogo: { color: '#E040FB', weight: 2, fillOpacity: 0.22 },
  protected: { color: '#D97757', weight: 1.5, dashArray: '6 4', fillOpacity: 0.06 },
  military: { color: '#FF5252', weight: 1.5, dashArray: '3 5', fillOpacity: 0.08 },
}
const DESCRIPTION = {
  nogo: 'Zona vietata: niente navigazione, ancoraggio né balneazione',
  protected: 'Navigazione con regole (velocità, ancoraggio, pesca)',
  military: 'Zona militare: vietata durante le esercitazioni, verifica gli avvisi ai naviganti',
}
// Le zone più restrittive sopra (e cliccabili per prime)
const ORDER = { protected: 0, military: 1, nogo: 2 }

export const ProtectedAreasLayer = L.Layer.extend({
  // options.popup(area) → HTML della scheda; options.interactive
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
    // SVG, non canvas: su iPad i canvas grandi quanto la mappa esauriscono la
    // memoria di Safari e la carta diventa nera
    this._renderer = L.svg({ padding: 0.2 })
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
    const b = map.getBounds().pad(0.2)
    const areas = await protectedAreas([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()])
    if (gen !== this._gen || !this._map) return
    this._group.clearLayers()
    for (const area of [...areas].sort((x, y) => ORDER[x.kind] - ORDER[y.kind])) {
      const style = STYLE[area.kind]
      const poly = L.polygon(area.rings, {
        ...style,
        fillColor: style.color,
        renderer: this._renderer,
        // Tracciando la rotta il tocco deve aggiungere il waypoint
        interactive: !!this.options.interactive,
      })
      if (this.options.interactive) poly.bindPopup(() => this.options.popup(area, DESCRIPTION[area.kind], areas), { maxWidth: 320 })
      poly.addTo(this._group)
    }
  },
})
