import { markType } from './marks.js'
import { SPECIES_GLYPHS } from './sightingIcons.js'

/*
 * Icone dei mark: tassello colorato con il disegno in bianco, una stringa SVG
 * sola per la carta (divIcon) e per il pannello. Roccia, relitto, ostacolo e
 * boe riprendono i simboli delle carte nautiche.
 */

const line = (d, width = 2.4) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`
const solid = (d) => `<path d="${d}" fill="#fff"/>`
const FISH = `${solid('M2.5 12c3-5 9.5-6.2 13.5-2l5.5-3.2-1.6 5.2 1.6 5.2-5.5-3.2c-4 4.2-10.5 3-13.5-2z')}<circle cx="7.5" cy="11" r="1.1" fill="#0a1620"/>`
const ring = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  return `<circle cx="${(12 + 8 * Math.cos(a)).toFixed(1)}" cy="${(12 + 8 * Math.sin(a)).toFixed(1)}" r="1.7" fill="#fff"/>`
}).join('')

const GLYPHS = {
  mark: solid('M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2z'),
  dot: '<circle cx="12" cy="12" r="4.5" fill="#fff"/>',
  anchor: `<circle cx="12" cy="5" r="2.2" fill="none" stroke="#fff" stroke-width="2.2"/>${line('M12 7.2V21M8 11h8M4 13.5c.4 4.4 3.6 7.5 8 7.5s7.6-3.1 8-7.5')}`,
  mob: `<circle cx="12" cy="6" r="2.6" fill="#fff"/>${line('M5 7.5l4.5 5h5l4.5-5M12 12.5v3')}${line('M3 19.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0')}`,
  fish: FISH,
  fishB: FISH,
  fishC: FISH,
  fishD: FISH,
  danger: `${solid('M12 3l10.5 18h-21z')}${'<path d="M12 9.5v6M12 18v.2" fill="none" stroke="#0a1620" stroke-width="2.4" stroke-linecap="round"/>'}`,
  rock: line('M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9', 2.8),
  obstruction: ring,
  wreck: line('M2.5 12h19M8 7v10M12 5v14M16 7v10', 2.6),
  dive: `${solid('M3 5h18v14H3z')}<path d="M3.5 5.5l17 13" stroke="#0a1620" stroke-width="3.4"/>`,
  can: `${line('M7.5 4.5h9v11.5h-9z')}${line('M3.5 19.5h6.5M14 19.5h6.5')}<circle cx="12" cy="19.5" r="2" fill="none" stroke="#fff" stroke-width="2.2"/>`,
  cone: `${line('M12 3.5l6.5 12.5h-13z')}${line('M3.5 19.5h6.5M14 19.5h6.5')}<circle cx="12" cy="19.5" r="2" fill="none" stroke="#fff" stroke-width="2.2"/>`,
  fuel: `${solid('M4 3.5h9.5V21H4zM6.2 6v4.6h5.1V6z')}${line('M13.5 9.5h2l3 3v5a1.6 1.6 0 0 0 3.2 0V10L19 7.5', 2)}`,
  star: solid('M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7-6-3.3-6 3.3 1.3-6.7-5-4.6 6.8-.8z'),
}

/** Tassello del mark, come HTML (il tipo sconosciuto diventa una spilla). */
export function markIconHtml(typeId, size = 30) {
  const { id, color } = markType(typeId)
  return `<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size / 4)}px;background:${color};border:1.5px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.5)"><svg viewBox="0 0 24 24" width="${Math.round(size * 0.74)}" height="${Math.round(size * 0.74)}">${GLYPHS[id] ?? SPECIES_GLYPHS[id]}</svg></div>`
}
