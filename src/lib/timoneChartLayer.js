/*
 * Sfondo "Carta TIMONE" della mappa Leaflet, leggero: MapLibre (timoneChart.js)
 * si scarica solo quando serve. Se l'iPad non ha WebGL, se il modulo non si
 * carica o se il contesto WebGL si perde (memoria di Safari), lo strato si
 * sostituisce da solo con la carta di riserva (options.fallback(), la carta
 * Esri) e lo dice con options.onFallback(motivo).
 */
import L from 'leaflet'

function webglOk() {
  try {
    const c = document.createElement('canvas')
    const ok = !!(c.getContext('webgl2') || c.getContext('webgl'))
    c.width = c.height = 0
    return ok
  } catch {
    return false
  }
}

export const TimoneChartLayer = L.Layer.extend({
  // options: safety, seamarks, fallback() → strato Leaflet, onFallback(motivo)
  initialize(options) {
    L.setOptions(this, options)
  },

  onAdd(map) {
    this._alive = true
    if (this._failed) return this._showFallback()
    if (!webglOk()) return this._fail('WebGL assente')
    import('./timoneChart.js')
      .then(({ timoneChart }) => {
        if (!this._alive || this._failed) return
        this._gl = timoneChart({
          safety: this.options.safety,
          seamarks: this.options.seamarks,
          onLost: (why) => this._alive && this._fail(why),
        })
        map.addLayer(this._gl)
      })
      .catch((err) => this._fail(err?.message || 'modulo non caricato'))
  },

  onRemove(map) {
    this._alive = false
    if (this._gl && map.hasLayer(this._gl)) map.removeLayer(this._gl)
    this._gl = null
    if (this._fb && map.hasLayer(this._fb)) map.removeLayer(this._fb)
  },

  setSafety(safety) {
    this.options.safety = safety
    this._gl?.setSafety(safety)
  },

  setSeamarks(on) {
    this.options.seamarks = on
    this._gl?.setSeamarks(on)
  },

  failed() {
    return !!this._failed
  },

  _fail(why) {
    if (this._failed) return
    this._failed = why || 'errore'
    console.warn('Carta TIMONE non disponibile, uso la carta di riserva:', this._failed)
    const map = this._map
    if (map && this._gl && map.hasLayer(this._gl)) {
      try {
        map.removeLayer(this._gl)
      } catch {}
    }
    this._gl = null
    if (this._alive) this._showFallback()
    this.options.onFallback?.(this._failed)
  },

  _showFallback() {
    if (!this._map) return
    if (!this._fb) this._fb = this.options.fallback()
    if (!this._map.hasLayer(this._fb)) this._map.addLayer(this._fb)
  },
})
