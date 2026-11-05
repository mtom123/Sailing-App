import { useEffect, useState } from 'react'
import { solveRaceRoute } from '../lib/raceRoute.js'
import { checkLeg } from '../lib/routeHazards.js'

/*
 * Rotta ideale dalla barca alla boa, ricalcolata quando la barca si sposta
 * di un paio di centinaia di metri, cambiano boa o previsioni, o ogni due
 * minuti. Se il primo bordo porta su terra o bassi fondali prova le altre
 * mure; se nessuna va bene lo segnala (la rotta resta da controllare a vista).
 */

const REFRESH_MS = 120000

// Il vento di bordo oscilla di continuo: conta solo un cambio vero
const windKey = (w) => (w ? `${Math.round(w.speed / 2)}/${Math.round(w.dir / 10)}` : '')

async function isClear(route, minDepth) {
  const results = await Promise.all(
    route.points.slice(1).map((p, i) => checkLeg(route.points[i], p, minDepth).catch(() => ({ hazards: [] })))
  )
  return !results.some((r) => r.hazards?.some((h) => h.kind === 'land' || h.kind === 'shallow' || h.kind === 'nogo'))
}

export default function useRaceRoute({ geo, mark, grib, currentField, polarKey, liveWind, minDepth }) {
  const [state, setState] = useState({ route: null, error: null, blocked: false })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!mark) return undefined
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => clearInterval(t)
  }, [mark])

  const key =
    mark && geo.lat != null
      ? [geo.lat.toFixed(3), geo.lon.toFixed(3), mark.lat, mark.lon, grib?.updatedAt, polarKey, windKey(liveWind), tick].join('|')
      : null

  useEffect(() => {
    if (!key) {
      setState({ route: null, error: null, blocked: false })
      return undefined
    }
    if (!grib && !liveWind) {
      setState({ route: null, error: 'In attesa delle previsioni del vento', blocked: false })
      return undefined
    }
    let alive = true
    const timer = setTimeout(async () => {
      const opts = { from: { lat: geo.lat, lon: geo.lon }, mark, nowMs: Date.now(), heading: geo.cog, grib, currentField, liveWind, polarKey }
      const route = solveRaceRoute(opts)
      if (route.error) {
        if (alive) setState({ route: null, error: route.error, blocked: false })
        return
      }
      if (alive) setState({ route, error: null, blocked: false })
      if (await isClear(route, minDepth)) return
      const other = solveRaceRoute({ ...opts, flip: true })
      if (!alive) return
      if (!other.error && (await isClear(other, minDepth))) {
        if (alive) setState({ route: other, error: null, blocked: false })
      } else if (alive) {
        setState({ route, error: null, blocked: true })
      }
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
