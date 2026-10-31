/**
 * Regole delle aree marine protette per zona (src/data/ampRules.js): quale
 * regola vale per un'area di OpenStreetMap e i testi per schede e avvisi.
 *
 * Le zone in OSM sono spesso poligoni chiamati solo "Zona B": l'area marina
 * a cui appartengono è quella col nome noto che le contiene.
 */
import { AMP_PAGES, AMP_RULES } from '../data/ampRules.js'

export function ampRuleFor(name) {
  return (name && AMP_RULES.find((r) => r.match.test(name))) || null
}

/** 'A' | 'B' | 'C' | 'D' dal nome ("Zona B", "… · Zona C"), o null */
export function zoneLetter(name) {
  const m = /\bzon[ae]\s*([ABCD])\b/i.exec(name || '')
  return m ? m[1].toUpperCase() : null
}

const bboxArea = ([s, w, n, e]) => (n - s) * (e - w)

/** Regola e zona per un'area OSM, cercando l'area marina che la contiene */
export function ampContext(area, areas = []) {
  const zone = zoneLetter(area.name)
  let rule = ampRuleFor(area.name)
  if (!rule) {
    const [s, w, n, e] = area.bbox
    const eps = 0.002
    const parent = areas
      .filter(
        (p) =>
          p !== area &&
          ampRuleFor(p.name) &&
          p.bbox[0] <= s + eps &&
          p.bbox[1] <= w + eps &&
          p.bbox[2] >= n - eps &&
          p.bbox[3] >= e - eps
      )
      .sort((x, y) => bboxArea(x.bbox) - bboxArea(y.bbox))[0]
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

const list = (items, color = '#C9D4DC') =>
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
      `<div style="margin-top:5px;font-size:11px;font-weight:600;color:${z === 'A' ? '#E040FB' : '#F5A623'}">Zona ${z}${zr.label ? ` · ${esc(zr.label)}` : ''}</div>${list(zr.rules)}`
    )
  }
  if (rule.general?.length) {
    sections.push(`<div style="margin-top:5px;font-size:11px;font-weight:600;color:#8FA0AE">In tutta l'area</div>${list(rule.general, '#8FA0AE')}`)
  }
  const source = rule.source
    ? `<a href="${esc(rule.source)}" target="_blank" rel="noopener" style="color:#5EE6C8">${esc(rule.edition)}</a>`
    : esc(rule.edition || '')
  return `<div style="min-width:220px;max-width:300px;max-height:340px;overflow-y:auto">
    <div style="font-weight:600;color:#E8F0F5;font-size:13px">${esc(title)}</div>
    ${sections.join('')}
    <div style="margin-top:6px;font-size:10px;color:#5C6B78">Fonte: ${source}. Sintesi: fanno fede il testo, le ordinanze e i disciplinari dell'ente gestore${rule.manager ? ` (${esc(rule.manager)})` : ''}.</div>
  </div>`
}
