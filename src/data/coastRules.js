/*
 * Fascia dalla costa vietata alle unità da diporto, dalle ordinanze di
 * sicurezza balneare delle Capitanerie di porto (lette sul sito della
 * Guardia Costiera, edizioni 2025-2026).
 *
 * Per ogni ufficio: distanze in metri dalle spiagge (e scogliere basse) e
 * dalle coste alte / a picco entro cui sono vietati transito, sosta e
 * ancoraggio (salvo i corridoi di lancio), stagione, orario e l'eventuale
 * limite di velocità più al largo. Vale la prima regola che contiene il
 * punto: prima i singoli uffici, poi le regioni, infine il default.
 *
 * area: [sud, ovest, nord, est] in gradi, oppure un poligono [[lat, lon], …].
 * Confini approssimati: vicino al limite tra due uffici controlla l'ordinanza.
 * season: 'national' = dalla terza settimana di maggio alla terza di
 * settembre (DL 73/2025 art. 6), oppure ['MM-GG', 'MM-GG'].
 * hours: ['HH:MM', 'HH:MM'] se l'ordinanza limita il divieto a un orario,
 * null se non indicato (allora vale tutto il giorno, per prudenza).
 */

const GC = 'https://www.guardiacostiera.gov.it/portale/documents'

export const COAST_RULES = [
  // ---------------------------------------------------------- Sicilia
  {
    id: 'lipari',
    name: 'Circondario marittimo di Lipari (Eolie)',
    area: [38.33, 14.3, 38.85, 15.3],
    beach: 300,
    cliff: 200,
    season: ['05-01', '10-31'],
    hours: ['09:00', '19:00'],
    speed: { kn: 10, beach: 1000, cliff: 500 },
    source: `${GC}/315631/1326621/Ord.+42+del+03-06-2025+Ordinanza+di+Sicurezza+balneare.pdf`,
    edition: 'Ord. 42/2025',
  },
  {
    id: 'catania',
    name: 'Capitaneria di porto di Catania',
    area: [37.38, 14.95, 37.63, 15.3],
    beach: 300,
    cliff: 150,
    season: ['05-01', '10-31'],
    hours: null,
    speed: { kn: 10, beach: 1000, cliff: 500 },
    source: `${GC}/315023/706724/Ordinanza+di+sicurezza+balneare+2026+.pdf`,
    edition: 'Ord. 40/2026',
  },
  {
    id: 'licata',
    name: 'Circondario marittimo di Licata',
    area: [37.0, 13.75, 37.2, 14.05],
    beach: 300,
    cliff: 100,
    season: ['05-01', '10-31'],
    hours: null,
    speed: { kn: 8, beach: 1000, cliff: 500 },
    source: `${GC}/115846/1635997/Ordinanza+Sicurezza+Balneare+12.2026+-+pdf.pdf`,
    edition: 'Ord. 12/2026',
  },
  {
    id: 'porto-empedocle',
    name: 'Circondario marittimo di Porto Empedocle',
    area: [37.15, 13.2, 37.5, 13.75],
    beach: 300,
    cliff: 100,
    season: ['05-01', '10-31'],
    hours: null,
    speed: null,
    source: `${GC}/314340/1220370/Ordinanza+Sicurezza+Balneare+17+2026+aggiornata.pdf`,
    edition: 'Ord. 17/2026',
  },

  // ---------------------------------------------------------- Lazio
  {
    id: 'ponza',
    name: 'Circondario marittimo di Ponza',
    area: [40.84, 12.75, 40.98, 13.02],
    beach: 200,
    cliff: 50,
    season: 'national',
    hours: null,
    speed: null,
    source: `${GC}/315369/0/Ordinanza+di+Sicurezza+balneare+2025+-+pdf+(2).pdf`,
    edition: 'Ord. 2025',
  },
  {
    id: 'terracina',
    name: 'Circondario marittimo di Terracina',
    area: [41.2, 12.75, 41.45, 13.3],
    // 200/100 riservati ai bagnanti più 50 m interdetti a navigazione e ancoraggio
    beach: 250,
    cliff: 150,
    season: 'national',
    hours: null,
    speed: { kn: 10, beach: 1000, cliff: 500 },
    source: `${GC}/315209/1728182/Ord.+Nr.+30+del+30.04.2025+-+Ordinanza+di+Sicurezza+Balneare+2025.pdf`,
    edition: 'Ord. 30/2025',
  },
  {
    id: 'gaeta',
    name: 'Capitaneria di porto di Gaeta',
    area: [41.15, 13.3, 41.3, 13.8],
    beach: 200,
    cliff: 100,
    season: 'national',
    hours: null,
    speed: null,
    source: `${GC}/314452/1848609/Ord.+25.2025+Ordinanza+di+Sicurezza+Balneare+del+Circondario+Marittimo+di+Gaeta+-+pdf.pdf`,
    edition: 'Ord. 25/2025',
  },

  // ---------------------------------------------------------- Calabria
  {
    id: 'soverato',
    name: 'Circondario marittimo di Soverato',
    area: [38.42, 16.4, 38.95, 16.8],
    beach: 150,
    cliff: 100,
    season: 'national',
    hours: ['08:00', '20:00'],
    speed: null,
    source: `${GC}/315710/353295/Ordinanza+09.2026+ordinanza+balneare.pdf`,
    edition: 'Ord. 9/2026',
  },

  // ---------------------------------------------------------- Toscana
  {
    id: 'porto-santo-stefano',
    name: 'Circondario marittimo di Porto Santo Stefano',
    area: [42.2, 10.85, 42.75, 11.5],
    beach: 200,
    cliff: 100,
    season: 'national',
    hours: ['08:30', '19:30'],
    speed: null,
    source: `${GC}/315884/2187140/ord+37+del+15-05-2026+Ordinanza+di+sicurezza+balneare.pdf`,
    edition: 'Ord. 37/2026',
  },
  {
    id: 'portoferraio',
    name: 'Capitaneria di porto di Portoferraio (Elba)',
    area: [42.55, 10.0, 42.9, 10.48],
    beach: 200,
    cliff: 100,
    season: 'national',
    hours: ['09:00', '19:00'],
    speed: null,
    source: `${GC}/314505/2186810/Ord.+n%C2%B0+23+-+Ordinanza+di+Sicurezza+Balneare.pdf`,
    edition: 'Ord. 23/2026',
  },
  {
    id: 'piombino',
    name: 'Circondario marittimo di Piombino',
    area: [42.75, 10.48, 43.2, 10.85],
    beach: 200,
    cliff: 100,
    season: 'national',
    hours: ['08:30', '19:30'],
    speed: null,
    source: `${GC}/315386/8768406/Ordinanza+di+sicurezza+balneare+50-2026_REV+MERICO_Firmato.pdf`,
    edition: 'Ord. 50/2026',
  },

  // ---------------------------------------------------------- Liguria
  {
    id: 'santa-margherita',
    name: 'Circondario marittimo di Santa Margherita Ligure',
    // da San Fruttuoso (escluso) a Deiva Marina (esclusa)
    area: [44.15, 9.176, 44.4, 9.5],
    beach: 200,
    cliff: 100,
    season: ['05-01', '09-30'],
    hours: ['08:00', '19:30'],
    speed: null,
    source: 'https://cdn.levantenews.it/wp-content/uploads/2026/04/ORDINANZA-3.pdf',
    edition: 'Ord. 2026',
  },
  {
    id: 'loano',
    name: 'Circondario marittimo di Loano-Albenga',
    area: [43.92, 8.08, 44.17, 8.3],
    beach: 200,
    cliff: 100,
    season: ['05-01', '09-30'],
    hours: null,
    speed: null,
    source: `${GC}/315243/1114544/Ord.+n.+43+del+08.05.2026+Ordinanza+di+sicurezza+balneare.pdf`,
    edition: 'Ord. 43/2026',
  },
  {
    id: 'liguria',
    name: 'Capitanerie della Liguria',
    area: [43.7, 7.5, 44.5, 10.05],
    beach: 200,
    cliff: 100,
    season: ['05-01', '09-30'],
    hours: null,
    speed: null,
    source: `${GC}/115952/885213/Ordinanza+n.+30+del+22-04-2024+-+Ordinanza+di+Sicurezza+Balneare+-+pdf.pdf`,
    edition: 'Imperia Ord. 30/2024 (verificate anche S. Margherita e Loano)',
  },

  // ---------------------------------------------------------- Sardegna
  {
    id: 'sardegna',
    name: 'Capitanerie della Sardegna',
    area: [38.8, 8.0, 41.35, 9.9],
    beach: 200,
    cliff: 100,
    season: 'national',
    hours: null,
    speed: null,
    source: `${GC}/126613/0/Ordinanza+Sicurezza+Balneare+2025+unica+(1).pdf`,
    edition: 'La Maddalena 2025 (verificate anche Cagliari, Alghero, Golfo Aranci)',
  },

  // ---------------------------------------------------------- default
  {
    id: 'sicilia',
    name: 'Capitanerie della Sicilia (non verificata)',
    region: 'sicily',
    beach: null, // dalle impostazioni: di solito 300
    cliff: null,
    season: ['05-01', '10-31'],
    hours: null,
    speed: null,
    source: null,
    edition: null,
  },
  {
    id: 'italia',
    name: 'Ordinanza della Capitaneria (non verificata)',
    region: 'italy',
    beach: null,
    cliff: null,
    season: 'national',
    hours: null,
    speed: null,
    source: null,
    edition: null,
  },
]

