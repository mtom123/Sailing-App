import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Ship, Undo2 } from 'lucide-react'
import { bearing, formatDeg, haversine } from '../../lib/geo.js'

/**
 * Righello: tap sulla carta per aggiungere punti, misura in metri (e miglia)
 * ogni tratto e il totale. I punti si trascinano col dito e la misura segue.
 * "Da barca" parte dalla posizione GPS. I tap vanno solo al righello finché
 * è aperto (niente waypoint).
 */

function formatMeters(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`
}
const formatNm = (m) => `${(m / 1852).toFixed(2).replace('.', ',')} nm`

const COLOR = '#FFD54F'

// Pallino giallo con un'area di presa larga per il dito (36 px)
const handleIcon = L.divIcon({
  className: 'timone-marker',
  html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center"><div style="width:14px;height:14px;border-radius:50%;background:${COLOR};border:2px solid #0a1620;box-shadow:0 1px 4px rgba(0,0,0,0.6)"></div></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

export default function RulerTool({ map, boatPosition, onClose }) {
  const [points, setPoints] = useState([]) // [{ lat, lon }]
  const layersRef = useRef(null) // { group, casing, line, markers: [] }

  // Tap sulla carta: nuovo punto
  useEffect(() => {
    if (!map) return undefined
    const group = L.layerGroup().addTo(map)
    // Bordo scuro sotto il tratteggio: si vede anche sulla carta chiara
    const casing = L.polyline([], { color: '#0a1620', weight: 6, opacity: 0.7, interactive: false }).addTo(group)
    const line = L.polyline([], { color: COLOR, weight: 3, dashArray: '8 6', interactive: false }).addTo(group)
    layersRef.current = { group, casing, line, markers: [] }
    const onClick = (e) => setPoints((p) => [...p, { lat: e.latlng.lat, lon: e.latlng.lng }])
    map.on('click', onClick)
    map.getContainer().classList.add('cursor-crosshair')
    return () => {
      map.off('click', onClick)
      map.getContainer().classList.remove('cursor-crosshair')
      // Se la carta è già stata smontata (ricarica dell'app) non c'è niente da togliere
      if (map.hasLayer(group)) group.remove()
      layersRef.current = null
    }
  }, [map])

  // Linea, punti trascinabili e distanza progressiva a ogni punto. I marker
  // restano gli stessi (ricrearli interromperebbe il trascinamento)
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    const { group, markers } = layers
    while (markers.length > points.length) group.removeLayer(markers.pop())
    points.forEach((p, i) => {
      if (!markers[i]) {
        const m = L.marker([p.lat, p.lon], { icon: handleIcon, draggable: true, autoPan: true, zIndexOffset: 1500 }).addTo(group)
        m.on('drag', (e) => {
          const { lat, lng } = e.target.getLatLng()
          setPoints((list) => list.map((q, j) => (j === i ? { lat, lon: lng } : q)))
        })
        markers[i] = m
      } else {
        const cur = markers[i].getLatLng()
        if (cur.lat !== p.lat || cur.lng !== p.lon) markers[i].setLatLng([p.lat, p.lon])
      }
    })
    const latlngs = points.map((p) => [p.lat, p.lon])
    layers.casing.setLatLngs(points.length > 1 ? latlngs : [])
    layers.line.setLatLngs(points.length > 1 ? latlngs : [])
    let total = 0
    points.forEach((p, i) => {
      const m = markers[i]
      if (i === 0) {
        m.unbindTooltip()
        return
      }
      total += haversine(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon)
      if (m.getTooltip()) m.setTooltipContent(formatMeters(total))
      else m.bindTooltip(formatMeters(total), { permanent: true, direction: 'right', offset: [12, 0], className: 'ruler-label' })
    })
  }, [points])

  let total = 0
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
  const last = points.length > 1 ? points.slice(-2) : null
  const lastBrg = last ? bearing(last[0].lat, last[0].lon, last[1].lat, last[1].lon) : null

  const btn = 'touch rounded-md border px-3 py-1.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest'

  return (
    <div className="glass-strong absolute left-1/2 top-3 z-[950] flex max-w-[calc(100%-140px)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-lg px-4 py-2 slide-up">
      <span className="text-[calc(11px*var(--fs))] font-semibold tracking-wider text-warn">RIGHELLO</span>
      {points.length < 2 ? (
        <span className="text-[calc(11px*var(--fs))] text-fog">{points.length ? 'tap sul punto di arrivo' : 'tap sul punto di partenza'}</span>
      ) : (
        <span className="whitespace-nowrap font-mono text-[calc(16px*var(--fs))] font-bold text-paper tabular-nums">
          {formatMeters(total)}
          <span className="ml-2 whitespace-nowrap text-[calc(11px*var(--fs))] font-semibold text-fog">
            {formatNm(total)} · {formatDeg(lastBrg)}°
          </span>
        </span>
      )}
      <div className="flex gap-1.5">
        {points.length === 0 && boatPosition && (
          <button
            type="button"
            onClick={() => setPoints([{ lat: boatPosition.lat, lon: boatPosition.lon }])}
            className={`${btn} flex items-center gap-1 border-line text-paper`}
          >
            <Ship size={13} /> DA BARCA
          </button>
        )}
        {points.length > 0 && (
          <button type="button" title="Togli l'ultimo punto" onClick={() => setPoints((p) => p.slice(0, -1))} className={`${btn} border-line text-paper`}>
            <Undo2 size={13} />
          </button>
        )}
        <button type="button" onClick={onClose} className={`${btn} border-warn bg-warn/15 text-warn`}>
          FINE
        </button>
      </div>
    </div>
  )
}
