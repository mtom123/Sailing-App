/*
 * Dati della pagina di prova della carta veloce (public/prova-carta.html):
 * isobate e fasce EMODnet e isobate di dettaglio della Regione Liguria,
 * calcolate qui una volta sola e salvate come GeoJSON. Nella carta vera
 * diventeranno tasselli PMTiles.
 *
 * Uso: node tools/proto-chart-data.mjs
 */
import { writeFileSync } from 'node:fs'
import { contours } from 'd3-contour'
import { loadBlock, mergeBlocks, blockIndex, BLOCK, CELLS_PER_DEGREE } from '../src/lib/depthGrid.js'
import { buildIsobaths, chaikin, fillCoastalGaps } from '../src/lib/isobathVector.js'

const AREAS = {
  genova: { s: 44.37, w: 8.84, n: 44.42, e: 8.98, liguria: false }, // il rilievo regionale non copre il porto
  finale: { s: 44.14, w: 8.3, n: 44.19, e: 8.42, liguria: true },
  corsica: { s: 41.44, w: 9.22, n: 41.58, e: 9.34, liguria: false },
}
const BANDS = [20, 10, 5, 2] // dal più profondo: ogni fascia copre la precedente
const OUT = 'public/prova-carta'
const r5 = (v) => Math.round(v * 1e5) / 1e5

async function emodnet(a) {
  const bx0 = blockIndex(a.w)
  const bx1 = blockIndex(a.e)
  const by0 = blockIndex(a.s)
  const by1 = blockIndex(a.n)
  const jobs = []
  for (let bx = bx0; bx <= bx1; bx++) for (let by = by0; by <= by1; by++) jobs.push(loadBlock(bx, by))
  const grid = mergeBlocks(await Promise.all(jobs), bx0 * BLOCK, (bx1 + 1) * BLOCK - 1, by0 * BLOCK, (by1 + 1) * BLOCK - 1)
  const { lines } = buildIsobaths(grid)
  const lineFeatures = lines.map((l) => ({
    type: 'Feature',
    properties: { depth: l.depth },
    geometry: { type: 'LineString', coordinates: l.path.map(([lat, lon]) => [r5(lon), r5(lat)]) },
  }))
  // Fasce: area con fondale ≤ d (terra compresa: la copre la terra della carta)
  const values = fillCoastalGaps(grid)
  const toLonLat = ([x, y]) => [r5((grid.iMin + x) / CELLS_PER_DEGREE), r5((grid.jMax + 1 - y) / CELLS_PER_DEGREE)]
  const gen = contours().size([grid.width, grid.height])
  const bandFeatures = BANDS.map((d) => {
    const geom = gen.contour(values, -d)
    return {
      type: 'Feature',
      properties: { depth: d },
      geometry: {
        type: 'MultiPolygon',
        coordinates: geom.coordinates.map((poly) => poly.map((ring) => chaikin(ring, true).map(toLonLat)).map((ring) => [...ring, ring[0]])),
      },
    }
  })
  return { lineFeatures, bandFeatures }
}

// Douglas-Peucker in gradi, ~3 m (come liguriaIsobaths.js)
function simplify(points, tol = 0.00003) {
  if (points.length < 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-18
    let max = -1
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
      const d = Math.hypot(ax + t * dx - px, ay + t * dy - py)
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > tol) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

// Isobate multibeam della Regione Liguria (WFS M2112:L7174), come liguriaIsobaths.js
async function liguria(a) {
  const CELL = 0.05
  const feats = []
  for (let i = Math.floor(a.w / CELL); i <= Math.floor(a.e / CELL); i++) {
    for (let j = Math.floor(a.s / CELL); j <= Math.floor(a.n / CELL); j++) {
      const bbox = [i * CELL, j * CELL, (i + 1) * CELL, (j + 1) * CELL].map((v) => v.toFixed(4)).join(',')
      const url =
        'https://geoservizi.regione.liguria.it/geoserver/M2112/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=M2112:L7174' +
        `&outputFormat=application/json&srsName=EPSG:4326&bbox=${bbox},EPSG:4326`
      const r = await fetch(url)
      if (!r.ok) throw new Error(`Liguria WFS ${r.status}`)
      const json = await r.json()
      for (const f of json.features || []) {
        const depth = -Number(f.properties.VALUE)
        if (!(depth > 0)) continue
        const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
        for (const part of parts) {
          const pts = simplify(part).map(([lon, lat]) => [r5(lon), r5(lat)])
          if (pts.length >= 2) feats.push({ type: 'Feature', properties: { depth }, geometry: { type: 'LineString', coordinates: pts } })
        }
      }
    }
  }
  return feats
}

const fc = (features) => JSON.stringify({ type: 'FeatureCollection', features })
for (const [name, a] of Object.entries(AREAS)) {
  const { lineFeatures, bandFeatures } = await emodnet(a)
  writeFileSync(`${OUT}/${name}-emodnet-lines.geojson`, fc(lineFeatures))
  writeFileSync(`${OUT}/${name}-emodnet-bands.geojson`, fc(bandFeatures))
  let lig = 0
  if (a.liguria) {
    const feats = await liguria(a)
    lig = feats.length
    writeFileSync(`${OUT}/${name}-liguria-lines.geojson`, fc(feats))
  }
  console.log(name, 'EMODnet linee', lineFeatures.length, 'Liguria linee', lig)
}