const inArea = (area, lat, lon) => {
  if (typeof area[0] === 'number') {
    const [s, w, n, e] = area
    return lat >= s && lat <= n && lon >= w && lon <= e
  }
  let inside = false
  for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
    const [yi, xi] = area[i]
    const [yj, xj] = area[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Regola per un punto di costa italiana della regione data ('italy' | 'sicily') */
export function ruleAt(lat, lon, region) {
  return (
    COAST_RULES.find((r) => r.area && inArea(r.area, lat, lon)) ||
    COAST_RULES.find((r) => r.region === region) ||
    COAST_RULES[COAST_RULES.length - 1]
  )
}

// Terzo sabato di maggio e terza domenica di settembre dell'anno
function nationalSeason(year) {
  const nth = (month, weekday, n) => {
    const d = new Date(year, month, 1)
    const first = (weekday - d.getDay() + 7) % 7
    return new Date(year, month, 1 + first + (n - 1) * 7)
  }
  return [nth(4, 6, 3), nth(8, 0, 3)]
}

const fmtDay = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })

/**
 * Stagione e orario della regola alla data: { inSeason, inHours, active,
 * season: '17 mag–21 set', hours: '08:30–19:30' | null }
 */
export function ruleTiming(rule, now = new Date()) {
  const y = now.getFullYear()
  let from
  let to
  if (rule.season === 'national') [from, to] = nationalSeason(y)
  else {
    const [fm, fd] = rule.season[0].split('-').map(Number)
    const [tm, td] = rule.season[1].split('-').map(Number)
    from = new Date(y, fm - 1, fd)
    to = new Date(y, tm - 1, td)
  }
  to = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59)
  const inSeason = now >= from && now <= to
  let inHours = true
  if (rule.hours) {
    const mins = now.getHours() * 60 + now.getMinutes()
    const [h0, h1] = rule.hours.map((h) => {
      const [hh, mm] = h.split(':').map(Number)
      return hh * 60 + mm
    })
    inHours = mins >= h0 && mins <= h1
  }
  return {
    inSeason,
    inHours,
    active: inSeason && inHours,
    season: `${fmtDay(from)}–${fmtDay(to)}`,
    hours: rule.hours ? rule.hours.join('–') : null,
  }
}
