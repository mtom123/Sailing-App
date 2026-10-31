import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatDeg, metersToNm, haversine, bearing, cardinal } from '../../lib/geo.js'
import { useAppStore } from '../../store/useAppStore.js'
import { logStep, failStep, hideLoadingScreen } from '../../lib/debugLogger.js'
import { EMODNET_WMS_URL, EMODNET_DEPTH_LAYER, isobathSld } from '../../lib/isobaths.js'
import { SEAGRASS_WMS_URL, SEAGRASS_LAYER, seagrassSld } from '../../lib/seagrass.js'
import { IsobathLayer } from '../../lib/isobathLayer.js'
import { ShomReliefLayer } from '../../lib/shomRelief.js'
import { HdIsobathLayer } from '../../lib/hdIsobathLayer.js'
import { LIGURIA_ISOBATH_SOURCE } from '../../lib/liguriaIsobaths.js'
import { CoastBandLayer } from '../../lib/coastBandLayer.js'
import { ProtectedAreasLayer } from '../../lib/protectedAreasLayer.js'
import { OrdinancesLayer } from '../../lib/ordinancesLayer.js'
import { ampContext, ampPageFor, ampPopupHTML } from '../../lib/ampRules.js'
import { LiguriaHabitatLayer } from '../../lib/liguriaHabitat.js'

const ISOBATH_VECTOR_MIN_ZOOM = 12
import ConnectivityIndicator from './ConnectivityIndicator.jsx'
import MapContextMenu from './MapContextMenu.jsx'
import DepthHover from './DepthHover.jsx'
import MeteogramPopup from './MeteogramPopup.jsx'
import WaypointPopup from './WaypointPopup.jsx'
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
  Sun,
} from 'lucide-react'

