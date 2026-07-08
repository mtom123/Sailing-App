import { useEffect, useRef, useState, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import marineStyle from '../../map/marine-style.json'
import { formatDeg, metersToNm, haversine, bearing } from '../../lib/geo.js'
import { useAppStore } from '../../store/useAppStore.js'
import ConnectivityIndicator from './ConnectivityIndicator.jsx'
import MapContextMenu from './MapContextMenu.jsx'
import MeteogramPopup from './MeteogramPopup.jsx'
import {
  Anchor,
  Crosshair,
  Layers,
  LifeBuoy,
  Moon,
  Navigation2,
  Settings,
  ChevronLeft,
  ChevronRight,
  Waves,
} from 'lucide-react'

const MAX_ZOOM = 19
const MIN_ZOOM = 3

// ============================================================
// Marker HTML helpers
// ============================================================
function boatMarkerEl(cog) {
  const rot = cog != null ? cog : 0
  const el = document.createElement('div')
  el.className = 'timone-marker'
  el.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 32 32" style="transform:rotate(${rot}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7))">
      <polygon points="16,2 26,28 16,22 6,28" fill="#E8F0F5" stroke="#0a1620" stroke-width="2"/>
      <circle cx="16" cy="14" r="2" fill="#5EE6C8"/>
    </svg>`
  return el
}

function waypointMarkerEl(index, active, draggable = false) {
  const color = active ? '#5EE6C8' : '#E8F0F5'
  const el = document.createElement('div')
  el.className = 'timone-marker'
  el.style.cursor = draggable ? 'grab' : 'pointer'
  el.innerHTML = `
    <div style="
      width:30px;height:30px;border-radius:50%;
      background:#0a1620;border:2.5px solid ${color};
      color:${color};display:flex;align-items:center;justify-content:center;
      font:bold 12px 'JetBrains Mono',monospace;
      box-shadow:0 2px 8px rgba(0,0,0,0.6),0 0 0 1px rgba(0,0,0,0.4);
    ">${index}</div>`
  return el
}

function mobMarkerEl() {
  const el = document.createElement('div')
  el.className = 'timone-marker'
  el.innerHTML = `
    <div style="
      width:36px;height:36px;border-radius:50%;
      background:#FF5252;border:3px solid #E8F0F5;
      color:#0a1620;display:flex;align-items:center;justify-content:center;
      font:bold 11px 'JetBrains Mono',monospace;
      box-shadow:0 0 16px #FF5252,0 4px 8px rgba(0,0,0,0.6);
      animation:pulse-soft 1s ease-in-out infinite;
    ">MOB</div>`
  return el
}

function anchorageMarkerEl(color) {
  const el = document.createElement('div')
  el.className = 'timone-marker'
  el.innerHTML = `
    <div style="
      width:24px;height:24px;border-radius:50%;
      background:#0a1620;border:2px solid ${color};
      color:${color};font-size:13px;line-height:1;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,0.6);
    ">⚓</div>`
  return el
}

