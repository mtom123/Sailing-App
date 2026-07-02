import { useEffect, useRef, useState } from 'react'

/*
 * Campo vento a griglia per l'overlay di frecce sulla mappa.
 * Open-Meteo accetta liste di coordinate in una singola chiamata:
 * campioniamo una griglia 4×3 sui bounds correnti (12 punti, 1 request).
 */

const GRID_COLS = 4
const GRID_ROWS = 3
const REFRESH_MS = 10 * 60 * 1000

function gridFromBounds(bounds) {
  const { south, west, north, east } = bounds
  const points = []
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      points.push({
        lat: south + ((r + 0.5) / GRID_ROWS) * (north - south),
        lon: west + ((c + 0.5) / GRID_COLS) * (east - west),
      })
    }
  }
  return points
}

export default function useWindField(bounds, enabled) {
  const [field, setField] = useState([])
  const abortRef = useRef(null)

  // Rifetch solo quando la vista cambia in modo apprezzabile
  const key =
    enabled && bounds
      ? [bounds.south, bounds.west, bounds.north, bounds.east]
          .map((v) => v.toFixed(1))
          .join(',')
      : null

  useEffect(() => {
    if (!key) return undefined
    const [south, west, north, east] = key.split(',').map(Number)
    const points = gridFromBounds({ south, west, north, east })

    async function load() {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const p = new URLSearchParams({
        latitude: points.map((pt) => pt.lat.toFixed(3)).join(','),
        longitude: points.map((pt) => pt.lon.toFixed(3)).join(','),
        current: 'wind_speed_10m,wind_direction_10m',
        wind_speed_unit: 'kn',
      })
      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`, {
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        const list = Array.isArray(data) ? data : [data]
        setField(
          list
            .map((d, i) => ({
              lat: points[i]?.lat,
              lon: points[i]?.lon,
              speed: d?.current?.wind_speed_10m,
              dir: d?.current?.wind_direction_10m,
            }))
            .filter((d) => d.lat != null && d.speed != null && d.dir != null)
        )
      } catch {
        // rete assente: si mantiene l'ultimo campo noto
      }
    }

    const debounce = setTimeout(load, 800)
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      clearTimeout(debounce)
      clearInterval(timer)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [key])

  return enabled ? field : []
}
