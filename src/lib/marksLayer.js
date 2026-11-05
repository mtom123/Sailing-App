import L from 'leaflet'
import { markIconHtml } from './markIcons.js'

/*
 * Mark sulla carta. Possono essere migliaia: si disegnano solo quelli a vista
 * e, finché non si è vicini, quelli sovrapposti diventano una bolla col
 * numero, così i marcatori sulla carta restano pochi (iPad).
 *
 * Il tocco si riconosce qui (dito giù e su, poco spostamento) e non con il
 * click di Leaflet: sull'iPad il dito si muove di qualche pixel, Leaflet lo
 * prende per un trascinamento e il click non arriva.
 */

const CELL_PX = 56
const CLUSTER_MAX_ZOOM = 16 // da qui in su si vedono tutti
const NAMES_MIN_ZOOM = 13
const TAP_MAX_MOVE_PX = 12
const TAP_MAX_MS = 500

const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function markIcon(mark, showName) {
  const name = showName && mark.name
    ? `<div style="position:absolute;top:31px;left:50%;transform:translateX(-50%);width:max-content;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;border-radius:3px;background:rgba(10,22,32,0.8);color:#fff;font-size:11px;font-weight:600">${escapeHtml(mark.name)}</div>`
    : ''
  return L.divIcon({
    className: 'timone-marker',
    html: `<div style="position:relative">${markIconHtml(mark.type)}${name}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

const clusterIcon = (count) =>
  L.divIcon({
    className: 'timone-marker',
    html: `<div style="width:36px;height:36px;border-radius:50%;background:#0a1620;border:2.5px solid #4FC3F7;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.5)">${count}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })

export const MarksLayer = L.Layer.extend({
  initialize(onTap) {
    this._onTap = onTap
    this._marks = []
    this._actions = new WeakMap() // icona sulla carta → cosa fa il tocco
  },

  setMarks(marks) {
    this._marks = marks
    if (this._map) this._draw()
  },

  onAdd(map) {
    this._group = L.layerGroup().addTo(map)
    map.on('moveend', this._draw, this)
    const el = map.getContainer()
    this._pointerDown = (e) => {
      this._press = e.isPrimary ? { x: e.clientX, y: e.clientY, t: Date.now() } : null
    }
    this._pointerCancel = () => {
      this._press = null
    }
    this._pointerUp = (e) => {
      const press = this._press
      this._press = null
      if (!press || !e.isPrimary || Date.now() - press.t > TAP_MAX_MS) return
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_MAX_MOVE_PX) return
      const icon = e.target.closest?.('.leaflet-marker-icon')
      if (icon) this._actions.get(icon)?.()
    }
    el.addEventListener('pointerdown', this._pointerDown)
    el.addEventListener('pointerup', this._pointerUp)
    el.addEventListener('pointercancel', this._pointerCancel)
    this._draw()
  },

  onRemove(map) {
    map.off('moveend', this._draw, this)
    const el = map.getContainer()
    el.removeEventListener('pointerdown', this._pointerDown)
    el.removeEventListener('pointerup', this._pointerUp)
    el.removeEventListener('pointercancel', this._pointerCancel)
    this._group.remove()
  },

  _draw() {
    const map = this._map
    const zoom = map.getZoom()
    const b = map.getBounds().pad(0.1)
    const [s, w, n, e] = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]
    const visible = this._marks.filter((m) => m.lat >= s && m.lat <= n && m.lon >= w && m.lon <= e)

    const cells = new Map()
    visible.forEach((m, i) => {
      let key = i
      if (zoom < CLUSTER_MAX_ZOOM) {
        const p = map.project([m.lat, m.lon], zoom)
        key = `${Math.floor(p.x / CELL_PX)},${Math.floor(p.y / CELL_PX)}`
      }
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key).push(m)
    })

    this._group.clearLayers()
    for (const group of cells.values()) {
      if (group.length === 1) {
        const [m] = group
        this._add([m.lat, m.lon], markIcon(m, zoom >= NAMES_MIN_ZOOM), () => this._onTap(m))
        continue
      }
      const bounds = L.latLngBounds(group.map((m) => [m.lat, m.lon]))
      this._add(bounds.getCenter(), clusterIcon(group.length), () =>
        map.flyToBounds(bounds.pad(0.3), { maxZoom: Math.min(zoom + 3, CLUSTER_MAX_ZOOM), duration: 0.4 })
      )
    }
  },

  _add(latlng, icon, action) {
    const marker = L.marker(latlng, { icon, zIndexOffset: 500 }).addTo(this._group)
    this._actions.set(marker.getElement(), action)
  },
})
