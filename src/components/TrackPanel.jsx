import { Circle, Download, Trash2 } from 'lucide-react'
import { downloadFile, trackToGPX } from '../lib/route.js'

/*
 * Registro di bordo: registrazione della traccia GPS con miglia percorse,
 * durata ed export GPX.
 */

function fmtDuration(startTs) {
  if (!startTs) return '--'
  const mins = Math.floor((Date.now() - startTs) / 60000)
  const h = Math.floor(mins / 60)
  return `${h}h ${String(mins % 60).padStart(2, '0')}m`
}

export default function TrackPanel({ track, gpsOk }) {
  const { recording, setRecording, points, distanceNm, startedAt, clearTrack } = track

  return (
    <div className="p-2">
      <div className="label pb-2">Registro di bordo</div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="border border-line bg-panel px-2 py-1.5">
          <div className="label">Percorse</div>
          <div className="text-xl font-bold text-phos tabular-nums">
            {distanceNm.toFixed(1)}
            <span className="text-[10px] text-fog"> nm</span>
          </div>
        </div>
        <div className="border border-line bg-panel px-2 py-1.5">
          <div className="label">Durata</div>
          <div className="text-xl font-bold text-paper tabular-nums">
            {fmtDuration(startedAt)}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!gpsOk}
        onClick={() => setRecording(!recording)}
        className={`mt-2 flex w-full items-center justify-center gap-2 border py-3 text-[12px] font-bold tracking-[0.2em] ${
          recording
            ? 'border-danger bg-danger/15 text-danger'
            : gpsOk
              ? 'border-phos bg-phos/10 text-phos active:bg-phos/25'
              : 'border-line text-fog opacity-50'
        }`}
      >
        <Circle size={12} fill={recording ? 'currentColor' : 'none'} />
        {recording ? 'STOP REGISTRAZIONE' : 'REGISTRA TRACCIA'}
      </button>
      {!gpsOk && <div className="pt-1 text-[9px] text-fog">Richiede il fix GPS</div>}

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={points.length < 2}
          onClick={() => downloadFile('traccia-timone.gpx', trackToGPX(points))}
          className="flex flex-1 items-center justify-center gap-1 border border-line bg-panel py-2 text-[10px] font-bold tracking-widest text-paper active:bg-raised disabled:opacity-40"
        >
          <Download size={12} />
          GPX
        </button>
        <button
          type="button"
          disabled={points.length === 0}
          onClick={clearTrack}
          className="flex flex-1 items-center justify-center gap-1 border border-line bg-panel py-2 text-[10px] font-bold tracking-widest text-danger active:bg-raised disabled:opacity-40"
        >
          <Trash2 size={12} />
          AZZERA
        </button>
      </div>

      <div className="pt-2 text-[9px] leading-relaxed text-fog">
        {points.length} punti registrati (1 ogni 15 m). La traccia resta in
        memoria finché l'app è aperta: esporta il GPX per archiviarla.
      </div>
    </div>
  )
}
