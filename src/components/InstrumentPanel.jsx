import { useState } from 'react'
import { Copy, Satellite } from 'lucide-react'
import WindCompass from './WindCompass.jsx'
import ForecastChart from './ForecastChart.jsx'
import TideChart from './TideChart.jsx'
import { cardinal, formatCoord, formatDeg } from '../lib/geo.js'

/*
 * Sidebar sinistra: strumenti di navigazione.
 * SOG e COG giganti dal GPS dell'iPad, bussola del vento analogica,
 * dati numerici vento/onde, grafici 72h e sorgente AIS.
 */

function BigValue({ label, value, unit }) {
  return (
    <div className="flex-1 border border-line bg-panel px-2 py-1.5">
      <div className="label">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-[36px] sm:text-[44px] md:text-[52px] font-bold leading-none tracking-tight text-phos tabular-nums">
          {value}
        </span>
        <span className="text-xs text-fog">{unit}</span>
      </div>
    </div>
  )
}

function DataCell({ label, value }) {
  return (
    <div className="border border-line bg-panel px-2 py-1">
      <div className="label">{label}</div>
      <div className="text-sm font-bold text-paper tabular-nums">{value}</div>
    </div>
  )
}

function pressureTrendGlyph(trend) {
  if (trend == null) return { glyph: '→', color: '#9BA0A6' }
  if (trend <= -2) return { glyph: '▼▼', color: '#FF4545' }
  if (trend <= -0.8) return { glyph: '▼', color: '#FFC933' }
  if (trend >= 0.8) return { glyph: '▲', color: '#3DFF7A' }
  return { glyph: '→', color: '#9BA0A6' }
}

const fmtClock = (d) =>
  d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '--'

// Posizione grande e leggibile, con COPIA per comunicarla in fretta (VHF,
// telefono): gradi e primi, come si legge in radio
function Position({ geo, gpsOk }) {
  const [copied, setCopied] = useState(false)
  if (!gpsOk) {
    return <div className="px-3 pb-1 text-[calc(10px*var(--fs))] text-fog">{geo.error || 'In attesa del segnale GPS…'}</div>
  }
  const lat = formatCoord(geo.lat, true)
  const lon = formatCoord(geo.lon, false)
  const copy = async () => {
    const text = `${lat} ${lon}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Senza permesso agli appunti: copia da un campo di testo selezionato
      const field = document.createElement('textarea')
      field.value = text
      document.body.appendChild(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-stretch gap-1.5 px-1.5 pb-1.5">
      <div className="min-w-0 flex-1 border border-line bg-panel px-2 py-1 font-mono text-[calc(20px*var(--fs))] font-bold leading-tight text-paper tabular-nums">
        <div>{lat}</div>
        <div>{lon}</div>
      </div>
      <button
        type="button"
        onClick={copy}
        title="Copia la posizione"
        className="flex w-[calc(54px*var(--fs))] flex-none flex-col items-center justify-center gap-1 border border-phos bg-phos/10 text-phos active:bg-phos/25"
      >
        <Copy size={18} />
        <span className="text-[calc(9px*var(--fs))] font-bold tracking-wider">{copied ? 'COPIATO' : 'COPIA'}</span>
      </button>
    </div>
  )
}

export default function InstrumentPanel({ geo, weather, sun, moon }) {
  const gpsOk = geo.lat != null && !geo.error
  const { wind, wave, hourly, pressure } = weather
  const trend = pressureTrendGlyph(pressure?.trend3h)

  return (
    <div className="flex h-full flex-col border-r border-line bg-abyss">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-sm font-bold tracking-[0.3em] text-phos">TIMONE</span>
        <span className="flex items-center gap-1.5">
          <Satellite size={14} className={gpsOk ? 'text-phos' : 'text-danger'} />
          <span className={`label ${gpsOk ? '!text-phos' : '!text-danger'}`}>
            {gpsOk ? 'GPS FIX' : 'NO GPS'}
          </span>
        </span>
      </div>

      <div className="flex gap-1.5 p-1.5">
        <BigValue
          label="SOG"
          value={geo.sog != null ? geo.sog.toFixed(1) : '--'}
          unit="kn"
        />
        <BigValue
          label="COG"
          value={geo.cog != null ? formatDeg(geo.cog) : '---'}
          unit="°"
        />
      </div>

      <Position geo={geo} gpsOk={gpsOk} />

      <div className="panel-scroll min-h-0 flex-1">
        <div className="px-3 py-2">
          <WindCompass wind={wind} wave={wave} />
        </div>

        <div className="grid grid-cols-3 gap-1.5 px-1.5">
          <DataCell
            label="Vento"
            value={wind && wind.speed != null ? `${wind.speed.toFixed(0)} kn` : '--'}
          />
          <DataCell
            label="Raffica"
            value={wind && wind.gust != null ? `${wind.gust.toFixed(0)} kn` : '--'}
          />
          <DataCell
            label="Dir"
            value={wind && wind.dir != null ? `${formatDeg(wind.dir)}° ${cardinal(wind.dir)}` : '--'}
          />
          <DataCell
            label="Onda"
            value={wave && wave.height != null ? `${wave.height.toFixed(1)} m` : '--'}
          />
          <DataCell
            label="Periodo"
            value={wave && wave.period != null ? `${wave.period.toFixed(0)} s` : '--'}
          />
          <DataCell
            label="Dir onda"
            value={wave && wave.dir != null ? cardinal(wave.dir) : '--'}
          />
          <div className="border border-line bg-panel px-2 py-1">
            <div className="label">Barometro</div>
            <div className="text-sm font-bold text-paper tabular-nums">
              {pressure ? `${pressure.value.toFixed(0)}` : '--'}
              <span className="text-[calc(9px*var(--fs))] text-fog"> hPa </span>
              <span style={{ color: trend.color }}>{trend.glyph}</span>
            </div>
          </div>
          <DataCell
            label="Alba / Tram."
            value={sun ? `${fmtClock(sun.sunrise)} ${fmtClock(sun.sunset)}` : '--'}
          />
          <DataCell
            label="Luna"
            value={moon ? `${moon.emoji} ${moon.name}` : '--'}
          />
        </div>

        <div className="mt-3 border-t border-line px-1.5 pb-3 pt-2">
          <ForecastChart hourly={hourly} />
        </div>
        <div className="border-t border-line px-1.5 pb-4 pt-2">
          <TideChart hourly={hourly} />
        </div>
      </div>
    </div>
  )
}
