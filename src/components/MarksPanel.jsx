import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Download, MapPin, Navigation2, Plus, Search, Trash2, Upload } from 'lucide-react'
import { importMarks, removeMark, saveMark } from '../hooks/useMarks.js'
import { depthAt } from '../lib/depthAt.js'
import { formatCoord, formatDeg, bearing, haversine, metersToNm } from '../lib/geo.js'
import { gpxToMarks, marksFileName, marksToGpx, newMarksOnly } from '../lib/markGpx.js'
import { MARK_TYPES, SEABEDS, markDetail, markType, newMark, searchMarks, validDepth } from '../lib/marks.js'
import { shareFile } from '../lib/route.js'
import { useAppStore } from '../store/useAppStore.js'

/*
 * Mark personali: elenco con ricerca e scheda del singolo mark. La scheda in
 * lavorazione sta nello store (markEdit), così sopravvive quando si va sulla
 * carta a sceglierne la posizione o si chiude il pannello.
 */

const PAGE = 100 // righe per volta: i mark possono essere migliaia
const NEAR_BOAT_M = 100 // qui l'ecoscandaglio vale per il mark

const input = 'w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-2.5 text-xs text-paper outline-none focus:border-phos'
const btn = 'touch flex items-center justify-center gap-1.5 rounded-md border py-2.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest'

const editDraft = (patch) => useAppStore.setState((s) => ({ markEdit: { ...s.markEdit, ...patch } }))

