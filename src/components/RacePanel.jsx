import { useEffect, useState } from 'react'
import { Flag, MapPin, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore.js'
import { cardinal, formatCoord, formatDeg, metersToNm } from '../lib/geo.js'
import { parseCoord, raceStats } from '../lib/race.js'

/*
 * Regata: VMG verso la boa in grande, con distanza, direzione e arrivo.
 * La boa si scrive a mano o si tocca sulla carta (utile anche in crociera,
 * per sapere quanto ci si sta davvero avvicinando a un punto).
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

function IdealRoute({ ideal }) {
  const { route, error, blocked } = ideal
  if (!route) {
    return error ? <div className="mt-1.5 border border-line bg-panel px-3 py-2 text-[calc(11px*var(--fs))] text-fog">{error}</div> : null
  }
  const n = route.turns.length
  const word = route.downwind ? ['strambata', 'strambate'] : ['virata', 'virate']
  const tacks = n === 0 ? 'senza virare' : `${n} ${word[n === 1 ? 0 : 1]}`
  return (
    <div className="mt-1.5 border border-line bg-panel px-3 py-2">
      <div className="label">Rotta ideale</div>
      <div className="text-[calc(14px*var(--fs))] font-bold text-paper tabular-nums">
        {fmtEta(route.totalMs)} · {route.distNm.toFixed(2).replace('.', ',')} nm · {tacks}
      </div>
      {route.legs.map((leg, i) => (
        <div key={i} className="flex items-baseline gap-2 border-t border-line py-1.5 first:mt-1">
          <span className="text-[calc(16px*var(--fs))] font-bold text-phos tabular-nums">{formatDeg(leg.heading)}°</span>
          <span className="min-w-0 flex-1 text-[calc(11px*var(--fs))] text-fog">mure a {leg.side}</span>
          <span className="text-[calc(12px*var(--fs))] text-paper tabular-nums">
            {leg.distNm.toFixed(2).replace('.', ',')} nm · {fmtEta(leg.ms)}
          </span>
        </div>
      ))}
      {blocked && (
        <div className="pt-1 text-[calc(10px*var(--fs))] font-semibold text-danger">Passa su terra, bassi fondali o zone vietate: controlla a vista</div>
      )}
    </div>
  )
}

export default function RacePanel({ geo, ideal }) {
  const { raceMark, setRaceMark, setRouteEditing } = useAppStore()
  const [latText, setLatText] = useState('')
  const [lonText, setLonText] = useState('')
  const [error, setError] = useState(null)
  const stats = raceStats(geo, raceMark)

  useEffect(() => {
    setLatText(raceMark ? formatCoord(raceMark.lat, true) : '')
    setLonText(raceMark ? formatCoord(raceMark.lon, false) : '')
    setError(null)
  }, [raceMark])

  const applyCoords = () => {
    const lat = parseCoord(latText, true)
    const lon = parseCoord(lonText, false)
    if (lat == null || lon == null) {
      setError('Coordinate non valide. Esempio: 44 16.002 N e 009 23.700 E')
      return
    }
    setRaceMark({ lat, lon })
  }

  const pickOnMap = () => {
    setRouteEditing(false)
    useAppStore.setState({ racePicking: true, activeDrawer: null })
  }

  const vmg = stats?.vmg
  const away = vmg != null && vmg < 0
  const input = 'w-full min-w-0 rounded-md border border-line bg-surface px-2.5 py-2.5 font-mono text-xs text-paper outline-none focus:border-phos'
  const btn = 'touch flex items-center justify-center gap-1.5 rounded-md border py-2.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest'

  return (
    <div className="p-2">
      {raceMark ? (
        <>
          <div className={`border px-3 py-2 ${away ? 'border-danger bg-danger/10' : 'border-line bg-panel'}`}>
            <div className="label">VMG verso la boa</div>
            <div className="flex items-baseline gap-1.5">
              <span className={`text-[52px] font-bold leading-none tabular-nums ${away ? 'text-danger' : 'text-phos'}`}>
                {vmg != null ? vmg.toFixed(1).replace('.', ',') : '--'}
              </span>
              <span className="text-xs text-fog">kn</span>
            </div>
            {away && <div className="pt-1 text-[calc(10px*var(--fs))] font-semibold text-danger">Ti stai allontanando dalla boa</div>}
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Cell label="Distanza" value={stats ? fmtDist(stats.distM) : '--'} />
            <Cell label="Direzione" value={stats ? `${formatDeg(stats.brg)}° ${cardinal(stats.brg)}` : '--'} />
            <Cell label="SOG" value={geo.sog != null ? `${geo.sog.toFixed(1).replace('.', ',')} kn` : '--'} />
            <Cell label="Arrivo a questa VMG" value={stats?.etaMs != null ? fmtEta(stats.etaMs) : '--'} />
          </div>
          {!stats && <div className="pt-1.5 text-[calc(10px*var(--fs))] text-fog">In attesa del GPS.</div>}
          <IdealRoute ideal={ideal} />
        </>
      ) : (
        <div className="flex items-start gap-2 border border-line bg-panel px-3 py-3 text-[calc(11px*var(--fs))] leading-relaxed text-fog">
          <Flag size={16} className="mt-0.5 flex-none text-phos" />
          Scegli la boa o il punto da raggiungere: vedrai quanto ti ci stai avvicinando davvero.
        </div>
      )}

      <button type="button" onClick={pickOnMap} className={`${btn} mt-3 w-full border-phos bg-phos/15 text-phos`}>
        <MapPin size={14} /> {raceMark ? 'CAMBIA SULLA CARTA' : 'SCEGLI SULLA CARTA'}
      </button>

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
      <div className="mt-1.5 flex gap-1.5">
        <button type="button" onClick={applyCoords} className={`${btn} flex-1 border-line bg-surface text-paper`}>
          USA QUESTE COORDINATE
        </button>
        {raceMark && (
          <button type="button" title="Togli la boa" onClick={() => setRaceMark(null)} className={`${btn} w-11 flex-none border-line text-danger`}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
