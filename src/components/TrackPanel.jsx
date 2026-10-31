import { useEffect, useState } from 'react'
import { Circle, Download, Eye, EyeOff, Pause, Play, Square, Trash2, X } from 'lucide-react'
import { downloadFile, trackToGPX } from '../lib/route.js'
import { fmtDuration } from '../lib/trackStats.js'

/*
 * Registro di bordo, come sui plotter: registra / pausa / riprendi / stop e
 * salva, statistiche della traccia in corso e archivio delle tracce salvate
 * (mostra sulla carta, GPX, elimina).
 */

const fileName = (name) => `${name.replace(/[^\w\-àèéìòù ]+/gi, '').trim().replace(/\s+/g, '-') || 'traccia'}.gpx`

function Stat({ label, value, unit, accent }) {
  return (
    <div className="border border-line bg-panel px-2 py-1.5">
      <div className="label">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-phos' : 'text-paper'}`}>
        {value}
        {unit && <span className="text-[calc(10px*var(--fs))] text-fog"> {unit}</span>}
      </div>
    </div>
  )
}

const btn = 'flex flex-1 items-center justify-center gap-1.5 border py-3 text-[calc(11px*var(--fs))] font-bold tracking-[0.15em] active:opacity-70 disabled:opacity-40'

export default function TrackPanel({ track, gpsOk }) {
  const { status, current, stats, wakeLock, saved, shownIds } = track
  const [confirm, setConfirm] = useState(null) // id da eliminare o 'discard'
  const [, tick] = useState(0)

  // La durata scorre anche senza nuovi punti
  useEffect(() => {
    if (status !== 'recording') return undefined
    const id = setInterval(() => tick((n) => n + 1), 15000)
    return () => clearInterval(id)
  }, [status])

  const exportTrack = async (id) => {
    const t = await track.getFull(id)
    if (t) downloadFile(fileName(t.name), trackToGPX(t.segments, t.name))
  }

  return (
    <div className="p-2">
      <div className="label pb-2">Registro di bordo</div>

      {/* --- Traccia in corso --------------------------------------------- */}
      {current && stats ? (
        <>
          <div className="flex items-center gap-1.5 pb-1.5 text-[calc(11px*var(--fs))] font-bold tracking-widest">
            <Circle size={10} className={status === 'recording' ? 'text-danger' : 'text-warn'} fill="currentColor" />
            <span className={status === 'recording' ? 'text-danger' : 'text-warn'}>{status === 'recording' ? 'REGISTRAZIONE' : 'IN PAUSA'}</span>
            <span className="ml-auto truncate font-normal tracking-normal text-fog">{current.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Stat label="Percorse" value={stats.distanceNm.toFixed(2)} unit="nm" accent />
            <Stat label="Durata" value={fmtDuration(stats.durationMs)} />
            <Stat label="Media" value={stats.avgKn.toFixed(1)} unit="kn" />
            <Stat label="Max" value={stats.maxKn.toFixed(1)} unit="kn" />
          </div>
          <div className="mt-2 flex gap-1.5">
            {status === 'recording' ? (
              <button type="button" onClick={track.pause} className={`${btn} border-warn bg-warn/10 text-warn`}>
                <Pause size={14} /> PAUSA
              </button>
            ) : (
              <button type="button" disabled={!gpsOk} onClick={track.resume} className={`${btn} border-phos bg-phos/10 text-phos`}>
                <Play size={14} /> RIPRENDI
              </button>
            )}
            <button type="button" onClick={track.stopAndSave} className={`${btn} border-danger bg-danger/10 text-danger`}>
              <Square size={13} /> STOP E SALVA
            </button>
          </div>
          {confirm === 'discard' ? (
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirm(null)
                  track.discard()
                }}
                className={`${btn} border-danger text-danger`}
              >
                SCARTA DAVVERO
              </button>
              <button type="button" onClick={() => setConfirm(null)} className={`${btn} border-line text-fog`}>
                ANNULLA
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm('discard')} className="mt-1.5 w-full py-1.5 text-[calc(10px*var(--fs))] tracking-widest text-fog">
              SCARTA TRACCIA
            </button>
          )}
          <div className="pt-1 text-[calc(9px*var(--fs))] leading-relaxed text-fog">
            {stats.points} punti · {wakeLock === 'on' ? 'schermo tenuto acceso' : 'tieni lo schermo acceso: a schermo spento il GPS si ferma'}
          </div>
        </>
      ) : (
        <>
          <button type="button" disabled={!gpsOk} onClick={track.start} className={`${btn} w-full border-phos bg-phos/10 text-phos`}>
            <Circle size={12} /> REGISTRA TRACCIA
          </button>
          <div className="pt-1 text-[calc(9px*var(--fs))] leading-relaxed text-fog">
            {gpsOk
              ? 'Un punto ogni 10 m. La traccia si salva anche se chiudi l’app; mentre registri lo schermo resta acceso.'
              : 'Richiede il fix GPS.'}
          </div>
        </>
      )}

      {/* --- Archivio ------------------------------------------------------ */}
      <div className="label pb-1.5 pt-4">Tracce salvate</div>
      {saved.length === 0 && <div className="text-[calc(10px*var(--fs))] text-fog">Nessuna traccia salvata.</div>}
      {saved.map((t) => (
        <div key={t.id} className="mb-1.5 border border-line bg-panel px-2 py-1.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[calc(12px*var(--fs))] font-bold text-paper">{t.name}</div>
              <div className="text-[calc(10px*var(--fs))] tabular-nums text-fog">
                {t.stats ? `${t.stats.distanceNm.toFixed(1)} nm · ${fmtDuration(t.stats.durationMs)} · media ${t.stats.avgKn.toFixed(1)} kn · max ${t.stats.maxKn.toFixed(1)} kn` : ''}
              </div>
            </div>
            <button
              type="button"
              title={shownIds[t.id] ? 'Nascondi dalla carta' : 'Mostra sulla carta'}
              onClick={() => track.toggleShown(t.id)}
              className={`flex h-9 w-9 flex-none items-center justify-center border ${shownIds[t.id] ? 'border-phos text-phos' : 'border-line text-fog'}`}
            >
              {shownIds[t.id] ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button
              type="button"
              title="Esporta GPX"
              onClick={() => exportTrack(t.id)}
              className="flex h-9 w-9 flex-none items-center justify-center border border-line text-paper"
            >
              <Download size={15} />
            </button>
            {confirm === t.id ? (
              <>
                <button
                  type="button"
                  title="Conferma eliminazione"
                  onClick={() => {
                    setConfirm(null)
                    track.remove(t.id)
                  }}
                  className="flex h-9 flex-none items-center justify-center border border-danger px-2 text-[calc(10px*var(--fs))] font-bold text-danger"
                >
                  ELIMINA
                </button>
                <button type="button" title="Annulla" onClick={() => setConfirm(null)} className="flex h-9 w-9 flex-none items-center justify-center border border-line text-fog">
                  <X size={15} />
                </button>
              </>
            ) : (
              <button
                type="button"
                title="Elimina"
                onClick={() => setConfirm(t.id)}
                className="flex h-9 w-9 flex-none items-center justify-center border border-line text-danger"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
