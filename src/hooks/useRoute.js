import { useCallback, useMemo, useState } from 'react'
import { haversine, bearing, metersToNm } from '../lib/geo.js'
import { crossTrackError, routeLegs, routeTotalNm } from '../lib/route.js'

/*
 * Stato della rotta attiva: waypoint editabili sulla mappa, waypoint attivo
 * con auto-avanzamento all'arrivo, dati di guida in tempo reale (DTW, BTW,
 * XTE, ETA) calcolati sulla posizione GPS.
 */

const ARRIVAL_RADIUS_M = 100

let wpCounter = 0

export default function useRoute(geo) {
  const [waypoints, setWaypoints] = useState([])
  const [activeIdx, setActiveIdx] = useState(1) // indice del waypoint di destinazione
  const [editing, setEditing] = useState(false)
  const [planSpeed, setPlanSpeed] = useState(5) // kn, per ETA quando fermi

  const addWaypoint = useCallback((lat, lon) => {
    wpCounter += 1
    setWaypoints((wps) => [
      ...wps,
      { id: `wp-${wpCounter}`, lat, lon, name: `WP${wps.length + 1}` },
    ])
  }, [])

  const removeWaypoint = useCallback((id) => {
    setWaypoints((wps) =>
      wps
        .filter((w) => w.id !== id)
        .map((w, i) => ({ ...w, name: `WP${i + 1}` }))
    )
    setActiveIdx((idx) => Math.max(1, idx - 1))
  }, [])

  const moveWaypoint = useCallback((id, lat, lon) => {
    setWaypoints((wps) => wps.map((w) => (w.id === id ? { ...w, lat, lon } : w)))
  }, [])

  const clearRoute = useCallback(() => {
    setWaypoints([])
    setActiveIdx(1)
  }, [])

  // Guida in tempo reale verso il waypoint attivo
  const nav = useMemo(() => {
    if (waypoints.length < 2 || geo.lat == null) return null
    const idx = Math.min(Math.max(activeIdx, 1), waypoints.length - 1)
    const prev = waypoints[idx - 1]
    const dest = waypoints[idx]
    const dtw = haversine(geo.lat, geo.lon, dest.lat, dest.lon)
    const btw = bearing(geo.lat, geo.lon, dest.lat, dest.lon)
    const xte = crossTrackError({ lat: geo.lat, lon: geo.lon }, prev, dest)
    const speed = geo.sog != null && geo.sog > 1 ? geo.sog : planSpeed
    const remaining =
      dtw +
      routeLegs(waypoints.slice(idx)).reduce((sum, leg) => sum + leg.dist, 0)
    return {
      idx,
      dest,
      dtwNm: metersToNm(dtw),
      btw,
      xte,
      etaMs: Date.now() + (metersToNm(remaining) / speed) * 3600 * 1000,
      remainingNm: metersToNm(remaining),
      arrived: dtw < ARRIVAL_RADIUS_M,
      isLast: idx === waypoints.length - 1,
    }
  }, [waypoints, activeIdx, geo.lat, geo.lon, geo.sog, planSpeed])

  // Auto-avanzamento al waypoint successivo
  if (nav && nav.arrived && !nav.isLast && activeIdx === nav.idx) {
    setActiveIdx(nav.idx + 1)
  }

  return {
    waypoints,
    legs: useMemo(() => routeLegs(waypoints), [waypoints]),
    totalNm: useMemo(() => routeTotalNm(waypoints), [waypoints]),
    activeIdx,
    setActiveIdx,
    editing,
    setEditing,
    planSpeed,
    setPlanSpeed,
    addWaypoint,
    removeWaypoint,
    moveWaypoint,
    clearRoute,
    nav,
  }
}
