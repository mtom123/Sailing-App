import { useState } from 'react'
import { Trash2, ChevronUp, ChevronDown, Edit3, MapPin, X, Navigation } from 'lucide-react'
import { haversine, bearing, formatDeg, metersToNm, cardinal } from '../../lib/geo.js'

/**
 * Popup marker per waypoint:
 * - Mostra coordinate + distanza/rotta da barca
 * - Pulsanti: sposta su/giù nella sequenza, elimina, set come attivo
 *
 * Si apre con tap su waypoint (non in editing mode).
 */
export default function WaypointPopup({
  waypoint,
  index,
  total,
  boatPosition,
  onMoveUp,
  onMoveDown,
  onDelete,
  onSetActive,
  onClose,
}) {
  if (!waypoint) return null

  let infoRow = null
  if (boatPosition) {
    const dist = haversine(boatPosition.lat, boatPosition.lon, waypoint.lat, waypoint.lon)
    const brg = bearing(boatPosition.lat, boatPosition.lon, waypoint.lat, waypoint.lon)
    infoRow = (
      <div className="text-[10px] text-fog font-mono pt-1 border-t border-line mt-1">
        {metersToNm(dist).toFixed(2)} nm · {formatDeg(brg)}° {cardinal(brg)}
      </div>
    )
  }

  return (
    <div className="glass-strong absolute right-3 top-16 z-[1500] w-[260px] max-w-[90%] rounded-lg p-3 slide-up">
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-phos/15 border border-phos/40 text-xs font-bold text-phos font-mono">
            {index + 1}
          </div>
          <div>
            <div className="text-xs font-semibold text-paper">{waypoint.name || `WP${index + 1}`}</div>
            <div className="text-[10px] text-fog">Waypoint {index + 1} di {total}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="touch rounded-md border border-line text-fog hover:text-paper hover:bg-raised p-1.5"
        >
          <X size={14} />
        </button>
      </div>

      <div className="pt-2 pb-1">
        <div className="font-mono text-[11px] text-paper">
          {waypoint.lat.toFixed(4)}, {waypoint.lon.toFixed(4)}
        </div>
        {infoRow}
      </div>

      <div className="grid grid-cols-2 gap-1.5 pt-2">
        <button
          type="button"
          onClick={() => onMoveUp?.(waypoint.id)}
          disabled={index === 0}
          className="touch flex items-center justify-center gap-1 rounded-md border border-line bg-surface px-2 py-2 text-[10px] font-semibold text-paper hover:bg-raised disabled:opacity-40"
        >
          <ChevronUp size={13} />
          SU
        </button>
        <button
          type="button"
          onClick={() => onMoveDown?.(waypoint.id)}
          disabled={index === total - 1}
          className="touch flex items-center justify-center gap-1 rounded-md border border-line bg-surface px-2 py-2 text-[10px] font-semibold text-paper hover:bg-raised disabled:opacity-40"
        >
          <ChevronDown size={13} />
          GIU
        </button>
        <button
          type="button"
          onClick={() => onSetActive?.(index)}
          className="touch flex items-center justify-center gap-1 rounded-md border border-phos/40 bg-phos/10 px-2 py-2 text-[10px] font-semibold text-phos hover:bg-phos/20"
        >
          <Navigation size={13} />
          ATTIVO
        </button>
        <button
          type="button"
          onClick={() => onDelete?.(waypoint.id)}
          className="touch flex items-center justify-center gap-1 rounded-md border border-danger/40 bg-danger/10 px-2 py-2 text-[10px] font-semibold text-danger hover:bg-danger/20"
        >
          <Trash2 size={13} />
          ELIMINA
        </button>
      </div>
    </div>
  )
}
