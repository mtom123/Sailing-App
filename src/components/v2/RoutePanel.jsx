import { useState } from 'react'
import {
  Check,
  Download,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  Undo2,
  Zap,
  Waves,
  Shield,
  Sparkles,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore.js'
import { formatDeg, metersToNm } from '../../lib/geo.js'
import { downloadFile, etaTimes, routeToGPX } from '../../lib/route.js'

const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
const fmtDayTime = (ms) =>
  new Date(ms).toLocaleString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
const fmtDuration = (ms) => {
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  return h > 0 ? `${h}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`
}

const ROUTE_TYPES = [
  { key: 'fastest', label: 'VELOCE', icon: Zap, color: '#5EE6C8', desc: 'Min tempo, max 35kn vento' },
  { key: 'comfortable', label: 'COMODA', icon: Waves, color: '#4A9EFF', desc: 'Max onda 1.5m, vento 22kn' },
  { key: 'safest', label: 'SICURA', icon: Shield, color: '#F5A623', desc: 'Max onda 1m, vento 18kn' },
]

function BigButton({ onClick, disabled, danger, children, primary }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`touch flex w-full items-center justify-center gap-2 rounded-md border py-3 text-xs font-semibold tracking-[0.2em] transition-all ${
        danger
          ? 'border-danger/50 bg-danger/15 text-danger'
          : disabled
            ? 'border-line text-fog opacity-50'
            : primary
              ? 'border-phos bg-phos/15 text-phos hover:bg-phos/25'
              : 'border-line bg-surface text-paper hover:bg-raised'
      }`}
    >
      {children}
    </button>
  )
}

