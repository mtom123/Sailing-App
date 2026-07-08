import { useEffect, useRef, useState } from 'react'

/**
 * GRIB-like local wind grid: campiona una griglia densa di punti
 * per un bbox, con dati orari (forecast_days=3).
 *
 * Rispetto a useWindField (solo 12 punti current), questo ritorna
 * una matrice NxN x ore per alimentare il routing isocrone.
 *
 * Open-Meteo accetta max 50 coordinate per chiamata → griglia 7x7 = 49 punti.
 */
const GRID_SIZE = 7
const MAX_POINTS_PER_CALL = 50
const REFRESH_MS = 30 * 60 * 1000

export default function useGrib(bounds, enabled) {
  const [grib, setGrib] = useState(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(null)

  // Key arrotondata a 0.2° per evitare rifetch su micro-pan
  const key =
    enabled && bounds
      ? [
          bounds.south.toFixed(1),
          bounds.west.toFixed(1),
          bounds.north.toFixed(1),
          bounds.east.toFixed(1),
        ].join(',')
      : null

  useEffect(() => {
    if (!key) {
      setGrib(null)
      return undefined
    }
    const [south, west, north, east] = key.split(',').map(Number)

    async function load() {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)

      // Genera griglia NxN
      const points = []
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const lat = south + ((r + 0.5) / GRID_SIZE) * (north - south)
          const lon = west + ((c + 0.5) / GRID_SIZE) * (east - west)
          points.push({ lat, lon })
        }
      }

      // Se < 50 punti → singola chiamata; altrimenti split (in futuro)
      const lats = points.map((p) => p.lat.toFixed(3)).join(',')
      const lons = points.map((p) => p.lon.toFixed(3)).join(',')

      const params = new URLSearchParams({
        latitude: lats,
        longitude: lons,
        hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        wind_speed_unit: 'kn',
        forecast_days: '3',
        timezone: 'UTC',
      })

      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data) ? data : [data]

        const grid = list.map((d, i) => ({
          lat: points[i]?.lat,
          lon: points[i]?.lon,
          times: d?.hourly?.time?.map((t) => `${t}Z`) || [],
          wind: d?.hourly?.wind_speed_10m || [],
          windDir: d?.hourly?.wind_direction_10m || [],
          gust: d?.hourly?.wind_gusts_10m || [],
        }))

        if (!controller.signal.aborted) {
          setGrib({
            grid,
            bounds: { south, west, north, east },
            updatedAt: Date.now(),
          })
        }
      } catch (e) {
        // mantieni ultimo
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    const debounce = setTimeout(load, 600)
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      clearTimeout(debounce)
      clearInterval(timer)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [key])

  return enabled ? grib : null
}
