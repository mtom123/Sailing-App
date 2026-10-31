import L from 'leaflet'
import { MaskedCanvas, ensurePane } from './isobathLayer.js'
import { waterRings } from './waterMask.js'

/*
 * Terra più scura sulla carta CHIARA: al sole la carta Esri (terra quasi
 * bianca, mare azzurro chiaro) si confonde. Un velo color sabbia in
 * "moltiplica" su tutta la vista, con il mare ritagliato via dalla costa
 * OSM: la terra scurisce ma strade, rilievo e nomi restano leggibili.
 */

const PANE = 'landTintPane'
const PAD = 0.25
const MIN_ZOOM = 8 // sotto: troppi tasselli per la costa, niente velo

export const LandTintLayer = L.Layer.extend({
  options: { color: '#cdbd9b' },

  initialize(options) {
    L.setOptions(this, options)
    this._req = 0
  },

  onAdd(map) {
    ensurePane(map, PANE, 235) // sopra la carta, sotto rilievo e isobate
    map.getPane(PANE).style.mixBlendMode = 'multiply'
    this._renderer = new MaskedCanvas({ pane: PANE, padding: PAD })
    this._group = L.layerGroup().addTo(map)
    map.on('moveend', this._update, this)
    this._update()
  },

  onRemove(map) {
    this._req++
    map.off('moveend', this._update, this)
    this._group.remove()
    this._renderer.remove()
  },

  _update() {
    const map = this._map
    if (!map) return
    const req = ++this._req
    if (map.getZoom() < MIN_ZOOM) {
      this._group.clearLayers()
      return
    }
    const bounds = map.getBounds().pad(PAD)
    waterRings(bounds, map.getZoom())
      .then((rings) => {
        if (req !== this._req || !this._map) return
        this._group.clearLayers()
        if (!rings) return
        L.rectangle(bounds, { renderer: this._renderer, stroke: false, fillColor: this.options.color, fillOpacity: 1, interactive: false }).addTo(this._group)
        // Il mare va via per ultimo
        if (rings.length) L.polygon(rings, { renderer: this._renderer, cut: true, stroke: false, interactive: false }).addTo(this._group)
      })
      .catch(() => {
        if (req === this._req) this._group.clearLayers()
      })
  },
})
