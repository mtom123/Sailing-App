/**
 * Livello Leaflet dei baretti sulla spiaggia (beachBars.js), da zoom 14.
 * Tocca per la scheda: contatti e orari da OpenStreetMap, e le note mie
 * (approdo tender, gavitelli, telefono…) salvate sul dispositivo.
 */
import L from 'leaflet'
import { BAR_FLAGS, BAR_KIND, barDetails, barInfo, beachBarsIn } from './beachBars.js'

const MIN_ZOOM = 14

// Bicchiere da cocktail; bordo verde per i locali su cui ho scritto note
const iconHtml = (mine) =>
  `<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#FF9F43" stroke="${mine ? '#2BD9A8' : '#fff'}" stroke-width="${mine ? 3 : 2}"/><path d="M7 7.5h10L12 13z" fill="#fff"/><path d="M12 13v4M9.5 17.5h5" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>`
const ICONS = [false, true].map((mine) => L.divIcon({ className: '', html: iconHtml(mine), iconSize: [24, 24], iconAnchor: [12, 12] }))
const hasNote = (n) => !!n && (Object.values(n.flags || {}).some(Boolean) || !!n.phone || !!n.text)

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const row = (label, value) =>
  `<div style="display:flex;gap:6px;font-size:calc(11px*var(--fs))"><span style="color:var(--color-fog);min-width:62px">${label}</span><span style="color:var(--color-paper);min-width:0;overflow-wrap:anywhere">${value}</span></div>`
const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener" style="color:var(--color-phos)">${esc(text)}</a>`

export const BeachBarsLayer = L.Layer.extend({
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
    const bars = await beachBarsIn(map.getBounds().pad(0.15)).catch(() => null)
    if (gen !== this._gen || !this._map || !bars) return
    // Una scheda aperta resta (si sta scrivendo una nota)
    const open = this._openId
    this._group.eachLayer((m) => {
      if (m._barId !== open) this._group.removeLayer(m)
    })
    const interactive = !!this.options.interactive
    for (const b of bars) {
      if (b.id === open) continue
      const icon = ICONS[hasNote(this.options.getNote(b.id)) ? 1 : 0]
      const m = L.marker([b.lat, b.lon], { icon, title: b.name, interactive, zIndexOffset: 400 })
      m._barId = b.id
      if (interactive) {
        m.bindPopup(() => this._card(b), { maxWidth: 290, minWidth: 230 })
        m.on('popupopen', () => (this._openId = b.id))
        m.on('popupclose', () => (this._openId = null))
      }
      m.addTo(this._group)
    }
  },

  _card(b) {
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;flex-direction:column;gap:5px'
    const where = b.waterM != null ? (b.waterM <= 15 ? "sull'acqua" : `a ~${b.waterM} m dall'acqua`) : ''
    el.innerHTML = `<div style="font-weight:700;color:var(--color-paper);font-size:calc(13px*var(--fs))">${esc(b.name)}</div>
      <div style="font-size:calc(11px*var(--fs));color:var(--color-fog)">${BAR_KIND[b.kind] || 'Locale'}${where ? ` · ${where}` : ''}</div>`
    const osm = document.createElement('div')
    osm.style.cssText = 'display:flex;flex-direction:column;gap:2px'
    osm.innerHTML = `<div style="font-size:calc(10px*var(--fs));color:var(--color-fog-dim)">Contatti da OpenStreetMap…</div>`
    el.appendChild(osm)
    barDetails(b.id).then((tags) => {
      const info = barInfo(tags)
      if (!info) {
        osm.innerHTML = `<div style="font-size:calc(10px*var(--fs));color:var(--color-fog-dim)">Contatti non disponibili (serve la rete)</div>`
        return
      }
      const rows = []
      if (info.phone) rows.push(row('Telefono', info.phone.split(';').map((t) => link(`tel:${t.replace(/[^\d+]/g, '')}`, t.trim())).join(', ')))
      if (info.website) rows.push(row('Sito', link(info.website, info.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))))
      if (info.instagram) rows.push(row('Instagram', link(info.instagram, 'apri')))
      if (info.facebook) rows.push(row('Facebook', link(info.facebook, 'apri')))
      if (info.email) rows.push(row('Email', link(`mailto:${info.email}`, info.email)))
      if (info.hours) rows.push(row('Orari', esc(info.hours)))
      if (info.cuisine) rows.push(row('Cucina', esc(info.cuisine)))
      const extra = [info.outdoor && 'tavoli all’aperto', info.wheelchair && 'accessibile'].filter(Boolean)
      if (extra.length) rows.push(row('Altro', extra.join(', ')))
      if (info.description) rows.push(row('Note OSM', esc(info.description)))
      osm.innerHTML = rows.length
        ? rows.join('')
        : `<div style="font-size:calc(10px*var(--fs));color:var(--color-fog-dim)">Nessun contatto su OpenStreetMap: aggiungilo nelle tue note</div>`
    })
    el.appendChild(this._notes(b))
    return el
  },

  // Le mie note sul baretto: caratteristiche, telefono, testo libero
  _notes(b) {
    const note = this.options.getNote(b.id) || {}
    const save = (patch) => {
      this.options.setNote(b.id, { name: b.name, lat: b.lat, lon: b.lon, ...patch })
      // Bordo verde sul marker appena c'è una nota
      this._group.eachLayer((m) => m._barId === b.id && m.setIcon(ICONS[hasNote(this.options.getNote(b.id)) ? 1 : 0]))
    }
    const box = document.createElement('div')
    box.style.cssText = 'margin-top:4px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.12);display:flex;flex-direction:column;gap:5px'
    box.innerHTML = `<div style="font-weight:600;color:var(--color-paper);font-size:calc(11px*var(--fs))">Le mie note</div>`
    const chips = document.createElement('div')
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px'
    const flags = { ...(note.flags || {}) }
    for (const f of BAR_FLAGS) {
      const c = document.createElement('button')
      c.type = 'button'
      c.textContent = f.label
      const paint = () => {
        const on = !!flags[f.key]
        c.style.cssText = `padding:3px 7px;border-radius:12px;font-size:calc(10px*var(--fs));font-weight:600;border:1px solid ${on ? '#FF9F43' : 'rgba(255,255,255,0.2)'};background:${on ? 'rgba(255,159,67,0.18)' : 'transparent'};color:${on ? '#FF9F43' : 'var(--color-fog)'}`
      }
      paint()
      c.onclick = () => {
        flags[f.key] = !flags[f.key]
        paint()
        save({ flags: { ...flags } })
      }
      chips.appendChild(c)
    }
    box.appendChild(chips)
    const field = (placeholder, value, key, multi) => {
      const input = document.createElement(multi ? 'textarea' : 'input')
      if (!multi) input.type = 'tel'
      input.placeholder = placeholder
      input.value = value || ''
      if (multi) input.rows = 2
      input.style.cssText =
        'width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;background:transparent;color:var(--color-paper);font-size:calc(12px*var(--fs));resize:vertical'
      input.onchange = () => save({ [key]: input.value.trim() })
      return input
    }
    box.appendChild(field('Telefono / VHF (es. canale 9)', note.phone, 'phone', false))
    box.appendChild(field('Note: fondo, ridosso, prezzi, cosa prendere…', note.text, 'text', true))
    return box
  },
})
