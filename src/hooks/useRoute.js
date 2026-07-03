import { useCallback, useMemo, useState } from 'react'
import usePersistentState from './usePersistentState.js'
import { haversine, bearing, metersToNm } from '../lib/geo.js'
import { crossTrackError, routeLegs, routeTotalNm } from '../lib/route.js'

/*
 * Motore del route planner.
 * - La rotta in lavorazione (draft) e l'archivio rotte sono persistenti
 *   in localStorage: sopravvivono a chiusure e riavvii.
 * - Flusso: NUOVA ROTTA → editing (tap sulla mappa) → SALVA con nome →
 *   piano orario → NAVIGA (guida live DTW/BTW/XTE con avanzamento
 *   automatico dei waypoint).
 */

const ARRIVAL_RADIUS_M = 100

const newId = () =>
  `r${Date.now().toString(36)}${Math.floor(Math.random() * 10000)}`

export default function useRoute(geo) {
  const [savedRoutes, setSavedRoutes] = usePersistentState('timone.routes.v1', [])
  const [draft, setDraft] = usePersistentState('timone.draft.v1', {
    name: '',
    waypoints: [],
  })
  const [editing, setEditing] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [activeIdx, setActiveIdx] = useState(1)
  const [planSpeed, setPlanSpeed] = usePersistentState('timone.planSpeed.v1', 5)
  const [departureOffsetH, setDepartureOffsetH] = useState(0)

  const waypoints = draft.waypoints

  const addWaypoint = useCallback(
    (lat, lon) => {
      setDraft((d) => ({
        ...d,
        waypoints: [
          ...d.waypoints,
          { id: newId(), lat, lon, name: `WP${d.waypoints.length + 1}` },
        ],
      }))
    },
    [setDraft]
  )

  const undoWaypoint = useCallback(() => {
    setDraft((d) => ({ ...d, waypoints: d.waypoints.slice(0, -1) }))
  }, [setDraft])

  const removeWaypoint = useCallback(
    (id) => {
      setDraft((d) => ({
        ...d,
        waypoints: d.waypoints
          .filter((w) => w.id !== id)
          .map((w, i) => ({ ...w, name: `WP${i + 1}` })),
      }))
      setActiveIdx((idx) => Math.max(1, idx - 1))
    },
    [setDraft]
  )

  const moveWaypoint = useCallback(
    (id, lat, lon) => {
      setDraft((d) => ({
        ...d,
        waypoints: d.waypoints.map((w) => (w.id === id ? { ...w, lat, lon } : w)),
      }))
    },
    [setDraft]
  )

  const newRoute = useCallback(() => {
    setDraft({ name: '', waypoints: [] })
    setNavigating(false)
    setActiveIdx(1)
    setEditing(true)
  }, [setDraft])

  const clearDraft = useCallback(() => {
    setDraft({ name: '', waypoints: [] })
    setNavigating(false)
    setActiveIdx(1)
    setEditing(false)
  }, [setDraft])

  const saveRoute = useCallback(
    (name) => {
      const finalName = (name || '').trim() || `Rotta ${savedRoutes.length + 1}`
      setSavedRoutes((list) => {
        const others = list.filter((r) => r.name !== finalName)
        return [
          { id: newId(), name: finalName, waypoints, createdAt: Date.now() },
          ...others,
        ]
      })
      setDraft((d) => ({ ...d, name: finalName }))
      setEditing(false)
    },
    [savedRoutes.length, waypoints, setDraft, setSavedRoutes]
  )

  const loadRoute = useCallback(
    (id) => {
      const r = savedRoutes.find((x) => x.id === id)
      if (!r) return
      setDraft({ name: r.name, waypoints: r.waypoints })
      setNavigating(false)
      setActiveIdx(1)
      setEditing(false)
    },
    [savedRoutes, setDraft]
  )

  const deleteRoute = useCallback(
    (id) => setSavedRoutes((list) => list.filter((r) => r.id !== id)),
    [setSavedRoutes]
  )

  const startNav = useCallback(() => {
    setActiveIdx(1)
    setNavigating(true)
    setEditing(false)
  }, [])
  const stopNav = useCallback(() => setNavigating(false), [])

  // Partenza pianificata: "ORA" scorre col tempo reale
  const departureMs = Date.now() + departureOffsetH * 3600 * 1000

  // Guida live verso il waypoint attivo (solo in navigazione)
  const nav = useMemo(() => {
    if (!navigating || waypoints.length < 2 || geo.lat == null) return null
    const idx = Math.min(Math.max(activeIdx, 1), waypoints.length - 1)
    const prev = waypoints[idx - 1]
    const dest = waypoints[idx]
    const dtw = haversine(geo.lat, geo.lon, dest.lat, dest.lon)
    const btw = bearing(geo.lat, geo.lon, dest.lat, dest.lon)
    const xte = crossTrackError({ lat: geo.lat, lon: geo.lon }, prev, dest)
    const speed = geo.sog != null && geo.sog > 1 ? geo.sog : planSpeed
    const remaining =
      dtw + routeLegs(waypoints.slice(idx)).reduce((sum, leg) => sum + leg.dist, 0)
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
  }, [navigating, waypoints, activeIdx, geo.lat, geo.lon, geo.sog, planSpeed])

  // Avanzamento automatico al waypoint successivo
  if (nav && nav.arrived && !nav.isLast && activeIdx === nav.idx) {
    setActiveIdx(nav.idx + 1)
  }

  return {
    waypoints,
    routeName: draft.name,
    savedRoutes,
    legs: useMemo(() => routeLegs(waypoints), [waypoints]),
    totalNm: useMemo(() => routeTotalNm(waypoints), [waypoints]),
    editing,
    setEditing,
    navigating,
    startNav,
    stopNav,
    activeIdx,
    planSpeed,
    setPlanSpeed,
    departureOffsetH,
    setDepartureOffsetH,
    departureMs,
    addWaypoint,
    undoWaypoint,
    removeWaypoint,
    moveWaypoint,
    newRoute,
    clearDraft,
    saveRoute,
    loadRoute,
    deleteRoute,
    nav,
  }
}
