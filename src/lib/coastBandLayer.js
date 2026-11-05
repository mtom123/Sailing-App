/**
 * Livello Leaflet della fascia costiera (coastBand.js): linea rossa in
 * Italia (ancoraggio vietato in stagione balneare), arancione in Francia e
 * Corsica (5 nodi), con la distanza; più tenue fuori stagione balneare.
 * Ricalcolata da MIN_ZOOM in su a carta ferma, un calcolo alla volta: è
 * pesante, e sull'iPad più calcoli lanciati dallo zoom bloccavano la carta.
 * Appena la carta si muove quello in corso si ferma.
 */
import L from 'leaflet'
import { BAND_DEFAULTS, MIN_ZOOM, coastBandLines } from './coastBand.js'
import { ruleTiming } from '../data/coastRules.js'

export const PANE = 'coastBandPane'
const COLORS = { italy: '#FF3B30', france: '#F5A623' }
const MAX_CELLS = 6e5 // celle della griglia (iPad: memoria e tempo)
const SETTLE_MS = 800 // la carta è ferma da tanto: si calcola
const LABEL_MIN_PX = 140 // etichetta solo sui tratti abbastanza lunghi

export const CoastBandLayer = L.Layer.extend({
  initialize(options) {
    L.setOptions(this, options)
    this._cfg = { ...BAND_DEFAULTS }
    this._gen = 0
  },

  setConfig(cfg) {
    const next = { ...BAND_DEFAULTS, ...cfg }
    if (JSON.stringify(next) === JSON.stringify(this._cfg)) return
    this._cfg = next
    if (this._map) this._schedule()
  },

  onAdd(map) {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE)
      pane.style.zIndex = 258
      pane.style.pointerEvents = 'none'
    }
    this._group = L.layerGroup().addTo(map)
    map.on('moveend', this._schedule, this)
    map.on('movestart zoomstart', this._cancel, this)
    this._schedule()
  },

  onRemove(map) {
    map.off('moveend', this._schedule, this)
    map.off('movestart zoomstart', this._cancel, this)
    clearTimeout(this._timer)
    this._gen++
    this._group.remove()
  },

  _schedule() {
    clearTimeout(this._timer)
    this._timer = setTimeout(() => this._update(), SETTLE_MS)
  },

  _cancel() {
    clearTimeout(this._timer)
    this._gen++
  },

  async _update() {
    const map = this._map
    if (!map) return
    if (map.getZoom() < MIN_ZOOM) {
      this._gen++
      this._group.clearLayers()
      return
    }
    if (this._running) {
      this._again = true
      return
    }
    const gen = ++this._gen
    const bounds = map.getBounds().pad(0.15)
    const sw = L.CRS.EPSG3857.project(bounds.getSouthWest())
    const ne = L.CRS.EPSG3857.project(bounds.getNorthEast())
    const m = 1 / Math.cos((bounds.getCenter().lat * Math.PI) / 180)
    const res = Math.max(4 * m, Math.sqrt(((ne.x - sw.x) * (ne.y - sw.y)) / MAX_CELLS))
    let lines
    this._running = true
    try {
      lines = await coastBandLines(bounds, res, this._cfg, () => gen !== this._gen)
    } catch (err) {
      console.warn('Fascia costiera non disponibile', err)
      return
    } finally {
      this._running = false
      if (this._again) {
        this._again = false
        this._schedule()
      }
    }
    if (gen !== this._gen || !lines || !this._map) return
    this._group.clearLayers()
    for (const line of lines) {
      const color = COLORS[line.region]
      // Fuori stagione balneare la linea resta, più tenue
      const active = !line.rule || ruleTiming(line.rule).inSeason
      L.polyline(line.path, { pane: PANE, color, weight: 2.5, opacity: active ? 0.95 : 0.4, dashArray: '8 6', interactive: false }).addTo(this._group)
      const px = line.path.map((ll) => map.latLngToLayerPoint(ll))
      let len = 0
      for (let i = 1; i < px.length; i++) len += px[i].distanceTo(px[i - 1])
      if (len < LABEL_MIN_PX) continue
      const text = line.region === 'france' ? `${line.dM} m · 5 kn` : `${line.dM} m`
      L.marker(line.path[Math.floor(line.path.length / 2)], {
        pane: PANE,
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'timone-band-label', html: `<span style="color:${color}">${text}</span>`, iconSize: null }),
      }).addTo(this._group)
    }
  },
})
