import { useEffect, useMemo, useRef, useState } from 'react'
import { etaTimes, routeLegs, windAngleToCourse } from '../lib/route.js'
import { cardinal } from '../lib/geo.js'

/*
 * Weather routing assistito: per ogni tratta della rotta interroga Open-Meteo
 * (vento + onde, multi-coordinate in una sola chiamata) all'orario di
 * passaggio previsto, valuta comfort e rischi, e cerca la finestra di
 * partenza migliore nelle prossime 24 ore.
 */

const DEPARTURE_OFFSETS_H = [0, 3, 6, 9, 12, 18, 24]

function nearestHourIdx(times, targetMs) {
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(new Date(times[i]).getTime() - targetMs)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return best
}

// Penalità di una tratta date le condizioni al passaggio
function legPenalty({ wind, gust, wave, twa }) {
  let p = 0
  if (wind != null) {
    if (wind > 28) p += 4
    else if (wind > 22) p += 2.5
    else if (wind > 16) p += 1
  }
  if (gust != null && gust > 30) p += 2
  if (wave != null) {
    if (wave > 2.5) p += 3
    else if (wave > 1.5) p += 1.5
    else if (wave > 1) p += 0.5
  }
  if (twa != null && twa < 45) p += 1.5 // bolina stretta / vento in prua
  return p
}

function legVerdict(cond) {
  const p = legPenalty(cond)
  if (p >= 4) return { level: 'danger', label: 'Critico' }
  if (p >= 1.5) return { level: 'caution', label: 'Impegnativo' }
  return { level: 'safe', label: 'Buono' }
}

export default function useRouteWeather(waypoints, planSpeed) {
  const [grid, setGrid] = useState(null) // dati orari per waypoint
  const abortRef = useRef(null)

  const key =
    waypoints.length >= 2
      ? waypoints.map((w) => `${w.lat.toFixed(2)},${w.lon.toFixed(2)}`).join(';')
      : null

  useEffect(() => {
    if (!key) {
      setGrid(null)
      return undefined
    }
    const coords = key.split(';').map((s) => s.split(',').map(Number))

    async function load() {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const lats = coords.map((c) => c[0].toFixed(3)).join(',')
      const lons = coords.map((c) => c[1].toFixed(3)).join(',')
      const windP = new URLSearchParams({
        latitude: lats,
        longitude: lons,
        hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        wind_speed_unit: 'kn',
        forecast_days: '3',
        timezone: 'UTC',
      })
      const waveP = new URLSearchParams({
        latitude: lats,
        longitude: lons,
        hourly: 'wave_height',
        forecast_days: '3',
        timezone: 'UTC',
      })
      const [windRes, waveRes] = await Promise.allSettled([
        fetch(`https://api.open-meteo.com/v1/forecast?${windP}`, {
          signal: controller.signal,
        }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))),
        fetch(`https://marine-api.open-meteo.com/v1/marine?${waveP}`, {
          signal: controller.signal,
        }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))),
      ])
      if (controller.signal.aborted) return

      const windData = windRes.status === 'fulfilled' ? windRes.value : null
      const waveData = waveRes.status === 'fulfilled' ? waveRes.value : null
      if (!windData) {
        setGrid(null)
        return
      }
      const windList = Array.isArray(windData) ? windData : [windData]
      const waveList = waveData ? (Array.isArray(waveData) ? waveData : [waveData]) : []

      setGrid(
        coords.map((c, i) => ({
          times: windList[i]?.hourly?.time || [],
          wind: windList[i]?.hourly?.wind_speed_10m || [],
          windDir: windList[i]?.hourly?.wind_direction_10m || [],
          gust: windList[i]?.hourly?.wind_gusts_10m || [],
          wave: waveList[i]?.hourly?.wave_height || null,
        }))
      )
    }

    load().catch(() => setGrid(null))
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [key])

  return useMemo(() => {
    if (!grid || !key || waypoints.length < 2) return null
    const legs = routeLegs(waypoints)

    function evaluate(departureMs) {
      const etas = etaTimes(waypoints, planSpeed, departureMs)
      const legReports = legs.map((leg, i) => {
        // condizioni al waypoint di arrivo della tratta, all'ora di passaggio
        const g = grid[Math.min(i + 1, grid.length - 1)]
        if (!g || !g.times.length) {
          return { ...leg, cond: null, verdict: { level: 'unknown', label: 'N/D' } }
        }
        // Le API ritornano orari UTC senza suffisso Z
        const hi = nearestHourIdx(g.times.map((t) => `${t}Z`), etas[i + 1])
        const cond = {
          wind: g.wind[hi] ?? null,
          windDir: g.windDir[hi] ?? null,
          gust: g.gust[hi] ?? null,
          wave: g.wave ? g.wave[hi] ?? null : null,
          twa:
            g.windDir[hi] != null ? windAngleToCourse(g.windDir[hi], leg.brg) : null,
          at: etas[i + 1],
        }
        return { ...leg, cond, verdict: legVerdict(cond), penalty: legPenalty(cond) }
      })
      const score = legReports.reduce((s, l) => s + (l.penalty || 0), 0)
      return { legReports, score, departureMs }
    }

    const now = evaluate(Date.now())
    const windows = DEPARTURE_OFFSETS_H.map((h) =>
      evaluate(Date.now() + h * 3600 * 1000)
    )
    let best = windows[0]
    for (const w of windows) if (w.score < best.score - 0.5) best = w

    return {
      legs: now.legReports,
      score: now.score,
      bestDeparture:
        best.departureMs > Date.now() + 30 * 60 * 1000
          ? { at: best.departureMs, score: best.score }
          : null,
      describe: (cond) =>
        cond
          ? `${Math.round(cond.wind ?? 0)} kn da ${cardinal(cond.windDir)}${
              cond.wave != null ? ` · onda ${cond.wave.toFixed(1)} m` : ''
            }${cond.twa != null && cond.twa < 45 ? ' · BOLINA' : ''}`
          : 'N/D',
    }
  }, [grid, key, waypoints, planSpeed])
}
