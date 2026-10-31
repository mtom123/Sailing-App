/**
 * Isobate ogni metro dai rilievi Litto3D® del Shom (Corsica, Costa Azzurra…),
 * calcolate in anticipo da tools/litto3d-isobaths.mjs e pubblicate con l'app
 * in public/isobaths-hd/. Si caricano solo i tasselli (2 × 2 km) della zona
 * visibile. Ogni tassello porta anche il contorno dell'area rilevata, passato
 * a `onCoverage`: lì le isobate EMODnet, meno precise, si nascondono.
 *
 * Profondità riferite al livello medio del mare (IGN69). Non per la navigazione.
 * Con l'opzione `source` lo stesso livello disegna altre isobate di dettaglio
 * (liguriaIsobaths.js).
 */
import L from 'leaflet'
import { CHART_COLORS, IMAGERY_COLORS } from './isobaths.js'
import { PANE, LABEL_PANE, ensurePane, drawDepthLabels } from './isobathLayer.js'

export const HD_BASE = `${import.meta.env.BASE_URL}isobaths-hd/`

let indexPromise = null
const tiles = new Map() // nome -> Promise<{ lines, cov }>

/** { list: [{ name, bounds, origin }], grid: { cell, size, nodata } | null } */
export function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(`${HD_BASE}index.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => ({
        list: Object.entries(j.tiles || {}).map(([name, [s, w, n, e]]) => ({
          name,
          bounds: L.latLngBounds([s, w], [n, e]),
          origin: j.grids?.[name],
        })),
        grid: j.grid || null,
      }))
      .catch(() => ({ list: [], grid: null }))
  }
  return indexPromise
}

// [lat0, lon0, dlat1, dlon1, ...] in 1e-5 gradi → [lat, lon][]
function decode(arr, from) {
  const out = []
  let lat = 0
  let lon = 0
  for (let i = from; i + 1 < arr.length; i += 2) {
    lat += arr[i]
    lon += arr[i + 1]
    out.push([lat / 1e5, lon / 1e5])
  }
  return out
}

function loadTile(name) {
  if (!tiles.has(name)) {
    const p = fetch(`${HD_BASE}${name}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`isobate HD ${r.status}`)
        return r.json()
      })
      .then((j) => ({
        lines: j.lines.map((l) => ({ depth: l[0], path: decode(l, 1) })),
        cov: j.cov.map((c) => decode(c, 0)),
      }))
    p.catch(() => tiles.delete(name))
    tiles.set(name, p)
  }
  return tiles.get(name)
}

// Fonte predefinita: i tasselli Shom pubblicati con l'app. Altre fonti
// (es. le isobate multibeam della Regione Liguria) danno gli stessi
// { lines, cov } con names(vista) → nomi dei tasselli e load(nome)
export const SHOM_SOURCE = {
  names: (view) => loadIndex().then((index) => index.list.filter((t) => t.bounds.intersects(view)).map((t) => t.name)),
  load: loadTile,
}

// Ogni 5 m (e i bassi fondali) linea marcata con etichetta, gli altri metri
// sottili e solo da vicino: sulle coste ripide si accavallerebbero
const major = (depth) => depth <= 3 || depth % 5 === 0
const MINOR_ZOOM = 16

export const HdIsobathLayer = L.Layer.extend({
  options: {
    minZoom: 13,
    imagery: false,
    onCoverage: () => {},
    source: SHOM_SOURCE,
    attribution: '© Shom – Litto3D® (isobate HD)',
  },

  initialize(options) {
    L.setOptions(this, options)
    this._shown = new Map() // nome tassello -> { layers, lines, cov }
    this._lines = []
    this._cov = [] // anelli di copertura dei tasselli mostrati
    this._sentCov = undefined
  },

  onAdd(map) {
    ensurePane(map, PANE, 250)
    ensurePane(map, LABEL_PANE, 255)
    this._renderer = L.canvas({ pane: PANE, padding: 0.25 })
    this._group = L.layerGroup().addTo(map)
    this._minor = L.layerGroup()
    this._labels = L.layerGroup().addTo(map)
    map.on('moveend', this._update, this)
    this._update()
  },

  onRemove(map) {
    map.off('moveend', this._update, this)
    this._group.remove()
    this._minor.remove()
    this._labels.remove()
    this._group.clearLayers()
    this._minor.clearLayers()
    this._shown.clear()
    this._cov = []
    this._sendCoverage(null)
  },

  // Copertura alle isobate EMODnet solo quando cambia: ogni invio le fa
  // ridisegnare, e a ogni spostamento sarebbe un ridisegno in più
  _sendCoverage(cov) {
    if (cov === this._sentCov) return
    this._sentCov = cov
    this.options.onCoverage(cov)
  },

  setImagery(imagery) {
    if (imagery === this.options.imagery) return
    this.options.imagery = imagery
    const names = [...this._shown.keys()]
    this._group.clearLayers()
    this._minor.clearLayers()
    this._shown.clear()
    names.forEach((name) => this.options.source.load(name).then((t) => this._show(name, t)))
  },

  _update() {
    const map = this._map
    if (!map) return
    if (map.getZoom() < this.options.minZoom) {
      // Isobate HD nascoste: le EMODnet tornano anche nelle aree Shom
      this._group.remove()
      this._minor.remove()
      this._labels.clearLayers()
      this._sendCoverage(null)
      return
    }
    this._group.addTo(map)
    if (map.getZoom() >= MINOR_ZOOM) this._minor.addTo(map)
    else this._minor.remove()
    this._sendCoverage(this._cov)
    const view = map.getBounds().pad(0.3)
    const { source } = this.options
    source.names(view).then((names) => {
      if (!this._map) return
      for (const name of names) {
        if (this._shown.has(name)) continue
        source
          .load(name)
          .then((t) => this._show(name, t))
          .catch((err) => console.warn('Isobate HD non disponibili', err))
      }
      this._drawLabels()
    })
  },

  _show(name, tile) {
    if (!this._map || this._shown.has(name)) return
    const [shallowColor, deepColor] = this.options.imagery ? IMAGERY_COLORS : CHART_COLORS
    const lines = tile.lines.map(({ depth, path }) => {
      const strong = major(depth)
      const color = depth <= 10 ? shallowColor : deepColor
      const polyline = L.polyline(path, {
        renderer: this._renderer,
        color,
        weight: strong ? 1.4 : 0.6,
        opacity: strong ? 1 : 0.7,
        interactive: false,
      }).addTo(strong ? this._group : this._minor)
      return { polyline, depth, color, strong }
    })
    this._shown.set(name, { lines, cov: tile.cov })
    this._lines = [...this._shown.values()].flatMap((t) => t.lines.filter((l) => l.strong))
    this._cov = [...this._shown.values()].flatMap((t) => t.cov)
    this._sendCoverage(this._cov)
    this._drawLabels()
  },

  // Più tasselli in arrivo insieme: un solo calcolo delle etichette
  _drawLabels() {
    if (this._labelsQueued) return
    this._labelsQueued = true
    requestAnimationFrame(() => {
      this._labelsQueued = false
      this._placeLabels()
    })
  },

  _placeLabels() {
    if (!this._map || this._map.getZoom() < this.options.minZoom) return
    drawDepthLabels(this._map, this._labels, this._lines, {
      halo: this.options.imagery ? IMAGERY_COLORS[2] : CHART_COLORS[2],
      spacing: 220,
    })
  },
})
