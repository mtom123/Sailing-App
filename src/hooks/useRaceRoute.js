import { useEffect, useRef, useState } from 'react'
import { solveRaceCourse } from '../lib/raceRoute.js'
import { checkLeg } from '../lib/routeHazards.js'

/*
 * Rotta ideale da `from` lungo i punti `targets` (race.js → routeLegs),
 * ricalcolata quando la barca si sposta di un paio di centinaia di metri,
 * cambia il percorso, o ogni due minuti. Se un tratto porta su terra o bassi
 * fondali prova le altre mure; se nessuna va bene lo segnala (la rotta resta
 * da controllare a vista).
 *
 * Il controllo dei pericoli pesa (canvas grandi, iPad: memoria e blocchi
 * durante lo zoom): uno alla volta, a carta ferma, e solo quando cambiano i
 * bordi. Le previsioni seguono l'area della carta, quindi uno zoom non deve
 * far ripartire niente: i dati nuovi si leggono al giro dei due minuti.
 */

const REFRESH_MS = 120000
const CHECK_DELAY_MS = 3000
const LIVE_WIND_AHEAD_MS = 30 * 60 * 1000

// Il vento di bordo oscilla di continuo: conta solo un cambio vero
const windKey = (w) => (w ? `${Math.round(w.speed / 2)}/${Math.round(w.dir / 10)}` : '')

// Stessi bordi verso gli stessi punti: il controllo fatto vale ancora
const hazardKey = (route, from, targets, minDepth) =>
  [minDepth, from.lat.toFixed(2), from.lon.toFixed(2), ...targets.map((p) => `${p.lat},${p.lon}`), ...route.segments.flatMap((seg) => seg.legs.map((l) => `${Math.round(l.heading / 10)}${l.side}`))].join('|')

async function isClear(segment, minDepth) {
  for (let i = 1; i < segment.points.length; i++) {
    const r = await checkLeg(segment.points[i - 1], segment.points[i], minDepth).catch(() => ({ hazards: [] }))
    if (r.hazards?.some((h) => h.kind === 'land' || h.kind === 'shallow' || h.kind === 'nogo')) return false
  }
  return true
}

export default function useRaceRoute({ from, heading, targets, departMs, grib, currentField, polarKey, liveWind, minDepth }) {
  const [state, setState] = useState({ route: null, error: null, blocked: false })
  const [tick, setTick] = useState(0)
  const checked = useRef({ key: null, flips: [], blocked: false })
  const hasTargets = targets.length > 0

  useEffect(() => {
    if (!hasTargets) return undefined
    const t = setInterval(() => setTick((n) => n + 1), REFRESH_MS)
    return () => clearInterval(t)
  }, [hasTargets])

  const key =
    hasTargets && from
      ? [from.lat.toFixed(3), from.lon.toFixed(3), targets.map((p) => `${p.lat},${p.lon}`).join(';'), !!grib, departMs, polarKey, windKey(liveWind), tick].join('|')
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
      // Con l'ora di partenza conta il vento di allora; quello di bordo solo se è vicina
      const now = Date.now()
      const nowMs = Math.max(now, departMs || 0)
      const opts = { from, targets, nowMs, heading, grib, currentField, liveWind: nowMs - now < LIVE_WIND_AHEAD_MS ? liveWind : null, polarKey }
      const route = solveRaceCourse(opts)
      if (route.error) {
        if (alive) setState({ route: null, error: route.error, blocked: false })
        return
      }
      if (!alive) return
      const hazards = hazardKey(route, from, targets, minDepth)
      if (checked.current.key === hazards) {
        const { flips, blocked } = checked.current
        setState({ route: flips.length ? solveRaceCourse({ ...opts, flips }) : route, error: null, blocked })
        return
      }
      setState({ route, error: null, blocked: false })

      await new Promise((resolve) => setTimeout(resolve, CHECK_DELAY_MS))
      const flips = []
      let blocked = false
      for (let i = 0; alive && i < route.segments.length; i++) {
        if (await isClear(route.segments[i], minDepth)) continue
        const other = solveRaceCourse({ ...opts, flips: { ...flips, [i]: true } })
        if (!other.error && (await isClear(other.segments[i], minDepth))) flips[i] = true
        else blocked = true
      }
      if (!alive) return
      checked.current = { key: hazards, flips, blocked }
      if (blocked || flips.length) setState({ route: flips.length ? solveRaceCourse({ ...opts, flips }) : route, error: null, blocked })
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
