/*
 * Ordinanze recenti delle Capitanerie di porto → public/ordinances.json
 *
 * Dalla mappa ordinanze del portale della Guardia Costiera (tutti gli
 * uffici, con posizione indicativa): interdizioni temporanee, esercitazioni
 * militari e poligoni di tiro, lavori, eventi, regate. Il servizio accetta
 * richieste solo dal proprio sito: lo scarica questo strumento (anche nel
 * rilascio automatico), non l'app.
 *
 * Uso: npm run ordinances            (ultimi 90 giorni)
 *      npm run ordinances -- 30      (ultimi 30 giorni)
 *
 * Se il servizio non risponde il file esistente resta com'è.
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve('public/ordinances.json')
const BASE = 'https://www.guardiacostiera.gov.it'
const API = `${BASE}/portale/o/capitanerie-rest-builder/v1.0/mappa-ordinanze/get-poi?mappa=true&keyword=&ufficio=&tipologia=&anno=`
const DAYS = Number(process.argv[2]) || 90

const res = await fetch(API, {
  headers: { 'User-Agent': 'TIMONE sailing app (github.com/mtom123/Sailing-App)', Accept: 'application/json' },
  signal: AbortSignal.timeout(120000),
})
if (!res.ok) {
  console.error(`Guardia Costiera → ${res.status}: ordinanze non aggiornate`)
  process.exit(1)
}
const { items } = await res.json()

// "[44.30, 44.31]" → [44.30, 44.31]
const nums = (s) =>
  String(s || '')
    .replace(/[[\]]/g, '')
    .split(',')
    .map(Number)
    .filter((v) => Number.isFinite(v) && v !== 0)
const round = (v) => Math.round(v * 1e5) / 1e5

const since = Date.now() - DAYS * 864e5
const list = []
for (const it of items) {
  const date = new Date(String(it.dataEmissione).replace('GMT', 'UTC'))
  if (!(date.getTime() >= since)) continue
  const lat = nums(it.coordinateNord)
  const lon = nums(it.coordinateEst)
  const points = lat.slice(0, lon.length).map((la, i) => [round(la), round(lon[i])])
  // Solo il Mediterraneo con coordinate plausibili
  const ok = points.filter(([la, lo]) => la > 35 && la < 47 && lo > 5 && lo < 20)
  if (!ok.length) continue
  list.push({
    id: it.articleId,
    n: it.numeroOrdinanza,
    date: date.toISOString().slice(0, 10),
    office: it.ufficio,
    types: String(it.tipologia || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    title: String(it.titoloOrdinanza || '')
      .replace(/\s*-\s*pdf\s*$/i, '')
      .trim(),
    url: it.linkFile ? BASE + it.linkFile.replace(/null&?$/, '') : null,
    points: ok,
  })
}
list.sort((a, b) => b.date.localeCompare(a.date))
writeFileSync(
  OUT,
  JSON.stringify({
    source: 'Guardia Costiera, mappa ordinanze (posizioni indicative: fa fede il testo)',
    generated: new Date().toISOString(),
    days: DAYS,
    ordinances: list,
  })
)
console.log(`${list.length} ordinanze degli ultimi ${DAYS} giorni in ${OUT}`)
