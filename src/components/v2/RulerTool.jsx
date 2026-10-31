import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Ship, Undo2 } from 'lucide-react'
import { bearing, formatDeg, haversine } from '../../lib/geo.js'

/**
 * Righello: tap sulla carta per aggiungere punti, misura in metri (e miglia)
 * ogni tratto e il totale. "Da barca" parte dalla posizione GPS.
 * I tap vanno solo al righello finché è aperto (niente waypoint).
 */

export function formatMeters(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`
}
const formatNm = (m) => `${(m / 1852).toFixed(2).replace('.', ',')} nm`

const COLOR = '#FFD54F'

export default function RulerTool({ map, boatPosition, onClose }) {
  const [points, setPoints] = useState([]) // [{ lat, lon }]
  const groupRef = useRef(null)

  // Tap sulla carta: nuovo punto
  useEffect(() => {
    if (!map) return undefined
    const group = L.layerGroup().addTo(map)
    groupRef.current = group
    const onClick = (e) => setPoints((p) => [...p, { lat: e.latlng.lat, lon: e.latlng.lng }])
    map.on('click', onClick)
    map.getContainer().classList.add('cursor-crosshair')
    return () => {
      map.off('click', onClick)
      map.getContainer().classList.remove('cursor-crosshair')
      group.remove()
    }
  }, [map])

  // Linea, punti e distanza progressiva a ogni punto
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    group.clearLayers()
    if (points.length > 1) {
      const line = points.map((p) => [p.lat, p.lon])
      // Bordo scuro sotto il tratteggio: si vede anche sulla carta chiara
      L.polyline(line, { color: '#0a1620', weight: 6, opacity: 0.7, interactive: false }).addTo(group)
      L.polyline(line, { color: COLOR, weight: 3, dashArray: '8 6', interactive: false }).addTo(group)
    }
    let total = 0
    points.forEach((p, i) => {
      if (i > 0) total += haversine(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon)
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 6,
        color: '#0a1620',
        weight: 2,
        fillColor: COLOR,
        fillOpacity: 1,
        interactive: false,
      }).addTo(group)
      if (i > 0) {
        marker.bindTooltip(formatMeters(total), { permanent: true, direction: 'right', offset: [8, 0], className: 'ruler-label' })
      }
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
        <span className="font-mono text-[calc(16px*var(--fs))] font-bold text-paper tabular-nums">
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
