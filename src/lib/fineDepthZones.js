/**
 * Fasce di profondità di dettaglio in Liguria: per ogni blocco di 0,05°
 * (~4 × 5,5 km) il worker ricostruisce una griglia a ~10 m dalle isobate
 * multibeam della Regione (ogni 5 m, liguriaIsobaths.js) e dalla costa OSM,
 * e la colora con le fasce dell'utente (imageWorker.js → fineZones). Qui le
 * immagini si mettono sulla carta. Dove c'è il dettaglio, le fasce EMODnet
 * (DepthZoneLayer) si tagliano: onCoverage(anelli).
 *
 * Sotto i 5 m (prima isobata) la profondità è stimata tra la riva e
 * l'isobata: le fasce più basse lì sono indicative.
 */
import L from 'leaflet'
import { LIGURIA_ISOBATH_SOURCE } from './liguriaIsobaths.js'
import { waterRings } from './waterMask.js'
import { fineZonesImage } from './imagePixels.js'
import { DEPTH_ZONE_OPACITY } from './isobaths.js'
import { mapAtRest } from './offlinePack.js'

const PANE = 'fineDepthZonePane'
const CELL = 0.05 // come liguriaIsobaths.js
const WATER_ZOOM = 15 // dettaglio della costa OSM

export const FineDepthZoneLayer = L.Layer.extend({
  options: { minZoom: 13, zones: [], onCoverage: () => {} },

  initialize(options) {
    L.setOptions(this, options)
    this._shown = new Map() // nome blocco -> { overlay, url, cov }
    this._gen = 0
  },

  setZones(zones) {
    this.options.zones = zones
    if (!this._map) return
    // Ricolora i blocchi già mostrati
    for (const name of [...this._shown.keys()]) this._drop(name)
    this._update()
  },

  onAdd(map) {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE)
      pane.style.zIndex = 249 // sopra le fasce EMODnet, sotto le isobate
      pane.style.pointerEvents = 'none'
    }
    map.on('moveend', this._update, this)
    this._update()
  },

  onRemove(map) {
    map.off('moveend', this._update, this)
    this._gen++
    for (const name of [...this._shown.keys()]) this._drop(name)
    this.options.onCoverage(null)
  },

  _drop(name) {
    const s = this._shown.get(name)
    if (!s) return
    s.overlay?.remove()
    if (s.url) URL.revokeObjectURL(s.url)
    this._shown.delete(name)
  },

  _coverage() {
    const rings = [...this._shown.values()].flatMap((s) => s.cov || [])
    this.options.onCoverage(rings.length ? rings : null)
  },

  async _update() {
    const map = this._map
    if (!map) return
    const gen = ++this._gen
    if (map.getZoom() < this.options.minZoom) {
      for (const name of [...this._shown.keys()]) this._drop(name)
      this._coverage()
      return
    }
    const view = map.getBounds().pad(0.2)
    const names = await LIGURIA_ISOBATH_SOURCE.names(view)
    if (gen !== this._gen || !this._map) return
    const wanted = new Set(names)
    for (const name of [...this._shown.keys()]) if (!wanted.has(name)) this._drop(name)
    this._coverage()
    for (const name of names) {
      if (this._shown.has(name)) continue
      // Lavoro pesante: a carta ferma, un blocco alla volta
      await mapAtRest()
      if (gen !== this._gen || !this._map) return
      await this._show(name).catch((err) => console.warn('Fasce di dettaglio non disponibili', err))
      if (gen !== this._gen) return
    }
  },

  async _show(name) {
    const [i, j] = name.split(',').map(Number)
    const bbox = [j * CELL, i * CELL, (j + 1) * CELL, (i + 1) * CELL]
    const bounds = L.latLngBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]])
    const { lines, cov } = await LIGURIA_ISOBATH_SOURCE.load(name)
    if (!lines.length) {
      this._shown.set(name, { cov: [] })
      return
    }
    const zones = this.options.zones
    const job = { key: name, bbox, zones, opacity: DEPTH_ZONE_OPACITY }
    let blob = await fineZonesImage(job)
    if (blob === 'missing') {
      // Troppi tasselli di costa a quello zoom: un livello meno fine
      const water = (await waterRings(bounds, WATER_ZOOM)) || (await waterRings(bounds, WATER_ZOOM - 2)) || []
      if (!water.length) {
        this._shown.set(name, { cov: [] })
        return
      }
      blob = await fineZonesImage({ ...job, lines, water })
    }
    if (!this._map || this._shown.has(name)) return
    if (!blob || blob === 'missing') {
      this._shown.set(name, { cov })
      this._coverage()
      return
    }
    const url = URL.createObjectURL(blob)
    const overlay = L.imageOverlay(url, bounds, { pane: PANE, interactive: false, className: 'fine-depth-zones' }).addTo(this._map)
    this._shown.set(name, { overlay, url, cov })
    this._coverage()
  },
})