function MarkEditor({ mark, geo, depthLive, draftM }) {
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const isAnchor = mark.type === 'anchor'
  const close = () => useAppStore.setState({ markEdit: null })

  // Profondità proposta: ecoscandaglio se la barca è lì, altrimenti la carta
  useEffect(() => {
    if (mark.type !== 'anchor' || mark.depth !== '') return undefined
    const near = geo.lat != null && haversine(geo.lat, geo.lon, mark.lat, mark.lon) < NEAR_BOAT_M
    if (near && depthLive) {
      const water = depthLive.ref === 'chiglia' ? depthLive.depth + draftM : depthLive.depth
      editDraft({ depth: water.toFixed(1).replace('.', ','), depthSource: 'ecoscandaglio' })
      return undefined
    }
    let alive = true
    depthAt(mark.lat, mark.lon)
      .then((d) => {
        if (alive && d?.reliable && useAppStore.getState().markEdit?.depth === '') {
          editDraft({ depth: d.depth.toFixed(1).replace('.', ','), depthSource: `carta ${d.source}` })
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark.type, mark.lat, mark.lon])

  const save = async () => {
    if (!validDepth(mark.depth)) {
      setError('Profondità non valida. Esempio: 9,5')
      return
    }
    const { marks } = useAppStore.getState()
    const name = mark.name.trim() || `${markType(mark.type).label} ${marks.filter((m) => m.type === mark.type).length + 1}`
    try {
      await saveMark({ ...mark, name, depth: mark.depth.trim() })
      close()
    } catch {
      setError('Mark non salvato: spazio sul dispositivo non disponibile')
    }
  }

  const remove = async () => {
    if (!deleting) {
      setDeleting(true)
      return
    }
    await removeMark(mark.id)
    close()
  }

  return (
    <div className="p-2">
      <button type="button" onClick={close} className="touch flex items-center gap-1 pb-2 text-[calc(11px*var(--fs))] font-semibold text-fog">
        <ChevronLeft size={14} /> {mark.id ? 'Mark' : 'Annulla'}
      </button>

      <div className="label pb-1">Tipo</div>
      <div className="grid grid-cols-4 gap-1">
        {MARK_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => editDraft({ type: t.id })}
            className={`touch flex flex-col items-center gap-0.5 rounded-md border py-1.5 text-[calc(9px*var(--fs))] font-semibold ${
              mark.type === t.id ? 'border-phos bg-phos/15 text-phos' : 'border-line bg-surface text-paper'
            }`}
          >
            <span className="text-base leading-none">{t.glyph}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="label pb-1 pt-3">Nome</div>
      <input
        type="text"
        value={mark.name}
        onChange={(e) => editDraft({ name: e.target.value })}
        placeholder={markType(mark.type).label}
        className={input}
      />

      <div className="flex items-center gap-2 pt-2">
        <div className="min-w-0 flex-1 font-mono text-[calc(10px*var(--fs))] text-fog">
          {formatCoord(mark.lat, true)} {formatCoord(mark.lon, false)}
        </div>
        <button
          type="button"
          onClick={() => useAppStore.setState({ markPicking: true, activeDrawer: null })}
          className={`${btn} flex-none border-line bg-surface px-2.5 text-paper`}
        >
          <MapPin size={13} /> SPOSTA
        </button>
      </div>

      {isAnchor && (
        <>
          <div className="grid grid-cols-2 gap-1.5 pt-3">
            <div className="min-w-0">
              <div className="label pb-1">Profondità (m)</div>
              <input
                type="text"
                inputMode="decimal"
                value={mark.depth}
                onChange={(e) => editDraft({ depth: e.target.value, depthSource: '' })}
                placeholder="9,5"
                className={input}
              />
            </div>
            <div className="min-w-0">
              <div className="label pb-1">Data</div>
              <input type="date" value={mark.date} onChange={(e) => editDraft({ date: e.target.value })} className={input} />
            </div>
          </div>
          {mark.depthSource && <div className="pt-1 text-[calc(10px*var(--fs))] text-fog">Da {mark.depthSource}: correggila se hai misurato tu.</div>}

          <div className="label pb-1 pt-3">Fondale</div>
          <div className="flex flex-wrap gap-1">
            {SEABEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => editDraft({ seabed: mark.seabed === s ? '' : s })}
                className={`touch rounded-md border px-2.5 py-2 text-[calc(11px*var(--fs))] font-semibold ${
                  mark.seabed === s ? 'border-phos bg-phos/15 text-phos' : 'border-line bg-surface text-paper'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="label pb-1 pt-3">Note</div>
      <textarea value={mark.notes} onChange={(e) => editDraft({ notes: e.target.value })} rows={4} className={`${input} resize-none`} />

      {error && <div className="pt-1 text-[calc(10px*var(--fs))] text-danger">{error}</div>}
      <button type="button" onClick={save} className={`${btn} mt-3 w-full border-phos bg-phos/15 text-phos`}>
        SALVA MARK
      </button>
      {mark.id && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => useAppStore.getState().routeTo(mark.lat, mark.lon)} className={`${btn} border-line bg-surface text-paper`}>
            <Navigation2 size={13} /> ROTTA QUI
          </button>
          <button type="button" onClick={remove} className={`${btn} ${deleting ? 'border-danger bg-danger/15' : 'border-line'} text-danger`}>
            <Trash2 size={13} /> {deleting ? 'CONFERMA' : 'ELIMINA'}
          </button>
        </div>
      )}
    </div>
  )
}

function MarkRow({ mark, onOpen, geo }) {
  const detail = markDetail(mark)
  return (
    <button type="button" onClick={onOpen} className="touch flex w-full items-center gap-2 border-b border-line px-1 py-2 text-left active:bg-raised">
      <span className="flex-none text-lg leading-none">{markType(mark.type).glyph}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[calc(12px*var(--fs))] font-bold text-paper">{mark.name}</span>
        {detail && <span className="block truncate text-[calc(10px*var(--fs))] text-fog">{detail}</span>}
      </span>
      {mark.distM != null && (
        <span className="flex-none text-right text-[calc(11px*var(--fs))] font-bold tabular-nums text-paper">
          {metersToNm(mark.distM).toFixed(1).replace('.', ',')} nm
          <span className="block text-[calc(9px*var(--fs))] font-normal text-fog">{formatDeg(bearing(geo.lat, geo.lon, mark.lat, mark.lon))}°</span>
        </span>
      )}
    </button>
  )
}

// Copia su file: i mark stanno solo in questo browser, e cancellandone i dati si perdono
function MarksBackup({ marks }) {
  const fileRef = useRef(null)
  const [message, setMessage] = useState(null)
  const [failed, setFailed] = useState(false)

  const load = async (e) => {
    const [file] = e.target.files
    e.target.value = ''
    if (!file) return
    try {
      const found = gpxToMarks(await file.text())
      const fresh = newMarksOnly(found, marks)
      await importMarks(fresh)
      const skipped = found.length - fresh.length
      setMessage(found.length ? `${fresh.length} mark caricati${skipped ? `, ${skipped} già presenti` : ''}` : 'Nessun mark nel file')
      setFailed(false)
    } catch {
      setMessage('File non valido: serve un GPX')
      setFailed(true)
    }
  }

  return (
    <div className="mt-1.5">
      {/* Senza accept: su iPad un filtro per estensione rende grigi i .gpx */}
      <input ref={fileRef} type="file" onChange={load} className="hidden" aria-label="File GPX dei mark" />
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={!marks.length}
          onClick={() => shareFile(marksFileName(), marksToGpx(marks))}
          className={`${btn} border-line bg-surface text-paper disabled:opacity-40`}
        >
          <Download size={13} /> SALVA SU FILE
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} border-line bg-surface text-paper`}>
          <Upload size={13} /> CARICA DA FILE
        </button>
      </div>
      {message && <div className={`pt-1 text-[calc(10px*var(--fs))] font-semibold ${failed ? 'text-danger' : 'text-phos'}`}>{message}</div>}
      <div className="pt-1 text-[calc(10px*var(--fs))] text-fog">
        I mark stanno solo su questo iPad: salva ogni tanto il file su iCloud. È un GPX, lo legge anche Navionics.
      </div>
    </div>
  )
}

function MarkList({ marks, geo }) {
  const [text, setText] = useState('')
  const [type, setType] = useState(null)
  const [limit, setLimit] = useState(PAGE)
  const found = searchMarks(marks, { type, text }, geo)

  const open = ({ distM, ...mark }) => {
    useAppStore.setState((s) => ({ markEdit: mark, follow: false, view: { ...s.view, center: { lat: mark.lat, lon: mark.lon } } }))
  }
  const addHere = () => useAppStore.setState({ markEdit: newMark('mark', geo) })
  const addOnMap = () => useAppStore.setState({ markEdit: null, markPicking: true, activeDrawer: null })

  return (
    <div className="p-2">
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" disabled={geo.lat == null} onClick={addHere} className={`${btn} border-phos bg-phos/15 text-phos disabled:opacity-40`}>
          <Plus size={14} /> MARK QUI
        </button>
        <button type="button" onClick={addOnMap} className={`${btn} border-phos bg-phos/15 text-phos`}>
          <MapPin size={14} /> SULLA CARTA
        </button>
      </div>
      <MarksBackup marks={marks} />

      {marks.length === 0 ? (
        <div className="pt-3 text-[calc(11px*var(--fs))] leading-relaxed text-fog">
          Nessun mark. Puoi aggiungerli anche tenendo premuto un punto della carta.
        </div>
      ) : (
        <>
          <div className="relative mt-2">
            <Search size={13} className="absolute left-2.5 top-3 text-fog" />
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Cerca nei mark" className={`${input} pl-8`} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {MARK_TYPES.filter((t) => marks.some((m) => m.type === t.id)).map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.label}
                onClick={() => setType(type === t.id ? null : t.id)}
                className={`touch h-9 w-9 rounded-md border text-base leading-none ${type === t.id ? 'border-phos bg-phos/15' : 'border-line bg-surface'}`}
              >
                {t.glyph}
              </button>
            ))}
          </div>
          <div className="label pb-0.5 pt-2">
            {found.length} mark
          </div>
          {found.slice(0, limit).map((m) => (
            <MarkRow key={m.id} mark={m} geo={geo} onOpen={() => open(m)} />
          ))}
          {found.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE)} className={`${btn} mt-2 w-full border-line bg-surface text-paper`}>
              MOSTRA ALTRI
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default function MarksPanel({ geo, depthLive, draftM }) {
  const marks = useAppStore((s) => s.marks)
  const markEdit = useAppStore((s) => s.markEdit)
  if (markEdit) return <MarkEditor mark={markEdit} geo={geo} depthLive={depthLive} draftM={draftM} />
  return <MarkList marks={marks} geo={geo} />
}
