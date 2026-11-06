import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore.js'
import { routeLandGrid } from '../lib/routeHazards.js'

/**
 * Hook: usa il routing isocrone via Web Worker per non bloccare la UI.
 * Per rotte brevi (<5nm) potrebbe essere più veloce inline, ma usiamo
 * sempre il worker per consistenza.
 *
 * Output: routeOptions { fastest, comfortable, safest } | null
 */
export default function useWeatherRouting({ start, goal, grib, currentField, enabled }) {
  const [routeOptions, setRouteOptions] = useState(null)
  const [computing, setComputing] = useState(false)
  const [duration, setDuration] = useState(null)
  const workerRef = useRef(null)
  const reqIdRef = useRef(0)
  const { boat, departureOffsetH } = useAppStore()

  // Niente grib nella chiave: segue l'area della carta, e ogni zoom farebbe
  // ripartire il calcolo. Basta che ci sia
  const key =
    enabled && start && goal && grib
      ? `${start.lat.toFixed(3)},${start.lon.toFixed(3)};${goal.lat.toFixed(3)},${goal.lon.toFixed(3)}`
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
      return undefined
    }

    const reqId = ++reqIdRef.current
    setComputing(true)
    let alive = true
    let stop = () => {}

    const run = async () => {
      // La costa vera: senza, il motore ha solo una maschera grossolana
      const landGrid = await routeLandGrid(start, goal).catch(() => null)
      if (!alive) return
      const opts = {
        start,
        goal,
        grib,
        currentField,
        polarKey: boat.polarProfile,
        departureMs: Date.now() + departureOffsetH * 3600 * 1000,
        maxHours: 48,
        landGrid,
      }

      const worker = workerRef.current
      if (worker) {
        // Use worker
        const onMessage = (e) => {
          if (e.data.id !== reqId) return // stale response
          if (e.data.type === 'success') {
            setRouteOptions(e.data.result)
            setDuration(e.data.duration)
          } else {
            console.error('Worker routing error:', e.data.error)
            setRouteOptions(null)
          }
          setComputing(false)
        }
        worker.addEventListener('message', onMessage)
        worker.postMessage({ id: reqId, opts })
        stop = () => worker.removeEventListener('message', onMessage)
      } else {
        // Fallback: inline (block UI)
        console.warn('Worker not available, using inline routing')
        import('../routing/isochroneEngine.js').then(({ computeRouteOptions }) => {
          if (reqId !== reqIdRef.current) return // stale
          try {
            const t0 = Date.now()
            const result = computeRouteOptions(opts)
            setRouteOptions(result)
            setDuration(Date.now() - t0)
          } catch (err) {
            console.error('Inline routing error:', err)
            setRouteOptions(null)
          }
          setComputing(false)
        })
      }
    }
    run()
    return () => {
      alive = false
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, boat.polarProfile, departureOffsetH])

  return { routeOptions, computing, duration }
}
