/**
 * Tipi di fondale in Liguria — Nuovo Atlante degli Habitat Marini 2020
 * della Regione Liguria (1:10.000): posidonia, cymodocea, matte morta,
 * sabbie, roccia e coralligeno, colorati per chi deve dare fondo
 * (seagrass.js). Poligoni via WFS a blocchi fissi, tenuti in memoria.
 */
import L from 'leaflet'
import { MaskedCanvas } from './isobathLayer.js'
import {
  LIGURIA_HABITAT_WFS_URL,
  LIGURIA_HABITAT_WMS_URL,
  LIGURIA_HABITAT_LAYER,
  LIGURIA_BOUNDS,
  LIGURIA_POSIDONIA_CQL,
  POSIDONIA_RGB,
  liguriaHabitatStyle,
} from './seagrass.js'
import { tintedBitmap } from './imagePixels.js'

const PANE = 'habitatPane'
const CELL = 0.1 // gradi: ~8 × 11 km, ~0,5 MB compressi (diversi MB da leggere)
const MAX_CELLS = 6 // blocchi nella vista: oltre, zoom troppo largo
const KEEP_CELLS = 12 // blocchi tenuti in memoria
const AREA = L.latLngBounds(LIGURIA_BOUNDS)

const cells = new Map() // "i,j" -> Promise<GeoJSON features> (i più recenti in fondo)

// Coordinate in EPSG:3857: niente dubbi sull'ordine lat/lon del WFS 2.0
const toLatLng = (c) => L.CRS.EPSG3857.unproject(L.point(c[0], c[1]))

function loadCell(i, j) {
  const key = `${i},${j}`
  if (cells.has(key)) {
    // Usato di nuovo: in fondo alla coda, l'ultimo a uscire
    const p = cells.get(key)
    cells.delete(key)
    cells.set(key, p)
    return p
  }
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
  if (cells.size > KEEP_CELLS) cells.delete(cells.keys().next().value)
  return p
}

/*
 * Su iPad i poligoni dell'Atlante sono pesanti (migliaia, molto dettagliati):
 * da zoom 14 (dove servono per dare fondo; prima c'è la posidonia EMODnet in
 * immagine) e sulla carta solo i blocchi della vista, tolti quando si esce.
 */
export const LiguriaHabitatLayer = L.Layer.extend({
  options: {
    minZoom: 14,
    attribution: '© Regione Liguria – Atlante Habitat Marini 2020',
  },

  onAdd(map) {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE)
      pane.style.zIndex = 245 // sopra il rilievo Shom, sotto le isobate
      pane.style.pointerEvents = 'none'
    }
    this._renderer = new MaskedCanvas({ pane: PANE, padding: 0.1, lowRes: true })
    this._group = L.layerGroup()
    this._cellGroups = new Map() // "i,j" -> layerGroup dei poligoni del blocco
    map.on('moveend', this._update, this)
    this._update()
  },

  onRemove(map) {
    map.off('moveend', this._update, this)
    this._group.remove()
    this._group.clearLayers()
    this._cellGroups.clear()
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
    const b = map.getBounds().pad(0.1)
    if (!AREA.intersects(b)) return
    const i0 = Math.floor(Math.max(b.getWest(), AREA.getWest()) / CELL)
    const i1 = Math.floor(Math.min(b.getEast(), AREA.getEast()) / CELL)
    const j0 = Math.floor(Math.max(b.getSouth(), AREA.getSouth()) / CELL)
    const j1 = Math.floor(Math.min(b.getNorth(), AREA.getNorth()) / CELL)
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_CELLS) return
    const wanted = new Set()
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) wanted.add(`${i},${j}`)
    // Via dalla carta i blocchi usciti dalla vista
    for (const [key, g] of this._cellGroups) {
      if (!wanted.has(key)) {
        this._group.removeLayer(g)
        this._cellGroups.delete(key)
      }
    }
    for (const key of wanted) {
      if (this._cellGroups.has(key)) continue
      const g = L.layerGroup()
      this._cellGroups.set(key, g)
      const [i, j] = key.split(',').map(Number)
      loadCell(i, j)
        .then((features) => this._add(key, g, features))
        .catch((err) => console.warn('Atlante habitat Liguria non disponibile', err))
    }
  },

  // Un poligono può stare in due blocchi: si disegna nel primo che lo porta
  _add(key, g, features) {
    if (!this._map || this._cellGroups.get(key) !== g) return
    const drawn = new Set()
    for (const other of this._cellGroups.values()) other.eachLayer((l) => l.featureId && drawn.add(l.featureId))
    for (const f of features) {
      if (drawn.has(f.id)) continue
      const style = liguriaHabitatStyle(f.properties.CLASSE)
      if (!style) continue
      const layer = L.geoJSON(f, {
        renderer: this._renderer,
        interactive: false,
        style: () => style,
        coordsToLatLng: toLatLng,
      })
      layer.featureId = f.id
      layer.addTo(g)
    }
    g.addTo(this._group)
  },
})

/*
 * Vista d'insieme della posidonia ligure (zoom 10–13, prima dei poligoni
 * dell'Atlante): immagini del server della Regione con le sole praterie,
 * ricolorate nel worker col verde della posidonia.
 */
const OVERVIEW_TILE = 512
export const LiguriaPosidoniaOverview = L.GridLayer.extend({
  options: {
    tileSize: OVERVIEW_TILE,
    minZoom: 10,
    maxZoom: 13,
    bounds: AREA,
    pane: PANE,
    updateWhenZooming: false,
    updateWhenIdle: true,
    attribution: '© Regione Liguria – Atlante Habitat Marini 2020',
  },

  initialize(options) {
    L.setOptions(this, options)
    this.on('tileunload', ({ tile }) => {
      tile.width = 0
      tile.height = 0
    })
  },

  onAdd(map) {
    if (!map.getPane(PANE)) {
      const pane = map.createPane(PANE)
      pane.style.zIndex = 245
      pane.style.pointerEvents = 'none'
    }
    L.GridLayer.prototype.onAdd.call(this, map)
  },

  createTile(coords, done) {
    const tile = document.createElement('canvas')
    tile.width = OVERVIEW_TILE
    tile.height = OVERVIEW_TILE
    const b = this._tileCoordsToBounds(coords)
    const sw = L.CRS.EPSG3857.project(b.getSouthWest())
    const ne = L.CRS.EPSG3857.project(b.getNorthEast())
    const url =
      `${LIGURIA_HABITAT_WMS_URL}?service=WMS&version=1.1.1&request=GetMap&layers=${LIGURIA_HABITAT_LAYER}&styles=` +
      `&format=image/png&transparent=true&srs=EPSG:3857&bbox=${sw.x},${sw.y},${ne.x},${ne.y}` +
      `&width=${OVERVIEW_TILE}&height=${OVERVIEW_TILE}&CQL_FILTER=${encodeURIComponent(LIGURIA_POSIDONIA_CQL)}`
    tintedBitmap(url, POSIDONIA_RGB, 0.55)
      .then((bitmap) => {
        if (bitmap && this._map) tile.getContext('2d').drawImage(bitmap, 0, 0)
        bitmap?.close()
        done(null, tile)
      })
      .catch((err) => done(err, tile))
    return tile
  },
})
