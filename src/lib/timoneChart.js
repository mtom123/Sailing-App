/*
 * Carta TIMONE come sfondo della mappa Leaflet: una mappa MapLibre sotto
 * tutti gli altri strati, mossa da Leaflet (plugin maplibre-gl-leaflet).
 *
 * Base nautica Open Waters (terra, costa, fari, boe, pericoli) e sopra i
 * fondali TIMONE: il file PMTiles su Cloudflare R2 (tools/chart-tiles.mjs).
 * Lo stile dei fondali è lo stesso di public/prova-carta.html: se cambia
 * lì, va cambiato anche qui.
 *
 * Questo modulo è grande (MapLibre) e si carica solo quando serve, da
 * timoneChartLayer.js, che pensa anche al ripiego sulla carta Esri.
 * Ogni richiesta della carta passa dal protocollo timone:// (chartCache.js),
 * che salva tutto nell'archivio: così la carta c'è anche senza rete.
 */
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { cartaSource, chartProtocol, chartStyle } from './chartCache.js'

// Il nome del worker MapLibre lo calcola la libreria dal proprio indirizzo:
// impacchettata da Vite non lo trova, quindi glielo diamo noi
maplibregl.setWorkerUrl(workerUrl)
maplibregl.addProtocol('timone', chartProtocol)

// Fondali della base Open Waters: al loro posto quelli TIMONE
const OW_DEPTH = ['depth-shading', 'depth-areas', 'unsurveyed', 'depth-hillshade', 'contour-lines', 'contour-labels', 'soundings']
// Zone vietate e consentite: le disegna già TIMONE, con regole e stagioni
const OW_ZONES = ['allowed-areas', 'allowed-areas-labels', 'restricted-areas', 'restricted-areas-stubs', 'restricted-areas-label', 'restricted-areas-fill', 'restricted-areas-fill-pattern']
// Fari, boe e segnali: si accendono e spengono con "Fari e boe"
const isSeamark = (layer) => layer.source === 'seamap' && (layer['source-layer'] === 'seamark' || layer['source-layer'] === 'light') && !OW_ZONES.includes(layer.id)

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
const safetyContour = (safety) => LEVELS.find((d) => d >= safety) ?? 20
// Più è basso più è blu, al largo bianco (come le carte di giorno)
const bandColor = (safety) => [
  'step', ['get', 'd'],
  '#5b9bd5', // fino a metà del fondale di sicurezza
  Math.max(1, safety / 2) + 0.01, '#86bde9',
  safety + 0.01, '#b3d6f3', // oltre il fondale di sicurezza
  safety * 2 + 0.01, '#cfe6f8',
  20.01, '#dff0fc',
  50.01, '#e9f7ff', // il mare della carta di base: nessuno stacco ai bordi
]
const soundingColor = (safety) => ['case', ['<=', ['get', 'd'], safety], '#0b2545', ['==', ['get', 'q'], 1], '#4a5a6a', '#7d8a96']

function hatch() {
  const c = document.createElement('canvas')
  c.width = c.height = 16
  const g = c.getContext('2d')
  g.strokeStyle = 'rgba(110,120,130,0.55)'
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(0, 16); g.lineTo(16, 0); g.moveTo(-4, 4); g.lineTo(4, -4); g.moveTo(12, 20); g.lineTo(20, 12)
  g.stroke()
  const data = g.getImageData(0, 0, 16, 16)
  c.width = c.height = 0
  return data
}

// Puntinato della «stima» (fondale non misurato): più leggero del tratteggio
function dots() {
  const c = document.createElement('canvas')
  c.width = c.height = 12
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(80,95,110,0.55)'
  g.beginPath()
  g.arc(3, 3, 1.1, 0, 2 * Math.PI)
  g.arc(9, 9, 1.1, 0, 2 * Math.PI)
  g.fill()
  const data = g.getImageData(0, 0, 12, 12)
  c.width = c.height = 0
  return data
}

