import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigation2, MapPin, Anchor, X, Ship, BarChart3, Bookmark, Fish } from 'lucide-react'
import { haversine, bearing, formatDeg, metersToNm, cardinal } from '../../lib/geo.js'
import { depthAt } from '../../lib/depthAt.js'
import { formatDepth } from './DepthHover.jsx'
import { bandAt, bandText } from '../../lib/coastBand.js'
import { isMilitary, ordinancesNear } from '../../lib/ordinances.js'
import { useAppStore } from '../../store/useAppStore.js'
import { sampleCurrent, sampleSea, sampleWind } from '../../routing/isochroneEngine.js'

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
// Il menu si apre col dito ancora giù: al rilascio l'iPad manda un tocco sul
// punto, che ora è coperto dal menu e lo chiudeva (o sceglieva una voce)
const RELEASE_GUARD_MS = 500
const FORECAST_SLACK_MS = 3600000

const oneDecimal = (v) => v.toFixed(1).replace('.', ',')
const compass = (deg) => {
  const d = ((Math.round(deg) % 360) + 360) % 360
  return `${d}° ${cardinal(d)}`
}

// Vento, onda e corrente nel punto, all'ora del cursore del tempo
function forecastAt(point, grib, currentField, timeMs) {
  const times = grib?.grid?.[0]?.times
  if (!times?.length) return null
  const from = new Date(times[0]).getTime()
  const to = new Date(times[times.length - 1]).getTime()
  if (timeMs < from - FORECAST_SLACK_MS || timeMs > to + FORECAST_SLACK_MS) return { old: true }
  const wind = sampleWind(grib, point.lat, point.lon, timeMs)
  const { wave } = sampleSea(grib, point.lat, point.lon, timeMs)
  const current = currentField ? sampleCurrent(currentField, point.lat, point.lon, timeMs) : null
  return { wind, wave, current }
}

export default function MapContextMenu({
  map,
  mapReady,
  enabled = true,
  onAddWaypoint,
  onSetDestination,
  onSetAnchor,
  onShowMeteogram,
  onAddMark,
  onAddSighting,
  boatPosition,
  grib = null,
  currentField = null,
}) {
  const [menu, setMenu] = useState(null) // { lat, lon, x, y }
  const [depth, setDepth] = useState(undefined) // undefined = in arrivo, null = terra / nessun dato
  const [band, setBand] = useState(undefined) // fascia dalla costa: undefined = in arrivo
  const coastBand = useAppStore((s) => s.coastBand)
  const timeOffset = useAppStore((s) => s.timeOffset)
  const forecast = useMemo(
    () => (menu ? forecastAt(menu, grib, currentField, Date.now() + timeOffset * 3600000) : null),
    [menu, grib, currentField, timeOffset]
  )
  const [nearby, setNearby] = useState([]) // ordinanze entro 1,5 km
  const pressTimerRef = useRef(null)
  const startPosRef = useRef(null)
  const guardUntilRef = useRef(0)

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
        guardUntilRef.current = Infinity // finché il dito non si alza
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
      if (guardUntilRef.current === Infinity) guardUntilRef.current = Date.now() + RELEASE_GUARD_MS
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
    // Sul documento: il dito può alzarsi fuori dalla carta
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('touchcancel', onTouchEnd, { passive: true })
    container.addEventListener('contextmenu', onContextMenu)

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
      container.removeEventListener('contextmenu', onContextMenu)
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
    }
  }, [map, mapReady, enabled])

  if (!menu) return null

  const close = () => setMenu(null)
  const ignoreRelease = (e) => {
    if (Date.now() < guardUntilRef.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const actions = []
  if (onAddMark) {
    actions.push(
      {
        icon: Bookmark,
        label: 'Aggiungi marker',
        onClick: () => {
          onAddMark('mark', menu.lat, menu.lon)
          close()
        },
      },
      {
        icon: Anchor,
        label: 'Marker di ancoraggio',
        onClick: () => {
          onAddMark('anchor', menu.lat, menu.lon)
          close()
        },
      }
    )
  }
  if (onAddSighting) {
    actions.push({
      icon: Fish,
      label: 'Segna avvistamento',
      onClick: () => {
        onAddSighting(menu.lat, menu.lon)
        close()
      },
    })
  }
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

  // Posizione dentro la carta (il menu sta nel suo riquadro, non nella finestra)
  const box = map.getContainer().getBoundingClientRect()
  const menuW = 220
  const menuH = Math.min(actions.length * 44 + 250, box.height - 20)
  const x = Math.max(10, Math.min(menu.x - box.left, box.width - menuW - 10))
  const y = Math.max(10, Math.min(menu.y - box.top, box.height - menuH - 10))

  return (
    <>
      <button
        type="button"
        aria-label="Chiudi menu"
        onClickCapture={ignoreRelease}
        onClick={close}
        className="absolute inset-0 z-[2000] cursor-default"
      />
      <div
        onClickCapture={ignoreRelease}
        className="glass-strong absolute z-[2001] w-[220px] overflow-y-auto rounded-lg p-1 slide-up"
        style={{ left: x, top: y, maxHeight: box.height - 20 }}
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
          {forecast?.old && <div className="mt-1 text-[calc(10px*var(--fs))] text-warn">Previsione scaduta: niente meteo qui</div>}
          {forecast?.wind?.speed > 0 && (
            <div className="mt-1 text-[calc(10px*var(--fs))] text-fog">
              Vento <span className="font-mono text-xs font-semibold text-paper">{Math.round(forecast.wind.speed)} kn</span> da {compass(forecast.wind.dir)}
            </div>
          )}
          {forecast?.wave > 0 && (
            <div className="text-[calc(10px*var(--fs))] text-fog">
              Onda <span className="font-mono text-xs font-semibold text-paper">{oneDecimal(forecast.wave)} m</span>
            </div>
          )}
          {forecast?.current?.speed > 0 && (
            <div className="text-[calc(10px*var(--fs))] text-fog">
              Corrente <span className="font-mono text-xs font-semibold text-paper">{oneDecimal(forecast.current.speed)} kn</span> verso {compass(forecast.current.dir)}
            </div>
          )}
          {forecast && !forecast.old && timeOffset !== 0 && (
            <div className="text-[calc(9px*var(--fs))] text-fog-dim">
              Previsione per le {new Date(Date.now() + timeOffset * 3600000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
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
