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
} from 'lucide-react'
import { SAFETY_COLORS } from '../lib/anchorageSafety.js'
import { formatDeg, metersToNm } from '../lib/geo.js'
import { downloadFile, etaTimes, routeToGPX } from '../lib/route.js'

/*
 * Route planner: archivio rotte salvate, editor con salvataggio, piano di
 * navigazione (partenza, velocità, tabella ETA per waypoint, meteo per
 * tratta), navigazione live e pilota automatico.
 */

const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
const fmtDayTime = (ms) =>
  new Date(ms).toLocaleString('it-IT', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

function fmtDuration(ms) {
  const mins = Math.round(ms / 60000)
  const h = Math.floor(mins / 60)
  return h > 0 ? `${h}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`
}

function BigButton({ onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 border py-3 text-[12px] font-bold tracking-[0.2em] ${
        danger
          ? 'border-danger bg-danger/15 text-danger'
          : disabled
            ? 'border-line text-fog opacity-50'
            : 'border-phos bg-phos/10 text-phos active:bg-phos/25'
      }`}
    >
      {children}
    </button>
  )
}

function SavedRoutes({ route }) {
  if (!route.savedRoutes.length) return null
  return (
    <div className="border-t border-line">
      <div className="label px-2 py-2">Le mie rotte</div>
      {route.savedRoutes.map((r) => (
        <div key={r.id} className="flex items-center gap-1 border-b border-line px-2 py-1.5">
          <button
            type="button"
            onClick={() => route.loadRoute(r.id)}
            className="min-w-0 flex-1 text-left active:opacity-70"
          >
            <div className="truncate text-[12px] font-bold text-paper">{r.name}</div>
            <div className="text-[9px] text-fog">
              {r.waypoints.length} WP ·{' '}
              {new Date(r.createdAt).toLocaleDateString('it-IT')}
            </div>
          </button>
          <button
            type="button"
            title="Carica"
            onClick={() => route.loadRoute(r.id)}
            className="flex h-9 w-9 flex-none items-center justify-center border border-line text-phos active:bg-raised"
          >
            <FolderOpen size={14} />
          </button>
          <button
            type="button"
            title="Elimina"
            onClick={() => route.deleteRoute(r.id)}
            className="flex h-9 w-9 flex-none items-center justify-center border border-line text-danger active:bg-raised"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export default function RoutePanel({
  route,
  routeWx,
  autopilot,
  gpsOk,
  bridgeConfigured,
}) {
  const [nameInput, setNameInput] = useState('')
  const { waypoints, totalNm, nav, editing } = route

  // ---- 1. Nessuna rotta: crea nuova o carica dall'archivio -----------------
  if (!editing && waypoints.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="p-3">
          <BigButton onClick={route.newRoute}>
            <Plus size={15} />
            NUOVA ROTTA
          </BigButton>
          <p className="pt-2 text-[10px] leading-relaxed text-fog">
            Poi tocca il mare sulla mappa per posare i waypoint. Trascinali per
            correggerli, toccali per eliminarli.
          </p>
        </div>
        <div className="panel-scroll min-h-0 flex-1">
          <SavedRoutes route={route} />
        </div>
      </div>
    )
  }

  // ---- 2. Editor attivo: waypoint + salvataggio ------------------------------
  if (editing) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line bg-warn/5 p-3">
          <div className="text-[11px] font-bold tracking-wider text-warn">
            TOCCA IL MARE PER AGGIUNGERE WAYPOINT
          </div>
          <div className="pt-1 text-[10px] text-fog">
            Trascina per spostare · tocca un waypoint per eliminarlo
          </div>
        </div>

        <div className="flex items-baseline justify-between border-b border-line px-3 py-2">
          <span className="text-lg font-bold text-paper tabular-nums">
            {waypoints.length} <span className="text-[10px] text-fog">WP</span>
          </span>
          <span className="text-lg font-bold text-phos tabular-nums">
            {totalNm.toFixed(1)} <span className="text-[10px] text-fog">nm</span>
          </span>
          <button
            type="button"
            disabled={!waypoints.length}
            onClick={route.undoWaypoint}
            className="flex items-center gap-1 border border-line bg-panel px-3 py-2 text-[10px] font-bold tracking-widest text-paper active:bg-raised disabled:opacity-40"
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
            className="mb-2 w-full border border-line bg-panel px-2.5 py-2.5 text-[12px] text-paper outline-none focus:border-phos"
          />
          <BigButton
            disabled={waypoints.length < 2}
            onClick={() => {
              route.saveRoute(nameInput || route.routeName)
              setNameInput('')
            }}
          >
            <Check size={15} />
            SALVA ROTTA
          </BigButton>
          {waypoints.length < 2 && (
            <div className="pt-1 text-[9px] text-fog">Servono almeno 2 waypoint</div>
          )}
          <button
            type="button"
            onClick={route.clearDraft}
            className="mt-1.5 w-full border border-line bg-panel py-2 text-[10px] font-bold tracking-widest text-danger active:bg-raised"
          >
            ANNULLA E SVUOTA
          </button>
        </div>

        <div className="panel-scroll min-h-0 flex-1">
          {route.legs.map((leg) => (
            <div
              key={`${leg.from.id}-${leg.to.id}`}
              className="flex items-center justify-between border-b border-line px-3 py-1.5"
            >
              <span className="text-[11px] text-paper">
                {leg.from.name} → {leg.to.name}
              </span>
              <span className="text-[10px] text-fog tabular-nums">
                {metersToNm(leg.dist).toFixed(1)} nm · {formatDeg(leg.brg)}°
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ---- 3. Piano di navigazione ------------------------------------------------
  const etas = etaTimes(waypoints, route.planSpeed, route.departureMs)
  const totalMs = etas[etas.length - 1] - etas[0]
  let cumNm = 0
  const cumDists = waypoints.map((w, i) => {
    if (i > 0) cumNm += metersToNm(route.legs[i - 1].dist)
    return cumNm
  })

  return (
    <div className="flex h-full flex-col">
      {/* Intestazione rotta */}
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-paper">
            {route.routeName || 'Rotta senza nome'}
          </div>
          <div className="text-[10px] text-phos tabular-nums">
            {totalNm.toFixed(1)} nm · {fmtDuration(totalMs)} a {route.planSpeed} kn
          </div>
        </div>
        <button
          type="button"
          title="Modifica rotta"
          onClick={() => route.setEditing(true)}
          className="flex h-10 w-10 flex-none items-center justify-center border border-line text-fog active:text-paper"
        >
          <Pencil size={15} />
        </button>
      </div>

      {/* Guida live in navigazione */}
      {nav && (
        <div className="border-b border-line bg-panel p-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-bold tracking-widest text-phos">
              → {nav.dest.name}
            </span>
            <span className="text-[10px] text-fog">ETA {fmtTime(nav.etaMs)}</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="label">DTW</div>
              <div className="text-xl font-bold text-paper tabular-nums">
                {nav.dtwNm.toFixed(1)}
                <span className="text-[9px] text-fog"> nm</span>
              </div>
            </div>
            <div>
              <div className="label">BTW</div>
              <div className="text-xl font-bold text-paper tabular-nums">
                {formatDeg(nav.btw)}°
              </div>
            </div>
            <div>
              <div className="label">XTE</div>
              <div
                className={`text-xl font-bold tabular-nums ${
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

      <div className="panel-scroll min-h-0 flex-1">
        {/* Partenza e velocità */}
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
                onClick={() => route.setDepartureOffsetH(h)}
                className={`flex-1 border py-2 text-[10px] font-bold tracking-widest ${
                  route.departureOffsetH === h
                    ? 'border-phos bg-phos/10 text-phos'
                    : 'border-line bg-panel text-fog'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="label">Velocità piano</span>
            <span className="text-[11px] font-bold text-paper tabular-nums">
              {route.planSpeed} kn
            </span>
          </div>
          <input
            type="range"
            min="3"
            max="10"
            step="0.5"
            value={route.planSpeed}
            onChange={(e) => route.setPlanSpeed(Number(e.target.value))}
            className="w-full accent-[#3DFF7A]"
          />
          {routeWx?.bestDeparture && (
            <div className="mt-1 border border-phosdim bg-phos/5 p-1.5 text-[10px] text-phos">
              Meteo migliore partendo {fmtDayTime(routeWx.bestDeparture.at)}
            </div>
          )}
        </div>

        {/* Tabella oraria con meteo per tratta */}
        <div className="label px-2.5 pt-2">Piano orario</div>
        {waypoints.map((w, i) => {
          const legWx = i > 0 && routeWx ? routeWx.legs[i - 1] : null
          const color = legWx ? SAFETY_COLORS[legWx.verdict.level] || '#9BA0A6' : null
          const isActive = nav && nav.idx === i
          return (
            <div key={w.id}>
              {legWx && (
                <div className="flex items-center gap-1.5 px-3 py-1">
                  <span
                    className="inline-block h-1.5 w-6 flex-none"
                    style={{ background: color }}
                  />
                  <span className="text-[9px]" style={{ color }}>
                    {legWx.verdict.label} · {routeWx.describe(legWx.cond)}
                  </span>
                </div>
              )}
              <div
                className={`flex items-baseline justify-between border-b border-line px-2.5 py-1.5 ${
                  isActive ? 'bg-phos/5' : ''
                }`}
              >
                <span
                  className={`text-[12px] font-bold ${
                    isActive ? 'text-phos' : 'text-paper'
                  }`}
                >
                  {w.name}
                </span>
                <span className="text-[11px] text-paper tabular-nums">
                  {fmtDayTime(etas[i])}
                </span>
                <span className="w-16 text-right text-[10px] text-fog tabular-nums">
                  {cumDists[i].toFixed(1)} nm
                </span>
              </div>
            </div>
          )
        })}
        <div className="flex items-baseline justify-between px-2.5 py-2">
          <span className="label">Arrivo</span>
          <span className="text-[12px] font-bold text-phos tabular-nums">
            {fmtDayTime(etas[etas.length - 1])} · {fmtDuration(totalMs)}
          </span>
        </div>

        {/* Pilota automatico (solo in navigazione) */}
        {nav && (
          <div className="border-t border-line p-2.5">
            <div className="label pb-1.5">Pilota automatico</div>
            <BigButton
              disabled={!bridgeConfigured}
              danger={autopilot.engaged}
              onClick={() => autopilot.setEngaged(!autopilot.engaged)}
            >
              {autopilot.engaged ? <Square size={14} /> : <Play size={14} />}
              {autopilot.engaged ? 'STOP PILOTA' : 'PILOTA — VAI'}
            </BigButton>
            <div
              className={`mt-1 text-[9px] leading-snug ${
                autopilot.status.state === 'error' ? 'text-danger' : 'text-fog'
              }`}
            >
              {autopilot.status.state === 'engaged' && autopilot.status.detail}
              {autopilot.status.state === 'connecting' && 'Connessione al bridge…'}
              {autopilot.status.state === 'error' && autopilot.status.detail}
              {autopilot.status.state === 'idle' &&
                'Invia APB/RMB/XTE al pilota Raymarine via bridge NMEA (Track).'}
            </div>
          </div>
        )}

        <SavedRoutes route={route} />
      </div>

      {/* Azioni principali */}
      <div className="flex flex-none gap-1.5 border-t border-line p-2">
        {!nav ? (
          <button
            type="button"
            disabled={!gpsOk}
            onClick={route.startNav}
            className={`flex flex-[2] items-center justify-center gap-2 border py-3 text-[12px] font-bold tracking-[0.2em] ${
              gpsOk
                ? 'border-phos bg-phos/10 text-phos active:bg-phos/25'
                : 'border-line text-fog opacity-50'
            }`}
          >
            <Play size={14} />
            NAVIGA
          </button>
        ) : (
          <button
            type="button"
            onClick={route.stopNav}
            className="flex flex-[2] items-center justify-center gap-2 border border-danger bg-danger/15 py-3 text-[12px] font-bold tracking-[0.2em] text-danger"
          >
            <Square size={14} />
            STOP NAV
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            downloadFile(
              `${(route.routeName || 'rotta').replace(/\s+/g, '-')}.gpx`,
              routeToGPX(waypoints, route.routeName || 'Rotta TIMONE')
            )
          }
          className="flex flex-1 items-center justify-center border border-line bg-panel py-3 text-[10px] font-bold tracking-widest text-paper active:bg-raised"
        >
          <Download size={13} />
        </button>
        <button
          type="button"
          onClick={route.clearDraft}
          className="flex flex-1 items-center justify-center border border-line bg-panel py-3 text-[10px] font-bold tracking-widest text-danger active:bg-raised"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
