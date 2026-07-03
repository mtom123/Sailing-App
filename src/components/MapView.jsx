import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { formatDeg, metersToNm } from '../lib/geo.js'
import { SAFETY_COLORS } from '../lib/anchorageSafety.js'

/*
 * Mappa centrale: base CARTO Dark Matter + batimetria EMODnet + seamarks
 * OpenSeaMap + radar pioggia RainViewer. Overlay vento su canvas, navi AIS,
 * ancoraggi con semaforo, rotta editabile con waypoint trascinabili, aree
 * marine protette, traccia GPS, MOB e cerchio di guardia dell'ancora.
 */

const MAX_ZOOM = 20 // zoom massimo della mappa: oltre il nativo si upscala

// CHIARA: CARTO Voyager, dettagliata fino a z19 nativo (coste, porti, paesi)
const CHART_URL =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
// Batimetria EMODnet: overlay semitrasparente (nativo fino a z12)
const BATHY_URL =
  'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png'
const BATHY_ATTR = '&copy; <a href="https://emodnet.ec.europa.eu">EMODnet Bathymetry</a>'
const SEAMARK_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'
const SEAMARK_ATTR = '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>'
const RAIN_ATTR = '&copy; <a href="https://www.rainviewer.com">RainViewer</a>'

function vesselIcon(v) {
  const rot = v.cog != null ? v.cog : v.hdg != null ? v.hdg : 0
  return L.divIcon({
    className: '',
    html: `<svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${rot}deg)">
      <polygon points="12,2 20,22 12,17 4,22" fill="#3DFF7A" stroke="#0D0D0D" stroke-width="1.5"/>
    </svg>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

function boatIcon(cog) {
  const rot = cog != null ? cog : 0
  return L.divIcon({
    className: '',
    html: `<svg width="30" height="30" viewBox="0 0 30 30" style="transform:rotate(${rot}deg)">
      <polygon points="15,2 24,27 15,21 6,27" fill="#F2F2F2" stroke="#0D0D0D" stroke-width="2"/>
    </svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function anchorageIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:#121212;border:2.5px solid ${color};display:flex;align-items:center;justify-content:center;color:${color};font-size:12px;line-height:1">&#9875;</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function waypointIcon(index, active) {
  const color = active ? '#3DFF7A' : '#F2F2F2'
  return L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#0D0D0D;border:2.5px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;font:bold 11px ui-monospace,monospace;box-shadow:0 1px 6px rgba(0,0,0,.6)">${index}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function legLabelIcon(text) {
  return L.divIcon({
    className: 'leg-label',
    html: text,
    iconSize: null,
  })
}

const mobIcon = () =>
  L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#FF4545;border:3px solid #F2F2F2;color:#0D0D0D;display:flex;align-items:center;justify-content:center;font:bold 11px ui-monospace,monospace;box-shadow:0 0 12px #FF4545">MOB</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

function vesselPopup(v) {
  return `<div style="min-width:150px">
    <div style="color:#3DFF7A;font-weight:bold">${v.name || 'MMSI ' + v.mmsi}</div>
    <div style="color:#9BA0A6;font-size:10px">MMSI ${v.mmsi}</div>
    <div>SOG <b>${v.sog != null ? v.sog.toFixed(1) : '--'}</b> kn ·
    COG <b>${v.cog != null ? formatDeg(v.cog) : '---'}°</b></div>
  </div>`
}

function anchoragePopup(a, safety) {
  const color = SAFETY_COLORS[safety.level]
  return `<div style="min-width:190px">
    <div style="color:#F2F2F2;font-weight:bold">${a.name}</div>
    <div style="color:#9BA0A6;font-size:10px">${a.region}</div>
    <div style="margin-top:4px;color:${color};font-weight:bold">&#9679; ${safety.reason}</div>
    <div style="margin-top:4px;font-size:11px">Fondale ${a.depth[0]}–${a.depth[1]} m · ${a.seabed}</div>
    <div style="color:#9BA0A6;font-size:10px;margin-top:2px">${a.notes}</div>
  </div>`
}

function parkPopup(park, status) {
  const banner =
    status === 'inside'
      ? '<div style="color:#FF4545;font-weight:bold">SEI DENTRO L\'AREA</div>'
      : status === 'near'
        ? '<div style="color:#FFC933;font-weight:bold">Area a meno di 1 nm</div>'
        : ''
  return `<div style="min-width:210px">
    <div style="color:#F2F2F2;font-weight:bold">${park.name}</div>
    <div style="color:#9BA0A6;font-size:10px">${park.authority}</div>
    ${banner}
    <div style="margin-top:4px;font-size:11px;line-height:1.45">${park.rules}</div>
    <div style="color:#9BA0A6;font-size:9px;margin-top:4px">Perimetro indicativo — fanno fede le ordinanze ufficiali.</div>
  </div>`
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

    function colorFor(speed) {
      if (speed < 11) return '#3DFF7A'
      if (speed < 21) return '#FFC933'
      return '#FF4545'
    }

    function draw() {
      raf = null
      const size = map.getSize()
      const dpr = window.devicePixelRatio || 1
      // Ridimensionare il buffer canvas è costoso: solo quando serve davvero
      if (size.x !== lastW || size.y !== lastH) {
        canvas.width = size.x * dpr
        canvas.height = size.y * dpr
        canvas.style.width = `${size.x}px`
        canvas.style.height = `${size.y}px`
        lastW = size.x
        lastH = size.y
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.x, size.y)
      if (!field.length) return

      const step = 90
      for (let px = step / 2; px < size.x; px += step) {
        for (let py = step / 2; py < size.y; py += step) {
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

    // Throttle a un frame per refresh: niente ridisegni multipli per evento
    function schedule() {
      if (raf == null) raf = requestAnimationFrame(draw)
    }

    schedule()
    map.on('move zoom moveend zoomend resize viewreset', schedule)
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      map.off('move zoom moveend zoomend resize viewreset', schedule)
    }
  }, [map, field])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[500]"
    />
  )
}

export default function MapView({
  initialCenter,
  baseStyle,
  boat,
  follow,
  layers,
  windField,
  vessels,
  anchorages,
  anchorWatch,
  focusTarget,
  route,
  parks,
  trackPoints,
  mob,
  rainTileUrl,
  onViewChange,
  onUserPan,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)

  const tileRefs = useRef({})
  const rainLayerRef = useRef(null)
  const interactingRef = useRef(false)
  const vesselMarkersRef = useRef(new Map())
  const vesselGroupRef = useRef(null)
  const anchorMarkersRef = useRef(new Map())
  const anchorStateRef = useRef(new Map())
  const anchorGroupRef = useRef(null)
  const routeGroupRef = useRef(null)
  const parksGroupRef = useRef(null)
  const parkLayersRef = useRef(new Map())
  const parkStateRef = useRef(new Map())
  const trackLineRef = useRef(null)
  const mobMarkerRef = useRef(null)
  const boatMarkerRef = useRef(null)
  const boatCircleRef = useRef(null)
  const watchLayersRef = useRef(null)
  const callbacksRef = useRef({})
  callbacksRef.current = {
    onViewChange,
    onUserPan,
    editing: route.editing,
    addWaypoint: route.addWaypoint,
    removeWaypoint: route.removeWaypoint,
    moveWaypoint: route.moveWaypoint,
  }

  // Inizializzazione mappa (una sola volta)
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [initialCenter.lat, initialCenter.lon],
      zoom: 11,
      minZoom: 3,
      maxZoom: MAX_ZOOM,
      zoomControl: false,
      attributionControl: true,
      touchZoom: true, // pinch-to-zoom
      tap: false,
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map)

    // maxNativeZoom: oltre lo zoom nativo dei server le tile vengono
    // upscalate invece di sparire (fix "zoom non carica")
    tileRefs.current.chart = L.tileLayer(CHART_URL, {
      attribution: CARTO_ATTR,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 19,
    })
    tileRefs.current.dark = L.tileLayer(DARK_URL, {
      attribution: CARTO_ATTR,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 19,
    })
    tileRefs.current.bathy = L.tileLayer(BATHY_URL, {
      attribution: BATHY_ATTR,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 12,
      opacity: 0.45,
    })
    tileRefs.current.seamarks = L.tileLayer(SEAMARK_URL, {
      attribution: SEAMARK_ATTR,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: 18,
    })

    // Il pannello strumenti è richiudibile: la mappa deve reagire al resize
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false })
    })
    resizeObserver.observe(containerRef.current)

    parksGroupRef.current = L.layerGroup().addTo(map)
    routeGroupRef.current = L.layerGroup().addTo(map)
    vesselGroupRef.current = L.layerGroup().addTo(map)
    anchorGroupRef.current = L.layerGroup().addTo(map)
    watchLayersRef.current = L.layerGroup().addTo(map)

    trackLineRef.current = L.polyline([], {
      color: '#3DFF7A',
      weight: 2,
      opacity: 0.7,
      dashArray: '1 6',
    }).addTo(map)

    const emitView = () => {
      const c = map.getCenter()
      const b = map.getBounds()
      callbacksRef.current.onViewChange({
        center: { lat: c.lat, lon: c.lng },
        bounds: {
          south: b.getSouth(),
          west: b.getWest(),
          north: b.getNorth(),
          east: b.getEast(),
        },
      })
    }
    map.on('moveend', emitView)
    // Traccia le interazioni dirette: il follow non deve combattere col pinch
    map.on('zoomstart', () => {
      interactingRef.current = true
    })
    map.on('zoomend', () => {
      interactingRef.current = false
    })
    map.on('dragstart', () => {
      interactingRef.current = true
      callbacksRef.current.onUserPan()
    })
    map.on('dragend', () => {
      interactingRef.current = false
    })
    map.on('click', (e) => {
      if (callbacksRef.current.editing) {
        callbacksRef.current.addWaypoint(e.latlng.lat, e.latlng.lng)
      }
    })
    emitView()

    mapRef.current = map
    setMapReady(true)
    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Carta base: CHIARA (Voyager dettagliata) o SCURA (Dark Matter)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const active = baseStyle === 'dark' ? 'dark' : 'chart'
    const inactive = active === 'dark' ? 'chart' : 'dark'
    if (map.hasLayer(tileRefs.current[inactive])) {
      map.removeLayer(tileRefs.current[inactive])
    }
    if (!map.hasLayer(tileRefs.current[active])) {
      tileRefs.current[active].addTo(map)
      tileRefs.current[active].bringToBack()
    }
  }, [baseStyle, mapReady])

  // Overlay batimetria e seamarks attivabili
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const key of ['bathy', 'seamarks']) {
      const layer = tileRefs.current[key]
      if (layers[key] && !map.hasLayer(layer)) map.addLayer(layer)
      if (!layers[key] && map.hasLayer(layer)) map.removeLayer(layer)
    }
  }, [layers.bathy, layers.seamarks, mapReady])

  // Radar pioggia
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (rainLayerRef.current) {
      map.removeLayer(rainLayerRef.current)
      rainLayerRef.current = null
    }
    if (rainTileUrl) {
      rainLayerRef.current = L.tileLayer(rainTileUrl, {
        attribution: RAIN_ATTR,
        opacity: 0.65,
        maxZoom: 18,
      }).addTo(map)
    }
  }, [rainTileUrl, mapReady])

  // Marker AIS (diff per MMSI: aggiorna senza chiudere i popup)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const group = vesselGroupRef.current
    const markers = vesselMarkersRef.current
    const list = layers.ais ? vessels.filter((v) => v.lat != null) : []
    const seen = new Set()

    for (const v of list) {
      seen.add(v.mmsi)
      const existing = markers.get(v.mmsi)
      if (existing) {
        existing.setLatLng([v.lat, v.lon])
        existing.setIcon(vesselIcon(v))
        existing.getPopup().setContent(vesselPopup(v))
      } else {
        const m = L.marker([v.lat, v.lon], { icon: vesselIcon(v) })
        m.bindPopup(vesselPopup(v))
        m.addTo(group)
        markers.set(v.mmsi, m)
      }
    }
    for (const [mmsi, m] of markers) {
      if (!seen.has(mmsi)) {
        group.removeLayer(m)
        markers.delete(mmsi)
      }
    }
  }, [vessels, layers.ais, mapReady])

  // Marker ancoraggi con semaforo
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const group = anchorGroupRef.current
    const markers = anchorMarkersRef.current

    for (const a of anchorages) {
      const color = SAFETY_COLORS[a.safety.level]
      const stateKey = `${a.safety.level}|${a.safety.reason}`
      const existing = markers.get(a.id)
      if (existing) {
        // Aggiorna solo se il semaforo è davvero cambiato: evita churn DOM
        if (anchorStateRef.current.get(a.id) !== stateKey) {
          existing.setIcon(anchorageIcon(color))
          existing.getPopup().setContent(anchoragePopup(a, a.safety))
          anchorStateRef.current.set(a.id, stateKey)
        }
      } else {
        const m = L.marker([a.lat, a.lon], { icon: anchorageIcon(color) })
        m.bindPopup(anchoragePopup(a, a.safety))
        m.addTo(group)
        markers.set(a.id, m)
        anchorStateRef.current.set(a.id, stateKey)
      }
    }
  }, [anchorages, mapReady])

  // Aree marine protette (poligoni creati una volta, ristilizzati sul cambio stato)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const group = parksGroupRef.current
    if (!layers.parks) {
      group.clearLayers()
      parkLayersRef.current.clear()
      parkStateRef.current.clear()
      return
    }
    for (const p of parks) {
      const color =
        p.status === 'inside' ? '#FF4545' : p.status === 'near' ? '#FFC933' : '#FF7A45'
      const style = {
        color,
        weight: p.status ? 2.5 : 1.5,
        dashArray: '8 5',
        fillColor: color,
        fillOpacity: p.status === 'inside' ? 0.18 : 0.07,
      }
      let poly = parkLayersRef.current.get(p.id)
      if (!poly) {
        poly = L.polygon(
          p.polygon.map(([lat, lon]) => [lat, lon]),
          style
        ).bindPopup(parkPopup(p, p.status))
        poly.addTo(group)
        parkLayersRef.current.set(p.id, poly)
        parkStateRef.current.set(p.id, p.status)
      } else if (parkStateRef.current.get(p.id) !== p.status) {
        poly.setStyle(style)
        poly.getPopup().setContent(parkPopup(p, p.status))
        parkStateRef.current.set(p.id, p.status)
      }
    }
  }, [parks, layers.parks, mapReady])

  // Rotta: polyline + waypoint (trascinabili in modifica)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const group = routeGroupRef.current
    group.clearLayers()
    const wps = route.waypoints
    if (!wps.length) return

    if (wps.length > 1) {
      // Alone scuro sotto la linea: leggibile sia su carta chiara sia scura
      L.polyline(
        wps.map((w) => [w.lat, w.lon]),
        { color: '#0D0D0D', weight: 6, opacity: 0.55 }
      ).addTo(group)
      L.polyline(
        wps.map((w) => [w.lat, w.lon]),
        { color: '#00C853', weight: 3, opacity: 0.95 }
      ).addTo(group)
      // Etichetta distanza·rotta a metà di ogni tratta
      for (let i = 0; i < wps.length - 1; i++) {
        const a = wps[i]
        const b = wps[i + 1]
        const distNm = metersToNm(
          map.distance([a.lat, a.lon], [b.lat, b.lon])
        )
        L.marker([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2], {
          icon: legLabelIcon(`${distNm.toFixed(1)} nm`),
          interactive: false,
          keyboard: false,
        }).addTo(group)
      }
    }
    wps.forEach((w, i) => {
      const isActiveDest = route.nav && route.nav.idx === i
      const m = L.marker([w.lat, w.lon], {
        icon: waypointIcon(i + 1, isActiveDest),
        draggable: route.editing,
        zIndexOffset: 500,
      })
      if (route.editing) {
        m.on('dragend', () => {
          const pos = m.getLatLng()
          callbacksRef.current.moveWaypoint(w.id, pos.lat, pos.lng)
        })
        m.on('click', () => callbacksRef.current.removeWaypoint(w.id))
      } else {
        m.bindPopup(
          `<b>${w.name}</b><br/><span style="color:#9BA0A6;font-size:10px">${w.lat.toFixed(4)}, ${w.lon.toFixed(4)}</span>`
        )
      }
      m.addTo(group)
    })
  }, [route.waypoints, route.editing, route.nav && route.nav.idx, mapReady])

  // Traccia GPS
  useEffect(() => {
    if (!trackLineRef.current) return
    trackLineRef.current.setLatLngs(trackPoints.map((p) => [p.lat, p.lon]))
  }, [trackPoints, mapReady])

  // MOB
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (mobMarkerRef.current) {
      map.removeLayer(mobMarkerRef.current)
      mobMarkerRef.current = null
    }
    if (mob) {
      mobMarkerRef.current = L.marker([mob.lat, mob.lon], {
        icon: mobIcon(),
        zIndexOffset: 2000,
      }).addTo(map)
    }
  }, [mob, mapReady])

  // Posizione barca + cerchio di accuratezza + follow
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (boat.lat == null) return

    if (!boatMarkerRef.current) {
      boatMarkerRef.current = L.marker([boat.lat, boat.lon], {
        icon: boatIcon(boat.cog),
        zIndexOffset: 1000,
      }).addTo(map)
      boatCircleRef.current = L.circle([boat.lat, boat.lon], {
        radius: boat.accuracy || 0,
        color: '#F2F2F2',
        weight: 1,
        opacity: 0.4,
        fillOpacity: 0.06,
      }).addTo(map)
    } else {
      boatMarkerRef.current.setLatLng([boat.lat, boat.lon])
      boatMarkerRef.current.setIcon(boatIcon(boat.cog))
      boatCircleRef.current.setLatLng([boat.lat, boat.lon])
      boatCircleRef.current.setRadius(boat.accuracy || 0)
    }
    // Follow senza animazione e mai durante pinch/drag: evita che il
    // ricentraggio interrompa i gesti dell'utente e generi jank
    if (follow && !interactingRef.current) {
      const boatPt = map.latLngToContainerPoint([boat.lat, boat.lon])
      const centerPt = map.latLngToContainerPoint(map.getCenter())
      if (boatPt.distanceTo(centerPt) > 12) {
        map.panTo([boat.lat, boat.lon], { animate: false })
      }
    }
  }, [boat.lat, boat.lon, boat.cog, boat.accuracy, follow, mapReady])

  // Cerchio di guardia ancora
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const group = watchLayersRef.current
    group.clearLayers()
    if (!anchorWatch) return
    L.circle([anchorWatch.lat, anchorWatch.lon], {
      radius: anchorWatch.radius,
      color: '#FF4545',
      weight: 2,
      dashArray: '6 4',
      fillColor: '#FF4545',
      fillOpacity: 0.08,
    }).addTo(group)
    L.marker([anchorWatch.lat, anchorWatch.lon], {
      icon: L.divIcon({
        className: '',
        html: '<div style="color:#FF4545;font-size:18px;text-shadow:0 0 4px #000">&#9875;</div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }),
    }).addTo(group)
  }, [anchorWatch, mapReady])

  // Zoom su ancoraggio selezionato dal pannello
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusTarget) return
    map.flyTo([focusTarget.lat, focusTarget.lon], 14, { duration: 1.2 })
    const marker = anchorMarkersRef.current.get(focusTarget.id)
    if (marker) setTimeout(() => marker.openPopup(), 1300)
  }, [focusTarget])

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className={`h-full w-full ${route.editing ? 'cursor-crosshair' : ''}`}
      />
      {mapReady && layers.wind && (
        <WindCanvas map={mapRef.current} field={windField} />
      )}
    </div>
  )
}
