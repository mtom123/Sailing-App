import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore.js'
import { checkOptions, markObstacles, routeLandGrid } from '../lib/routeHazards.js'
import { mapAtRest } from '../lib/offlinePack.js'

const MAX_OBSTACLE_ROUNDS = 3
const OBSTACLE_BUDGET_MS = 30000 // oltre non si ricalcola: resta l'avviso sull'opzione

/**
 * Hook: usa il routing isocrone via Web Worker per non bloccare la UI.
 * Per rotte brevi (<5nm) potrebbe essere più veloce inline, ma usiamo
 * sempre il worker per consistenza.
 *
 * Output: routeOptions { fastest, comfortable, safest } | null
 */
export default function useWeatherRouting({ start, goal, grib, currentField, gribKey, enabled }) {
  const [routeOptions, setRouteOptions] = useState(null)
  const [computing, setComputing] = useState(false)
  const [duration, setDuration] = useState(null)
  const workerRef = useRef(null)
  const reqIdRef = useRef(0)
  const { boat, departureOffsetH } = useAppStore()

  // Del grib conta solo l'area (gribKey): se seguisse la carta, ogni zoom farebbe
  // ripartire il calcolo
  const key =
    enabled && start && goal && grib
      ? `${start.lat.toFixed(3)},${start.lon.toFixed(3)};${goal.lat.toFixed(3)},${goal.lon.toFixed(3)};${gribKey}`
      : null

  useEffect(() => {
    // Init worker once
    if (!workerRef.current) {
      try {
        workerRef.current = new Worker(new URL('../routing/routingWorker.js', import.meta.url), { type: 'module' })
      } catch (e) {
        console.warn('Worker init failed, will fallback to inline:', e)
      }
    }
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!key) {
      setRouteOptions(null)
      setComputing(false)
      return undefined
    }

    setComputing(true)
    let alive = true

    const solve = (opts) =>
      new Promise((resolve, reject) => {
        const worker = workerRef.current
        if (!worker) {
          // Senza worker si calcola qui, bloccando la pagina
          import('../routing/isochroneEngine.js').then(({ computeRouteOptions }) => resolve(computeRouteOptions(opts)), reject)
          return
        }
        const id = ++reqIdRef.current
        const onMessage = (e) => {
          if (e.data.id !== id) return
          worker.removeEventListener('message', onMessage)
          if (e.data.type === 'success') resolve(e.data.result)
          else reject(new Error(e.data.error))
        }
        worker.addEventListener('message', onMessage)
        worker.postMessage({ id, opts })
      })

    const run = async () => {
      const t0 = Date.now()
      // La costa vera: senza, il motore ha solo una maschera grossolana
      const landGrid = await routeLandGrid(start, goal).catch(() => null)
      if (!alive) return
      const opts = {
        start,
        goal,
        grib,
        currentField,
        polarKey: boat.polarProfile,
        propulsion: { mode: boat.propulsion, motorKn: boat.motoringSpeedKn, motorBelowKn: boat.motorBelowKn },
        departureMs: Date.now() + departureOffsetH * 3600 * 1000,
        maxHours: 48,
        landGrid,
      }
      const minDepth = (boat.draftM ?? 1.9) + (boat.safetyMarginM ?? 1)
      try {
        // La griglia del calcolo è larga: ciò che il controllo fine trova sulle
        // rotte diventa terra, e si ricalcola
        let result = await solve(opts)
        for (let round = 0; alive; round++) {
          const check = await checkOptions(result, minDepth, { mapAtRest, isAlive: () => alive })
          if (!check) return
          if (!check.points.length || !landGrid || round === MAX_OBSTACLE_ROUNDS || Date.now() - t0 > OBSTACLE_BUDGET_MS) {
            for (const key of Object.keys(check.unsafe)) result[key] = { ...result[key], unsafe: true }
            break
          }
          markObstacles(landGrid, check.points)
          result = await solve(opts)
        }
        if (!alive) return
        setRouteOptions(result)
        setDuration(Date.now() - t0)
      } catch (err) {
        console.error('Weather routing error:', err)
        if (alive) setRouteOptions(null)
      }
      if (alive) setComputing(false)
    }
    run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, boat.polarProfile, boat.propulsion, boat.motoringSpeedKn, boat.motorBelowKn, boat.draftM, boat.safetyMarginM, departureOffsetH])

  return { routeOptions, computing, duration }
}
