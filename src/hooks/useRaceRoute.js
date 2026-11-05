import { useEffect, useState } from 'react'
import { solveRaceCourse } from '../lib/raceRoute.js'
import { checkLeg } from '../lib/routeHazards.js'

/*
 * Rotta ideale dalla barca lungo i punti che restano del percorso,
 * ricalcolata quando la barca si sposta di un paio di centinaia di metri,
 * cambiano percorso o previsioni, o ogni due minuti. Se un tratto porta su
 * terra o bassi fondali prova le altre mure; se nessuna va bene lo segnala
 * (la rotta resta da controllare a vista).
 */

const REFRESH_MS = 120000

// Il vento di bordo oscilla di continuo: conta solo un cambio vero
const windKey = (w) => (w ? `${Math.round(w.speed / 2)}/${Math.round(w.dir / 10)}` : '')

async function isClear(segment, minDepth) {
  const results = await Promise.all(
    segment.points.slice(1).map((p, i) => checkLeg(segment.points[i], p, minDepth).catch(() => ({ hazards: [] })))
  )
  return !results.some((r) => r.hazards?.some((h) => h.kind === 'land' || h.kind === 'shallow' || h.kind === 'nogo'))
}

export default function useRaceRoute({ geo, targets, grib, currentField, polarKey, liveWind, minDepth }) {
  const [state, setState] = useState({ route: null, error: null, blocked: false })
  const [tick, setTick] = useState(0)
  const hasTargets = targets.length > 0

  useEffect(() => {
    if (!hasTargets) return undefined
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => clearInterval(t)
  }, [hasTargets])

  const key =
    hasTargets && geo.lat != null
      ? [geo.lat.toFixed(3), geo.lon.toFixed(3), targets.map((p) => `${p.lat},${p.lon}`).join(';'), grib?.updatedAt, polarKey, windKey(liveWind), tick].join('|')
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
      const opts = { from: { lat: geo.lat, lon: geo.lon }, targets, nowMs: Date.now(), heading: geo.cog, grib, currentField, liveWind, polarKey }
      const route = solveRaceCourse(opts)
      if (route.error) {
        if (alive) setState({ route: null, error: route.error, blocked: false })
        return
      }
      if (alive) setState({ route, error: null, blocked: false })

      const flips = []
      let blocked = false
      for (let i = 0; i < route.segments.length; i++) {
        if (await isClear(route.segments[i], minDepth)) continue
        const other = solveRaceCourse({ ...opts, flips: { ...flips, [i]: true } })
        if (!other.error && (await isClear(other.segments[i], minDepth))) flips[i] = true
        else blocked = true
        if (!alive) return
      }
      if (alive && (blocked || flips.length)) setState({ route: flips.length ? solveRaceCourse({ ...opts, flips }) : route, error: null, blocked })
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
