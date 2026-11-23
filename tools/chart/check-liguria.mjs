// Le isobate basse della Regione Liguria cadono in acqua secondo la costa OSM? (controllo di georeferenziazione)
import { liguriaIn, waterTile } from './sources.js'
import { lonLatToMerc } from './tiler.js'
const lines = await liguriaIn(7.5, 43.7, 10.2, 44.5)
let seed = 7; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const Z = 2 ** 14, cache = new Map()
async function inWater(lon, lat) {
  const [mx, my] = lonLatToMerc(lon, lat); const x = Math.floor(mx * Z), y = Math.floor(my * Z), k = `${x},${y}`
  if (!cache.has(k)) cache.set(k, await waterTile(x, y))
  const t = cache.get(k); if (!t) return false
  const px = (mx * Z - x) * t.extent, py = (my * Z - y) * t.extent
  let inside = false
  for (const ring of t.rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const res = {}
for (const d of [1, 2, 3, 5, 10, 20]) {
  const L = lines.filter((l) => l.depth === d); let n = 0, land = 0
  for (let i = 0; i < 400 && L.length; i++) {
    const l = L[Math.floor(rand() * L.length)]; const p = l.pts[Math.floor(rand() * l.pts.length)]
    n++; if (!(await inWater(p[0], p[1]))) land++
  }
  res[d] = { linee: L.length, punti: n, su_terra_pct: n ? +(100 * land / n).toFixed(1) : null }
}
console.log(JSON.stringify(res, null, 1))