function vesselMarkerEl(rot) {
  const el = document.createElement('div')
  el.className = 'timone-marker'
  el.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
    <polygon points="12,2 20,22 12,17 4,22" fill="#5EE6C8" stroke="#0a1620" stroke-width="1.5"/>
  </svg>`
  return el
}

function popupHTML(title, lines) {
  const rows = lines
    .map(
      (l) =>
        `<div style="font-size:11px;color:${l.color || '#E8F0F5'};margin-top:2px">${l.label}: <b style="font-family:'JetBrains Mono',monospace">${l.value}</b></div>`
    )
    .join('')
  return `<div style="min-width:160px">
    <div style="font-weight:600;color:#E8F0F5;font-size:13px;margin-bottom:4px">${title}</div>
    ${rows}
  </div>`
}

// ============================================================
// MapView main component
// ============================================================
export default function MapView({
  geo,
  windField,
  currentField,
  vessels,
  anchorages,
  route,
  parks,
  trackPoints,
  mob,
  routeOptions,
  onDropMob,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({
    boat: null,
    mob: null,
    vessels: new Map(),
    anchorages: new Map(),
    waypoints: new Map(),
  })

  const [mapReady, setMapReady] = useState(false)
  const [meteoPoint, setMeteoPoint] = useState(null) // { lat, lon } | null

  const {
    view,
    setView,
    follow,
    setFollow,
    baseStyle,
    layers,
    toggleLayer,
    leftPanelOpen,
    setLeftPanelOpen,
    activeDrawer,
    setActiveDrawer,
    setSettingsOpen,
    nightMode,
    setNightMode,
    setRouteEditing,
    activeRouteOption,
  } = useAppStore()

  // Action wrappers (need store.getState for callbacks)
  const addWaypoint = (lat, lon) =>
    useAppStore.setState((s) => ({
      routeDraft: {
        ...s.routeDraft,
        waypoints: [
          ...s.routeDraft.waypoints,
          { id: `w${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`, lat, lon, name: `WP${s.routeDraft.waypoints.length + 1}` },
        ],
      },
    }))
  const removeWaypoint = (id) =>
    useAppStore.setState((s) => ({
      routeDraft: {
        ...s.routeDraft,
        waypoints: s.routeDraft.waypoints.filter((w) => w.id !== id),
      },
    }))
  const moveWaypoint = (id, lat, lon) =>
    useAppStore.setState((s) => ({
      routeDraft: {
        ...s.routeDraft,
        waypoints: s.routeDraft.waypoints.map((w) =>
          w.id === id ? { ...w, lat, lon } : w
        ),
      },
    }))

  // === Init map (once) ===
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Detect iOS Safari per fix specifici
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)

    // Check WebGL support
    function checkWebGL() {
      try {
        const canvas = document.createElement('canvas')
        return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')))
      } catch (e) {
        return false
      }
    }
    if (!checkWebGL()) {
      console.error('WebGL not supported')
      return
    }

    try {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: marineStyle,
      center: [view.center.lon, view.center.lat],
      zoom: view.zoom || 11,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxPitch: 0,
      dragRotate: false,
      attributionControl: { compact: true },
      touchZoomRotate: true,
      touchPitch: false,
      // iOS Safari fix critici:
      preserveDrawingBuffer: isIOS, // per canvas rendering su iOS
      antialias: !isIOS, // disabilita antialias su iOS per performance
      // Necessario per tap-and-hold waypoint su touch
      cooperativeGestures: false,
      // Performance iPad
      fadeDuration: isIOS ? 0 : 300,
      crossSourceCollisions: false,
    })

    // iOS: forza resize dopo 100ms (altrimenti canvas 0x0)
    if (isIOS) {
      setTimeout(() => map.resize(), 100)
      setTimeout(() => map.resize(), 500)
    }

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: false, showCompass: false }),
      'bottom-right'
    )
    map.addControl(
      new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 200 }),
      'bottom-left'
    )

    map.on('load', () => {
      // Sources
      map.addSource('route-draft', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addSource('route-options', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addSource('track-gps', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addSource('parks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Route draft (shadow + line)
      map.addLayer({
        id: 'route-shadow',
        type: 'line',
        source: 'route-draft',
        paint: {
          'line-color': '#000',
          'line-width': 7,
          'line-opacity': 0.5,
          'line-blur': 1,
        },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-draft',
        paint: {
          'line-color': '#5EE6C8',
          'line-width': 3,
          'line-opacity': 0.95,
        },
      })

      // Leg labels (distance + bearing) — symbol layer
      map.addSource('leg-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'leg-labels',
        type: 'symbol',
        source: 'leg-labels',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-anchor': 'center',
          'text-offset': [0, -0.5],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#5EE6C8',
          'text-halo-color': '#0a1620',
          'text-halo-width': 2,
        },
      })

      // Route alternative options
      map.addLayer({
        id: 'route-option-shadow',
        type: 'line',
        source: 'route-options',
        paint: {
          'line-color': '#000',
          'line-width': 5,
          'line-opacity': 0.4,
        },
        filter: ['!=', ['get', 'isActive'], true],
      })
      map.addLayer({
        id: 'route-option-line',
        type: 'line',
        source: 'route-options',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': 0.75,
          'line-dasharray': [4, 3],
        },
        filter: ['!=', ['get', 'isActive'], true],
      })

      // Track GPS
      map.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track-gps',
        paint: {
          'line-color': '#5EE6C8',
          'line-width': 2,
          'line-opacity': 0.65,
          'line-dasharray': [1, 5],
        },
      })

      // Parks
      map.addLayer({
        id: 'parks-fill',
        type: 'fill',
        source: 'parks',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['get', 'fillOpacity'],
        },
      })
      map.addLayer({
        id: 'parks-border',
        type: 'line',
        source: 'parks',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'weight'],
          'line-dasharray': [6, 4],
          'line-opacity': 0.85,
        },
      })

      setMapReady(true)
    })

    // Emit view changes
    map.on('moveend', () => {
      const c = map.getCenter()
      const b = map.getBounds()
      const z = map.getZoom()
      setView({
        center: { lat: c.lat, lon: c.lng },
        zoom: z,
        bounds: {
          south: b.getSouth(),
          west: b.getWest(),
          north: b.getNorth(),
          east: b.getEast(),
        },
      })
    })
    map.on('dragstart', () => setFollow(false))
    map.on('click', (e) => {
      const st = useAppStore.getState()
      if (st.routeEditing) {
        addWaypoint(e.lngLat.lat, e.lngLat.lng)
      }
    })
    map.on('error', (e) => {
      console.warn('MapLibre error:', e)
    })
    map.on('webglcontextlost', (e) => {
      console.error('WebGL context lost')
      e.preventDefault()
    })

    mapRef.current = map

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
    } catch (err) {
      console.error('MapLibre init error:', err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // === Layer visibility toggles ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const setVis = (id, vis) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    }
    setVis('bathymetry-hr', layers.bathy ? 'visible' : 'none')
    setVis('seamarks', layers.seamarks ? 'visible' : 'none')
  }, [layers.bathy, layers.seamarks, mapReady])

  // === Follow boat ===
  useEffect(() => {
    if (!mapReady || !follow || geo.lat == null) return
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    if (Math.abs(geo.lon - c.lng) > 0.001 || Math.abs(geo.lat - c.lat) > 0.001) {
      map.panTo([geo.lon, geo.lat], { animate: false })
    }
  }, [geo.lat, geo.lon, follow, mapReady])

  // === Boat marker (create once, update position+rotation) ===
  useEffect(() => {
    if (!mapReady || geo.lat == null) return
    const map = mapRef.current
    if (!map) return

    if (!markersRef.current.boat) {
      markersRef.current.boat = new maplibregl.Marker({
        element: boatMarkerEl(geo.cog),
        rotationAlignment: 'map',
        rotation: geo.cog || 0,
      })
        .setLngLat([geo.lon, geo.lat])
        .addTo(map)
    } else {
      markersRef.current.boat.setLngLat([geo.lon, geo.lat])
      markersRef.current.boat.setRotation(geo.cog || 0)
    }
  }, [geo.lat, geo.lon, geo.cog, mapReady])

  // === MOB marker ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    if (markersRef.current.mob) {
      markersRef.current.mob.remove()
      markersRef.current.mob = null
    }
    if (mob) {
      markersRef.current.mob = new maplibregl.Marker({ element: mobMarkerEl() })
        .setLngLat([mob.lon, mob.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 18 }).setHTML(
            popupHTML('UOMO A MARE', [
              { label: 'Pos', value: `${mob.lat.toFixed(4)}, ${mob.lon.toFixed(4)}`, color: '#FF5252' },
            ])
          )
        )
        .addTo(map)
    }
  }, [mob, mapReady])

  // === AIS vessels ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current.vessels
    const list = layers.ais ? vessels.filter((v) => v.lat != null) : []
    const seen = new Set()

    for (const v of list) {
      seen.add(v.mmsi)
      const rot = v.cog != null ? v.cog : v.hdg != null ? v.hdg : 0
      const existing = markers.get(v.mmsi)
      if (existing) {
        existing.setLngLat([v.lon, v.lat])
        existing.setRotation(rot)
      } else {
        const m = new maplibregl.Marker({
          element: vesselMarkerEl(rot),
          rotationAlignment: 'map',
          rotation: rot,
        })
          .setLngLat([v.lon, v.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 16 }).setHTML(
              popupHTML(v.name || `MMSI ${v.mmsi}`, [
                { label: 'MMSI', value: v.mmsi, color: '#8FA0AE' },
                { label: 'SOG', value: `${v.sog != null ? v.sog.toFixed(1) : '--'} kn` },
                { label: 'COG', value: `${v.cog != null ? formatDeg(v.cog) : '---'}°` },
              ])
            )
          )
          .addTo(map)
        markers.set(v.mmsi, m)
      }
    }
    for (const [mmsi, m] of markers) {
      if (!seen.has(mmsi)) {
        m.remove()
        markers.delete(mmsi)
      }
    }
  }, [vessels, layers.ais, mapReady])

  // === Anchorages ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current.anchorages
    const colorMap = { safe: '#5EE6C8', caution: '#F5A623', danger: '#FF5252' }

    const popupFor = (a, color) =>
      new maplibregl.Popup({ offset: 14 }).setHTML(
        popupHTML(a.name, [
          { label: 'Regione', value: a.region, color: '#8FA0AE' },
          { label: 'Stato', value: a.safety.reason, color },
          { label: 'Fondale', value: `${a.depth[0]}–${a.depth[1]} m` },
          { label: 'Fondo', value: a.seabed },
        ])
      )

    for (const a of anchorages) {
      const color = colorMap[a.safety.level] || '#8FA0AE'
      const stateKey = `${a.safety.level}|${a.safety.reason}`
      const existing = markers.get(a.id)
      if (existing) {
        if (existing._stateKey !== stateKey) {
          existing.remove()
          const el = anchorageMarkerEl(color)
          el.dataset.state = stateKey
          const m = new maplibregl.Marker({ element: el })
            .setLngLat([a.lon, a.lat])
            .setPopup(popupFor(a, color))
            .addTo(map)
          m._stateKey = stateKey
          markers.set(a.id, m)
        }
      } else {
        const el = anchorageMarkerEl(color)
        el.dataset.state = stateKey
        const m = new maplibregl.Marker({ element: el })
          .setLngLat([a.lon, a.lat])
          .setPopup(popupFor(a, color))
          .addTo(map)
        m._stateKey = stateKey
        markers.set(a.id, m)
      }
    }
  }, [anchorages, mapReady])

  // === Route draft (line + waypoints) ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('route-draft')
    if (!src) return

    const wps = route.waypoints
    if (wps.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      // Clear leg labels
      const legSrc = map.getSource('leg-labels')
      if (legSrc) legSrc.setData({ type: 'FeatureCollection', features: [] })
    } else {
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: wps.map((w) => [w.lon, w.lat]),
            },
            properties: {},
          },
        ],
      })

      // Build leg labels (distance + bearing) at midpoint of each leg
      const legFeatures = []
      for (let i = 0; i < wps.length - 1; i++) {
        const a = wps[i]
        const b = wps[i + 1]
        const distNm = metersToNm(haversine(a.lat, a.lon, b.lat, b.lon))
        const brg = bearing(a.lat, a.lon, b.lat, b.lon)
        const midLat = (a.lat + b.lat) / 2
        const midLon = (a.lon + b.lon) / 2
        legFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [midLon, midLat] },
          properties: {
            label: `${distNm.toFixed(1)}nm ${formatDeg(brg)}°`,
          },
        })
      }
      const legSrc = map.getSource('leg-labels')
      if (legSrc) legSrc.setData({ type: 'FeatureCollection', features: legFeatures })
    }

    // Sync waypoint markers — ricrea solo quando cambia index/active/editing,
    // altrimenti solo posizione
    const markers = markersRef.current.waypoints
    const seen = new Set()
    wps.forEach((w, i) => {
      seen.add(w.id)
      const isActive = route.nav && route.nav.idx === i
      const stateKey = `${i + 1}|${isActive ? 1 : 0}|${route.editing ? 1 : 0}`
      const existing = markers.get(w.id)
      if (existing) {
        existing.setLngLat([w.lon, w.lat])
        // Update element only when state changed
        if (existing._stateKey !== stateKey) {
          existing.remove()
          const el = waypointMarkerEl(i + 1, isActive, route.editing)
          el.dataset.id = w.id
          const m = new maplibregl.Marker({ element: el, draggable: route.editing })
            .setLngLat([w.lon, w.lat])
            .addTo(map)
          m._stateKey = stateKey
          m.on('dragend', () => {
            const p = m.getLngLat()
            moveWaypoint(w.id, p.lat, p.lng)
          })
          el.addEventListener('click', (ev) => {
            ev.stopPropagation()
            if (route.editing) removeWaypoint(w.id)
          })
          markers.set(w.id, m)
        }
      } else {
        const el = waypointMarkerEl(i + 1, isActive, route.editing)
        el.dataset.id = w.id
        const m = new maplibregl.Marker({ element: el, draggable: route.editing })
          .setLngLat([w.lon, w.lat])
          .addTo(map)
        m._stateKey = stateKey
        m.on('dragend', () => {
          const p = m.getLngLat()
          moveWaypoint(w.id, p.lat, p.lng)
        })
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          if (route.editing) removeWaypoint(w.id)
        })
        markers.set(w.id, m)
      }
    })
    for (const [id, m] of markers) {
      if (!seen.has(id)) {
        m.remove()
        markers.delete(id)
      }
    }
  }, [route.waypoints, route.editing, route.nav, mapReady])

  // === Route alternative options ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('route-options')
    if (!src) return

    if (!routeOptions) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const colors = {
      fastest: '#5EE6C8',
      comfortable: '#4A9EFF',
      safest: '#F5A623',
    }
    const features = Object.entries(routeOptions)
      .filter(([_, r]) => r && r.waypoints && r.waypoints.length >= 2)
      .map(([key, r]) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: r.waypoints.map((w) => [w.lon, w.lat]),
        },
        properties: {
          option: key,
          color: colors[key] || '#8FA0AE',
          isActive: key === activeRouteOption,
        },
      }))
    src.setData({ type: 'FeatureCollection', features })
  }, [routeOptions, activeRouteOption, mapReady])

  // === Track GPS ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('track-gps')
    if (!src) return
    src.setData({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: trackPoints.map((p) => [p.lon, p.lat]),
      },
    })
  }, [trackPoints, mapReady])

  // === Parks polygons ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('parks')
    if (!src) return
    if (!layers.parks) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const features = parks.map((p) => {
      const color = p.status === 'inside' ? '#FF5252' : p.status === 'near' ? '#F5A623' : '#D97757'
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [p.polygon.map(([lat, lon]) => [lon, lat])],
        },
        properties: {
          color,
          fillOpacity: p.status === 'inside' ? 0.18 : 0.07,
          weight: p.status ? 2.5 : 1.5,
          name: p.name,
        },
      }
    })
    src.setData({ type: 'FeatureCollection', features })
  }, [parks, layers.parks, mapReady])

  const toggleRouteEditing = () => {
    const st = useAppStore.getState()
    if (st.routeEditing) {
      setRouteEditing(false)
      return
    }
    if (st.routeDraft.waypoints.length === 0) {
      useAppStore.setState({
        routeDraft: { name: '', waypoints: [] },
        routeEditing: true,
        activeDrawer: 'route',
      })
    } else {
      setRouteEditing(true)
    }
  }

  return (
    <div className="relative h-full w-full" style={{ minHeight: 0, minWidth: 0 }}>
      <div
        ref={containerRef}
        className={`absolute inset-0 h-full w-full ${route.editing ? 'cursor-crosshair' : ''}`}
        style={{
          touchAction: 'none', // fondamentale per pinch-zoom su iOS
          // iOS Safari a volte non applica 100% height. Forza con vh fallback.
          height: '100%',
          width: '100%',
        }}
      />

      {/* Wind canvas overlay */}
      {mapReady && layers.wind && (
        <WindCanvas map={mapRef.current} field={windField} />
      )}

      {/* Current overlay */}
      {mapReady && layers.current && currentField && (
        <CurrentCanvas map={mapRef.current} field={currentField} timeOffset={useAppStore.getState().timeOffset} />
      )}

      {/* Floating instrument HUD */}
      <FloatingHUD geo={geo} />

      {/* Connectivity indicator (top-left of map, below HUD) */}
      <div className="absolute left-3 top-16 z-[900] fade-in">
        <ConnectivityIndicator
          gribAvailable={!!currentField}
          weatherAvailable={true}
        />
      </div>

      {/* Top-right controls */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
        <MapButton title="Layer" onClick={() => setActiveDrawer('layers')}>
          <Layers size={18} />
        </MapButton>
        <MapButton title="Segui barca" active={follow} onClick={() => setFollow(!follow)}>
          <Crosshair size={18} />
        </MapButton>
        <MapButton
          title="Modifica rotta"
          active={route.editing}
          onClick={toggleRouteEditing}
        >
          <Navigation2 size={18} />
        </MapButton>
        <MapButton title="Modalità notte" active={nightMode} onClick={() => setNightMode(!nightMode)}>
          <Moon size={18} />
        </MapButton>
        <MapButton
          title="Uomo a mare"
          danger={Boolean(mob)}
          onClick={() => onDropMob?.()}
        >
          <LifeBuoy size={18} />
        </MapButton>
        <MapButton title="Impostazioni" onClick={() => setSettingsOpen(true)}>
          <Settings size={18} />
        </MapButton>
      </div>

      {/* Left panel toggle */}
      <button
        type="button"
        title={leftPanelOpen ? 'Nascondi strumenti' : 'Mostra strumenti'}
        onClick={() => setLeftPanelOpen(!leftPanelOpen)}
        className="glass absolute left-0 top-1/2 z-[950] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-lg"
      >
        {leftPanelOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>

      {/* Layer popover */}
      {activeDrawer === 'layers' && (
        <LayerPopover onClose={() => setActiveDrawer(null)} />
      )}

      {/* Route editing banner */}
      {route.editing && (
        <div className="glass-strong absolute left-1/2 top-3 z-[950] flex -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 slide-up">
          <span className="text-xs font-semibold tracking-wider text-warn">
            ROTTA · TAP SUL MARE
          </span>
          <span className="text-xs font-semibold text-paper tabular">
            {route.waypoints.length} WP · {route.totalNm.toFixed(1)} nm
          </span>
          <button
            type="button"
            onClick={() => setRouteEditing(false)}
            className="rounded-md border border-warn bg-warn/15 px-3 py-1.5 text-[10px] font-semibold tracking-widest text-warn touch"
          >
            FINE
          </button>
        </div>
      )}

      {/* NAV banner */}
      {route.nav && !route.editing && !mob && (
        <div className="glass absolute left-1/2 top-3 z-[900] flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-2 slide-up">
          <span className="text-xs font-semibold text-phos">→ {route.nav.dest.name}</span>
          <span className="text-xs text-paper tabular">
            {route.nav.dtwNm.toFixed(1)} nm · {formatDeg(route.nav.btw)}°
          </span>
          <span className="text-xs text-fog tabular">
            · ETA{' '}
            {new Date(route.nav.etaMs).toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      )}

      {/* Drawer rails */}
      {!activeDrawer && (
        <div className="absolute right-0 top-1/2 z-[950] flex -translate-y-1/2 flex-col gap-1.5">
          {[
            { id: 'route', label: 'ROTTA', icon: Navigation2 },
            { id: 'anchors', label: 'ANCORE', icon: Anchor },
            { id: 'weather', label: 'METEO', icon: Waves },
          ].map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveDrawer(t.id)}
                className="glass flex h-14 w-12 flex-col items-center justify-center gap-0.5 rounded-l-lg text-fog hover:text-paper transition-colors"
              >
                <Icon size={16} />
                <span className="text-[7px] font-bold tracking-widest">{t.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Long-press context menu (touch UX) */}
      <MapContextMenu
        map={mapRef.current}
        mapReady={mapReady}
        enabled={!route.editing}
        onAddWaypoint={(lat, lon) => {
          useAppStore.setState((s) => ({
            routeDraft: {
              ...s.routeDraft,
              waypoints: [
                ...s.routeDraft.waypoints,
                { id: `w${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`, lat, lon, name: `WP${s.routeDraft.waypoints.length + 1}` },
              ],
            },
            activeDrawer: 'route',
          }))
        }}
        onSetDestination={(lat, lon) => {
          // Set come unico waypoint destinazione
          useAppStore.setState((s) => ({
            routeDraft: {
              name: 'Destinazione',
              waypoints: s.routeDraft.waypoints.length >= 1
                ? [...s.routeDraft.waypoints, { id: `w${Date.now().toString(36)}`, lat, lon, name: `WP${s.routeDraft.waypoints.length + 1}` }]
                : [{ id: `w${Date.now().toString(36)}`, lat: s.view.center.lat, lon: s.view.center.lon, name: 'WP1' }, { id: `w${Date.now().toString(36)}x`, lat, lon, name: 'WP2' }],
            },
            activeDrawer: 'route',
          }))
        }}
        onShowMeteogram={(lat, lon) => setMeteoPoint({ lat, lon })}
        boatPosition={geo.lat != null ? { lat: geo.lat, lon: geo.lon } : null}
      />

      {/* Meteogram popup */}
      {meteoPoint && (
        <MeteogramPopup
          lat={meteoPoint.lat}
          lon={meteoPoint.lon}
          onClose={() => setMeteoPoint(null)}
        />
      )}
    </div>
  )
}

// ============================================================
// Subcomponents
// ============================================================
function MapButton({ active, danger, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`glass touch flex h-11 w-11 items-center justify-center rounded-lg transition-all ${
        danger
          ? 'border-danger/40 text-danger'
          : active
            ? 'border-phos/50 text-phos shadow-[0_0_16px_rgba(94,230,200,0.3)]'
            : 'text-fog hover:text-paper'
      }`}
    >
      {children}
    </button>
  )
}

function LayerPopover({ onClose }) {
  const { layers, toggleLayer, baseStyle, setBaseStyle } = useAppStore()
  const LAYER_DEFS = [
    { key: 'bathy', label: 'Batimetria' },
    { key: 'seamarks', label: 'Fari / Boe' },
    { key: 'wind', label: 'Vettori vento' },
    { key: 'ais', label: 'Navi AIS' },
    { key: 'parks', label: 'Aree protette' },
    { key: 'rain', label: 'Radar pioggia' },
    { key: 'current', label: 'Correnti' },
  ]
  return (
    <>
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 z-[990] cursor-default"
      />
      <div className="glass-strong absolute right-16 top-3 z-[1000] w-56 rounded-lg p-3 slide-up">
        <div className="label pb-2">Carta base</div>
        <div className="mb-3 flex gap-1">
          {[
            ['chart', 'CHIARA'],
            ['dark', 'SCURA'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBaseStyle(id)}
              className={`flex-1 rounded-md border py-2 text-[10px] font-semibold tracking-widest transition-all ${
                baseStyle === id
                  ? 'border-phos bg-phos/10 text-phos'
                  : 'border-line bg-surface text-fog'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="label pb-2">Overlay</div>
        {LAYER_DEFS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => toggleLayer(l.key)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-[11px] tracking-wide hover:bg-raised transition-colors"
          >
            <span
              className={`flex h-4 w-4 flex-none items-center justify-center rounded border text-[10px] ${
                layers[l.key] ? 'border-phos text-phos' : 'border-line text-transparent'
              }`}
            >
              ✓
            </span>
            <span className={layers[l.key] ? 'text-paper' : 'text-fog'}>{l.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function FloatingHUD({ geo }) {
  if (geo.lat == null) return null
  return (
    <div className="glass absolute left-3 top-3 z-[900] flex items-center gap-4 rounded-lg px-4 py-2 fade-in">
      <div>
        <div className="label">SOG</div>
        <div className="font-mono text-lg font-bold text-phos">
          {geo.sog != null ? geo.sog.toFixed(1) : '--'}
          <span className="text-[10px] text-fog ml-1">kn</span>
        </div>
      </div>
      <div className="h-8 w-px bg-line" />
      <div>
        <div className="label">COG</div>
        <div className="font-mono text-lg font-bold text-paper">
          {geo.cog != null ? formatDeg(geo.cog) : '---'}
          <span className="text-[10px] text-fog ml-1">°</span>
        </div>
      </div>
    </div>
  )
}

function WindCanvas({ map, field }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!map) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = null
    let lastW = 0
    let lastH = 0
    let particles = []
    let lastFieldUpdate = 0

    const colorFor = (speed) => {
      if (speed < 8) return '#5EE6C8'
      if (speed < 14) return '#7FE0A8'
      if (speed < 20) return '#F5A623'
      if (speed < 28) return '#FF8A4A'
      return '#FF5252'
    }

    const sampleWindAt = (px, py) => {
      const ll = map.unproject([px, py])
      let best = null
      let bestDist = Infinity
      for (const f of field) {
        const d = (f.lat - ll.lat) ** 2 + (f.lon - ll.lng) ** 2
        if (d < bestDist) {
          bestDist = d
          best = f
        }
      }
      return best
    }

    const initParticles = (w, h) => {
      const NUM = Math.min(180, Math.floor((w * h) / 7000))
      particles = []
      for (let i = 0; i < NUM; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          age: Math.random() * 80,
        })
      }
    }

    const draw = () => {
      raf = null
      const container = map.getContainer()
      const w = container.clientWidth
      const h = container.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (w !== lastW || h !== lastH) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        lastW = w
        lastH = h
        initParticles(w, h)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (!field.length) {
        ctx.clearRect(0, 0, w, h)
        return
      }

      // Trail effect: use destination-out to fade previous frame (transparent fade)
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'source-over'

      // Update + draw particles
      for (const p of particles) {
        p.age++
        if (p.age > 80 + Math.random() * 20) {
          p.x = Math.random() * w
          p.y = Math.random() * h
          p.age = 0
        }
        const sample = sampleWindAt(p.x, p.y)
        if (!sample || sample.speed == null) continue

        // Wind direction: "from" → move toward opposite
        const rad = ((sample.dir + 180) * Math.PI) / 180
        const speed = Math.min(3, sample.speed * 0.15)
        const dx = Math.sin(rad) * speed
        const dy = -Math.cos(rad) * speed

        const alpha = Math.min(1, p.age / 20) * Math.min(1, (80 - p.age) / 20) * 0.85
        ctx.strokeStyle = colorFor(sample.speed)
        ctx.globalAlpha = alpha
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + dx * 3, p.y + dy * 3)
        ctx.stroke()
        ctx.globalAlpha = 1

        p.x += dx * 3
        p.y += dy * 3

        // Wrap-around
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
      }

      // Static arrows overlay (less dense, for clear direction reading)
      const step = 130
      ctx.globalAlpha = 0.9
      for (let px = step / 2; px < w; px += step) {
        for (let py = step / 2; py < h; py += step) {
          const sample = sampleWindAt(px, py)
          if (!sample) continue
          const len = Math.min(28, 10 + sample.speed * 0.9)
          ctx.save()
          ctx.translate(px, py)
          ctx.rotate(((sample.dir + 180) * Math.PI) / 180)
          ctx.strokeStyle = colorFor(sample.speed)
          ctx.fillStyle = colorFor(sample.speed)
          ctx.lineWidth = 1.8
          ctx.beginPath()
          ctx.moveTo(0, len / 2)
          ctx.lineTo(0, -len / 2 + 5)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(0, -len / 2)
          ctx.lineTo(-4, -len / 2 + 7)
          ctx.lineTo(4, -len / 2 + 7)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }

    // Start animation loop
    loop()
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
    }
  }, [map, field])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[500]"
    />
  )
}