function SavedRoutes() {
  const { savedRoutes, deleteSavedRoute, setRouteDraft, setRouteEditing, setRouteNavigating, setActiveWaypointIdx } = useAppStore()
  if (!savedRoutes?.length) return null
  const loadRoute = (r) => {
    setRouteDraft({ name: r.name, waypoints: r.waypoints })
    setRouteEditing(false)
    setRouteNavigating(false)
    setActiveWaypointIdx(1)
  }
  return (
    <div className="border-t border-line">
      <div className="label px-3 py-2">Le mie rotte</div>
      {savedRoutes.map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-1 border-b border-line px-3 py-1.5"
        >
          <button
            type="button"
            onClick={() => loadRoute(r)}
            className="min-w-0 flex-1 text-left hover:opacity-70"
          >
            <div className="truncate text-xs font-semibold text-paper">{r.name}</div>
            <div className="text-[10px] text-fog">
              {r.waypoints.length} WP ·{' '}
              {new Date(r.createdAt).toLocaleDateString('it-IT')}
            </div>
          </button>
          <button
            type="button"
            title="Carica"
            onClick={() => loadRoute(r)}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-line text-phos hover:bg-raised"
          >
            <FolderOpen size={14} />
          </button>
          <button
            type="button"
            title="Elimina"
            onClick={() => deleteSavedRoute(r.id)}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-line text-danger hover:bg-raised"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export default function RoutePanel({ route, routeWx, routeOptions, computing, gpsOk, bridgeConfigured, autopilot }) {
  const [nameInput, setNameInput] = useState('')
  const {
    activeRouteOption,
    setActiveRouteOption,
    addSavedRoute,
    planSpeed,
    setPlanSpeed,
    departureOffsetH,
    setDepartureOffsetH,
    routeDraft,
    setRouteDraft,
    routeEditing,
    setRouteEditing,
    routeNavigating,
    setRouteNavigating,
    activeWaypointIdx,
    setActiveWaypointIdx,
    deleteSavedRoute,
    savedRoutes,
  } = useAppStore()

  const { waypoints, totalNm, nav } = route

  const undoWaypoint = () =>
    setRouteDraft((d) => ({ ...d, waypoints: d.waypoints.slice(0, -1) }))

  const clearDraftLocal = () => {
    setRouteDraft({ name: '', waypoints: [] })
    setRouteEditing(false)
  }

  const saveRoute = (name) => {
    const finalName = (name || '').trim() || `Rotta ${(savedRoutes?.length || 0) + 1}`
    addSavedRoute({
      name: finalName,
      waypoints: route.waypoints,
    })
    setRouteDraft((d) => ({ ...d, name: finalName }))
    setRouteEditing(false)
  }

  // ---- 1. NO ROUTE ----
  if (!routeEditing && waypoints.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-3">
          <BigButton
            primary
            onClick={() => {
              setRouteDraft({ name: '', waypoints: [] })
              setRouteEditing(true)
            }}
          >
            <Plus size={15} />
            NUOVA ROTTA
          </BigButton>
          <p className="pt-2 text-[10px] leading-relaxed text-fog">
            Tocca il mare sulla mappa per posare i waypoint. Trascinali per
            correggerli, toccali per eliminarli. Con 2+ WP puoi chiedere il
            weather routing automatico.
          </p>
        </div>
        <div className="scroll-y min-h-0 flex-1">
          <SavedRoutes />
        </div>
      </div>
    )
  }

  // ---- 2. EDITOR ----
  if (routeEditing) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line bg-warn/5 p-3">
          <div className="text-xs font-semibold tracking-wider text-warn">
            TOCCA IL MARE PER AGGIUNGERE WAYPOINT
          </div>
          <div className="pt-1 text-[10px] text-fog">
            Trascina per spostare · tocca un waypoint per eliminarlo
          </div>
        </div>

        <div className="flex items-baseline justify-between border-b border-line px-3 py-2">
          <span className="text-lg font-bold text-paper tabular">
            {waypoints.length} <span className="text-[10px] text-fog">WP</span>
          </span>
          <span className="text-lg font-bold text-phos tabular">
            {totalNm.toFixed(1)} <span className="text-[10px] text-fog">nm</span>
          </span>
          <button
            type="button"
            disabled={!waypoints.length}
            onClick={undoWaypoint}
            className="flex items-center gap-1 rounded-md border border-line bg-surface px-3 py-2 text-[10px] font-semibold tracking-widest text-paper hover:bg-raised disabled:opacity-40"
          >
            <Undo2 size={13} />
            UNDO
          </button>
        </div>

        <div className="border-b border-line p-3">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={route.routeName || 'Nome rotta (es. Palau → Bonifacio)'}
            className="mb-2 w-full rounded-md border border-line bg-surface px-2.5 py-2.5 text-xs text-paper outline-none focus:border-phos"
          />
          <BigButton
            primary
            disabled={waypoints.length < 2}
            onClick={() => {
              saveRoute(nameInput || route.routeName)
              setNameInput('')
            }}
          >
            <Check size={15} />
            SALVA ROTTA
          </BigButton>
          {waypoints.length < 2 && (
            <div className="pt-1 text-[10px] text-fog">Servono almeno 2 waypoint</div>
          )}
          <button
            type="button"
            onClick={clearDraftLocal}
            className="mt-1.5 w-full rounded-md border border-line bg-surface py-2 text-[10px] font-semibold tracking-widest text-danger hover:bg-raised"
          >
            ANNULLA E SVUOTA
          </button>
        </div>

        <div className="scroll-y min-h-0 flex-1">
          {route.legs.map((leg) => (
            <div
              key={`${leg.from.id}-${leg.to.id}`}
              className="flex items-center justify-between border-b border-line px-3 py-1.5"
            >
              <span className="text-xs text-paper">
                {leg.from.name} → {leg.to.name}
              </span>
              <span className="text-[10px] text-fog tabular">
                {metersToNm(leg.dist).toFixed(1)} nm · {formatDeg(leg.brg)}°
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---- 3. PLAN ----
  const etas = etaTimes(waypoints, planSpeed, Date.now() + departureOffsetH * 3600 * 1000)
  const totalMs = etas[etas.length - 1] - etas[0]
  let cumNm = 0
  const cumDists = waypoints.map((w, i) => {
    if (i > 0) cumNm += metersToNm(route.legs[i - 1].dist)
    return cumNm
  })

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-paper">
            {route.routeName || 'Rotta senza nome'}
          </div>
          <div className="text-[10px] text-phos tabular">
            {totalNm.toFixed(1)} nm · {fmtDuration(totalMs)} a {planSpeed} kn
          </div>
        </div>
        <button
          type="button"
          title="Modifica rotta"
          onClick={() => setRouteEditing(true)}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-md border border-line text-fog hover:text-paper hover:bg-raised"
        >
          <Pencil size={15} />
        </button>
      </div>

      {/* Live NAV */}
      {nav && (
        <div className="border-b border-line bg-surface p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold tracking-widest text-phos">
              → {nav.dest.name}
            </span>
            <span className="text-[10px] text-fog">ETA {fmtTime(nav.etaMs)}</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="label">DTW</div>
              <div className="font-mono text-xl font-bold text-paper">
                {nav.dtwNm.toFixed(1)}
                <span className="text-[9px] text-fog"> nm</span>
              </div>
            </div>
            <div>
              <div className="label">BTW</div>
              <div className="font-mono text-xl font-bold text-paper">
                {formatDeg(nav.btw)}°
              </div>
            </div>
            <div>
              <div className="label">XTE</div>
              <div
                className={`font-mono text-xl font-bold ${
                  Math.abs(nav.xte) > 185 ? 'text-warn' : 'text-paper'
                }`}
              >
                {Math.abs(metersToNm(nav.xte)).toFixed(2)}
                <span className="text-[9px] text-fog"> {nav.xte < 0 ? '◀' : '▶'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="scroll-y min-h-0 flex-1">
        {/* Weather routing suggestions */}
        {waypoints.length >= 2 && (
          <div className="border-b border-line p-2.5">
            <div className="flex items-center justify-between pb-2">
              <div className="label flex items-center gap-1">
                <Sparkles size={12} className="text-phos" />
                WEATHER ROUTING
              </div>
              {computing && (
                <span className="text-[9px] text-phos pulse-soft">CALCOLO…</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ROUTE_TYPES.map((t) => {
                const opt = routeOptions?.[t.key]
                const Icon = t.icon
                const isActive = activeRouteOption === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    disabled={!opt}
                    onClick={() => setActiveRouteOption(t.key)}
                    className={`rounded-md border p-2 text-center transition-all ${
                      isActive
                        ? 'border-phos bg-phos/10'
                        : opt
                          ? 'border-line bg-surface hover:bg-raised'
                          : 'border-line bg-surface opacity-40'
                    }`}
                    style={isActive ? { boxShadow: `0 0 12px ${t.color}33` } : undefined}
                  >
                    <Icon size={14} className="mx-auto mb-1" style={{ color: t.color }} />
                    <div className="text-[9px] font-bold tracking-widest text-paper">{t.label}</div>
                    {opt ? (
                      <div className="mt-0.5 text-[9px] text-fog tabular">
                        {opt.durationH.toFixed(1)}h · {opt.distNm.toFixed(0)}nm
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[9px] text-fog-dim">—</div>
                    )}
                  </button>
                )
              })}
            </div>
            {routeOptions?.[activeRouteOption] && (
              <div className="mt-2 rounded-md border border-line bg-surface p-2 text-[10px] text-fog">
                <div className="text-paper font-semibold mb-1">
                  {ROUTE_TYPES.find((t) => t.key === activeRouteOption)?.desc}
                </div>
                <div className="flex justify-between">
                  <span>ETA: <b className="text-phos font-mono">{fmtDayTime(routeOptions[activeRouteOption].etaMs)}</b></span>
                  <span>VMG: <b className="text-paper font-mono">{routeOptions[activeRouteOption].avgSpeedKn.toFixed(1)}kn</b></span>
                </div>
              </div>
            )}
            {!routeOptions && !computing && (
              <div className="mt-2 text-[10px] text-fog-dim text-center">
                In attesa dati vento (GRIB)…
              </div>
            )}
          </div>
        )}

        {/* Departure & speed */}
        <div className="border-b border-line p-2.5">
          <div className="label pb-1.5">Partenza</div>
          <div className="flex gap-1">
            {[
              [0, 'ORA'],
              [3, '+3H'],
              [6, '+6H'],
              [12, '+12H'],
            ].map(([h, label]) => (
              <button
                key={h}
                type="button"
                onClick={() => setDepartureOffsetH(h)}
                className={`flex-1 rounded-md border py-2 text-[10px] font-semibold tracking-widest transition-all ${
                  departureOffsetH === h
                    ? 'border-phos bg-phos/10 text-phos'
                    : 'border-line bg-surface text-fog hover:text-paper'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="label">Velocità piano</span>
            <span className="font-mono text-xs font-bold text-paper">{planSpeed} kn</span>
          </div>
          <input
            type="range"
            min="3"
            max="10"
            step="0.5"
            value={planSpeed}
            onChange={(e) => setPlanSpeed(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>

        {/* Waypoint table */}
        <div className="label px-3 pt-2">Piano orario</div>
        {waypoints.map((w, i) => {
          const isActive = nav && nav.idx === i
          return (
            <div
              key={w.id}
              className={`flex items-baseline justify-between border-b border-line px-3 py-1.5 ${
                isActive ? 'bg-phos/5' : ''
              }`}
            >
              <span className={`text-xs font-semibold ${isActive ? 'text-phos' : 'text-paper'}`}>
                {w.name}
              </span>
              <span className="font-mono text-xs text-paper">
                {fmtDayTime(etas[i])}
              </span>
              <span className="w-16 text-right font-mono text-[10px] text-fog">
                {cumDists[i].toFixed(1)} nm
              </span>
            </div>
          )
        })}
        <div className="flex items-baseline justify-between px-3 py-2">
          <span className="label">Arrivo</span>
          <span className="font-mono text-xs font-bold text-phos">
            {fmtDayTime(etas[etas.length - 1])} · {fmtDuration(totalMs)}
          </span>
        </div>

        <SavedRoutes />
      </div>

      {/* Actions */}
      <div className="flex flex-none gap-1.5 border-t border-line p-2">
        {!routeNavigating ? (
          <button
            type="button"
            disabled={!gpsOk}
            onClick={() => {
              useAppStore.setState({ routeNavigating: true, activeWaypointIdx: 1 })
            }}
            className={`touch flex flex-[2] items-center justify-center gap-2 rounded-md border py-3 text-xs font-semibold tracking-[0.2em] transition-all ${
              gpsOk
                ? 'border-phos bg-phos/15 text-phos hover:bg-phos/25'
                : 'border-line text-fog opacity-50'
            }`}
          >
            <Play size={14} />
            NAVIGA
          </button>
        ) : (
          <button
            type="button"
            onClick={() => useAppStore.setState({ routeNavigating: false })}
            className="touch flex flex-[2] items-center justify-center gap-2 rounded-md border border-danger/50 bg-danger/15 py-3 text-xs font-semibold tracking-[0.2em] text-danger"
          >
            <Square size={14} />
            STOP NAV
          </button>
        )}
        <button
          type="button"
          title="Esporta GPX"
          onClick={() =>
            downloadFile(
              `${(route.routeName || 'rotta').replace(/\s+/g, '-')}.gpx`,
              routeToGPX(waypoints, route.routeName || 'Rotta TIMONE')
            )
          }
          className="touch flex flex-1 items-center justify-center rounded-md border border-line bg-surface py-3 text-fog hover:text-paper hover:bg-raised"
        >
          <Download size={13} />
        </button>
        <button
          type="button"
          title="Elimina"
          onClick={clearDraftLocal}
          className="touch flex flex-1 items-center justify-center rounded-md border border-line bg-surface py-3 text-danger hover:bg-raised"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
