/**
 * Livello Leaflet delle isobate vettoriali: scarica i blocchi di griglia
 * EMODnet della zona visibile, calcola isobate e fasce di acque basse
 * (isobathVector.js) e le disegna su canvas, con le profondità lungo le linee.
 * Nitide a ogni zoom; si ricalcolano solo quando cambia l'insieme di blocchi.
 */
import L from 'leaflet'
import { loadBlock, blockIndex, mergeBlocks, BLOCK } from './depthGrid.js'
import { buildIsobaths } from './isobathVector.js'
import { CHART_COLORS, IMAGERY_COLORS, SHALLOW_LIMIT } from './isobaths.js'

const PANE = 'isobathPane'
const LABEL_PANE = 'isobathLabelPane'
const MAX_BLOCKS = 30 // ~15 × 11 km l'uno: oltre, zoom troppo lontano
const LABEL_SPACING = 280 // px tra due etichette sulla stessa linea
const MAX_LABELS = 160

function ensurePane(map, name, zIndex) {
  if (map.getPane(name)) return
  const pane = map.createPane(name)
  pane.style.zIndex = zIndex
  pane.style.pointerEvents = 'none'
}

export const IsobathLayer = L.Layer.extend({
  options: {
    imagery: false, // satellite: niente fasce, linee chiare
    minZoom: 12,
  },

  initialize(options) {
    L.setOptions(this, options)
    this._key = null
    this._data = null
    this._lines = []
    this._req = 0
  },

  onAdd(map) {
    ensurePane(map, PANE, 250) // sopra le carte, sotto fari/boe e rotte
    ensurePane(map, LABEL_PANE, 255)
    this._renderer = L.canvas({ pane: PANE, padding: 0.5 })
    this._group = L.layerGroup().addTo(map)
    this._labels = L.layerGroup().addTo(map)
    map.on('moveend', this._update, this)
    this._key = null
    this._update()
  },

  onRemove(map) {
    map.off('moveend', this._update, this)
    this._group.remove()
    this._labels.remove()
    this._req++
  },

  setImagery(imagery) {
    if (imagery === this.options.imagery) return
    this.options.imagery = imagery
    this._draw()
  },

  _update() {
    const map = this._map
    if (!map) return
    if (map.getZoom() < this.options.minZoom) {
      this._group.clearLayers()
      this._labels.clearLayers()
      this._key = null
      return
    }
    const b = map.getBounds().pad(0.15)
    const bx0 = blockIndex(b.getWest())
    const bx1 = blockIndex(b.getEast())
    const by0 = blockIndex(b.getSouth())
    const by1 = blockIndex(b.getNorth())
    if ((bx1 - bx0 + 1) * (by1 - by0 + 1) > MAX_BLOCKS) return

    const key = `${bx0},${bx1},${by0},${by1}`
    if (key === this._key) {
      this._drawLabels()
      return
    }
    const req = ++this._req
    const jobs = []
    for (let bx = bx0; bx <= bx1; bx++) for (let by = by0; by <= by1; by++) jobs.push(loadBlock(bx, by))
    Promise.all(jobs)
      .then((list) => {
        if (req !== this._req || !this._map) return
        const grid = mergeBlocks(list, bx0 * BLOCK, (bx1 + 1) * BLOCK - 1, by0 * BLOCK, (by1 + 1) * BLOCK - 1)
        this._data = buildIsobaths(grid)
        this._key = key
        this._draw()
      })
      .catch((err) => console.warn('Isobate EMODnet non disponibili', err))
  },

  _draw() {
    if (!this._map || !this._data) return
    this._group.clearLayers()
    const imagery = this.options.imagery
    const [shallowColor, deepColor] = imagery ? IMAGERY_COLORS : CHART_COLORS

    if (!imagery) {
      for (const band of this._data.bands) {
        L.polygon(band.rings, {
          renderer: this._renderer,
          stroke: false,
          fillColor: band.color,
          fillOpacity: band.opacity,
          interactive: false,
        }).addTo(this._group)
      }
    }
    this._lines = this._data.lines.map((line) => {
      const shallow = line.depth <= SHALLOW_LIMIT
      const color = shallow ? shallowColor : deepColor
      const polyline = L.polyline(line.path, {
        renderer: this._renderer,
        color,
        weight: shallow ? 1.6 : 0.9,
        opacity: 1,
        interactive: false,
      }).addTo(this._group)
      return { polyline, depth: line.depth, color }
    })
    this._drawLabels()
  },

  // Profondità lungo le linee, ogni LABEL_SPACING px, ruotate come la linea
  _drawLabels() {
    const map = this._map
    if (!map) return
    this._labels.clearLayers()
    const view = map.getBounds()
    const halo = this.options.imagery ? IMAGERY_COLORS[2] : CHART_COLORS[2]
    let count = 0
    for (const { polyline, depth, color } of this._lines) {
      if (count >= MAX_LABELS) break
      if (!view.intersects(polyline.getBounds())) continue
      const latlngs = polyline.getLatLngs()
      let prev = map.latLngToLayerPoint(latlngs[0])
      let walked = LABEL_SPACING / 2
      for (let i = 1; i < latlngs.length && count < MAX_LABELS; i++) {
        const p = map.latLngToLayerPoint(latlngs[i])
        walked += prev.distanceTo(p)
        if (walked >= LABEL_SPACING && view.contains(latlngs[i])) {
          walked = 0
          let angle = (Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI
          if (angle > 90) angle -= 180
          if (angle < -90) angle += 180
          L.marker(latlngs[i], {
            pane: LABEL_PANE,
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: 'timone-isobath-label',
              iconSize: [0, 0],
              html: `<span style="color:${color};--halo:${halo};transform:translate(-50%,-50%) rotate(${angle.toFixed(0)}deg)">${depth}</span>`,
            }),
          }).addTo(this._labels)
          count++
        }
        prev = p
      }
    }
  },
})
