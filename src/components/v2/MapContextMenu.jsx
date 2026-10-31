import { useEffect, useRef, useState } from 'react'
import { Navigation2, MapPin, Anchor, X, Ship, BarChart3 } from 'lucide-react'
import { haversine, bearing, formatDeg, metersToNm, cardinal } from '../../lib/geo.js'
import { depthAt } from '../../lib/depthAt.js'
import { formatDepth } from './DepthHover.jsx'
import { bandAt, bandText } from '../../lib/coastBand.js'
import { isMilitary, ordinancesNear } from '../../lib/ordinances.js'
import { useAppStore } from '../../store/useAppStore.js'

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
  const [depth, setDepth] = useState(undefined) // undefined = in arrivo, null = terra / nessun dato
  const [band, setBand] = useState(undefined) // fascia dalla costa: undefined = in arrivo
  const coastBand = useAppStore((s) => s.coastBand)
  const [nearby, setNearby] = useState([]) // ordinanze entro 1,5 km
  const pressTimerRef = useRef(null)
  const startPosRef = useRef(null)

  // Profondità del punto toccato (Shom dove c'è, altrimenti EMODnet)
  useEffect(() => {
    if (!menu) return undefined
    let alive = true
    setDepth(undefined)
    depthAt(menu.lat, menu.lon).then((d) => alive && setDepth(d))
    return () => {
      alive = false
    }
  }, [menu])

  // Ordinanze recenti delle Capitanerie qui vicino
  useEffect(() => {
    if (!menu) return undefined
    let alive = true
    setNearby([])
    ordinancesNear(menu.lat, menu.lon, 1500).then((list) => alive && setNearby(list.slice(0, 3)))
    return () => {
      alive = false
    }
  }, [menu])

  // Distanza dalla costa e fascia delle ordinanze balneari
  useEffect(() => {
    if (!menu) return undefined
    let alive = true
    setBand(undefined)
    bandAt(menu.lat, menu.lon, coastBand)
      .catch(() => null)
      .then((b) => alive && setBand(b ?? null))
    return () => {
      alive = false
    }
  }, [menu, coastBand])

  useEffect(() => {
    if (!map || !mapReady || !enabled) return undefined

    const container = map.getContainer()

    // Long-press detection (touch)
    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      startPosRef.current = { x: t.clientX, y: t.clientY }
      pressTimerRef.current = setTimeout(() => {
        const rect = container.getBoundingClientRect()
        const ll = map.containerPointToLatLng([t.clientX - rect.left, t.clientY - rect.top])
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
      const ll = map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top])
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
      <div className="text-[calc(10px*var(--fs))] text-fog font-mono">
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
          <div className="text-[calc(10px*var(--fs))] text-fog">Posizione</div>
          <div className="font-mono text-xs text-paper">{menu.lat.toFixed(4)}, {menu.lon.toFixed(4)}</div>
          {infoRow}
          <div className="mt-1 text-[calc(10px*var(--fs))] text-fog">
            Profondità{' '}
            {depth === undefined ? (
              '…'
            ) : depth && !depth.reliable ? (
              '— (vicino a costa o in porto: dato EMODnet non affidabile)'
            ) : depth ? (
              <>
                <span className="font-mono text-xs font-semibold text-paper">{formatDepth(depth.depth)} m</span>{' '}
                {depth.source === 'Shom' ? '(Shom)' : '(EMODnet, indicativa)'}
              </>
            ) : (
              '— (terra o nessun dato)'
            )}
          </div>
          {nearby.map((o) => (
            <a
              key={o.id}
              href={o.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-1 block text-[calc(10px*var(--fs))] leading-tight ${isMilitary(o) ? 'text-danger' : 'text-warn'}`}
            >
              Ord. {o.n} · {o.title.length > 70 ? `${o.title.slice(0, 70)}…` : o.title}
              <span className="block text-[calc(9px*var(--fs))] text-fog-dim">
                {o.office} · {Math.round(o.distanceM)} m
              </span>
            </a>
          ))}
          {band === undefined ? (
            <div className="mt-1 text-[calc(10px*var(--fs))] text-fog">Fascia dalla costa…</div>
          ) : (
            band && (
              <div className={`mt-1 text-[calc(10px*var(--fs))] ${bandText(band).warn ? 'text-danger' : 'text-fog'}`}>
                {bandText(band).text}
                <div className="text-[calc(9px*var(--fs))] text-fog-dim">{bandText(band).detail}</div>
              </div>
            )
          )}
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
          <div className="px-3 py-3 text-[calc(10px*var(--fs))] text-fog-dim text-center">
            Nessuna azione disponibile
          </div>
        )}
        <button
          type="button"
          onClick={close}
          className="flex w-full items-center justify-center gap-1 rounded-md px-3 py-2 text-[calc(10px*var(--fs))] text-fog hover:text-paper touch"
        >
          <X size={12} />
          Chiudi
        </button>
      </div>
    </>
  )
}
