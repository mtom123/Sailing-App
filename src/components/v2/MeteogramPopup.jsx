import { useEffect, useState } from 'react'
import { X, Wind, Waves } from 'lucide-react'
import { cardinal, formatDeg } from '../../lib/geo.js'

/**
 * Meteogramma per punto — tap sulla mappa (senza editing route) mostra
 * forecast 24h vento + onda per quel punto.
 *
 * USO: <MeteogramPopup map={map} mapReady={mapReady} lat={lat} lon={lon} onClose={...} />
 */
export default function MeteogramPopup({ lat, lon, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let aborted = false
    setLoading(true)
    async function load() {
      try {
        const windP = new URLSearchParams({
          latitude: lat.toFixed(3),
          longitude: lon.toFixed(3),
          hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
          wind_speed_unit: 'kn',
          forecast_days: '2',
          timezone: 'UTC',
        })
        const marineP = new URLSearchParams({
          latitude: lat.toFixed(3),
          longitude: lon.toFixed(3),
          hourly: 'wave_height,wave_period',
          forecast_days: '2',
          timezone: 'UTC',
        })
        const [wRes, mRes] = await Promise.allSettled([
          fetch(`https://api.open-meteo.com/v1/forecast?${windP}`).then((r) => r.json()),
          fetch(`https://marine-api.open-meteo.com/v1/marine?${marineP}`).then((r) => r.json()),
        ])
        if (aborted) return
        const w = wRes.status === 'fulfilled' ? wRes.value : null
        const m = mRes.status === 'fulfilled' ? mRes.value : null
        if (!w) {
          setData(null)
          return
        }
        // First 24 hours
        const times = (w.hourly?.time || []).slice(0, 24)
        const wind = (w.hourly?.wind_speed_10m || []).slice(0, 24)
        const windDir = (w.hourly?.wind_direction_10m || []).slice(0, 24)
        const gust = (w.hourly?.wind_gusts_10m || []).slice(0, 24)
        const wave = m?.hourly?.wave_height ? (m.hourly.wave_height || []).slice(0, 24) : null
        const wavePeriod = m?.hourly?.wave_period ? (m.hourly.wave_period || []).slice(0, 24) : null

        setData({ times, wind, windDir, gust, wave, wavePeriod })
      } catch (e) {
        console.error('Meteogram fetch error:', e)
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    load()
    return () => { aborted = true }
  }, [lat, lon])

  // Compute max wind for chart scaling
  const maxWind = data ? Math.max(...data.wind.filter(v => v != null), 30) : 30

  return (
    <div className="glass-strong absolute right-3 top-16 z-[1500] w-[300px] max-w-[90%] rounded-lg p-3 slide-up">
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div>
          <div className="text-[10px] text-fog">Forecast 24h</div>
          <div className="font-mono text-xs text-paper">{lat.toFixed(3)}, {lon.toFixed(3)}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="touch rounded-md border border-line text-fog hover:text-paper hover:bg-raised p-1.5"
        >
          <X size={14} />
        </button>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-fog pulse-soft">Caricamento…</div>
      ) : !data ? (
        <div className="py-6 text-center text-xs text-warn">Dati non disponibili</div>
      ) : (
        <div className="pt-2">
          {/* Wind chart */}
          <div className="label flex items-center gap-1 mb-1">
            <Wind size={10} className="text-phos" /> Vento (kn)
          </div>
          <div className="flex items-end gap-px h-16 mb-1">
            {data.wind.map((v, i) => {
              if (v == null) return <div key={i} className="flex-1 bg-line" style={{ height: '2px' }} />
              const h = Math.max(2, (v / maxWind) * 60)
              const color = v < 11 ? '#5EE6C8' : v < 21 ? '#F5A623' : '#FF5252'
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{ height: `${h}px`, background: color, opacity: 0.85 }}
                  title={`${new Date(data.times[i] + 'Z').toLocaleTimeString('it-IT', { hour: '2-digit' })}: ${v.toFixed(0)} kn ${cardinal(data.windDir[i])}`}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-[9px] text-fog font-mono pb-2 border-b border-line">
            <span>{new Date(data.times[0] + 'Z').toLocaleTimeString('it-IT', { hour: '2-digit' })}</span>
            <span>+6h</span>
            <span>+12h</span>
            <span>+18h</span>
            <span>{new Date(data.times[23] + 'Z').toLocaleTimeString('it-IT', { hour: '2-digit' })}</span>
          </div>

          {/* Current values */}
          <div className="grid grid-cols-3 gap-2 pt-2 text-center">
            <div>
              <div className="label">Vento</div>
              <div className="font-mono text-sm font-bold text-phos">
                {data.wind[0]?.toFixed(0) ?? '--'}<span className="text-[9px] text-fog ml-1">kn</span>
              </div>
              <div className="text-[9px] text-fog">{cardinal(data.windDir[0])}</div>
            </div>
            <div>
              <div className="label">Raffica</div>
              <div className="font-mono text-sm font-bold text-warn">
                {data.gust[0]?.toFixed(0) ?? '--'}<span className="text-[9px] text-fog ml-1">kn</span>
              </div>
            </div>
            <div>
              <div className="label">Onda</div>
              <div className="font-mono text-sm font-bold text-info">
                {data.wave?.[0]?.toFixed(1) ?? '--'}<span className="text-[9px] text-fog ml-1">m</span>
              </div>
            </div>
          </div>

          {/* Max values next 24h */}
          <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-line text-[10px]">
            <div>
              <span className="text-fog">Max vento 24h:</span>{' '}
              <span className="font-mono font-bold text-paper">
                {Math.max(...data.wind.filter(v => v != null)).toFixed(0)} kn
              </span>
            </div>
            <div>
              <span className="text-fog">Max onda 24h:</span>{' '}
              <span className="font-mono font-bold text-paper">
                {data.wave ? Math.max(...data.wave.filter(v => v != null)).toFixed(1) : '--'} m
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
