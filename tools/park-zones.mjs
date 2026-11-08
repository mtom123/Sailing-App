/*
 * Zone a mare ufficiali che OpenStreetMap non ha → public/park-zones.json
 *
 * - Parco Nazionale Arcipelago Toscano: zone MA, MB, MC, MD di Capraia,
 *   Pianosa, Montecristo, Giannutri e Gorgona dalle coordinate WGS84 del
 *   Piano del Parco (Norme tecniche di attuazione, aprile 2024, Appendice A).
 *   I punti "Costa" si uniscono lungo la riva dell'isola (linea di costa
 *   OpenStreetMap); ogni zona non copre quelle più protette.
 * - Ponza e Ventotene: specchi acquei delle navi cisterna (Ord. UCM Ponza
 *   04/2015), interdetti durante le loro manovre.
 *
 * Uso: node tools/park-zones.mjs
 *
 * Il file si unisce a public/protected-areas.json (src/lib/protectedAreas.js).
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as turf from '@turf/turf'

const OUT = resolve('public/park-zones.json')
const SERVERS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const UA = 'TIMONE sailing app (github.com/mtom123/Sailing-App)'
const PARK = 'Parco Arcipelago Toscano'

// "43°0'25.1362''" → gradi decimali
function dms(s) {
  const m = /(\d+)°\s*(\d+)'\s*([\d.]+)/.exec(s)
  if (!m) throw new Error(`coordinata non valida: ${s}`)
  return Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600
}
const pts = (table) => Object.fromEntries(Object.entries(table).map(([k, [la, lo]]) => [k, [dms(la), dms(lo)]]))

// Zone in ordine di protezione: la prima vince dove si sovrappongono.
// coast: la zona tocca la riva tra il primo e l'ultimo punto (chiusa
// passando per l'interno dell'isola); ring: anello di soli punti in mare;
// sortRing: punti elencati per latitudine, da ordinare attorno all'isola.
const ISLANDS = [
  {
    id: 'capraia',
    name: 'Capraia',
    bbox: [42.98, 9.77, 43.09, 9.86],
    p: pts({
      40: ["43°0'25.1362", "9°48'4.42514"], // Punta del Linguello
      25: ["43°0'19.1104", "9°47'54.9126"],
      33: ["43°0'57.8200", "9°47'29.5200"],
      34: ["43°0'59.2400", "9°47'45.1500"], // Punta delle Cote
      42: ["43°1'42.9218", "9°47'46.1996"], // promontorio a N di Cala del Vetriolo
      28: ["43°1'49.4438", "9°47'13.6134"],
      29: ["43°2'25.3149", "9°47'23.2625"],
      43: ["43°2'19.2126", "9°47'53.8053"], // Punta del Fondo
      26: ["43°3'5.01135", "9°47'33.9430"],
      41: ["43°3'3.19135", "9°48'7.62394"], // punta adiacente gli Scogli del Mosè
      36: ["43°3'14.8700", "9°48'4.69000"], // Punta della Manza
      35: ["43°3'15.9517", "9°47'36.8877"],
      30: ["43°3'18.1559", "9°47'37.4824"],
      31: ["43°3'46.3068", "9°48'5.32236"],
      44: ["43°3'33.5472", "9°48'29.9699"], // baia a N di Punta Seccatoia
      39: ["43°0'46.3776", "9°49'13.3447"], // Punta Ortotomo
      22: ["43°0'38.9576", "9°49'35.9424"],
      23: ["43°0'13.1367", "9°49'20.3111"],
      24: ["42°59'52.2455", "9°48'36.6111"],
      27: ["43°1'30.3954", "9°47'8.15159"],
      32: ["43°3'54.7389", "9°48'13.6630"],
      19: ["43°4'44.5956", "9°49'36.0667"],
      20: ["43°4'33.4459", "9°50'2.05322"],
      21: ["43°4'4.24958", "9°50'30.9886"],
      37: ["43°3'55.2197", "9°50'13.0979"], // Punta del Vecchiaione
      38: ["43°1'36.6841", "9°50'29.7307"], // Punta della Civitata
      12: ["43°1'10.2637", "9°51'49.8782"],
      13: ["42°59'39.3735", "9°50'7.95489"],
      14: ["42°59'4.20201", "9°48'37.5952"],
      15: ["42°59'43.1389", "9°46'58.1457"],
      16: ["43°1'27.6904", "9°46'1.41486"],
      17: ["43°3'30.8012", "9°46'34.2400"],
      18: ["43°4'19.3866", "9°47'26.0362"],
      10: ["43°5'26.5475", "9°49'39.5830"],
      11: ["43°4'31.4788", "9°51'24.9558"],
      46: ["43°2'41.0624", "9°50'54.0559"], // Punta Bellavista
      3: ["43°2'54.0000", "9°55'6.00000"],
      4: ["43°0'18.0000", "9°54'18.0000"],
      5: ["42°57'5.0000", "9°48'42.0000"],
      6: ["42°58'24.0000", "9°45'0.0000"],
      7: ["43°1'18.0000", "9°43'18.0000"],
      8: ["43°4'0.0000", "9°44'0.0000"],
      9: ["43°5'24.0000", "9°45'18.0000"],
      1: ["43°7'18.0000", "9°49'54.0000"],
      2: ["43°5'30.0000", "9°53'30.0000"],
      45: ["43°3'20.5421", "9°50'16.2055"], // Punta di Porto Vecchio
    }),
    zones: [
      { zone: 'MA', sector: 'SO', coast: [40, 25, 33, 34] },
      { zone: 'MA', sector: 'O', coast: [42, 28, 29, 43] },
      { zone: 'MB speciale', sector: 'O', coast: [43, 29, 26, 41] },
      { zone: 'MB speciale', sector: 'NO', coast: [36, 35, 30, 31, 44] },
      { zone: 'MB', sector: 'S', coast: [39, 22, 23, 24, 25, 40] },
      { zone: 'MB', sector: 'SO', coast: [34, 33, 27, 28, 42] },
      { zone: 'MB', sector: 'O', coast: [41, 26, 35, 36] },
      { zone: 'MB', sector: 'NO', coast: [44, 31, 32, 19, 20, 21, 37] },
      // Fascia esterna alle zone MA e MB, da Punta della Civitata a Punta del Vecchiaione
      { zone: 'MC', coast: [38, 12, 13, 14, 15, 16, 17, 18, 10, 11, 21, 20, 19, 32, 31, 30, 35, 26, 29, 28, 27, 33, 25, 24, 23, 22, 39] },
      // Il resto entro il perimetro; il porto (Porto Vecchio – Bellavista) è fuori dal Parco
      { zone: 'MD', coast: [46, 3, 4, 5, 6, 7, 8, 9, 1, 2, 45] },
    ],
  },
  {
    id: 'pianosa',
    name: 'Pianosa',
    bbox: [42.56, 10.05, 42.61, 10.12],
    p: pts({
      8: ["42°36'52.5076", "10°5'23.7087"], // Punta del Grottone
      9: ["42°38'5.44842", "10°5'25.0811"],
      10: ["42°38'9.68424", "10°4'43.7303"],
      7: ["42°36'25.2006", "10°3'31.5889"],
      5: ["42°35'32.0328", "10°1'31.0322"],
      2: ["42°33'30.7461", "10°2'37.3004"],
      1: ["42°33'3.86891", "10°5'36.2754"],
      3: ["42°34'32.1543", "10°7'31.5949"],
      4: ["42°34'33.0258", "10°6'11.4397"], // Punta Secca
      6: ["42°36'23.2157", "10°6'34.6652"],
    }),
    zones: [
      { zone: 'MA', coast: [8, 9, 10, 7, 5, 2, 1, 3, 4] },
      { zone: 'MB speciale', coast: [4, 3, 6, 9, 8] },
    ],
  },
  {
    id: 'montecristo',
    name: 'Montecristo',
    bbox: [42.31, 10.28, 42.35, 10.33],
    p: pts({
      3: ["42°17'21.2122", "10°18'0.55941"],
      4: ["42°17'22.3575", "10°19'38.7278"],
      5: ["42°17'43.3819", "10°16'37.8044"],
      6: ["42°18'5.41374", "10°20'59.8538"],
      8: ["42°18'46.7209", "10°15'31.7969"],
      9: ["42°19'9.79829", "10°21'52.1512"],
      10: ["42°20'16.8001", "10°15'18.3895"],
      11: ["42°20'28.7252", "10°21'44.7219"],
      13: ["42°21'19.4815", "10°15'42.6937"],
      14: ["42°21'36.5488", "10°21'6.35986"],
      15: ["42°22'23.9367", "10°17'6.17044"],
      17: ["42°22'32.3853", "10°19'5.59904"],
      1: ["42°15'48.0000", "10°20'6.00001"],
      2: ["42°16'18.0000", "10°15'36.0000"],
      7: ["42°18'12.0000", "10°23'36.0000"],
      12: ["42°20'30.0000", "10°13'18.0000"],
      16: ["42°22'30.0000", "10°22'42.0000"],
      18: ["42°23'42.0000", "10°16'18.0000"],
      19: ["42°23'54.0000", "10°19'24.0000"],
    }),
    zones: [
      // 1,5 miglia dalla costa; riserva integrale a regolamentazione speciale
      { zone: 'MA', sortRing: [3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 17] },
      { zone: 'MB speciale', sortRing: [1, 2, 7, 12, 16, 18, 19] },
    ],
  },
  {
    id: 'giannutri',
    name: 'Giannutri',
    bbox: [42.235, 11.08, 42.27, 11.12],
    p: pts({
      27: ["42°15'27.4024", "11°5'43.4599"], // Punta Scaletta
      14: ["42°15'35.9270", "11°5'25.0743"],
      44: ["42°15'46.1841", "11°5'49.2451"],
      28: ["42°15'30.8417", "11°5'57.5857"],
      25: ["42°15'13.9522", "11°7'2.39108"],
      26: ["42°15'14.3759", "11°7'16.1763"],
      29: ["42°15'31.6034", "11°7'23.3121"],
      35: ["42°15'56.5932", "11°6'57.4217"],
      32: ["42°15'42.7662", "11°6'41.7067"],
      12: ["42°14'15.4233", "11°6'33.5053"], // Punta Capelrosso
      7: ["42°13'58.6130", "11°6'32.9138"],
      8: ["42°14'7.48633", "11°5'57.1068"],
      13: ["42°14'23.6344", "11°5'34.4466"],
      18: ["42°14'32.4162", "11°5'52.8821"],
      21: ["42°15'7.61848", "11°7'0.01370"], // Punta S. Francesco
      22: ["42°15'12.0000", "11°7'48.0000"],
      31: ["42°15'38.3596", "11°7'32.6767"],
      37: ["42°16'7.76425", "11°7'10.6581"],
      38: ["42°16'15.1578", "11°6'55.7805"],
      36: ["42°15'59.3538", "11°5'41.6712"],
      33: ["42°15'43.0724", "11°5'10.0810"],
      19: ["42°14'38.6849", "11°6'40.4332"],
      43: ["42°14'36.0000", "11°7'24.0000"],
      11: ["42°14'11.3582", "11°7'20.6767"],
      5: ["42°13'38.3501", "11°6'32.6771"],
      6: ["42°13'47.3579", "11°5'41.6740"],
      9: ["42°14'11.3508", "11°5'8.66719"],
      17: ["42°14'32.3499", "11°4'56.6676"],
      23: ["42°15'8.89755", "11°4'46.2570"],
      24: ["42°15'9.52930", "11°5'33.3466"], // Punta della Salvezza
      30: ["42°15'36.0000", "11°11'0.0000"],
      40: ["42°17'6.00000", "11°10'21.0000"],
      42: ["42°18'45.0000", "11°6'22.0000"],
      41: ["42°18'24.0000", "11°4'45.0000"],
      39: ["42°17'0.0000", "11°2'15.0000"],
      16: ["42°14'36.0000", "11°10'42.0000"],
      4: ["42°13'36.0000", "11°10'39.0000"],
      1: ["42°11'12.0000", "11°6'36.0000"],
      2: ["42°11'54.0000", "11°3'42.0000"],
      3: ["42°13'3.00000", "11°2'18.0000"],
      10: ["42°14'15.0000", "11°1'45.0000"],
      20: ["42°15'10.0000", "11°1'27.0000"],
    }),
    zones: [
      { zone: 'MA', sector: 'NO', coast: [27, 14, 44, 28] },
      { zone: 'MA', sector: 'NE', coast: [25, 26, 29, 35, 32] },
      { zone: 'MA', sector: 'S', coast: [12, 7, 8, 13, 18] },
      { zone: 'MB speciale', sector: 'N', coast: [21, 22, 31, 37, 38, 36, 33, 27] },
      { zone: 'MB speciale', sector: 'S', coast: [19, 43, 11, 5, 6, 9, 17, 23, 24] },
      // Fuori dalle zone MB: il lato verso l'isola è il bordo delle MB
      { zone: 'MC', sector: 'N', ring: [22, 30, 40, 42, 41, 39, 33, 36, 38, 37, 31] },
      { zone: 'MC', sector: 'S', ring: [43, 16, 4, 1, 2, 3, 10, 20, 23, 17, 9, 6, 5, 11] },
    ],
  },
  {
    id: 'gorgona',
    name: 'Gorgona',
    bbox: [43.42, 9.88, 43.445, 9.92],
    p: pts({
      17: ["43°26'22.0891", "9°54'4.89659"], // Punta di Cala Maestra
      18: ["43°26'56.5453", "9°54'5.15241"],
      15: ["43°26'20.8344", "9°52'47.8740"],
      10: ["43°25'26.5666", "9°52'34.2999"],
      7: ["43°25'2.58418", "9°52'47.0074"],
      5: ["43°24'41.4392", "9°53'34.3809"],
      6: ["43°24'44.5043", "9°54'29.0318"],
      8: ["43°25'5.99779", "9°55'1.05403"],
      12: ["43°25'32.3131", "9°54'27.5444"], // Punta N della Caletta
      14: ["43°25'54.9955", "9°54'29.4022"], // a N di Gorgona Scalo
      16: ["43°26'18.0000", "9°58'48.0000"],
      20: ["43°27'48.0000", "9°58'12.0000"],
      21: ["43°29'51.0000", "9°54'6.00000"],
      19: ["43°27'21.0000", "9°49'0.0000"],
      11: ["43°25'24.0000", "9°48'24.0000"],
      3: ["43°22'51.0000", "9°49'54.0000"],
      1: ["43°21'45.0000", "9°52'24.0000"],
      2: ["43°22'6.00000", "9°56'42.0000"],
      4: ["43°23'6.00000", "9°58'12.0000"],
      9: ["43°25'3.00000", "9°59'24.0000"],
      13: ["43°25'43.1301", "9°54'24.6942"], // a S di Gorgona Scalo
    }),
    zones: [
      { zone: 'MA', coast: [17, 18, 15, 10, 7, 5, 6, 8, 12] },
      { zone: 'MB', coast: [14, 16, 20, 21, 19, 11, 3, 1, 2, 4, 9, 13] },
    ],
  },
]

// Ord. UCM Ponza 04/2015: cerchi interdetti durante le manovre delle navi cisterna
const TANKER_BERTHS = [
  { id: 'ponza-a', place: 'Ponza, scogliera foranea del porto', lat: 40 + 53.8 / 60, lon: 12 + 58.0 / 60, r: 80 },
  { id: 'ponza-b', place: 'Ponza, Cala Inferno', lat: 40 + 55.2 / 60, lon: 12 + 58.2 / 60, r: 150 },
  { id: 'ponza-c', place: 'Ponza, Cala dell’Acqua', lat: 40 + 55.514 / 60, lon: 12 + 58.04 / 60, r: 80 },
  { id: 'ventotene-d', place: 'Ventotene, scogliera foranea del Porto Nuovo', lat: 40 + 47.94 / 60, lon: 13 + 26.09 / 60, r: 80 },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function overpass(query) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = SERVERS[attempt % SERVERS.length]
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(180000),
      })
      if (r.ok) return (await r.json()).elements
      console.warn(`  ${url} → ${r.status}, riprovo`)
    } catch (err) {
      console.warn(`  ${url} → ${err.message}, riprovo`)
    }
    await sleep(4000 * (attempt + 1))
  }
  throw new Error('Overpass non risponde')
}

// Linea di costa OSM dell'isola → poligono turf (lon, lat)
async function islandPolygon([s, w, n, e]) {
  const els = await overpass(`[out:json][timeout:120];way["natural"="coastline"](${s},${w},${n},${e});out geom;`)
  const segs = els.filter((el) => el.geometry).map((el) => el.geometry.map((p) => [p.lon, p.lat]))
  const same = (p, q) => p[0] === q[0] && p[1] === q[1]
  const rings = []
  const open = segs.map((s2) => [...s2])
  while (open.length) {
    let ring = open.shift()
    let grown = true
    while (!same(ring[0], ring[ring.length - 1]) && grown) {
      grown = false
      for (let i = 0; i < open.length; i++) {
        const sg = open[i]
        if (same(ring[ring.length - 1], sg[0])) ring = ring.concat(sg.slice(1))
        else if (same(sg[sg.length - 1], ring[0])) ring = sg.concat(ring.slice(1))
        else continue
        open.splice(i, 1)
        grown = true
        break
      }
    }
    if (same(ring[0], ring[ring.length - 1]) && ring.length >= 4) rings.push(turf.polygon([ring]))
  }
  if (!rings.length) throw new Error('linea di costa non chiusa')
  // L'isola è l'anello più grande; gli scogli attorno restano fuori (mare)
  rings.sort((a, b) => turf.area(b) - turf.area(a))
  return rings[0]
}

const ll = (p) => [p[1], p[0]] // [lat, lon] → [lon, lat]

function zonePolygon(isl, island, z) {
  if (z.ring || z.sortRing) {
    let ring = (z.ring || z.sortRing).map((k) => ll(isl.p[k]))
    if (z.sortRing) {
      const c = turf.centroid(turf.multiPoint(ring)).geometry.coordinates
      ring.sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]))
    }
    return turf.polygon([[...ring, ring[0]]])
  }
  const line = z.coast.map((k) => ll(isl.p[k]))
  // Chiusura lungo la riva, dal punto di costa finale a quello iniziale: dei
  // due archi quello che dà un poligono semplice e più piccolo (l'altro
  // girerebbe attorno a tutta l'isola)
  const ring = island.geometry.coordinates[0].slice(0, -1)
  const nearest = (p) => {
    let best = 0
    let bestD = Infinity
    ring.forEach((q, i) => {
      const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }
  const from = nearest(line[line.length - 1])
  const to = nearest(line[0])
  const arc = (dir) => {
    const out = []
    for (let i = from; ; i = (i + dir + ring.length) % ring.length) {
      out.push(ring[i])
      if (i === to) break
    }
    return out
  }
  // I punti di costa del Piano vanno sulla riva OSM (scarti di qualche metro
  // farebbero incrociare il bordo con la costa)
  const sea = line.slice(1, -1)
  const candidates = [arc(1), arc(-1)]
    .map((a) => turf.polygon([[...sea, ...a, sea[0]]]))
    .map((p) => ({ p, kinks: turf.kinks(p).features.length, area: turf.area(p) }))
    .sort((a, b) => a.kinks - b.kinks || a.area - b.area)
  const best = candidates[0]
  if (best.kinks) console.warn(`  ${isl.name} ${z.zone} ${z.sector || ''}: ${best.kinks} incroci col bordo`)
  return best.p
}

const round = (v) => Math.round(v * 1e5) / 1e5
function toAreas(geom, base) {
  const polys = geom.geometry.type === 'Polygon' ? [geom.geometry.coordinates] : geom.geometry.coordinates
  return polys
    .map((rings, i) => ({ rings: rings.map((r) => r.map(([lo, la]) => [round(la), round(lo)])), i }))
    .filter(({ rings }) => turf.area(turf.polygon(rings.map((r) => r.map(([la, lo]) => [lo, la])))) > 2000) // via le schegge
    .map(({ rings }, i, all) => {
      const flat = rings.flat()
      const lats = flat.map((p) => p[0])
      const lons = flat.map((p) => p[1])
      return {
        ...base,
        id: all.length > 1 ? `${base.id}-${i + 1}` : base.id,
        rings,
        bbox: [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)],
      }
    })
}

// Senza l'autorizzazione del Parco, per una barca a vela di 12 m: zone vietate
const NOGO = { pianosa: ['MA', 'MB speciale'], montecristo: ['MA'] }

const areas = []
for (const isl of ISLANDS) {
  process.stdout.write(`${isl.name}: costa … `)
  const island = await islandPolygon(isl.bbox)
  console.log(`${Math.round(turf.area(island) / 1e4) / 100} km²`)
  let taken = island // isola e zone più protette già assegnate
  for (const z of isl.zones) {
    let poly = zonePolygon(isl, island, z)
    const diff = turf.difference(turf.featureCollection([poly, taken]))
    if (!diff) {
      console.warn(`  ${isl.name} ${z.zone}: vuota`)
      continue
    }
    taken = turf.union(turf.featureCollection([taken, poly]))
    const kind = z.zone === 'MA' || NOGO[isl.id]?.includes(z.zone) ? 'nogo' : 'protected'
    const id = `pnat/${isl.id}-${z.zone.replace(' speciale', 's').toLowerCase()}${z.sector ? `-${z.sector.toLowerCase()}` : ''}`
    const made = toAreas(diff, { id, kind, name: `${PARK} – ${isl.name} · Zona ${z.zone}` })
    areas.push(...made)
    console.log(`  Zona ${z.zone}${z.sector ? ` ${z.sector}` : ''}: ${Math.round(turf.area(diff) / 1e4) / 100} km²${made.length > 1 ? ` in ${made.length} parti` : ''}`)
  }
  await sleep(1500)
}

for (const b of TANKER_BERTHS) {
  const c = turf.circle([b.lon, b.lat], b.r, { units: 'meters', steps: 32 })
  areas.push(...toAreas(c, { id: `ucm-ponza/${b.id}`, kind: 'restricted', name: `Navi cisterna – ${b.place}` }))
}

writeFileSync(
  OUT,
  JSON.stringify({
    source:
      'Piano del Parco Nazionale Arcipelago Toscano, NTA aprile 2024, Appendice A; Ord. UCM Ponza 04/2015. Riva da OpenStreetMap (ODbL). Fanno fede i testi ufficiali.',
    generated: new Date().toISOString().slice(0, 10),
    areas,
  })
)
console.log(`${areas.length} zone in ${OUT}`)
