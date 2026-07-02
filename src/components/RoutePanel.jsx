import { Download, Navigation2, Play, Square, Trash2 } from 'lucide-react'
import { SAFETY_COLORS } from '../lib/anchorageSafety.js'
import { formatDeg, metersToNm } from '../lib/geo.js'
import { downloadFile, routeToGPX } from '../lib/route.js'

/*
 * Pannello Rotta: tratte con analisi meteo all'orario di passaggio
 * (weather routing assistito), finestra di partenza consigliata, guida
 * live verso il waypoint attivo e comando del pilota automatico.
 */

const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
const fmtDayTime = (ms) =>
  new Date(ms).toLocaleString('it-IT', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function RoutePanel({
  route,
  routeWx,
  autopilot,
  gpsOk,
  bridgeConfigured,
}) {
  const { waypoints, totalNm, nav, editing, planSpeed, setPlanSpeed, clearRoute } = route

  if (waypoints.length === 0) {
    return (
      <div className="p-3">
        <div className="label pb-2">Nessuna rotta</div>
        <p className="text-[11px] leading-relaxed text-fog">
          Tocca il pulsante <Navigation2 size={11} className="inline text-phos" />{' '}
          sulla mappa per entrare in modalità rotta, poi tocca il mare per
          aggiungere i waypoint. Trascinali per correggerli, toccali per
          eliminarli.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Guida live */}
      {nav && (
        <div className="border-b border-line bg-panel p-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-bold tracking-widest text-phos">
              → {nav.dest.name}
            </span>
            <span className="text-[10px] text-fog">ETA {fmtTime(nav.etaMs)}</span>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="label">DTW</div>
              <div className="text-lg font-bold text-paper tabular-nums">
                {nav.dtwNm.toFixed(1)}
                <span className="text-[9px] text-fog"> nm</span>
              </div>
            </div>
            <div>
              <div className="label">BTW</div>
              <div className="text-lg font-bold text-paper tabular-nums">
                {formatDeg(nav.btw)}°
              </div>
            </div>
            <div>
              <div className="label">XTE</div>
              <div
                className={`text-lg font-bold tabular-nums ${
                  Math.abs(nav.xte) > 185 ? 'text-warn' : 'text-paper'
                }`}
              >
                {Math.abs(metersToNm(nav.xte)).toFixed(2)}
                <span className="text-[9px] text-fog">
                  {' '}
                  {nav.xte < 0 ? '◀' : '▶'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pilota automatico */}
      <div className="border-b border-line p-2">
        <div className="label pb-1.5">Pilota automatico</div>
        <button
          type="button"
          disabled={!nav || !gpsOk || !bridgeConfigured}
          onClick={() => autopilot.setEngaged(!autopilot.engaged)}
          className={`flex w-full items-center justify-center gap-2 border py-3 text-[12px] font-bold tracking-[0.2em] transition-colors ${
            autopilot.engaged
              ? 'border-danger bg-danger/15 text-danger'
              : nav && gpsOk && bridgeConfigured
                ? 'border-phos bg-phos/10 text-phos active:bg-phos/25'
                : 'border-line text-fog opacity-50'
          }`}
        >
          {autopilot.engaged ? <Square size={14} /> : <Play size={14} />}
          {autopilot.engaged ? 'STOP PILOTA' : 'VAI — PILOTA'}
        </button>
        <div
          className={`mt-1 text-[9px] leading-snug ${
            autopilot.status.state === 'error' ? 'text-danger' : 'text-fog'
          }`}
        >
          {autopilot.status.state === 'engaged' && autopilot.status.detail}
          {autopilot.status.state === 'connecting' && 'Connessione al bridge…'}
          {autopilot.status.state === 'error' && autopilot.status.detail}
          {autopilot.status.state === 'idle' &&
            (bridgeConfigured
              ? 'Invia APB/RMB/XTE al pilota Raymarine via bridge NMEA (modalità Track).'
              : 'Configura il bridge NMEA (sorgente AIS → NMEA) per usare il pilota.')}
        </div>
      </div>

      {/* Pianificazione */}
      <div className="border-b border-line p-2">
        <div className="flex items-center justify-between pb-1">
          <span className="label">Vel. pianificazione</span>
          <span className="text-[11px] font-bold text-paper tabular-nums">
            {planSpeed} kn
          </span>
        </div>
        <input
          type="range"
          min="3"
          max="10"
          step="0.5"
          value={planSpeed}
          onChange={(e) => setPlanSpeed(Number(e.target.value))}
          className="w-full accent-[#3DFF7A]"
        />
        {routeWx?.bestDeparture && (
          <div className="mt-1 border border-phosdim bg-phos/5 p-1.5 text-[10px] text-phos">
            Finestra migliore: partenza {fmtDayTime(routeWx.bestDeparture.at)}
          </div>
        )}
      </div>

      {/* Tratte con meteo */}
      <div className="panel-scroll min-h-0 flex-1">
        <div className="flex items-center justify-between border-b border-line px-2 py-1.5">
          <span className="label">
            {waypoints.length} WP · {totalNm.toFixed(1)} nm
          </span>
          {editing && <span className="text-[9px] text-warn">MODIFICA ATTIVA</span>}
        </div>
        {routeWx
          ? routeWx.legs.map((leg, i) => {
              const color = SAFETY_COLORS[leg.verdict.level] || '#9BA0A6'
              const isActive = nav && nav.idx === i + 1
              return (
                <div
                  key={`${leg.from.id}-${leg.to.id}`}
                  className={`border-b border-line px-2 py-1.5 ${
                    isActive ? 'bg-phos/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-paper">
                      {leg.from.name} → {leg.to.name}
                    </span>
                    <span className="text-[10px] text-fog tabular-nums">
                      {metersToNm(leg.dist).toFixed(1)} nm · {formatDeg(leg.brg)}°
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 flex-none rounded-full"
                      style={{ background: color }}
                    />
                    <span className="text-[10px]" style={{ color }}>
                      {leg.verdict.label} · {routeWx.describe(leg.cond)}
                    </span>
                  </div>
                  {leg.cond && (
                    <div className="text-[9px] text-fog">
                      passaggio {fmtDayTime(leg.cond.at)}
                    </div>
                  )}
                </div>
              )
            })
          : route.legs.map((leg) => (
              <div
                key={`${leg.from.id}-${leg.to.id}`}
                className="border-b border-line px-2 py-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-paper">
                    {leg.from.name} → {leg.to.name}
                  </span>
                  <span className="text-[10px] text-fog tabular-nums">
                    {metersToNm(leg.dist).toFixed(1)} nm · {formatDeg(leg.brg)}°
                  </span>
                </div>
                <div className="text-[9px] text-fog">meteo in caricamento…</div>
              </div>
            ))}
      </div>

      {/* Azioni */}
      <div className="flex gap-1.5 border-t border-line p-2">
        <button
          type="button"
          onClick={() => downloadFile('rotta-timone.gpx', routeToGPX(waypoints))}
          className="flex flex-1 items-center justify-center gap-1 border border-line bg-panel py-2 text-[10px] font-bold tracking-widest text-paper active:bg-raised"
        >
          <Download size={12} />
          GPX
        </button>
        <button
          type="button"
          onClick={clearRoute}
          className="flex flex-1 items-center justify-center gap-1 border border-line bg-panel py-2 text-[10px] font-bold tracking-widest text-danger active:bg-raised"
        >
          <Trash2 size={12} />
          ELIMINA
        </button>
      </div>
    </div>
  )
}