// ============================================================
// Current canvas overlay — frecce blu per correnti marine
// ============================================================
function CurrentCanvas({ map, field, timeOffset = 0 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!map) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf = null
    let lastW = 0
    let lastH = 0

    const draw = () => {
      raf = null
      const container = map.getContainer()
      const w = container.clientWidth
      const h = container.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (w !== lastW || h !== lastH) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        lastW = w
        lastH = h
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!field?.grid?.length) return

      const step = 110
      const now = Date.now() + timeOffset * 3600 * 1000

      for (let px = step / 2; px < w; px += step) {
        for (let py = step / 2; py < h; py += step) {
          const ll = map.unproject([px, py])
          // Trova punto più vicino
          let best = null
          let bestDist = Infinity
          for (const f of field.grid) {
            const d = (f.lat - ll.lat) ** 2 + (f.lon - ll.lng) ** 2
            if (d < bestDist) {
              bestDist = d
              best = f
            }
          }
          if (!best) continue

          // Sample current at time
          let speed = null
          let dir = null
          if (best.times?.length) {
            let bestI = 0
            let bestDiff = Infinity
            for (let i = 0; i < best.times.length; i++) {
              const t = new Date(best.times[i]).getTime()
              const diff = Math.abs(t - now)
              if (diff < bestDiff) {
                bestDiff = diff
                bestI = i
              }
            }
            speed = best.currSpeed?.[bestI]
            dir = best.currDir?.[bestI]
          }
          if (speed == null || dir == null || speed < 0.1) continue

          const len = Math.min(40, 14 + speed * 8)
          ctx.save()
          ctx.translate(px, py)
          ctx.rotate((dir * Math.PI) / 180) // dir = "verso" (流向)
          ctx.strokeStyle = '#4A9EFF'
          ctx.fillStyle = '#4A9EFF'
          ctx.globalAlpha = 0.7
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(0, len / 2)
          ctx.lineTo(0, -len / 2 + 7)
          ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(0, -len / 2)
          ctx.lineTo(-5, -len / 2 + 9)
          ctx.lineTo(5, -len / 2 + 9)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }
      }
    }
    const schedule = () => {
      if (raf == null) raf = requestAnimationFrame(draw)
    }
    schedule()
    map.on('move zoom moveend zoomend resize', schedule)
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      map.off('move zoom moveend zoomend resize', schedule)
    }
  }, [map, field, timeOffset])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[510]"
    />
  )
}