async function addTimoneDepths(gl, safety) {
  const source = await cartaSource().catch(() => null)
  if (!gl.getStyle() || !source) return ''
  gl.addImage('hatch', hatch())
  gl.addImage('dots', dots())
  gl.addSource('carta', source)
  const before = gl.getLayer('land_area') ? 'land_area' : undefined // la terra copre fasce e linee
  gl.addLayer({
    id: 'carta-depare', type: 'fill', source: 'carta', 'source-layer': 'depare',
    layout: { 'fill-sort-key': ['-', 0, ['get', 'd']] }, // dalla più profonda alla più bassa
    paint: { 'fill-color': bandColor(safety), 'fill-antialias': false },
  }, before)
  gl.addLayer({ id: 'carta-nodata', type: 'fill', source: 'carta', 'source-layer': 'nodata', paint: { 'fill-pattern': 'hatch', 'fill-color': '#d9dde1' } }, before)
  // fondale a stima (EMODnet sbaglia la costa): le fasce restano, sopra un puntinato
  gl.addLayer({ id: 'carta-estimate', type: 'fill', source: 'carta', 'source-layer': 'estimate', paint: { 'fill-pattern': 'dots' } }, before)
  gl.addLayer({
    id: 'carta-depcnt', type: 'line', source: 'carta', 'source-layer': 'depcnt',
    paint: {
      'line-color': ['case', ['==', ['get', 'q'], 1], '#3e6e9c', '#6d8fae'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 13, ['case', ['==', ['%', ['get', 'd'], 5], 0], 1.1, 0.6], 17, ['case', ['==', ['%', ['get', 'd'], 5], 0], 1.6, 0.9]],
      'line-opacity': ['case', ['==', ['get', 'q'], 1], 0.9, 0.6],
    },
  }, before)
  gl.addLayer({
    id: 'carta-safety', type: 'line', source: 'carta', 'source-layer': 'depcnt',
    filter: ['==', ['get', 'd'], safetyContour(safety)],
    paint: { 'line-color': '#12355b', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 2.4] },
  }, before)
  gl.addLayer({
    id: 'carta-labels', type: 'symbol', source: 'carta', 'source-layer': 'depcnt', minzoom: 11,
    layout: {
      'symbol-placement': 'line', 'text-field': ['to-string', ['get', 'd']], 'text-font': ['Noto Sans Medium'],
      'text-size': 11, 'text-max-angle': 25, 'symbol-spacing': 280, 'text-keep-upright': true,
    },
    paint: { 'text-color': '#2f5b85', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.4 },
  })
  gl.addLayer({
    id: 'carta-estimate-label', type: 'symbol', source: 'carta', 'source-layer': 'estimate', minzoom: 13,
    layout: { 'text-field': 'stima', 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-padding': 20 },
    paint: { 'text-color': '#55687a', 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1.2 },
  })
  gl.addLayer({
    id: 'carta-soundg', type: 'symbol', source: 'carta', 'source-layer': 'soundg', minzoom: 9,
    layout: {
      'text-field': ['number-format', ['get', 'd'], { locale: 'it-IT', 'max-fraction-digits': 1 }],
      'text-font': ['Noto Sans Medium'], 'text-size': ['interpolate', ['linear'], ['zoom'], 10, 9, 16, 12],
      'symbol-sort-key': ['get', 'd'], 'text-padding': 6,
    },
    paint: { 'text-color': soundingColor(safety), 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1 },
  })
  return source.attribution || ''
}

// Strato Leaflet. options: safety (m), seamarks (bool), onLost() se WebGL cade
export const TimoneGL = MaplibreGL.extend({
  onAdd(map) {
    MaplibreGL.prototype.onAdd.call(this, map)
    const gl = this._glMap
    // Trasparente ai tocchi, come le immagini delle carte di Leaflet: MapLibre
    // ascolta i tocchi sul suo riquadro anche se non interattivo, e su iPad la
    // pressione lunga (profondità, vento, corrente) non arrivava più alla carta
    this._container.style.pointerEvents = 'none'
    gl.getCanvas().style.pointerEvents = 'none'
    // Anche gl.remove() perde il contesto apposta: quello non è un guasto
    gl.getCanvas().addEventListener('webglcontextlost', () => {
      if (!this._removing) this.options.onLost?.('webgl perso')
    })
    gl.on('error', (e) => console.warn('Carta TIMONE:', e?.error?.message || e))
    gl.once('load', async () => {
      for (const id of [...OW_DEPTH, ...OW_ZONES]) if (gl.getLayer(id)) gl.setLayoutProperty(id, 'visibility', 'none')
      // Sfondo trasparente: dove la carta non arriva (offline) si vede la
      // carta di riserva di Leaflet (costa OSM), non un mare vuoto
      if (gl.getLayer('background')) gl.setLayoutProperty('background', 'visibility', 'none')
      this._applySeamarks()
      const credits = await addTimoneDepths(gl, this.options.safety)
      this._ready = true
      this._applySafety()
      // crediti delle fonti dei fondali TIMONE (dal file della carta)
      this._credits = credits
      if (credits && this._map) this._map.attributionControl?.addAttribution(credits)
    })
  },

  onRemove(map) {
    if (this._credits) map.attributionControl?.removeAttribution(this._credits)
    this._ready = false
    this._removing = true
    MaplibreGL.prototype.onRemove.call(this, map)
  },

  setSafety(safety) {
    if (safety === this.options.safety) return
    this.options.safety = safety
    this._applySafety()
  },

  setSeamarks(on) {
    if (on === this.options.seamarks) return
    this.options.seamarks = on
    this._applySeamarks()
  },

  _applySafety() {
    const gl = this._glMap
    if (!gl || !this._ready || !gl.getLayer('carta-depare')) return
    const s = this.options.safety
    gl.setPaintProperty('carta-depare', 'fill-color', bandColor(s))
    gl.setFilter('carta-safety', ['==', ['get', 'd'], safetyContour(s)])
    gl.setPaintProperty('carta-soundg', 'text-color', soundingColor(s))
  },

  _applySeamarks() {
    const gl = this._glMap
    const style = gl?.getStyle()
    if (!style) return
    const vis = this.options.seamarks ? 'visible' : 'none'
    for (const layer of style.layers) if (isSeamark(layer)) gl.setLayoutProperty(layer.id, 'visibility', vis)
  },
})

// Lo stile si prepara prima (indirizzi su timone://, anche dall'archivio offline)
export async function timoneChart({ safety, seamarks, onLost }) {
  const style = await chartStyle()
  return new TimoneGL({
    style,
    safety,
    seamarks,
    onLost,
    // iPad: canvas WebGL poco più grande della vista e al massimo retina 2×
    padding: 0.05,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    maxTileCacheSize: 120,
    fadeDuration: 0,
  })
}
