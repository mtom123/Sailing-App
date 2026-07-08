import { useEffect, useRef, useState } from 'react'
import { Navigation2, MapPin, Anchor, X, Ship, BarChart3 } from 'lucide-react'
import { haversine, bearing, formatDeg, metersToNm, cardinal } from '../../lib/geo.js'

/**
 * Long-press menu su mappa — per iPad/touch UX.
 * Su touch: long-press 500ms apre menu contestuale.
 * Su desktop: right-click apre menu contestuale.
 *
 * Azioni:
 * - Aggiungi waypoint (se editing route)
 * - Inizia nuova rotta da qui
 * - Set come destinazione
 * - Set come ancora (anchor watch)
 * - Mostra meteogramma (forecast 24h)
 */
export default function MapContextMenu({
  map,
  mapReady,
  enabled = true,
  onAddWaypoint,
  onSetDestination,
  onSetAnchor,
  onShowMeteogram,
  boatPosition,
}) {
  const [menu, setMenu] = useState(null) // { lat, lon, x, y }
  const pressTimerRef = useRef(null)
  const startPosRef = useRef(null)

  useEffect(() => {
    if (!map || !mapReady || !enabled) return undefined

    const container = map.getContainer()

    // Long-press detection (touch)
    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      startPosRef.current = { x: t.clientX, y: t.clientY }
      pressTimerRef.current = setTimeout(() => {
        const ll = map.unproject([t.clientX - container.getBoundingClientRect().left, t.clientY - container.getBoundingClientRect().top])
        setMenu({
          lat: ll.lat,
          lon: ll.lng,
          x: t.clientX,
          y: t.clientY,
        })
        // Haptic feedback (iOS)
        if (navigator.vibrate) navigator.vibrate(20)
      }, 500)
    }

    const onTouchMove = (e) => {
      if (!startPosRef.current || !pressTimerRef.current) return
      const t = e.touches[0]
      const dx = t.clientX - startPosRef.current.x
      const dy = t.clientY - startPosRef.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        // moved too much, cancel long-press
        clearTimeout(pressTimerRef.current)
        pressTimerRef.current = null
      }
    }

    const onTouchEnd = () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current)
        pressTimerRef.current = null
      }
    }

    // Right-click (desktop)
    const onContextMenu = (e) => {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const ll = map.unproject([e.clientX - rect.left, e.clientY - rect.top])
      setMenu({
        lat: ll.lat,
        lon: ll.lng,
        x: e.clientX,
        y: e.clientY,
      })
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: true })
    container.addEventListener('touchend', onTouchEnd, { passive: true })
    container.addEventListener('contextmenu', onContextMenu)

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      container.removeEventListener('contextmenu', onContextMenu)
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
    }
  }, [map, mapReady, enabled])

  if (!menu) return null

  const close = () => setMenu(null)

  const actions = []
  if (onShowMeteogram) {
    actions.push({
      icon: BarChart3,
      label: 'Meteogramma 24h',
      onClick: () => {
        onShowMeteogram(menu.lat, menu.lon)
        close()
      },
    })
  }
  if (onAddWaypoint) {
    actions.push({
      icon: Navigation2,
      label: 'Aggiungi waypoint',
      onClick: () => {
        onAddWaypoint(menu.lat, menu.lon)
        close()
      },
    })
  }
  if (onSetDestination) {
    actions.push({
      icon: MapPin,
      label: 'Set come destinazione',
      onClick: () => {
        onSetDestination(menu.lat, menu.lon)
        close()
      },
    })
  }
  if (boatPosition && onSetAnchor) {
    const dist = haversine(boatPosition.lat, boatPosition.lon, menu.lat, menu.lon)
    if (dist < 100) {
      actions.push({
        icon: Anchor,
        label: 'Cala ancora qui',
        onClick: () => {
          onSetAnchor(menu.lat, menu.lon)
          close()
        },
      })
    }
  }

  // Distance from boat (info display)
  let infoRow = null
  if (boatPosition) {
    const dist = haversine(boatPosition.lat, boatPosition.lon, menu.lat, menu.lon)
    const brg = bearing(boatPosition.lat, boatPosition.lon, menu.lat, menu.lon)
    infoRow = (
      <div className="text-[10px] text-fog font-mono">
        {metersToNm(dist).toFixed(2)} nm · {formatDeg(brg)}° {cardinal(brg)}
      </div>
    )
  }

  // Clamp menu position to viewport
  const menuW = 220
  const menuH = actions.length * 44 + 60
  const x = Math.min(menu.x, window.innerWidth - menuW - 10)
  const y = Math.min(menu.y, window.innerHeight - menuH - 10)

  return (
    <>
      <button
        type="button"
        aria-label="Chiudi menu"
        onClick={close}
        className="absolute inset-0 z-[2000] cursor-default"
      />
      <div
        className="glass-strong absolute z-[2001] w-[220px] rounded-lg p-1 slide-up"
        style={{ left: x, top: y }}
      >
        <div className="px-3 py-2 border-b border-line">
          <div className="text-[10px] text-fog">Posizione</div>
          <div className="font-mono text-xs text-paper">{menu.lat.toFixed(4)}, {menu.lon.toFixed(4)}</div>
          {infoRow}
        </div>
        {actions.length > 0 ? (
          actions.map((a, i) => {
            const Icon = a.icon
            return (
              <button
                key={i}
                type="button"
                onClick={a.onClick}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-xs text-paper hover:bg-raised touch"
              >
                <Icon size={14} className="text-phos" />
                {a.label}
              </button>
            )
          })
        ) : (
          <div className="px-3 py-3 text-[10px] text-fog-dim text-center">
            Nessuna azione disponibile
          </div>
        )}
        <button
          type="button"
          onClick={close}
          className="flex w-full items-center justify-center gap-1 rounded-md px-3 py-2 text-[10px] text-fog hover:text-paper touch"
        >
          <X size={12} />
          Chiudi
        </button>
      </div>
    </>
  )
}
