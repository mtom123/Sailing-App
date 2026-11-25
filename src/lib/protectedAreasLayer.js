/**
 * Livello Leaflet delle aree protette e zone militari (protectedAreas.js),
 * con i contorni veri da OpenStreetMap e le zone ufficiali dei parchi
 * (park-zones.json): magenta le zone vietate (zone A, MA), arancio le aree
 * marine protette e le loro zone, rosso tratteggiato i poligoni militari,
 * azzurro i semplici divieti di ancoraggio e pesca (cavi, condotte), viola a
 * tratto e punto i divieti di ancoraggio delle ordinanze (ordinance-zones.json),
 * sbiaditi fuori stagione.
 * Ridisegnato a ogni spostamento, da MIN_ZOOM. Da LETTERS_MIN_ZOOM le zone
 * hanno la loro sigla (A, B, C, MA…MD) sparsa su tutta la superficie.
 */
import L from 'leaflet'
import { ruleTiming } from '../data/coastRules.js'
import { inArea, protectedAreas } from './protectedAreas.js'

const MIN_ZOOM = 9
const LETTERS_MIN_ZOOM = 11
const LETTERS_PANE = 'ampLettersPane'
const LETTER_SCAN_PX = 16 // passo della ricerca: le zone sono spesso strisce strette lungo costa
const LETTER_GAP_PX = 90 // distanza tra due lettere uguali
const LETTER_MIN_PX = 40 // distanza minima tra due sigle qualsiasi
const MAX_LETTERS = 150
const LETTERS_DELAY_MS = 400
const ZONE_NAME = /\b[Zz]on[ae]\s*(M[ABCD]|[ABC])\b/
const LETTER_COLORS = { A: '#C2185B', B: '#D84315', C: '#8D6E00', MA: '#C2185B', MB: '#D84315', MC: '#8D6E00', MD: '#5D6D7E' }
const STYLE = {
  nogo: { color: '#E040FB', weight: 2, fillOpacity: 0.22 },
  protected: { color: '#D97757', weight: 1.5, dashArray: '6 4', fillOpacity: 0.06 },
  military: { color: '#FF5252', weight: 1.5, dashArray: '3 5', fillOpacity: 0.08 },
  restricted: { color: '#7FA7C9', weight: 1.2, dashArray: '2 4', fillOpacity: 0.05 },
}
// Divieto di ancoraggio da un'ordinanza: viola a tratto e punto, per non
// confondersi con la fascia dei bagnanti (rosso tratteggiato) e le zone
// vietate (magenta pieno). La linea del limite in mare (area.limit, come
// "dal molo alla foce") si vede sempre, come sulle carte nautiche; fuori
// stagione si schiarisce solo la tinta della zona
const ORDINANCE_COLOR = '#7C3AED'
const ORDINANCE = { color: ORDINANCE_COLOR, weight: 2.4, opacity: 0.95, dashArray: '10 4 2 4', fillOpacity: 0.14 }
const ORDINANCE_OFF = { ...ORDINANCE, opacity: 0.8, fillOpacity: 0.06 }
const LIMIT = { color: ORDINANCE_COLOR, weight: 3.5, opacity: 1, dashArray: '12 6', lineCap: 'butt' }
const LIMIT_LABEL_MIN_ZOOM = 14
const inSeason = (area) => !area.season || ruleTiming(area).inSeason
function styleOf(area) {
  if (!area.source) return STYLE[area.kind]
  const style = inSeason(area) ? ORDINANCE : ORDINANCE_OFF
  // con la linea del limite, il bordo lungo la riva non serve
  return area.limit ? { ...style, stroke: false } : style
}
const DESCRIPTION = {
  nogo: 'Zona vietata: niente navigazione, ancoraggio né balneazione',
  protected: 'Navigazione con regole (velocità, ancoraggio, pesca)',
  military: 'Zona militare: vietata durante le esercitazioni, verifica gli avvisi ai naviganti',
  restricted: 'Divieto segnato sulle carte nautiche, di solito sopra cavi o condotte sottomarine: il transito è libero',
}
// Le zone più restrittive sopra (e cliccabili per prime)
const ORDER = { restricted: 0, protected: 1, military: 2, nogo: 3 }

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
    // Le zone inserite a mano le disegna MapView, con la scheda per toglierle
    const areas = (await protectedAreas([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()])).filter((a) => !a.user)
    if (gen !== this._gen || !this._map) return
    this._group.clearLayers()
    for (const area of [...areas].sort((x, y) => ORDER[x.kind] - ORDER[y.kind])) {
      const style = styleOf(area)
      const poly = L.polygon(area.rings, {
        ...style,
        fillColor: style.color,
        renderer: this._renderer,
        // Tracciando la rotta il tocco deve aggiungere il waypoint
        interactive: !!this.options.interactive,
      })
      if (this.options.interactive) poly.bindPopup(() => this.options.popup(area, DESCRIPTION[area.kind], areas), { maxWidth: 320 })
      poly.addTo(this._group)
      for (const line of area.limit || []) this._drawLimit(area, line, areas)
    }
    if (map.getZoom() < LETTERS_MIN_ZOOM) return
    // Dopo il gesto: se la carta si muove ancora, questo giro non serve più
    await new Promise((resolve) => setTimeout(resolve, LETTERS_DELAY_MS))
    if (gen === this._gen && this._map) this._drawLetters(areas)
  },

  // Limite in mare di un divieto d'ordinanza: linea piena di colore e, da
  // vicino, la scritta a metà
  _drawLimit(area, line, areas) {
    const map = this._map
    const pl = L.polyline(line, { ...LIMIT, renderer: this._renderer, interactive: !!this.options.interactive })
    if (this.options.interactive) pl.bindPopup(() => this.options.popup(area, DESCRIPTION[area.kind], areas), { maxWidth: 320 })
    pl.addTo(this._group)
    if (map.getZoom() < LIMIT_LABEL_MIN_ZOOM) return
    const a = map.latLngToLayerPoint(line[0])
    const b = map.latLngToLayerPoint(line[line.length - 1])
    let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    if (deg > 90) deg -= 180
    if (deg < -90) deg += 180
    const mid = L.latLng((line[0][0] + line[line.length - 1][0]) / 2, (line[0][1] + line[line.length - 1][1]) / 2)
    L.marker(mid, {
      pane: LETTERS_PANE,
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: 'timone-marker',
        // ruota attorno al punto della linea, la scritta appena sopra
        html: `<div style="position:absolute;left:0;top:0;width:0;height:0;transform:rotate(${deg.toFixed(1)}deg)"><div style="position:absolute;left:0;bottom:4px;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:700;color:${ORDINANCE_COLOR};text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff">divieto di ancoraggio${inSeason(area) ? '' : ' · stagione balneare'}</div></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    }).addTo(this._group)
  },

  // Una zona alla volta, solo nel suo riquadro: a passo fitto, perché spesso è
  // una striscia stretta lungo costa, tenendo una lettera per riquadro
  _drawLetters(areas) {
    const map = this._map
    const zoom = map.getZoom()
    const view = map.getBounds()
    // Prima le zone vietate, poi le piccole (strisce lungo costa), che hanno
    // meno posto; sigle di zone vicine mai accavallate (LETTER_MIN_PX)
    const bboxArea = ([s, w, n, e]) => (n - s) * (e - w)
    const zones = areas
      .filter((a) => ZONE_NAME.test(a.name))
      .sort((a, b) => (b.kind === 'nogo') - (a.kind === 'nogo') || bboxArea(a.bbox) - bboxArea(b.bbox))
    const placed = []
    const forbidden = areas.filter((a) => a.kind === 'nogo')
    const taken = new Set()
    for (const zone of zones) {
      const letter = ZONE_NAME.exec(zone.name)[1]
      const size = letter.length > 1 ? 30 : 20
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
          if (placed.some(([px, py]) => Math.abs(px - x) < LETTER_MIN_PX && Math.abs(py - y) < LETTER_MIN_PX / 2)) continue
          if (taken.size >= MAX_LETTERS) return
          taken.add(cell)
          placed.push([x, y])
          L.marker(ll, {
            pane: LETTERS_PANE,
            interactive: false,
            keyboard: false,
            icon: L.divIcon({
              className: 'timone-marker',
              html: `<div style="width:${size}px;line-height:20px;text-align:center;font-size:${letter.length > 1 ? 14 : 16}px;font-weight:800;color:${LETTER_COLORS[letter]};text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff">${letter}</div>`,
              iconSize: [size, 20],
              iconAnchor: [size / 2, 10],
            }),
          }).addTo(this._group)
        }
      }
    }
  },
})