// ============================================================
// Marker HTML helpers — Leaflet divIcon
// ============================================================
function boatMarkerEl(cog) {
  const rot = cog != null ? cog : 0
  return L.divIcon({
    className: 'timone-marker',
    html: `<svg width="32" height="32" viewBox="0 0 32 32" style="transform:rotate(${rot}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7))">
      <polygon points="16,2 26,28 16,22 6,28" fill="#E8F0F5" stroke="#0a1620" stroke-width="2"/>
      <circle cx="16" cy="14" r="2" fill="#5EE6C8"/>
    </svg>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  })
}

function waypointMarkerEl(index, active) {
  const color = active ? '#5EE6C8' : '#E8F0F5'
  return L.divIcon({
    className: 'timone-marker',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#0a1620;border:2.5px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font:bold 12px 'JetBrains Mono',monospace;box-shadow:0 2px 8px rgba(0,0,0,0.6),0 0 0 1px rgba(0,0,0,0.4);">${index}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function mobMarkerEl() {
  return L.divIcon({
    className: 'timone-marker',
    html: `<div style="width:36px;height:36px;border-radius:50%;background:#FF5252;border:3px solid #E8F0F5;color:#0a1620;display:flex;align-items:center;justify-content:center;font:bold 11px 'JetBrains Mono',monospace;box-shadow:0 0 16px #FF5252,0 4px 8px rgba(0,0,0,0.6);animation:pulse-soft 1s ease-in-out infinite;">MOB</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}

function anchorageMarkerEl(color) {
  return L.divIcon({
    className: 'timone-marker',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:#0a1620;border:2px solid ${color};color:${color};font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.6);">⚓</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function vesselMarkerEl(rot) {
  return L.divIcon({
    className: 'timone-marker',
    html: `<svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
      <polygon points="12,2 20,22 12,17 4,22" fill="#5EE6C8" stroke="#0a1620" stroke-width="1.5"/>
    </svg>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function popupHTML(title, lines) {
  const rows = lines
    .map(
      (l) =>
        `<div style="font-size:calc(11px*var(--fs));color:${l.color || 'var(--color-paper)'};margin-top:2px">${l.label}: <b style="font-family:'JetBrains Mono',monospace">${l.value}</b></div>`
    )
    .join('')
  return `<div style="min-width:160px">
    <div style="font-weight:600;color:var(--color-paper);font-size:calc(13px*var(--fs));margin-bottom:4px">${title}</div>
    ${rows}
  </div>`
}

// ============================================================
// Tile layer URLs
// ============================================================
const TILES = {
  bathy: {
    url: 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png',
    attribution: '© EMODnet Bathymetry',
    maxZoom: 13,
    opacity: 0.65,
  },
  // Carte di base Esri, senza chiave (CARTO ora richiede una API key)
  bases: {
    chart: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
      maxNativeZoom: 19,
      opacity: 0.92,
    },
    dark: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, HERE, Garmin, © OpenStreetMap contributors',
      maxNativeZoom: 16,
      opacity: 1,
    },
    // Satellite: costa reale e fondale visibile (sabbia / posidonia / scogli) per ancorare
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, Maxar, Earthstar Geographics',
      maxNativeZoom: 19,
      opacity: 1,
    },
  },
  seamarks: {
    url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    attribution: '© OpenSeaMap',
    maxZoom: 18,
    opacity: 0.95,
  },
}

function makeBaseLayer(style) {
  const b = TILES.bases[style] || TILES.bases.chart
  return L.tileLayer(b.url, {
    attribution: b.attribution,
    maxZoom: 20,
    maxNativeZoom: b.maxNativeZoom,
    opacity: b.opacity,
    zIndex: 1,
  })
}

// ============================================================
// MapView main — Leaflet based
// ============================================================
export default function MapView({
  geo,
  weather,
  windField,
  currentField,
  vessels,
  anchorages,
  route,
  parks,
  trackSegments = [],
  trackRec = null, // { paused, distanceNm } mentre si registra
  shownTracks = [],
  mob,
  routeOptions,
  onDropMob,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const tileLayerRefs = useRef({})
  const markersRef = useRef({
    boat: null,
    mob: null,
    vessels: new Map(),
    anchorages: new Map(),
    waypoints: new Map(),
    watch: null,
  })
  const layerGroupRefs = useRef({
    route: null,
    routeOptions: null,
    track: null,
    parks: null,
  })

  const [mapReady, setMapReady] = useState(false)
  const [meteoPoint, setMeteoPoint] = useState(null)
  const [waypointPopupId, setWaypointPopupId] = useState(null)

  const {
    view,
    setView,
    follow,
    setFollow,
    layers,
    toggleLayer,
    baseStyle,
    leftPanelOpen,
    setLeftPanelOpen,
    activeDrawer,
    setActiveDrawer,
    setSettingsOpen,
    nightMode,
    setNightMode,
    dayTheme,
    setDayTheme,
    setRouteEditing,
    activeRouteOption,
    coastBand,
  } = useAppStore()

  // Actions via store (per click handler)
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
        waypoints: s.routeDraft.waypoints.map((w) => (w.id === id ? { ...w, lat, lon } : w)),
      },
    }))

  // === Init map (once) ===
  useEffect(() => {
    logStep('MapView useEffect starting')
    if (!containerRef.current || mapRef.current) {
      logStep('MapView skipped')
      return
    }

    try {
      logStep('Creating Leaflet map')
      const map = L.map(containerRef.current, {
        center: [view.center.lat, view.center.lon],
        zoom: view.zoom || 11,
        minZoom: 3,
        maxZoom: 19,
        zoomControl: false,
        attributionControl: true,
        touchZoom: true,
        tap: false,
        preferCanvas: false,
      })

      L.control.zoom({ position: 'bottomright' }).addTo(map)
      L.control.scale({ metric: true, imperial: false, position: 'bottomleft', maxWidth: 200 }).addTo(map)

      // Tile layers — zIndex fisso: l'ordine resta giusto anche
      // quando un livello viene spento e riacceso
      const imagery = baseStyle === 'satellite'
      tileLayerRefs.current.base = makeBaseLayer(baseStyle)
      tileLayerRefs.current.baseStyle = baseStyle
      tileLayerRefs.current.bathy = L.tileLayer(TILES.bathy.url, {
        attribution: TILES.bathy.attribution,
        // Oltre z13 (nativo) il rilievo ingrandito impasta anche la terra:
        // si nasconde e restano isobate e acque basse, ricalcolate a ogni zoom
        maxZoom: 13,
        maxNativeZoom: 13,
        opacity: TILES.bathy.opacity,
        zIndex: 2,
      })
      // Praterie di posidonia (EMODnet Seabed Habitats) + tipi di fondale
      // dell'Atlante della Regione Liguria, più dettagliato
      const seagrass = L.tileLayer.wms(SEAGRASS_WMS_URL, {
        layers: SEAGRASS_LAYER,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        sld_body: seagrassSld(),
        tileSize: 512,
        minZoom: 10,
        maxZoom: 19,
        updateWhenZooming: false,
        updateWhenIdle: true,
        attribution: '© EMODnet Seabed Habitats',
        zIndex: 3,
      })
      tileLayerRefs.current.posidonia = L.layerGroup([seagrass, new LiguriaHabitatLayer()])
      // Isobate 2–1000 m + acque basse. Vista d'insieme (z9–11): immagini
      // calcolate dal server EMODnet. Da z12: vettoriali, calcolate nell'app
      // dalla griglia delle profondità, nitide a ogni zoom.
      tileLayerRefs.current.isobaths = L.tileLayer.wms(EMODNET_WMS_URL, {
        layers: EMODNET_DEPTH_LAYER,
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        sld_body: isobathSld({ imagery }),
        interpolations: 'bilinear', // isobate morbide invece che "a scalini" sulle celle da ~115 m
        tileSize: 512,
        minZoom: 9, // sotto: troppo fitte e pesanti da calcolare
        maxZoom: ISOBATH_VECTOR_MIN_ZOOM - 1,
        updateWhenZooming: false, // ~1 s per tassello lato server: solo lo zoom finale
        updateWhenIdle: true,
        attribution: '© EMODnet Bathymetry',
        zIndex: 4,
      })
      tileLayerRefs.current.isobathsImagery = imagery
      tileLayerRefs.current.isobathVector = new IsobathLayer({
        imagery,
        minZoom: ISOBATH_VECTOR_MIN_ZOOM,
        attribution: '© EMODnet Bathymetry',
      })
      // Isobate ogni metro dai rilievi Shom, dove ci sono (public/isobaths-hd):
      // nella loro area le EMODnet si nascondono
      // Copertura delle isobate di dettaglio (Shom e Regione Liguria) unita
      const coverage = { shom: null, liguria: null }
      const setCoverage = (source, rings) => {
        coverage[source] = rings
        const all = [...(coverage.shom || []), ...(coverage.liguria || [])]
        tileLayerRefs.current.isobathVector.setHdCoverage(all.length ? all : null)
      }
      tileLayerRefs.current.isobathHd = new HdIsobathLayer({
        imagery,
        onCoverage: (rings) => setCoverage('shom', rings),
      })
      // Isobate multibeam della Regione Liguria: sotto costa molto più fedeli di EMODnet
      tileLayerRefs.current.isobathLiguria = new HdIsobathLayer({
        imagery,
        source: LIGURIA_ISOBATH_SOURCE,
        attribution: '© Regione Liguria – isobate di dettaglio (rilievi multibeam)',
        onCoverage: (rings) => setCoverage('liguria', rings),
      })
      // Rilievo HD del Shom (Corsica, Costa Azzurra): sopra le carte, sotto le isobate
      map.createPane('reliefPane').style.zIndex = 240
      tileLayerRefs.current.shomRelief = new ShomReliefLayer({ pane: 'reliefPane' })
      // Fari e boe sopra le isobate vettoriali (pane 250)
      map.createPane('seamarkPane').style.zIndex = 260
      tileLayerRefs.current.seamarks = L.tileLayer(TILES.seamarks.url, {
        attribution: TILES.seamarks.attribution,
        maxZoom: 19,
        maxNativeZoom: 18,
        opacity: TILES.seamarks.opacity,
        pane: 'seamarkPane',
      })

      // Fascia dalla costa delle ordinanze balneari (da zoom 14)
      tileLayerRefs.current.coastBand = new CoastBandLayer()

      // Add base + overlays based on layer state
      map.addLayer(tileLayerRefs.current.base)
      // Sul satellite il rilievo EMODnet coprirebbe il fondale visibile
      if (layers.bathy && !imagery) map.addLayer(tileLayerRefs.current.bathy)
      if (layers.posidonia) map.addLayer(tileLayerRefs.current.posidonia)
      if (layers.shomRelief) map.addLayer(tileLayerRefs.current.shomRelief)
      if (layers.isobaths) map.addLayer(tileLayerRefs.current.isobaths)
      if (layers.isobaths) map.addLayer(tileLayerRefs.current.isobathVector)
      if (layers.isobaths) map.addLayer(tileLayerRefs.current.isobathHd)
      if (layers.isobaths) map.addLayer(tileLayerRefs.current.isobathLiguria)
      if (layers.seamarks) map.addLayer(tileLayerRefs.current.seamarks)
      if (layers.coastBand) map.addLayer(tileLayerRefs.current.coastBand)

      // Layer groups for routes, tracks, parks
      layerGroupRefs.current.route = L.layerGroup().addTo(map)
      layerGroupRefs.current.routeOptions = L.layerGroup().addTo(map)
      layerGroupRefs.current.track = L.layerGroup().addTo(map)
      layerGroupRefs.current.parks = L.layerGroup().addTo(map)

      // Traccia in registrazione (a tratti: le pause non si uniscono)
      const trackLine = L.polyline([], {
        color: '#FF3B30',
        weight: 3,
        opacity: 0.9,
      }).addTo(layerGroupRefs.current.track)
      markersRef.current.trackLine = trackLine
      // Tracce salvate mostrate dall'archivio
      layerGroupRefs.current.savedTracks = L.layerGroup().addTo(map)

      // Emit view changes
      const emitView = () => {
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
      }
      map.on('moveend', emitView)
      map.on('dragstart', () => setFollow(false))
      map.on('click', (e) => {
        const st = useAppStore.getState()
        if (st.routeEditing) {
          addWaypoint(e.latlng.lat, e.latlng.lng)
        }
      })

      mapRef.current = map
      setMapReady(true)
      logStep('Leaflet map ready', 'ok')
      hideLoadingScreen()

      const ro = new ResizeObserver(() => {
        try { map.invalidateSize({ animate: false }) } catch (e) {}
      })
      ro.observe(containerRef.current)

      // Force invalidate after a moment (iOS Safari fix)
      setTimeout(() => {
        try { map.invalidateSize({ animate: false }) } catch (e) {}
      }, 300)
      setTimeout(() => {
        try { map.invalidateSize({ animate: false }) } catch (e) {}
      }, 1000)

      return () => {
        ro.disconnect()
        map.remove()
        mapRef.current = null
      }
    } catch (err) {
      console.error('Leaflet init error:', err)
      failStep('Leaflet init', err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // === Layer visibility ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const refs = tileLayerRefs.current
    const imagery = baseStyle === 'satellite'

    // Carta di base
    if (refs.baseStyle !== baseStyle) {
      map.removeLayer(refs.base)
      refs.base = makeBaseLayer(baseStyle)
      refs.baseStyle = baseStyle
      map.addLayer(refs.base)
    }
    // Isobate: senza riempimento e chiare sul satellite
    if (refs.isobaths && refs.isobathsImagery !== imagery) {
      refs.isobaths.setParams({ sld_body: isobathSld({ imagery }) })
      refs.isobathsImagery = imagery
    }
    refs.isobathVector?.setImagery(imagery)
    refs.isobathHd?.setImagery(imagery)
    refs.isobathLiguria?.setImagery(imagery)

    const setVis = (layer, visible) => {
      if (!layer) return
      if (visible && !map.hasLayer(layer)) map.addLayer(layer)
      if (!visible && map.hasLayer(layer)) map.removeLayer(layer)
    }
    setVis(refs.bathy, layers.bathy && !imagery)
    setVis(refs.posidonia, layers.posidonia)
    setVis(refs.shomRelief, layers.shomRelief)
    setVis(refs.isobaths, layers.isobaths)
    setVis(refs.isobathVector, layers.isobaths)
    setVis(refs.isobathHd, layers.isobaths)
    setVis(refs.isobathLiguria, layers.isobaths)
    setVis(refs.seamarks, layers.seamarks)
    setVis(refs.coastBand, layers.coastBand)
  }, [baseStyle, layers.bathy, layers.posidonia, layers.shomRelief, layers.isobaths, layers.seamarks, layers.coastBand, mapReady])

  // === Distanze della fascia costiera dalle impostazioni ===
  useEffect(() => {
    tileLayerRefs.current.coastBand?.setConfig(coastBand)
  }, [coastBand, mapReady])

  // === Cursore a croce mentre si traccia la rotta ===
  // (classList, non className di React: non tocca le classi di Leaflet)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.classList.toggle('cursor-crosshair', !!route.editing)
  }, [route.editing, mapReady])

  // === Follow boat ===
  useEffect(() => {
    if (!mapReady || !follow || geo.lat == null) return
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    if (Math.abs(geo.lat - c.lat) > 0.001 || Math.abs(geo.lon - c.lng) > 0.001) {
      map.panTo([geo.lat, geo.lon], { animate: false })
    }
  }, [geo.lat, geo.lon, follow, mapReady])

  // === Boat marker ===
  useEffect(() => {
    if (!mapReady || geo.lat == null) return
    const map = mapRef.current
    if (!map) return
    if (!markersRef.current.boat) {
      markersRef.current.boat = L.marker([geo.lat, geo.lon], {
        icon: boatMarkerEl(geo.cog),
        zIndexOffset: 1000,
      }).addTo(map)
    } else {
      markersRef.current.boat.setLatLng([geo.lat, geo.lon])
      markersRef.current.boat.setIcon(boatMarkerEl(geo.cog))
    }
  }, [geo.lat, geo.lon, geo.cog, mapReady])

  // === MOB marker ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    if (markersRef.current.mob) {
      map.removeLayer(markersRef.current.mob)
      markersRef.current.mob = null
    }
    if (mob) {
      markersRef.current.mob = L.marker([mob.lat, mob.lon], {
        icon: mobMarkerEl(),
        zIndexOffset: 2000,
      })
        .bindPopup(popupHTML('UOMO A MARE', [
          { label: 'Pos', value: `${mob.lat.toFixed(4)}, ${mob.lon.toFixed(4)}`, color: '#FF5252' },
        ]))
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
        existing.setLatLng([v.lat, v.lon])
        existing.setIcon(vesselMarkerEl(rot))
      } else {
        const m = L.marker([v.lat, v.lon], { icon: vesselMarkerEl(rot) })
          .bindPopup(popupHTML(v.name || `MMSI ${v.mmsi}`, [
            { label: 'MMSI', value: v.mmsi, color: 'var(--color-fog)' },
            { label: 'SOG', value: `${v.sog != null ? v.sog.toFixed(1) : '--'} kn` },
            { label: 'COG', value: `${v.cog != null ? formatDeg(v.cog) : '---'}°` },
          ]))
          .addTo(map)
        markers.set(v.mmsi, m)
      }
    }
    for (const [mmsi, m] of markers) {
      if (!seen.has(mmsi)) {
        map.removeLayer(m)
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
    for (const a of anchorages) {
      const color = colorMap[a.safety.level] || '#8FA0AE'
      const stateKey = `${a.safety.level}|${a.safety.reason}`
      const existing = markers.get(a.id)
      if (existing) {
        if (existing._stateKey !== stateKey) {
          existing.setIcon(anchorageMarkerEl(color))
          existing.setPopupContent(popupHTML(a.name, [
            { label: 'Regione', value: a.region, color: 'var(--color-fog)' },
            { label: 'Stato', value: a.safety.reason, color },
            { label: 'Fondale', value: `${a.depth[0]}–${a.depth[1]} m` },
            { label: 'Fondo', value: a.seabed },
          ]))
          existing._stateKey = stateKey
        }
      } else {
        const m = L.marker([a.lat, a.lon], { icon: anchorageMarkerEl(color) })
          .bindPopup(popupHTML(a.name, [
            { label: 'Regione', value: a.region, color: 'var(--color-fog)' },
            { label: 'Stato', value: a.safety.reason, color },
            { label: 'Fondale', value: `${a.depth[0]}–${a.depth[1]} m` },
            { label: 'Fondo', value: a.seabed },
          ]))
          .addTo(map)
        m._stateKey = stateKey
        markers.set(a.id, m)
      }
    }
  }, [anchorages, mapReady])

  // === Route draft (line + waypoints + leg labels) ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const group = layerGroupRefs.current.route
    if (!group) return
    group.clearLayers()

    const wps = route.waypoints
    if (wps.length >= 2) {
      // Shadow
      L.polyline(wps.map((w) => [w.lat, w.lon]), {
        color: '#000',
        weight: 7,
        opacity: 0.5,
      }).addTo(group)
      // Main line
      L.polyline(wps.map((w) => [w.lat, w.lon]), {
        color: '#5EE6C8',
        weight: 3,
        opacity: 0.95,
      }).addTo(group)
      // Leg labels (distance + bearing at midpoint)
      for (let i = 0; i < wps.length - 1; i++) {
        const a = wps[i]
        const b = wps[i + 1]
        const distNm = metersToNm(haversine(a.lat, a.lon, b.lat, b.lon))
        const brg = bearing(a.lat, a.lon, b.lat, b.lon)
        const midLat = (a.lat + b.lat) / 2
        const midLon = (a.lon + b.lon) / 2
        L.marker([midLat, midLon], {
          icon: L.divIcon({
            className: 'timone-leg-label',
            html: `${distNm.toFixed(1)}nm ${formatDeg(brg)}°`,
            iconSize: null,
          }),
          interactive: false,
          keyboard: false,
        }).addTo(group)
      }
      // Pericoli sulle tratte: rosso terra, magenta zona vietata (come sulle
      // carte nautiche), arancione fondale sotto pescaggio + margine
      const HAZARD_COLORS = { land: '#FF5252', nogo: '#E040FB', shallow: '#F5A623' }
      for (const leg of route.hazards || []) {
        for (const hz of leg?.hazards || []) {
          L.polyline(hz.path, {
            color: HAZARD_COLORS[hz.kind],
            weight: 6,
            opacity: 0.95,
            interactive: false,
          }).addTo(group)
        }
      }
    }

    // Waypoint markers: nel gruppo della rotta, che clearLayers() svuota a
    // ogni ridisegno (aggiunti alla mappa restavano quelli tolti con UNDO)
    const markers = markersRef.current.waypoints
    markers.clear()
    wps.forEach((w, i) => {
      const isActive = route.nav && route.nav.idx === i
      const m = L.marker([w.lat, w.lon], {
        icon: waypointMarkerEl(i + 1, isActive),
        draggable: route.editing,
        zIndexOffset: 500,
      })
      if (route.editing) {
        m.on('dragend', () => {
          const p = m.getLatLng()
          moveWaypoint(w.id, p.lat, p.lng)
        })
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          removeWaypoint(w.id)
        })
      } else {
        m.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          setWaypointPopupId(w.id)
        })
      }
      m.addTo(group)
      markers.set(w.id, m)
    })
  }, [route.waypoints, route.editing, route.nav, route.hazards, mapReady])

  // === Route alternative options ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    const group = layerGroupRefs.current.routeOptions
    if (!group) return
    group.clearLayers()
    if (!routeOptions) return
    const colors = {
      fastest: '#5EE6C8',
      comfortable: '#4A9EFF',
      safest: '#F5A623',
    }
    for (const [key, r] of Object.entries(routeOptions)) {
      if (!r || !r.waypoints || r.waypoints.length < 2) continue
      if (key === activeRouteOption) continue // skip active (it's the main)
      L.polyline(r.waypoints.map((w) => [w.lat, w.lon]), {
        color: colors[key] || '#8FA0AE',
        weight: 2.5,
        opacity: 0.75,
        dashArray: '4 3',
      }).addTo(group)
    }
  }, [routeOptions, activeRouteOption, mapReady])

  // === Traccia in registrazione ===
  useEffect(() => {
    if (!mapReady) return
    if (!markersRef.current.trackLine) return
    markersRef.current.trackLine.setLatLngs(trackSegments.map((seg) => seg.map((p) => [p[0], p[1]])))
  }, [trackSegments, mapReady])

  // === Tracce salvate: arancio, inizio verde e fine rossa, nome al tocco ===
  useEffect(() => {
    if (!mapReady) return
    const group = layerGroupRefs.current.savedTracks
    if (!group) return
    group.clearLayers()
    for (const t of shownTracks) {
      const segs = t.segments.map((seg) => seg.map((p) => [p[0], p[1]])).filter((seg) => seg.length)
      if (!segs.length) continue
      const date = new Date(t.start).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
      L.polyline(segs, { color: '#FF8C1A', weight: 3, opacity: 0.9, interactive: !route.editing })
        .bindPopup(
          popupHTML(t.name, [
            { label: 'Data', value: date, color: 'var(--color-fog)' },
            { label: 'Miglia', value: `${t.stats?.distanceNm?.toFixed(1) ?? '--'} nm` },
            { label: 'Media / max', value: `${t.stats?.avgKn?.toFixed(1) ?? '--'} / ${t.stats?.maxKn?.toFixed(1) ?? '--'} kn` },
          ])
        )
        .addTo(group)
      const first = segs[0][0]
      const lastSeg = segs[segs.length - 1]
      const last = lastSeg[lastSeg.length - 1]
      L.circleMarker(first, { radius: 5, color: '#fff', weight: 2, fillColor: '#2ECC71', fillOpacity: 1, interactive: false }).addTo(group)
      L.circleMarker(last, { radius: 5, color: '#fff', weight: 2, fillColor: '#FF3B30', fillOpacity: 1, interactive: false }).addTo(group)
    }
  }, [shownTracks, mapReady, route.editing])

  // === Aree protette e zone militari (contorni OpenStreetMap) ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!tileLayerRefs.current.protectedAreas) {
      tileLayerRefs.current.protectedAreas = new ProtectedAreasLayer({
        interactive: true,
        popup: (area, description, areas) => {
          // Regole per zona dal regolamento dell'area marina, se l'app le ha
          if (area.kind !== 'military') {
            const ctx = ampContext(area, areas)
            const html = ctx.rule && ampPopupHTML(area, ctx)
            if (html) return html
          }
          const lines = [{ label: 'Tipo', value: description, color: 'var(--color-fog)' }]
          const page = area.kind !== 'military' && ampPageFor(area, areas)
          if (page) {
            lines.push({
              label: 'Regole',
              value: `<a href="${page}" target="_blank" rel="noopener" style="color:#5EE6C8">decreti e regolamento (Ministero)</a>`,
              color: 'var(--color-fog)',
            })
          }
          lines.push({ label: 'Fonte', value: 'OpenStreetMap, indicativa: fanno fede decreti e ordinanze', color: 'var(--color-fog-dim)' })
          return popupHTML(area.name, lines)
        },
      })
    }
    const layer = tileLayerRefs.current.protectedAreas
    layer.setInteractive(!route.editing)
    if (layers.parks && !map.hasLayer(layer)) map.addLayer(layer)
    if (!layers.parks && map.hasLayer(layer)) map.removeLayer(layer)
  }, [layers.parks, mapReady, route.editing])

  // === Ordinanze recenti delle Capitanerie (interdizioni, esercitazioni) ===
  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    if (!tileLayerRefs.current.ordinances) tileLayerRefs.current.ordinances = new OrdinancesLayer({ interactive: true })
    const layer = tileLayerRefs.current.ordinances
    layer.setInteractive(!route.editing)
    if (layers.ordinances && !map.hasLayer(layer)) map.addLayer(layer)
    if (!layers.ordinances && map.hasLayer(layer)) map.removeLayer(layer)
  }, [layers.ordinances, mapReady, route.editing])

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
      {/* className fisso: Leaflet aggiunge le sue classi (leaflet-container,
          overflow nascosto); se React lo cambiasse le cancellerebbe e la
          mappa "scivolerebbe" di lato. Il cursore a croce è in un effetto. */}
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        style={{
          touchAction: 'none',
          height: '100%',
          width: '100%',
          background: '#0a1620',
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

      {/* Connectivity indicator */}
      <div className="absolute left-3 top-16 z-[900] fade-in">
        <ConnectivityIndicator
          gribAvailable={!!currentField}
          weatherAvailable={true}
        />
        {trackRec && (
          <button
            type="button"
            onClick={() => setActiveDrawer('log')}
            className={`glass mt-1.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[calc(10px*var(--fs))] font-bold tracking-widest ${trackRec.paused ? 'text-warn' : 'text-danger'}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${trackRec.paused ? 'bg-warn' : 'bg-danger animate-pulse'}`} />
            {trackRec.paused ? 'PAUSA' : 'REC'} {trackRec.distanceNm.toFixed(1)} nm
          </button>
        )}
      </div>

      {/* Top-right controls */}
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
        <MapButton title="Layer" onClick={() => setActiveDrawer('layers')}>
          <Layers size={18} />
        </MapButton>
        <MapButton title="Segui barca" active={follow} onClick={() => setFollow(!follow)}>
          <Crosshair size={18} />
        </MapButton>
        <MapButton title="Modifica rotta" active={route.editing} onClick={toggleRouteEditing}>
          <Navigation2 size={18} />
        </MapButton>
        <MapButton title="Tema giorno (sole)" active={dayTheme} onClick={() => setDayTheme(!dayTheme)}>
          <Sun size={18} />
        </MapButton>
        <MapButton title="Modalità notte" active={nightMode} onClick={() => setNightMode(!nightMode)}>
          <Moon size={18} />
        </MapButton>
        <MapButton title="Uomo a mare" danger={Boolean(mob)} onClick={() => onDropMob?.()}>
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
            className="rounded-md border border-warn bg-warn/15 px-3 py-1.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest text-warn touch"
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
                className="glass flex h-14 w-[calc(48px*var(--fs))] flex-col items-center justify-center gap-0.5 rounded-l-lg text-fog hover:text-paper transition-colors"
              >
                <Icon size={16} />
                <span className="text-[calc(7px*var(--fs))] font-bold tracking-wider">{t.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Profondità sotto il puntatore (mouse) */}
      <DepthHover map={mapRef.current} mapReady={mapReady} />

      {/* Long-press context menu */}
      <MapContextMenu
        map={mapRef.current}
        mapReady={mapReady}
        enabled={!route.editing}
        onAddWaypoint={(lat, lon) => addWaypoint(lat, lon)}
        onSetDestination={(lat, lon) => {
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

      {/* Waypoint popup */}
      {waypointPopupId && (() => {
        const idx = route.waypoints.findIndex((w) => w.id === waypointPopupId)
        if (idx < 0) return null
        const wp = route.waypoints[idx]
        return (
          <WaypointPopup
            waypoint={wp}
            index={idx}
            total={route.waypoints.length}
            boatPosition={geo.lat != null ? { lat: geo.lat, lon: geo.lon } : null}
            onMoveUp={(id) => useAppStore.getState().moveWaypointUp(id)}
            onMoveDown={(id) => useAppStore.getState().moveWaypointDown(id)}
            onDelete={(id) => {
              useAppStore.setState((s) => ({
                routeDraft: {
                  ...s.routeDraft,
                  waypoints: s.routeDraft.waypoints.filter((w) => w.id !== id),
                },
              }))
              setWaypointPopupId(null)
            }}
            onSetActive={(i) => {
              useAppStore.setState({
                activeWaypointIdx: i,
                routeNavigating: true,
              })
              setWaypointPopupId(null)
            }}
            onClose={() => setWaypointPopupId(null)}
          />
        )
      })()}
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
    { key: 'isobaths', label: 'Isobate / bassi fondali' },
    { key: 'posidonia', label: 'Posidonia / fondali (Liguria)' },
    { key: 'shomRelief', label: 'Fondale HD Francia (Shom)' },
    { key: 'seamarks', label: 'Fari / Boe' },
    { key: 'wind', label: 'Vettori vento' },
    { key: 'ais', label: 'Navi AIS' },
    { key: 'parks', label: 'Aree protette e zone militari' },
    { key: 'coastBand', label: 'Fascia dalla costa (balneazione)' },
    { key: 'ordinances', label: 'Ordinanze Capitanerie (90 giorni)' },
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
            ['satellite', 'SATELLITE'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBaseStyle(id)}
              className={`flex-1 rounded-md border py-2 text-[calc(10px*var(--fs))] font-semibold tracking-widest transition-all ${
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
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left text-[calc(11px*var(--fs))] tracking-wide hover:bg-raised transition-colors"
          >
            <span
              className={`flex h-4 w-4 flex-none items-center justify-center rounded border text-[calc(10px*var(--fs))] ${
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
          <span className="text-[calc(10px*var(--fs))] text-fog ml-1">kn</span>
        </div>
      </div>
      <div className="h-8 w-px bg-line" />
      <div>
        <div className="label">COG</div>
        <div className="font-mono text-lg font-bold text-paper">
          {geo.cog != null ? formatDeg(geo.cog) : '---'}
          <span className="text-[calc(10px*var(--fs))] text-fog ml-1">°</span>
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
    const colorFor = (speed) => {
      if (speed < 8) return '#5EE6C8'
      if (speed < 14) return '#7FE0A8'
      if (speed < 20) return '#F5A623'
      if (speed < 28) return '#FF8A4A'
      return '#FF5252'
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
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!field || !field.length) return
      const step = 90
      for (let px = step / 2; px < w; px += step) {
        for (let py = step / 2; py < h; py += step) {
          const ll = map.containerPointToLatLng([px, py])
          let best = null
          let bestDist = Infinity
          for (const f of field) {
            const d = (f.lat - ll.lat) ** 2 + (f.lon - ll.lng) ** 2
            if (d < bestDist) {
              bestDist = d
              best = f
            }
          }
          if (!best) continue
          const len = Math.min(34, 12 + best.speed * 1.1)
          ctx.save()
          ctx.translate(px, py)
          ctx.rotate(((best.dir + 180) * Math.PI) / 180)
          ctx.strokeStyle = colorFor(best.speed)
          ctx.fillStyle = colorFor(best.speed)
          ctx.globalAlpha = 0.8
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
    map.on('move zoom moveend zoomend resize viewreset', schedule)
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      map.off('move zoom moveend zoomend resize viewreset', schedule)
    }
  }, [map, field])
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[500]" />
}

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
          const ll = map.containerPointToLatLng([px, py])
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
          let speed = null, dir = null
          if (best.times?.length) {
            let bestI = 0, bestDiff = Infinity
            for (let i = 0; i < best.times.length; i++) {
              const t = new Date(best.times[i]).getTime()
              const diff = Math.abs(t - now)
              if (diff < bestDiff) { bestDiff = diff; bestI = i }
            }
            speed = best.currSpeed?.[bestI]
            dir = best.currDir?.[bestI]
          }
          if (speed == null || dir == null || speed < 0.1) continue
          const len = Math.min(40, 14 + speed * 8)
          ctx.save()
          ctx.translate(px, py)
          ctx.rotate((dir * Math.PI) / 180)
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
    map.on('move zoom moveend zoomend resize viewreset', schedule)
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      map.off('move zoom moveend zoomend resize viewreset', schedule)
    }
  }, [map, field, timeOffset])
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-[510]" />
}
