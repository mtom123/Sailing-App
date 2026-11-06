/**
 * Livello Leaflet delle aree protette e zone militari (protectedAreas.js),
 * con i contorni veri da OpenStreetMap: magenta le zone vietate (zone A),
 * arancio le aree marine protette e le loro zone B/C, rosso tratteggiato i
 * poligoni militari. Ridisegnato a ogni spostamento, da MIN_ZOOM. Da
 * LETTERS_MIN_ZOOM le zone A, B e C hanno la loro lettera sparsa su tutta la
 * superficie.
 */
import L from 'leaflet'
import { inArea, protectedAreas } from './protectedAreas.js'

const MIN_ZOOM = 9
const LETTERS_MIN_ZOOM = 11
const LETTERS_PANE = 'ampLettersPane'
const LETTER_SCAN_PX = 16 // passo della ricerca: le zone sono spesso strisce strette lungo costa
const LETTER_GAP_PX = 90 // distanza tra due lettere uguali
const MAX_LETTERS = 150
const LETTERS_DELAY_MS = 400
const ZONE_NAME = /\b[Zz]on[ae]\s*([ABC])\b/
const LETTER_COLORS = { A: '#C2185B', B: '#D84315', C: '#8D6E00' }
const STYLE = {
  nogo: { color: '#E040FB', weight: 2, fillOpacity: 0.22 },
  protected: { color: '#D97757', weight: 1.5, dashArray: '6 4', fillOpacity: 0.06 },
  military: { color: '#FF5252', weight: 1.5, dashArray: '3 5', fillOpacity: 0.08 },
}
const DESCRIPTION = {
  nogo: 'Zona vietata: niente navigazione, ancoraggio né balneazione',
  protected: 'Navigazione con regole (velocità, ancoraggio, pesca)',
  military: 'Zona militare: vietata durante le esercitazioni, verifica gli avvisi ai naviganti',
}
// Le zone più restrittive sopra (e cliccabili per prime)
const ORDER = { protected: 0, military: 1, nogo: 2 }

export const ProtectedAreasLayer = L.Layer.extend({
  // options.popup(area) → HTML della scheda; options.interactive
  initialize(options) {
    L.setOptions(this, options)
    this._gen = 0
  },

  setInteractive(interactive) {
    if (this.options.interactive === interactive) return
    this.options.interactive = interactive
    if (this._map) this._update()
  },

  onAdd(map) {
    // SVG, non canvas: su iPad i canvas grandi quanto la mappa esauriscono la
    // memoria di Safari e la carta diventa nera
    this._renderer = L.svg({ padding: 0.2 })
    if (!map.getPane(LETTERS_PANE)) {
      const pane = map.createPane(LETTERS_PANE)
      pane.style.zIndex = 430
      pane.style.pointerEvents = 'none'
    }
    this._group = L.layerGroup().addTo(map)
    map.on('moveend', this._update, this)
    this._update()
  },

  onRemove(map) {
    map.off('moveend', this._update, this)
    this._gen++
    this._group.remove()
  },

  async _update() {
    const map = this._map
    if (!map) return
    const gen = ++this._gen
    if (map.getZoom() < MIN_ZOOM) {
      this._group.clearLayers()
      return
    }
    const b = map.getBounds().pad(0.2)
    const areas = await protectedAreas([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()])
    if (gen !== this._gen || !this._map) return
    this._group.clearLayers()
    for (const area of [...areas].sort((x, y) => ORDER[x.kind] - ORDER[y.kind])) {
      const style = STYLE[area.kind]
      const poly = L.polygon(area.rings, {
        ...style,
        fillColor: style.color,
        renderer: this._renderer,
        // Tracciando la rotta il tocco deve aggiungere il waypoint
        interactive: !!this.options.interactive,
      })
      if (this.options.interactive) poly.bindPopup(() => this.options.popup(area, DESCRIPTION[area.kind], areas), { maxWidth: 320 })
      poly.addTo(this._group)
    }
    if (map.getZoom() < LETTERS_MIN_ZOOM) return
    // Dopo il gesto: se la carta si muove ancora, questo giro non serve più
    await new Promise((resolve) => setTimeout(resolve, LETTERS_DELAY_MS))
    if (gen === this._gen && this._map) this._drawLetters(areas)
  },

  // Una zona alla volta, solo nel suo riquadro: a passo fitto, perché spesso è
  // una striscia stretta lungo costa, tenendo una lettera per riquadro
  _drawLetters(areas) {
    const map = this._map
    const zoom = map.getZoom()
    const view = map.getBounds()
    const zones = areas.filter((a) => ZONE_NAME.test(a.name))
    const forbidden = areas.filter((a) => a.kind === 'nogo')
    const taken = new Set()
    for (const zone of zones) {
      const letter = ZONE_NAME.exec(zone.name)[1]
      const [s, w, n, e] = zone.bbox
      const top = map.project([Math.min(n, view.getNorth()), Math.max(w, view.getWest())], zoom)
      const bottom = map.project([Math.max(s, view.getSouth()), Math.min(e, view.getEast())], zoom)
      for (let y = Math.floor(top.y / LETTER_SCAN_PX) * LETTER_SCAN_PX; y <= bottom.y; y += LETTER_SCAN_PX) {
        for (let x = Math.floor(top.x / LETTER_SCAN_PX) * LETTER_SCAN_PX; x <= bottom.x; x += LETTER_SCAN_PX) {
          const cell = `${letter}${Math.floor(x / LETTER_GAP_PX)},${Math.floor(y / LETTER_GAP_PX)}`
          if (taken.has(cell)) continue
          const ll = map.unproject([x, y], zoom)
          if (!inArea(zone, ll.lat, ll.lng)) continue
          // Dentro una zona vietata vale la sua lettera
          if (zone.kind !== 'nogo' && forbidden.some((z) => inArea(z, ll.lat, ll.lng))) continue
          if (taken.size >= MAX_LETTERS) return
          taken.add(cell)
          L.marker(ll, {
            pane: LETTERS_PANE,
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: 'timone-marker',
              html: `<div style="width:20px;line-height:20px;text-align:center;font-size:16px;font-weight:800;color:${LETTER_COLORS[letter]};text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff">${letter}</div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            }),
          }).addTo(this._group)
        }
      }
    }
  },
})
