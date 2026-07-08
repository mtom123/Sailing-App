import { useEffect, useRef, useState } from 'react'
import { computeRouteOptions } from '../routing/isochroneEngine.js'
import { useAppStore } from '../store/useAppStore.js'

/**
 * Hook: usa il worker isocrone per calcolare 3 opzioni di rotta.
 * Inputs: start (geo position), goal (last waypoint), grib (wind field).
 * Output: routeOptions { fastest, comfortable, safest } | null
 */
export default function useWeatherRouting({ start, goal, grib, enabled }) {
  const [routeOptions, setRouteOptions] = useState(null)
  const [computing, setComputing] = useState(false)
  const abortRef = useRef(null)
  const { boat, departureOffsetH } = useAppStore()

  const key =
    enabled && start && goal && grib
      ? `${start.lat.toFixed(2)},${start.lon.toFixed(2)};${goal.lat.toFixed(2)},${goal.lon.toFixed(2)}`
      : null

  useEffect(() => {
    if (!key) {
      setRouteOptions(null)
      return undefined
    }
    if (abortRef.current) abortRef.current.abort = true
    const myAbort = { abort: false }
    abortRef.current = myAbort
    setComputing(true)

    // Run async (yield al main thread)
    const timer = setTimeout(() => {
      try {
        const opts = computeRouteOptions({
          start,
          goal,
          grib,
          polarKey: boat.polarProfile,
          departureMs: Date.now() + departureOffsetH * 3600 * 1000,
          maxHours: 48,
          isLand: () => false, // TODO: integrare land mask
        })
        if (!myAbort.abort) {
          setRouteOptions(opts)
        }
      } catch (err) {
        console.error('Routing error:', err)
      } finally {
        if (!myAbort.abort) setComputing(false)
      }
    }, 50)

    return () => {
      clearTimeout(timer)
      if (abortRef.current) abortRef.current.abort = true
    }
  }, [key, grib, boat.polarProfile, departureOffsetH])

  return { routeOptions, computing }
}
