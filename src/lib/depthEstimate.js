/**
 * Profondità stimata vicino a riva, dove la griglia EMODnet (~115 m) non vale
 * (mescola mare e terra: 0,1–0,3 m a 80 m da una spiaggia). Si prende il
 * primo fondale affidabile al largo e si scende in linea retta dalla riva
 * (0 m, costa OpenStreetMap) fino a lì. Solo una stima: fa fede lo scandaglio.
 */
import L from 'leaflet'
import { prepareDepth } from './depthAt.js'
import { coastFeatures, waterRings } from './waterMask.js'

const M = 111320
const STEP_M = 40
const MAX_M = 600
const DIRS = 16

// Distanza (m) dal punto al lato più vicino degli anelli
function distToEdge(rings, lat, lon) {
  const kx = M * Math.cos((lat * Math.PI) / 180)
  let best = Infinity
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i][1] - lon) * kx
      const ay = (ring[i][0] - lat) * M
      const bx = (ring[i + 1][1] - lon) * kx
      const by = (ring[i + 1][0] - lat) * M
      if (Math.min(Math.abs(ax), Math.abs(bx)) > best && Math.sign(ax) === Math.sign(bx)) continue
      if (Math.min(Math.abs(ay), Math.abs(by)) > best && Math.sign(ay) === Math.sign(by)) continue
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1e-9)))
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return best
}

// In porto le banchine sono verticali e i bacini dragati: la discesa dalla
// riva non vale (alla Fiera di Genova dava 0,6–1,6 m)
const HARBOR_M = 600

/** { depth, source } stimata tra riva e carta, { harbor: true } in porto, o null */
export async function coastalDepthEstimate(lat, lon) {
  const kx = M * Math.cos((lat * Math.PI) / 180)
  const near = L.latLngBounds([lat - HARBOR_M / M, lon - HARBOR_M / kx], [lat + HARBOR_M / M, lon + HARBOR_M / kx])
  const f = await coastFeatures(near, 9).catch(() => null)
  if (f?.harbors.some(([a, b]) => Math.hypot((a - lat) * M, (b - lon) * kx) <= HARBOR_M)) return { harbor: true }
  const rings = []
  for (let r = STEP_M; r <= MAX_M; r += STEP_M) {
    rings.push(
      Array.from({ length: DIRS }, (_, k) => {
        const a = (k * 2 * Math.PI) / DIRS
        return [lat + (r * Math.sin(a)) / M, lon + (r * Math.cos(a)) / kx]
      })
    )
  }
  const sample = await prepareDepth([...rings[rings.length - 1], [lat, lon]])
  // Il fondale affidabile più vicino (il primo anello che ne ha; lì il più basso)
  let found = null
  for (let i = 0; i < rings.length && !found; i++) {
    for (const [a, b] of rings[i]) {
      const d = sample(a, b)
      if (d?.reliable && (!found || d.depth < found.depth)) found = { depth: d.depth, distM: (i + 1) * STEP_M, source: d.source }
    }
  }
  if (!found) return null
  const box = L.latLngBounds([lat - MAX_M / M, lon - MAX_M / kx], [lat + MAX_M / M, lon + MAX_M / kx])
  const water = (await waterRings(box, 16, { oceanOnly: true }).catch(() => null)) || (await waterRings(box, 14, { oceanOnly: true }).catch(() => null))
  if (!water?.length) return null
  const shoreM = distToEdge(water, lat, lon)
  if (!Number.isFinite(shoreM)) return null
  const depth = Math.max(0.5, (found.depth * shoreM) / (shoreM + found.distM))
  return {
    depth,
    source: `stima a ${Math.round(shoreM)} m da riva: verifica con lo scandaglio`,
    detail: `${found.source} ${Math.round(found.depth)} m a ${found.distM} m, in linea retta dalla riva`,
  }
}
