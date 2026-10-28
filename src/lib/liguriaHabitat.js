/**
 * Tipi di fondale in Liguria — Nuovo Atlante degli Habitat Marini 2020
 * della Regione Liguria (1:10.000): posidonia, cymodocea, matte morta,
 * sabbie, roccia e coralligeno, colorati per chi deve dare fondo
 * (seagrass.js). Poligoni via WFS a blocchi fissi, tenuti in memoria.
 */
import L from 'leaflet'
import { LIGURIA_HABITAT_WFS_URL, LIGURIA_HABITAT_LAYER, LIGURIA_BOUNDS, liguriaHabitatStyle } from './seagrass.js'

const PANE = 'habitatPane'
const CELL = 0.1 // gradi: ~8 × 11 km, ~0,5 MB compressi
const MAX_CELLS = 16
const AREA = L.latLngBounds(LIGURIA_BOUNDS)

const cells = new Map() // "i,j" -> Promise<GeoJSON features>

// Coordinate in EPSG:3857: niente dubbi sull'ordine lat/lon del WFS 2.0
const toLatLng = (c) => L.CRS.EPSG3857.unproject(L.point(c[0], c[1]))

function loadCell(i, j) {
  const key = `${i},${j}`
  if (!cells.has(key)) {
    const sw = L.CRS.EPSG3857.project(L.latLng(j * CELL, i * CELL))
    const ne = L.CRS.EPSG3857.project(L.latLng((j + 1) * CELL, (i + 1) * CELL))
    const url =
      `${LIGURIA_HABITAT_WFS_URL}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${LIGURIA_HABITAT_LAYER}` +
      `&outputFormat=application/json&srsName=EPSG:3857&propertyName=CLASSE,DESCRIZIONE,GEOMETRY` +
      `&bbox=${sw.x},${sw.y},${ne.x},${ne.y},EPSG:3857`
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Regione Liguria WFS ${r.status}`)
        return r.json()
      })
      .then((json) => json.features || [])
    p.catch(() => cells.delete(key))
    cells.set(key, p)
  }
  return cells.get(key)
}

export const LiguriaHabitatLayer = L.Layer.extend({
  options: {
    minZoom: 12,
    attribution: '© Regione Liguria – Atlante Habitat Marini 2020',
  },

  onAdd(map) {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE)
      pane.style.zIndex = 245 // sopra il rilievo Shom, sotto le isobate
      pane.style.pointerEvents = 'none'
    }
    this._renderer = L.canvas({ pane: PANE, padding: 0.5 })
    this._group = L.layerGroup()
    this._drawn = new Set() // id dei poligoni già sulla mappa
    map.on('moveend', this._update, this)
    this._update()
  },

  onRemove(map) {
    map.off('moveend', this._update, this)
    this._group.remove()
    this._group.clearLayers()
  },

  _update() {
    const map = this._map
    if (!map) return
    const visible = map.getZoom() >= this.options.minZoom
    if (!visible) {
      this._group.remove()
      return
    }
    this._group.addTo(map)
    const b = map.getBounds().pad(0.2)
    if (!AREA.intersects(b)) return
    const i0 = Math.floor(Math.max(b.getWest(), AREA.getWest()) / CELL)
    const i1 = Math.floor(Math.min(b.getEast(), AREA.getEast()) / CELL)
    const j0 = Math.floor(Math.max(b.getSouth(), AREA.getSouth()) / CELL)
    const j1 = Math.floor(Math.min(b.getNorth(), AREA.getNorth()) / CELL)
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_CELLS) return
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        loadCell(i, j)
          .then((features) => this._add(features))
          .catch((err) => console.warn('Atlante habitat Liguria non disponibile', err))
      }
    }
  },

  // Un poligono può stare in due blocchi: si disegna una volta sola
  _add(features) {
    if (!this._map) return
    for (const f of features) {
      if (this._drawn.has(f.id)) continue
      const style = liguriaHabitatStyle(f.properties.CLASSE)
      if (!style) continue
      this._drawn.add(f.id)
      L.geoJSON(f, {
        renderer: this._renderer,
        interactive: false,
        style: () => style,
        coordsToLatLng: toLatLng,
      }).addTo(this._group)
    }
  },
})
