import { Anchor, BellOff, LocateFixed } from 'lucide-react'
import { SAFETY_COLORS } from '../lib/anchorageSafety.js'
import { cardinal, formatDeg, metersToNm } from '../lib/geo.js'

/*
 * Sidebar destra: ancoraggi ordinati per distanza con semaforo di sicurezza
 * calcolato sul vento attuale, e Anchor Watch (allarme scarroccio GPS).
 */

function AnchorageRow({ item, onSelect }) {
  const color = SAFETY_COLORS[item.safety.level]
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="block w-full border-b border-line px-2 py-2 text-left active:bg-raised"
    >
      <div className="flex items-start gap-1.5">
        <span
          className="mt-1 inline-block h-2.5 w-2.5 flex-none rounded-full"
          style={{ background: color }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold text-paper">{item.name}</div>
          <div className="truncate text-[9px] uppercase tracking-wider text-fog">
            {item.region}
          </div>
          <div className="mt-0.5 text-[10px] tabular-nums" style={{ color }}>
            {item.safety.reason}
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="text-[12px] font-bold text-paper tabular-nums">
            {item.distance != null ? `${metersToNm(item.distance).toFixed(1)}` : '--'}
          </div>
          <div className="text-[8px] uppercase text-fog">
            nm {item.bearing != null ? `· ${formatDeg(item.bearing)}° ${cardinal(item.bearing)}` : ''}
          </div>
        </div>
      </div>
    </button>
  )
}

export default function AnchoragePanel({
  anchorages,
  onSelect,
  gpsOk,
  anchorWatch,
  radius,
  onRadiusChange,
  onDropAnchor,
  onRaiseAnchor,
  watchDistance,
  alarmActive,
  onMuteAlarm,
}) {
  return (
    <div className="flex h-full flex-col border-l border-line bg-ink">
      {/* --- Anchor Watch ------------------------------------------------- */}
      <div className={`border-b border-line p-2 ${alarmActive ? 'alarm-flash' : ''}`}>
        <div className="label pb-1.5">Anchor Watch</div>

        {!anchorWatch && (
          <>
            <div className="flex items-center justify-between pb-1 text-[10px] text-fog">
              <span>Raggio scarroccio</span>
              <span className="font-bold text-paper tabular-nums">{radius} m</span>
            </div>
            <input
              type="range"
              min="15"
              max="120"
              step="5"
              value={radius}
              onChange={(e) => onRadiusChange(Number(e.target.value))}
              className="w-full accent-[#3DFF7A]"
            />
            <button
              type="button"
              onClick={onDropAnchor}
              disabled={!gpsOk}
              className={`mt-1.5 flex w-full items-center justify-center gap-2 border py-3 text-[12px] font-bold tracking-[0.2em] ${
                gpsOk
                  ? 'border-phos bg-phos/10 text-phos active:bg-phos/25'
                  : 'border-line text-fog opacity-50'
              }`}
            >
              <Anchor size={16} />
              ANCORA CADUTA
            </button>
            {!gpsOk && (
              <div className="pt-1 text-[9px] text-fog">Richiede il fix GPS</div>
            )}
          </>
        )}

        {anchorWatch && (
          <>
            <div className="flex items-baseline justify-between">
              <span
                className={`text-3xl font-bold tabular-nums ${
                  alarmActive ? 'text-danger' : 'text-phos'
                }`}
              >
                {watchDistance != null ? watchDistance.toFixed(0) : '--'}
                <span className="text-xs"> m</span>
              </span>
              <span className="text-[10px] text-fog tabular-nums">/ {anchorWatch.radius} m</span>
            </div>
            <div className="mt-1 h-2 w-full border border-line bg-panel">
              <div
                className="h-full"
                style={{
                  width: `${Math.min(100, ((watchDistance || 0) / anchorWatch.radius) * 100)}%`,
                  background: alarmActive ? '#FF4545' : '#3DFF7A',
                }}
              />
            </div>
            {alarmActive && (
              <div className="mt-1.5 text-center text-[11px] font-bold tracking-[0.25em] text-danger">
                !! FUORI RAGGIO !!
              </div>
            )}
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={onRaiseAnchor}
                className="flex flex-1 items-center justify-center gap-1 border border-line bg-panel py-2.5 text-[10px] font-bold tracking-widest text-paper active:bg-raised"
              >
                <LocateFixed size={13} />
                RECUPERA
              </button>
              {alarmActive && (
                <button
                  type="button"
                  onClick={onMuteAlarm}
                  className="flex flex-1 items-center justify-center gap-1 border border-danger bg-danger/15 py-2.5 text-[10px] font-bold tracking-widest text-danger"
                >
                  <BellOff size={13} />
                  TACITA
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* --- Elenco ancoraggi --------------------------------------------- */}
      <div className="label border-b border-line px-2 py-1.5">
        Ancoraggi vicini
      </div>
      <div className="panel-scroll min-h-0 flex-1">
        {anchorages.map((a) => (
          <AnchorageRow key={a.id} item={a} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}
