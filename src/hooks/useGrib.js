import { useEffect, useRef, useState } from 'react'
import { gribGet, gribSet, gribEvict } from '../lib/cache.js'

/**
 * GRIB-like local field: campiona una griglia densa di punti
 * per un bbox, con dati orari (forecast_days=3).
 *
 * Include:
 * - Vento (speed, dir, gust) da Open-Meteo Forecast
 * - Corrente marina (velocity, direction) da Open-Meteo Marine
 *
 * Open-Meteo accetta max 50 coordinate per chiamata → griglia 7x7 = 49 punti.
 * Cache IndexedDB: sopravvive a refresh pagina, TTL 6 ore.
 */

const GRID_SIZE = 7
const REFRESH_MS = 30 * 60 * 1000

export default function useGrib(bounds, enabled) {
  const [grib, setGrib] = useState(null)
  const [currentField, setCurrentField] = useState(null)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(null)

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
      setCurrentField(null)
      return undefined
    }
    const [south, west, north, east] = key.split(',').map(Number)

    async function load() {
      // Try cache first (instant)
      const cached = await gribGet(key)
      if (cached && !abortRef.current?.signal?.aborted) {
        setGrib({
          grid: cached.grid,
          bounds: cached.bounds,
          updatedAt: cached.updatedAt,
        })
        setCurrentField({
          grid: cached.grid.map((g) => ({
            lat: g.lat, lon: g.lon, times: g.times,
            currSpeed: g.currSpeed, currDir: g.currDir,
          })),
          bounds: cached.bounds,
        })
        // If cache is fresh (< 30 min), skip network fetch
        if (Date.now() - cached.updatedAt < REFRESH_MS) {
          setLoading(false)
          return
        }
      }

      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)

      const points = []
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const lat = south + ((r + 0.5) / GRID_SIZE) * (north - south)
          const lon = west + ((c + 0.5) / GRID_SIZE) * (east - west)
          points.push({ lat, lon })
        }
      }

      const lats = points.map((p) => p.lat.toFixed(3)).join(',')
      const lons = points.map((p) => p.lon.toFixed(3)).join(',')

      const windParams = new URLSearchParams({
        latitude: lats,
        longitude: lons,
        hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        wind_speed_unit: 'kn',
        forecast_days: '3',
        timezone: 'UTC',
      })
      const marineParams = new URLSearchParams({
        latitude: lats,
        longitude: lons,
        hourly: 'wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction',
        forecast_days: '3',
        timezone: 'UTC',
      })

      try {
        const [windRes, marineRes] = await Promise.allSettled([
          fetch(`https://api.open-meteo.com/v1/forecast?${windParams}`, {
            signal: controller.signal,
          }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))),
          fetch(`https://marine-api.open-meteo.com/v1/marine?${marineParams}`, {
            signal: controller.signal,
          }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))),
        ])

        if (controller.signal.aborted) return

        const windData = windRes.status === 'fulfilled' ? windRes.value : null
        const marineData = marineRes.status === 'fulfilled' ? marineRes.value : null
        if (!windData) return

        const windList = Array.isArray(windData) ? windData : [windData]
        const marineList = marineData ? (Array.isArray(marineData) ? marineData : [marineData]) : []

        const grid = windList.map((d, i) => {
          const m = marineList[i]
          const times = d?.hourly?.time?.map((t) => `${t}Z`) || []
          return {
            lat: points[i]?.lat,
            lon: points[i]?.lon,
            times,
            wind: d?.hourly?.wind_speed_10m || [],
            windDir: d?.hourly?.wind_direction_10m || [],
            gust: d?.hourly?.wind_gusts_10m || [],
            wave: m?.hourly?.wave_height || null,
            waveDir: m?.hourly?.wave_direction || null,
            wavePeriod: m?.hourly?.wave_period || null,
            // Convert ocean current from km/h to knots (1 km/h = 0.539956 kn)
            currSpeed: m?.hourly?.ocean_current_velocity?.map((v) => (v != null ? v * 0.539956 : null)) || null,
            currDir: m?.hourly?.ocean_current_direction || null,
          }
        })

        if (!controller.signal.aborted) {
          setGrib({
            grid,
            bounds: { south, west, north, east },
            updatedAt: Date.now(),
          })
          setCurrentField({
            grid: grid.map((g) => ({
              lat: g.lat,
              lon: g.lon,
              times: g.times,
              currSpeed: g.currSpeed,
              currDir: g.currDir,
            })),
            bounds: { south, west, north, east },
          })
          // Persist to IndexedDB (async, fire-and-forget)
          gribSet(key, grid, { south, west, north, east }).then(() => gribEvict(10))
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

  return enabled ? { grib, currentField, loading } : null
}
