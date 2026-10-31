import { useEffect, useRef, useState } from 'react'
import { depthAt } from '../../lib/depthAt.js'

/**
 * Profondità sotto il puntatore del mouse (Mac): un riquadrino che segue
 * il cursore sul mare. Sul touch non c'è passaggio: la profondità sta nel
 * menu della pressione prolungata (MapContextMenu).
 */
const MIN_ZOOM = 11 // più lontano i blocchi EMODnet da scaricare sarebbero troppi
const THROTTLE_MS = 80

export function formatDepth(depth) {
  return depth.toLocaleString('it-IT', { maximumFractionDigits: depth < 20 ? 1 : 0 })
}

export default function DepthHover({ map, mapReady }) {
  const [info, setInfo] = useState(null) // { x, y, depth, source }
  const reqRef = useRef(0)
  const lastRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!map || !mapReady) return undefined

    const query = (e) => {
      const req = ++reqRef.current
      const { lat, lng } = e.latlng
      const { clientX: x, clientY: y } = e.originalEvent
      depthAt(lat, lng).then((d) => {
        if (req !== reqRef.current) return
        setInfo(d ? { x, y, ...d } : null)
      })
    }

    const onMove = (e) => {
      // Solo mouse: sul touch Safari genera mousemove finti al tocco
      if (e.originalEvent?.sourceCapabilities?.firesTouchEvents) return
      if (map.getZoom() < MIN_ZOOM) {
        reqRef.current++
        setInfo(null)
        return
      }
      const now = Date.now()
      clearTimeout(timerRef.current)
      if (now - lastRef.current >= THROTTLE_MS) {
        lastRef.current = now
        query(e)
      } else {
        timerRef.current = setTimeout(() => {
          lastRef.current = Date.now()
          query(e)
        }, THROTTLE_MS)
      }
    }
    const onOut = () => {
      clearTimeout(timerRef.current)
      reqRef.current++
      setInfo(null)
    }

    map.on('mousemove', onMove)
    map.on('mouseout movestart', onOut)
    return () => {
      clearTimeout(timerRef.current)
      map.off('mousemove', onMove)
      map.off('mouseout movestart', onOut)
    }
  }, [map, mapReady])

  if (!info) return null
  return (
    <div
      className="glass pointer-events-none fixed z-[1200] rounded-md px-2 py-1"
      style={{ left: info.x + 14, top: info.y + 14 }}
    >
      <span className="font-mono text-[calc(12px*var(--fs))] font-semibold text-paper">{formatDepth(info.depth)} m</span>
      <span className="ml-1.5 text-[calc(9px*var(--fs))] tracking-wide text-fog">{info.source === 'Shom' ? 'Shom' : 'EMODnet ≈'}</span>
    </div>
  )
}
