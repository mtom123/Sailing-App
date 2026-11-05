import { markType } from './marks.js'
import { isSightingType } from './sightings.js'
import { SPECIES_GLYPHS } from './sightingIcons.js'

/*
 * Icone di TIMONE: bollo blu notte con anello e disegno al tratto nel colore
 * del tipo; gli avvistamenti hanno il bollo pieno con la sagoma bianca. Sulla
 * carta sotto il bollo c'è una punta, che indica il punto esatto.
 */

const NAVY = '#0a1620'
const line = (d, w = 2) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const round = (cx, cy, r, w = 2) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="${w}"/>`
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>`
const WAVE = line('M3 20.5c1.5-1.4 3-1.4 4.5 0s3 1.4 4.5 0 3-1.4 4.5 0 3 1.4 4.5 0')
const FISH = line('M3 12c2.6-4.2 8.6-5.4 12.6-1.6L21 7v10l-5.4-3.4C11.6 17.4 5.6 16.2 3 12z') + dot(7.8, 11, 1)

const GLYPHS = {
  mark: line('M6.5 21.5V3M6.5 4h11.5l-3 4 3 4H6.5'),
  dot: round(12, 12, 7.5) + dot(12, 12, 2.6),
  anchor: round(12, 4.8, 2) + line('M12 6.8V21M8.5 10.5h7M3.5 13l1.8 1.8M20.5 13l-1.8 1.8M4.2 14C5 18.4 8 21 12 21s7-2.6 7.8-7'),
  mob: round(12, 12, 9) + round(12, 12, 3.6) + line('M5.6 5.6l3.9 3.9M18.4 5.6l-3.9 3.9M5.6 18.4l3.9-3.9M18.4 18.4l-3.9-3.9', 2.6),
  fish: FISH,
  fishB: FISH + line('M11 9.5v5', 1.6),
  fishC: FISH + line('M10.5 9.6v4.8M13 10v4', 1.6),
  fishD: FISH + dot(11, 12, 0.9) + dot(13.4, 12, 0.9),
  danger: line('M12 2.5L21.5 12 12 21.5 2.5 12z') + line('M12 7.8v5.4', 2.4) + dot(12, 16.4, 1.3),
  rock: line('M2.5 17l4.2-7.5 3 3.2L13 5.5l4 6.5 4.5 5') + WAVE,
  obstruction: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3.2 3"/>` + line('M8.5 8.5l7 7M15.5 8.5l-7 7'),
  wreck: line('M3 11.5l3 5.5h11.5L21.5 9.5M12.5 14.5V4.5l5 4.5') + WAVE,
  dive: line('M3 9.5c0-1 .8-1.8 1.8-1.8h11.4c1 0 1.8.8 1.8 1.8v3.8c0 1.2-1 2.2-2.2 2.2h-2.1l-1.8-2.2h-2.8l-1.8 2.2H5.2c-1.2 0-2.2-1-2.2-2.2zM21 16V4.5'),
  can: line('M7.5 6.5c0-1.2 2-2 4.5-2s4.5.8 4.5 2v9.5h-9zM7.5 6.5c0 1.2 2 2 4.5 2s4.5-.8 4.5-2') + WAVE,
  cone: line('M12 3.5l5.5 12.5h-11z') + WAVE,
  fuel: line('M12 3s6.5 6.8 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 9.8 12 3 12 3z') + line('M9 15a3 3 0 0 0 3 3', 1.8),
  star: line('M12 3l2.7 5.8 6.3.8-4.6 4.3 1.2 6.2-5.6-3.1-5.6 3.1 1.2-6.2L3 9.6l6.3-.8z'),
}

/** Bollo del mark, come HTML (il tipo sconosciuto diventa la bandierina). */
export function markIconHtml(typeId, size = 30, tip = false) {
  const { id, color } = markType(typeId)
  const filled = isSightingType(id)
  const glyph = Math.round(size * (filled ? 0.8 : 0.66))
  const point = tip
    ? `<div style="position:absolute;left:50%;top:${size - 2}px;margin-left:-5px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${color}"></div>`
    : ''
  const style = filled ? `background:${color};border:2px solid #fff;color:#fff` : `background:${NAVY};border:2.5px solid ${color};color:${color}`
  return `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.55);${style}"><svg viewBox="0 0 24 24" width="${glyph}" height="${glyph}">${GLYPHS[id] ?? SPECIES_GLYPHS[id]}</svg>${point}</div>`
}
