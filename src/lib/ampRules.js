/**
 * Regole delle aree marine protette per zona (src/data/ampRules.js): quale
 * regola vale per un'area di OpenStreetMap e i testi per schede e avvisi.
 *
 * Le zone in OSM sono spesso poligoni chiamati solo "Zona B": l'area marina
 * a cui appartengono è quella col nome noto che le contiene.
 */
import { AMP_PAGES, AMP_RULES } from '../data/ampRules.js'
import { inArea } from './protectedAreas.js'

export function ampRuleFor(name) {
  return (name && AMP_RULES.find((r) => r.match.test(name))) || null
}

/** 'A' | 'B' | 'C' | 'D' dal nome ("Zona B", "… · Zona C"), o null */
export function zoneLetter(name) {
  const m = /\bzon[ae]\s*([ABCD])\b/i.exec(name || '')
  return m ? m[1].toUpperCase() : null
}

const bboxArea = ([s, w, n, e]) => (n - s) * (e - w)

// Punti campione dell'area: alcuni vertici del primo anello (le zone sono
// spesso fasce strette lungo costa: il loro baricentro cade a terra)
function samplePoints(area) {
  const ring = area.rings[0]
  const step = Math.max(1, Math.floor(ring.length / 15))
  return ring.filter((_, i) => i % step === 0)
}

/** Regola e zona per un'area OSM, cercando l'area marina che la contiene */
export function ampContext(area, areas = []) {
  const zone = zoneLetter(area.name)
  let rule = ampRuleFor(area.name)
  if (!rule) {
    // L'area marina che contiene più vertici della zona (a parità, la più piccola)
    const pts = samplePoints(area)
    const parent = areas
      .filter((p) => p !== area && ampRuleFor(p.name))
      .map((p) => ({ p, n: pts.filter(([la, lo]) => inArea(p, la, lo)).length }))
      .filter((x) => x.n > pts.length / 3)
      .sort((x, y) => y.n - x.n || bboxArea(x.p.bbox) - bboxArea(y.p.bbox))[0]?.p
    rule = parent ? ampRuleFor(parent.name) : null
  }
  return { rule, zone }
}

/** Pagina del Ministero per le aree marine di cui l'app non ha le regole */
export function ampPageFor(area, areas = []) {
  const names = [area.name, ...areas.filter((p) => p !== area && p.bbox[0] <= area.bbox[0] + 0.002 && p.bbox[2] >= area.bbox[2] - 0.002 && p.bbox[1] <= area.bbox[1] + 0.002 && p.bbox[3] >= area.bbox[3] - 0.002).map((p) => p.name)]
  for (const n of names) {
    const page = AMP_PAGES.find((p) => p.match.test(n))
    if (page) return page.url
  }
  return null
}

/** Sintesi di una zona per gli avvisi ("motore max 5 nodi, niente ancoraggio") */
export function zoneSummary(rule, zone) {
  if (!rule || !zone) return null
  return rule.zones[zone]?.short || null
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const list = (items, color = 'var(--color-paper)') =>
  `<ul style="margin:2px 0 0 14px;padding:0;font-size:11px;color:${color}">${items.map((i) => `<li style="margin:1px 0">${esc(i)}</li>`).join('')}</ul>`

/**
 * HTML della scheda: regole della zona (o di tutte le zone se si tocca il
 * perimetro dell'area marina), divieti generali e fonte.
 */
export function ampPopupHTML(area, { rule, zone }) {
  if (!rule) return null
  const title = zone ? `${rule.name} · Zona ${zone}` : rule.name
  const sections = []
  const zones = zone ? [zone] : Object.keys(rule.zones)
  for (const z of zones) {
    const zr = rule.zones[z]
    if (!zr) continue
    sections.push(
      `<div style="margin-top:5px;font-size:11px;font-weight:600;color:${z === 'A' || z === 'MA' ? '#C026D3' : 'var(--color-warn)'}">Zona ${z}${zr.label ? ` · ${esc(zr.label)}` : ''}</div>${list(zr.rules)}`
    )
  }
  if (rule.general?.length) {
    sections.push(`<div style="margin-top:5px;font-size:11px;font-weight:600;color:var(--color-fog)">In tutta l'area</div>${list(rule.general, 'var(--color-fog)')}`)
  }
  const source = rule.source
    ? `<a href="${esc(rule.source)}" target="_blank" rel="noopener" style="color:var(--color-phos)">${esc(rule.edition)}</a>`
    : esc(rule.edition || '')
  return `<div style="min-width:220px;max-width:300px;max-height:340px;overflow-y:auto">
    <div style="font-weight:600;color:var(--color-paper);font-size:13px">${esc(title)}</div>
    ${sections.join('')}
    <div style="margin-top:6px;font-size:10px;color:var(--color-fog-dim)">Fonte: ${source}. Sintesi: fanno fede il testo, le ordinanze e i disciplinari dell'ente gestore${rule.manager ? ` (${esc(rule.manager)})` : ''}.</div>
  </div>`
}
