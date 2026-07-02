import { useEffect, useMemo, useRef, useState } from 'react'
import { haversine, metersToNm } from '../lib/geo.js'

/*
 * Registro di bordo: registra la traccia GPS (un punto ogni ≥15 m),
 * calcola le miglia percorse ed esporta in GPX.
 */

const MIN_STEP_M = 15
const MAX_POINTS = 8000

export default function useTrack(geo) {
  const [recording, setRecording] = useState(false)
  const [points, setPoints] = useState([])
  const lastRef = useRef(null)

  useEffect(() => {
    if (!recording || geo.lat == null) return
    const last = lastRef.current
    if (
      last &&
      haversine(last.lat, last.lon, geo.lat, geo.lon) < MIN_STEP_M
    ) {
      return
    }
    const point = { lat: geo.lat, lon: geo.lon, ts: geo.ts || Date.now() }
    lastRef.current = point
    setPoints((pts) =>
      pts.length >= MAX_POINTS ? [...pts.slice(1), point] : [...pts, point]
    )
  }, [recording, geo.lat, geo.lon, geo.ts])

  const distanceNm = useMemo(() => {
    let meters = 0
    for (let i = 1; i < points.length; i++) {
      meters += haversine(
        points[i - 1].lat,
        points[i - 1].lon,
        points[i].lat,
        points[i].lon
      )
    }
    return metersToNm(meters)
  }, [points])

  const clearTrack = () => {
    setPoints([])
    lastRef.current = null
  }

  return {
    recording,
    setRecording,
    points,
    distanceNm,
    startedAt: points.length ? points[0].ts : null,
    clearTrack,
  }
}
