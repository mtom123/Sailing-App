import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { formatDeg } from '../lib/geo.js'
import { SAFETY_COLORS } from '../lib/anchorageSafety.js'

/*
 * Mappa centrale: base CARTO Dark Matter + batimetria EMODnet +
 * seamarks OpenSeaMap. Overlay vento su canvas, marker AIS triangolari
 * orientati secondo la prua, ancoraggi con semaforo di sicurezza,
 * posizione barca e cerchio di guardia dell'ancora.
 */

const BASE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const BASE_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const BATHY_URL = 'https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png'
const BATHY_ATTR = '&copy; <a href="https://emodnet.ec.europa.eu">EMODnet Bathymetry</a>'
const SEAMARK_URL = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'
const SEAMARK_ATTR = '&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>'

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

function WindCanvas({ map, field }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!map) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    function colorFor(speed) {
      if (speed < 11) return '#3DFF7A'
      if (speed < 21) return '#FFC933'
      return '#FF4545'
    }

    function draw() {
      const size = map.getSize()
      const dpr = window.devicePixelRatio || 1
      canvas.width = size.x * dpr
      canvas.height = size.y * dpr
      canvas.style.width = `${size.x}px`
      canvas.style.height = `${size.y}px`
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
          // la freccia punta DOVE VA il vento (direzione di provenienza + 180)
          ctx.rotate(((best.dir + 180) * Math.PI) / 180)
          ctx.strokeStyle = colorFor(best.speed)
          ctx.fillStyle = colorFor(best.speed)
          ctx.globalAlpha = 0.85
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
          ctx.rotate(-(((best.dir + 180) * Math.PI) / 180))
          ctx.globalAlpha = 0.9
          ctx.font = '9px ui-monospace, monospace'
          ctx.fillText(`${Math.round(best.speed)}`, 8, len / 2 + 2)
          ctx.restore()
        }
      }
    }

    draw()
    map.on('move zoom resize viewreset', draw)
    return () => map.off('move zoom resize viewreset', draw)
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
  boat,
  follow,
  layers,
  windField,
  vessels,
  anchorages,
  anchorWatch,
  focusTarget,
  onViewChange,
  onUserPan,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)

  const tileRefs = useRef({})
  const vesselMarkersRef = useRef(new Map())
  const vesselGroupRef = useRef(null)
  const anchorMarkersRef = useRef(new Map())
  const anchorGroupRef = useRef(null)
  const boatMarkerRef = useRef(null)
  const boatCircleRef = useRef(null)
  const watchLayersRef = useRef(null)
  const callbacksRef = useRef({ onViewChange, onUserPan })
  callbacksRef.current = { onViewChange, onUserPan }

  // Inizializzazione mappa (una sola volta)
  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [initialCenter.lat, initialCenter.lon],
      zoom: 11,
      zoomControl: false,
      attributionControl: true,
      touchZoom: true, // pinch-to-zoom
      tap: false,
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map)

    L.tileLayer(BASE_URL, { attribution: BASE_ATTR, maxZoom: 19 }).addTo(map)
    tileRefs.current.bathy = L.tileLayer(BATHY_URL, {
      attribution: BATHY_ATTR,
      maxZoom: 18,
      opacity: 0.55,
    })
    tileRefs.current.seamarks = L.tileLayer(SEAMARK_URL, {
      attribution: SEAMARK_ATTR,
      maxZoom: 18,
    })

    vesselGroupRef.current = L.layerGroup().addTo(map)
    anchorGroupRef.current = L.layerGroup().addTo(map)
    watchLayersRef.current = L.layerGroup().addTo(map)

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
    map.on('dragstart', () => callbacksRef.current.onUserPan())
    emitView()

    mapRef.current = map
    setMapReady(true)
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Layer raster attivabili
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    for (const key of ['bathy', 'seamarks']) {
      const layer = tileRefs.current[key]
      if (layers[key] && !map.hasLayer(layer)) map.addLayer(layer)
      if (!layers[key] && map.hasLayer(layer)) map.removeLayer(layer)
    }
  }, [layers.bathy, layers.seamarks, mapReady])

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
      const existing = markers.get(a.id)
      if (existing) {
        existing.setIcon(anchorageIcon(color))
        existing.getPopup().setContent(anchoragePopup(a, a.safety))
      } else {
        const m = L.marker([a.lat, a.lon], { icon: anchorageIcon(color) })
        m.bindPopup(anchoragePopup(a, a.safety))
        m.addTo(group)
        markers.set(a.id, m)
      }
    }
  }, [anchorages, mapReady])

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
    if (follow) {
      map.panTo([boat.lat, boat.lon], { animate: true, duration: 0.5 })
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
      <div ref={containerRef} className="h-full w-full" />
      {mapReady && layers.wind && (
        <WindCanvas map={mapRef.current} field={windField} />
      )}
    </div>
  )
}
