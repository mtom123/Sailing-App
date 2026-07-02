import { useEffect, useRef, useState } from 'react'

/*
 * Meteo marino da Open-Meteo (gratuito, senza chiave):
 * - Forecast API: vento a 10 m (velocità, direzione, raffiche) in nodi.
 * - Marine API: onde (altezza, direzione, periodo) e livello del mare (marea).
 * Aggiornamento quando il centro mappa si sposta in modo significativo
 * (griglia ~0.1°) oppure ogni 15 minuti.
 */

const REFRESH_MS = 15 * 60 * 1000

function buildForecastUrl(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    wind_speed_unit: 'kn',
    forecast_days: '3',
    timezone: 'auto',
  })
  return `https://api.open-meteo.com/v1/forecast?${p}`
}

function buildMarineUrl(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: 'wave_height,wave_direction,wave_period',
    hourly: 'wave_height,wave_direction,wave_period,sea_level_height_msl',
    forecast_days: '3',
    timezone: 'auto',
  })
  return `https://marine-api.open-meteo.com/v1/marine?${p}`
}

export default function useOpenMeteo(lat, lon) {
  const [state, setState] = useState({
    wind: null, // { speed, dir, gust } in kn / gradi
    wave: null, // { height, dir, period }
    hourly: null, // [{ t, wind, gust, windDir, wave, seaLevel }]
    updatedAt: null,
    error: null,
    loading: false,
  })
  const abortRef = useRef(null)

  // Chiave arrotondata: rifetch solo per spostamenti oltre ~11 km
  const key =
    lat != null && lon != null ? `${lat.toFixed(1)},${lon.toFixed(1)}` : null

  useEffect(() => {
    if (!key) return undefined
    const [kLat, kLon] = key.split(',').map(Number)

    async function load() {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState((s) => ({ ...s, loading: true }))

      const [forecastRes, marineRes] = await Promise.allSettled([
        fetch(buildForecastUrl(kLat, kLon), { signal: controller.signal }).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(`Forecast HTTP ${r.status}`))
        ),
        fetch(buildMarineUrl(kLat, kLon), { signal: controller.signal }).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(`Marine HTTP ${r.status}`))
        ),
      ])

      if (controller.signal.aborted) return

      const forecast = forecastRes.status === 'fulfilled' ? forecastRes.value : null
      const marine = marineRes.status === 'fulfilled' ? marineRes.value : null

      if (!forecast && !marine) {
        setState((s) => ({
          ...s,
          loading: false,
          error: 'Open-Meteo non raggiungibile (dati in cache se disponibili)',
        }))
        return
      }

      const wind = forecast?.current
        ? {
            speed: forecast.current.wind_speed_10m,
            dir: forecast.current.wind_direction_10m,
            gust: forecast.current.wind_gusts_10m,
          }
        : null

      const wave = marine?.current
        ? {
            height: marine.current.wave_height,
            dir: marine.current.wave_direction,
            period: marine.current.wave_period,
          }
        : null

      let hourly = null
      const fh = forecast?.hourly
      const mh = marine?.hourly
      const times = fh?.time || mh?.time
      if (times) {
        hourly = times.map((t, i) => ({
          t,
          wind: fh?.wind_speed_10m?.[i] ?? null,
          gust: fh?.wind_gusts_10m?.[i] ?? null,
          windDir: fh?.wind_direction_10m?.[i] ?? null,
          wave: mh?.wave_height?.[i] ?? null,
          seaLevel: mh?.sea_level_height_msl?.[i] ?? null,
        }))
      }

      setState({
        wind,
        wave,
        hourly,
        updatedAt: Date.now(),
        error: null,
        loading: false,
      })
    }

    load().catch(() => {})
    const timer = setInterval(() => load().catch(() => {}), REFRESH_MS)
    return () => {
      clearInterval(timer)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [key])

  return state
}
