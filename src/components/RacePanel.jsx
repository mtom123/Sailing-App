import { useState } from 'react'
import { Flag, MapPin, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore.js'
import { cardinal, formatCoord, formatDeg, metersToNm } from '../lib/geo.js'
import { EMPTY_COURSE, addCourseMark, beforeStart, coursePoints, parseCoord, raceStats, removeCoursePoint, racePlan, setCourseStart } from '../lib/race.js'

/*
 * Regata: VMG verso il prossimo punto in grande, con distanza, direzione e
 * arrivo, poi il percorso. Partenza e boe si scrivono a mano o si toccano
 * sulla carta (utile anche in crociera, con un punto solo).
 */

const fmtDist = (m) => (m < 1852 ? `${Math.round(m)} m` : `${metersToNm(m).toFixed(2).replace('.', ',')} nm`)

const fmtEta = (ms) => {
  const mins = Math.round(ms / 60000)
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

function Cell({ label, value }) {
  return (
    <div className="border border-line bg-panel px-2 py-1.5">
      <div className="label">{label}</div>
      <div className="text-[calc(16px*var(--fs))] font-bold leading-tight text-paper tabular-nums">{value}</div>
    </div>
  )
}

const turnsText = (seg) => {
  const n = seg.turns.length
  const word = seg.downwind ? ['strambata', 'strambate'] : ['virata', 'virate']
  return n === 0 ? 'senza virare' : `${n} ${word[n === 1 ? 0 : 1]}`
}

const fmtNm = (nm) => `${nm.toFixed(2).replace('.', ',')} nm`

function IdealRoute({ ideal, targets, fromStart }) {
  const { route, error, blocked } = ideal
  if (!route) {
    return error ? <div className="mt-1.5 border border-line bg-panel px-3 py-2 text-[calc(11px*var(--fs))] text-fog">{error}</div> : null
  }
  const [first, ...rest] = route.segments
  return (
    <div className="mt-1.5 border border-line bg-panel px-3 py-2">
      <div className="label">Rotta ideale {fromStart ? 'dalla partenza a' : 'verso'} {targets[0]?.label}</div>
      <div className="text-[calc(14px*var(--fs))] font-bold text-paper tabular-nums">
        {fmtEta(first.totalMs)} · {fmtNm(first.distNm)} · {turnsText(first)}
      </div>
      {first.legs.map((leg, i) => (
        <div key={i} className="flex items-baseline gap-2 border-t border-line py-1.5 first:mt-1">
          <span className="text-[calc(16px*var(--fs))] font-bold text-phos tabular-nums">{formatDeg(leg.heading)}°</span>
          <span className="min-w-0 flex-1 text-[calc(11px*var(--fs))] text-fog">mure a {leg.side}</span>
          <span className="text-[calc(12px*var(--fs))] text-paper tabular-nums">
            {fmtNm(leg.distNm)} · {fmtEta(leg.ms)}
          </span>
        </div>
      ))}
      {rest.map((seg, i) => (
        <div key={i} className="flex items-baseline gap-2 border-t border-line py-1.5">
          <span className="min-w-0 flex-1 text-[calc(11px*var(--fs))] font-semibold text-paper">Poi {targets[i + 1]?.label}</span>
          <span className="text-[calc(12px*var(--fs))] text-fog tabular-nums">
            {fmtNm(seg.distNm)} · {fmtEta(seg.totalMs)} · {turnsText(seg)}
          </span>
        </div>
      ))}
      {rest.length > 0 && (
        <div className="border-t border-line pt-1.5 text-[calc(12px*var(--fs))] font-bold text-paper tabular-nums">
          Tutto il percorso: {fmtEta(route.totalMs)} · {fmtNm(route.distNm)}
        </div>
      )}
      {blocked && (
        <div className="pt-1 text-[calc(10px*var(--fs))] font-semibold text-danger">Passa su terra, bassi fondali o zone vietate: controlla a vista</div>
      )}
    </div>
  )
}

function CourseRow({ point, index, next, onTarget, onMove, onRemove }) {
  const active = index === next
  return (
    <div className={`flex items-center gap-1 border ${active ? 'border-phos bg-phos/10' : 'border-line bg-panel'} ${index < next ? 'opacity-50' : ''}`}>
      <button type="button" onClick={onTarget} className="touch flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
        <span
          className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 border-abyss text-xs font-bold text-abyss ${point.kind === 'start' ? 'bg-[#69F0AE]' : 'bg-[#FFD54F]'}`}
        >
          {point.short}
        </span>
        <span className="min-w-0">
          <span className="block text-[calc(12px*var(--fs))] font-bold text-paper">
            {point.line ? `Linea di partenza · ${Math.round(point.lineM)} m` : point.label}
          </span>
          <span className="block truncate font-mono text-[calc(9px*var(--fs))] text-fog">
            {formatCoord(point.lat, true)} {formatCoord(point.lon, false)}
          </span>
        </span>
      </button>
      <button type="button" title={`Sposta ${point.label}`} onClick={onMove} className="touch flex h-10 w-9 flex-none items-center justify-center text-fog">
        <MapPin size={14} />
      </button>
      <button type="button" title={`Togli ${point.label}`} onClick={onRemove} className="touch flex h-10 w-9 flex-none items-center justify-center text-danger">
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export default function RacePanel({ geo, ideal }) {
  const { raceCourse, setRaceCourse, setRouteEditing } = useAppStore()
  const [latText, setLatText] = useState('')
  const [lonText, setLonText] = useState('')
  const [error, setError] = useState(null)
  const [clearing, setClearing] = useState(false)
  const points = coursePoints(raceCourse)
  const target = points[raceCourse.next] ?? null
  const stats = raceStats(geo, target)
  const preStart = beforeStart(raceCourse)
  const hasGps = geo.lat != null

  const typedPoint = () => {
    const lat = parseCoord(latText, true)
    const lon = parseCoord(lonText, false)
    if (lat == null || lon == null) {
      setError('Coordinate non valide. Esempio: 44 16.002 N e 009 23.700 E')
      return null
    }
    setError(null)
    setLatText('')
    setLonText('')
    return { lat, lon }
  }

  const applyTyped = (apply) => {
    const p = typedPoint()
    if (p) setRaceCourse(apply(raceCourse, p))
  }

  const pickOnMap = (racePicking) => {
    setRouteEditing(false)
    useAppStore.setState({ racePicking, activeDrawer: null })
  }

  const clearCourse = () => {
    if (clearing) setRaceCourse(EMPTY_COURSE)
    setClearing(!clearing)
  }

  const vmg = stats?.vmg
  const away = !preStart && vmg != null && vmg < 0
  const input = 'w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-2.5 font-mono text-xs text-paper outline-none focus:border-phos'
  const btn = 'touch flex items-center justify-center gap-1.5 rounded-md border py-2.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest'

  return (
    <div className="p-2">
      {target ? (
        <>
          {!preStart && (
            <div className={`mb-1.5 border px-3 py-2 ${away ? 'border-danger bg-danger/10' : 'border-line bg-panel'}`}>
              <div className="label">VMG verso {target.label}</div>
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[52px] font-bold leading-none tabular-nums ${away ? 'text-danger' : 'text-phos'}`}>
                  {vmg != null ? vmg.toFixed(1).replace('.', ',') : '--'}
                </span>
                <span className="text-xs text-fog">kn</span>
              </div>
              {away && <div className="pt-1 text-[calc(10px*var(--fs))] font-semibold text-danger">Ti stai allontanando da questo punto</div>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <Cell label={preStart ? 'Alla partenza' : 'Distanza'} value={stats ? fmtDist(stats.distM) : '--'} />
            <Cell label="Direzione" value={stats ? `${formatDeg(stats.brg)}° ${cardinal(stats.brg)}` : '--'} />
            {!preStart && <Cell label="SOG" value={geo.sog != null ? `${geo.sog.toFixed(1).replace('.', ',')} kn` : '--'} />}
            {!preStart && <Cell label="Arrivo a questa VMG" value={stats?.etaMs != null ? fmtEta(stats.etaMs) : '--'} />}
          </div>
          {!stats && <div className="pt-1.5 text-[calc(10px*var(--fs))] text-fog">In attesa del GPS.</div>}
          <IdealRoute ideal={ideal} targets={racePlan(raceCourse, geo).targets} fromStart={preStart} />
        </>
      ) : (
        <div className="flex items-start gap-2 border border-line bg-panel px-3 py-3 text-[calc(11px*var(--fs))] leading-relaxed text-fog">
          <Flag size={16} className="mt-0.5 flex-none text-phos" />
          Segna la partenza e aggiungi le boe, o un solo punto da raggiungere: vedrai quanto ti ci stai avvicinando davvero.
        </div>
      )}

      {points.length > 0 && (
        <>
          <div className="label pb-1 pt-3">Percorso</div>
          <div className="space-y-1">
            {points.map((p, i) => (
              <CourseRow
                key={`${p.kind}-${p.short}`}
                point={p}
                index={i}
                next={raceCourse.next}
                onTarget={() => setRaceCourse({ ...raceCourse, next: i })}
                onMove={() => pickOnMap(p.line ? 'line' : { move: i })}
                onRemove={() => setRaceCourse(removeCoursePoint(raceCourse, i))}
              />
            ))}
          </div>
          <div className="pt-1 text-[calc(10px*var(--fs))] text-fog">Passato un punto si punta da soli al successivo. Tocca una riga per scegliere tu.</div>
        </>
      )}

      <button type="button" onClick={() => pickOnMap('mark')} className={`${btn} mt-3 w-full border-phos bg-phos/15 text-phos`}>
        <MapPin size={14} /> AGGIUNGI BOE SULLA CARTA
      </button>
      <div className="label pb-1 pt-3">Partenza</div>
      <div className="grid grid-cols-3 gap-1.5">
        <button
          type="button"
          disabled={!hasGps}
          onClick={() => setRaceCourse(setCourseStart(raceCourse, { lat: geo.lat, lon: geo.lon }))}
          className={`${btn} border-line bg-surface text-paper disabled:opacity-40`}
        >
          QUI
        </button>
        <button type="button" onClick={() => pickOnMap('start')} className={`${btn} border-line bg-surface text-paper`}>
          PUNTO SULLA CARTA
        </button>
        <button type="button" onClick={() => pickOnMap('line')} className={`${btn} border-line bg-surface text-paper`}>
          LINEA SULLA CARTA
        </button>
      </div>

      <div className="label pb-1 pt-3">Oppure scrivi le coordinate</div>
      <div className="grid grid-cols-2 gap-1.5">
        <input
          type="text"
          value={latText}
          onChange={(e) => setLatText(e.target.value)}
          placeholder="44 16.002 N"
          autoCapitalize="characters"
          autoCorrect="off"
          className={input}
        />
        <input
          type="text"
          value={lonText}
          onChange={(e) => setLonText(e.target.value)}
          placeholder="009 23.700 E"
          autoCapitalize="characters"
          autoCorrect="off"
          className={input}
        />
      </div>
      {error && <div className="pt-1 text-[calc(10px*var(--fs))] text-danger">{error}</div>}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => applyTyped(addCourseMark)} className={`${btn} border-line bg-surface text-paper`}>
          AGGIUNGI BOA
        </button>
        <button type="button" onClick={() => applyTyped(setCourseStart)} className={`${btn} border-line bg-surface text-paper`}>
          È LA PARTENZA
        </button>
      </div>

      {points.length > 0 && (
        <button type="button" onClick={clearCourse} className={`${btn} mt-3 w-full ${clearing ? 'border-danger bg-danger/15' : 'border-line'} text-danger`}>
          <Trash2 size={14} /> {clearing ? 'TOCCA ANCORA PER CANCELLARE' : 'CANCELLA PERCORSO'}
        </button>
      )}
    </div>
  )
}
