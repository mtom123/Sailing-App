/**
 * Fasce di profondità di dettaglio (Liguria, Baleari): per ogni blocco di
 * 0,05° (~4 × 5,5 km) il worker ricostruisce una griglia a ~10 m dalle
 * isobate di dettaglio e dalla costa OSM, e la colora con le fasce
 * dell'utente (imageWorker.js → fineZones). Qui le immagini si mettono sulla
 * carta. Dove c'è il dettaglio, le fasce EMODnet (DepthZoneLayer) si
 * tagliano: onCoverage(anelli).
 *
 * Fonti (`sources`): oggetti { names(vista), load(nome) → { lines, cov } }
 * con blocchi "i,j" di 0,05° (liguriaIsobaths.js, baleariIsobaths.js).
 * In Liguria le isobate partono dai 5 m: più sotto la profondità è stimata
 * tra la riva e l'isobata, e le fasce più basse lì sono indicative. Alle
 * Baleari c'è un'isobata ogni metro da 1 m: anche le fasce basse sono misurate.
 */
import L from 'leaflet'
import { LIGURIA_ISOBATH_SOURCE } from './liguriaIsobaths.js'
import { waterRings } from './waterMask.js'
import { fineZonesImage } from './imagePixels.js'
import { DEPTH_ZONE_OPACITY } from './isobaths.js'
import { MaskedCanvas } from './isobathLayer.js'
import { mapAtRest } from './offlinePack.js'

const PANE = 'fineDepthZonePane'
const CELL = 0.05 // blocchi delle fonti (liguriaIsobaths.js, baleariIsobaths.js)
const WATER_ZOOM = 15 // dettaglio della costa OSM

export const FineDepthZoneLayer = L.Layer.extend({
  options: { minZoom: 13, zones: [], sources: [LIGURIA_ISOBATH_SOURCE], onCoverage: () => {} },

  initialize(options) {
    L.setOptions(this, options)
    this._shown = new Map() // chiave "fonte:i,j" -> { group (poligoni delle fasce), cov }
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
    // Fasce vettoriali (nitide a ogni zoom) su un canvas a risoluzione normale:
    // veli di colore, il dettaglio Retina non serve e su iPad la memoria è poca
    this._renderer = new MaskedCanvas({ pane: PANE, padding: 0.1, lowRes: true })
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
    s.group?.remove()
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
    const { sources } = this.options
    const lists = await Promise.all(sources.map((source) => source.names(view).catch(() => [])))
    if (gen !== this._gen || !this._map) return
    // La prima fonte tiene il nome della Liguria com'era (chiave della griglia nel worker)
    const blocks = lists.flatMap((names, k) => names.map((name) => ({ key: k ? `${k}:${name}` : name, name, source: sources[k] })))
    const wanted = new Set(blocks.map((b) => b.key))
    for (const key of [...this._shown.keys()]) if (!wanted.has(key)) this._drop(key)
    this._coverage()
    for (const block of blocks) {
      if (this._shown.has(block.key)) continue
      // Lavoro pesante: a carta ferma, un blocco alla volta
      await mapAtRest()
      if (gen !== this._gen || !this._map) return
      await this._show(block).catch((err) => console.warn('Fasce di dettaglio non disponibili', err))
      if (gen !== this._gen) return
    }
  },

  async _show({ key, name, source }) {
    const [i, j] = name.split(',').map(Number)
    const bbox = [j * CELL, i * CELL, (j + 1) * CELL, (i + 1) * CELL]
    const bounds = L.latLngBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]])
    const { lines } = await source.load(name)
    if (!lines.length) {
      this._shown.set(key, { cov: [] })
      return
    }
    const zones = this.options.zones
    const job = { key, bbox, zones }
    let res = await fineZonesImage(job)
    if (res === 'missing') {
      // Troppi tasselli di costa a quello zoom: un livello meno fine
      const water = (await waterRings(bounds, WATER_ZOOM)) || (await waterRings(bounds, WATER_ZOOM - 2)) || []
      if (!water.length) {
        this._shown.set(key, { cov: [] })
        return
      }
      res = await fineZonesImage({ ...job, lines, water })
    }
    if (!this._map || this._shown.has(key)) return
    // Il taglio delle fasce EMODnet segue l'area dove la griglia fine ha i dati
    const cov = res && res !== 'missing' ? res.cov : []
    if (!res || res === 'missing' || !res.zones.length) {
      this._shown.set(key, { cov })
      this._coverage()
      return
    }
    const group = L.layerGroup(
      res.zones.map((z) =>
        L.polygon(z.rings, {
          renderer: this._renderer,
          stroke: false,
          fillColor: z.color,
          fillOpacity: DEPTH_ZONE_OPACITY,
          interactive: false,
        })
      )
    ).addTo(this._map)
    this._shown.set(key, { group, cov })
    this._coverage()
  },
})
