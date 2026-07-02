import { Radio, Satellite, Ship, Wifi } from 'lucide-react'
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
        <span className="text-[52px] font-bold leading-none tracking-tight text-phos tabular-nums">
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

const AIS_MODES = [
  { id: 'sim', label: 'DEMO', icon: Ship },
  { id: 'nmea', label: 'NMEA', icon: Wifi },
  { id: 'aishub', label: 'AISHUB', icon: Radio },
]

export default function InstrumentPanel({
  geo,
  weather,
  aisMode,
  onAisModeChange,
  wsUrl,
  onWsUrlChange,
  aishubUser,
  onAishubUserChange,
  aisStatus,
}) {
  const gpsOk = geo.lat != null && !geo.error
  const { wind, wave, hourly } = weather

  return (
    <div className="flex h-full flex-col border-r border-line bg-ink">
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

      <div className="px-3 pb-1 text-[10px] text-fog tabular-nums">
        {gpsOk
          ? `${formatCoord(geo.lat, true)}  ${formatCoord(geo.lon, false)}`
          : geo.error || 'In attesa del segnale GPS…'}
      </div>

      <div className="panel-scroll min-h-0 flex-1">
        <div className="px-6 py-1">
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
            value={wave && wave.dir != null ? `${formatDeg(wave.dir)}°` : '--'}
          />
        </div>

        <div className="mt-3 border-t border-line px-1.5 pt-2">
          <ForecastChart hourly={hourly} />
        </div>
        <div className="mt-2 border-t border-line px-1.5 pt-2">
          <TideChart hourly={hourly} />
        </div>

        <div className="mt-2 border-t border-line p-1.5 pb-3">
          <div className="label px-1 pb-1.5">Sorgente AIS</div>
          <div className="flex gap-1">
            {AIS_MODES.map((m) => {
              const Icon = m.icon
              const active = aisMode === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onAisModeChange(m.id)}
                  className={`flex flex-1 items-center justify-center gap-1 border px-1 py-2 text-[10px] tracking-widest ${
                    active
                      ? 'border-phos bg-phos/10 text-phos'
                      : 'border-line bg-panel text-fog'
                  }`}
                >
                  <Icon size={12} />
                  {m.label}
                </button>
              )
            })}
          </div>
          {aisMode === 'nmea' && (
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => onWsUrlChange(e.target.value)}
              placeholder="ws://192.168.1.10:8484 (bridge NMEA0183)"
              autoCapitalize="none"
              autoCorrect="off"
              className="mt-1.5 w-full border border-line bg-panel px-2 py-2 text-[11px] text-paper outline-none focus:border-phos"
            />
          )}
          {aisMode === 'aishub' && (
            <input
              type="text"
              value={aishubUser}
              onChange={(e) => onAishubUserChange(e.target.value)}
              placeholder="Username AISHub (chiave share)"
              autoCapitalize="none"
              autoCorrect="off"
              className="mt-1.5 w-full border border-line bg-panel px-2 py-2 text-[11px] text-paper outline-none focus:border-phos"
            />
          )}
          <div
            className={`mt-1.5 px-1 text-[10px] ${
              aisStatus.state === 'error' ? 'text-danger' : 'text-fog'
            }`}
          >
            {aisStatus.state === 'sim' && `Demo attiva: ${aisStatus.detail}`}
            {aisStatus.state === 'connected' && `Collegato: ${aisStatus.detail}`}
            {aisStatus.state === 'connecting' && `Connessione a ${aisStatus.detail}…`}
            {aisStatus.state === 'error' && aisStatus.detail}
            {aisStatus.state === 'idle' && 'In attesa'}
          </div>
          {weather.error && (
            <div className="mt-1 px-1 text-[10px] text-warn">{weather.error}</div>
          )}
        </div>
      </div>
    </div>
  )
}
