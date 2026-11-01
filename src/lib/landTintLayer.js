import L from 'leaflet'
import { MaskedCanvas, ensurePane } from './isobathLayer.js'
import { waterRings } from './waterMask.js'

/*
 * Terra più scura sulla carta CHIARA: al sole la carta Esri (terra quasi
 * bianca, mare azzurro chiaro) si confonde. Un velo marrone semitrasparente
 * su tutta la vista, con il mare ritagliato via dalla costa OSM: la terra
 * scurisce e strade, rilievo e nomi restano leggibili. Niente fusione dei
 * colori ("moltiplica"): su iPad Safari ricomponeva tutta la carta a ogni
 * fotogramma di zoom e lo bloccava.
 *
 * Con `pane: 'offlineBasePane', blend: false` è invece la carta di riserva
 * sotto i tasselli Esri: terra piena dalla costa OSM, che si vede solo dove
 * la carta manca (offline, zona non scaricata); il mare è lo sfondo azzurro.
 */

const PAD = 0.1
const MIN_ZOOM = 8 // sotto: troppi tasselli per la costa, niente velo

export const LandTintLayer = L.Layer.extend({
  options: { color: '#8a6d3b', fillOpacity: 0.45, pane: 'landTintPane', zIndex: 235, blend: false },

  initialize(options) {
    L.setOptions(this, options)
    this._req = 0
  },

  onAdd(map) {
    const { pane, zIndex, blend } = this.options
    ensurePane(map, pane, zIndex) // velo: sopra la carta, sotto rilievo e isobate
    if (blend) map.getPane(pane).style.mixBlendMode = 'multiply'
    // Velo di colore: risoluzione normale e poco margine, per la memoria dell'iPad
    this._renderer = new MaskedCanvas({ pane, padding: PAD, lowRes: true })
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
        L.rectangle(bounds, { renderer: this._renderer, stroke: false, fillColor: this.options.color, fillOpacity: this.options.fillOpacity, interactive: false }).addTo(this._group)
        // Il mare va via per ultimo
        if (rings.length) L.polygon(rings, { renderer: this._renderer, cut: true, stroke: false, interactive: false }).addTo(this._group)
      })
      .catch(() => {
        if (req === this._req) this._group.clearLayers()
      })
  },
})
