import { useEffect, useRef, useState } from 'react'
import { LifeBuoy, Map as MapIcon } from 'lucide-react'
import { cardinal, formatDeg, haversine } from '../lib/geo.js'
import { depthAt } from '../lib/depthAt.js'

/*
 * Mani bagnate: con mare formato e mani bagnate i pulsanti piccoli non si
 * prendono. Quattro riquadri giganti (velocità, profondità, vento, rotta o
 * waypoint) e un MOB enorme; CARTA torna alla carta. Si apre dal pulsante
 * sulla carta o da sola sopra la soglia di vento (Impostazioni).
 */

const fmt1 = (v) => v.toFixed(1).replace('.', ',')

function Tile({ label, value, unit, sub, tone = 'text-phos', alert = false }) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col justify-between rounded-xl border-2 p-3 ${alert ? 'border-danger bg-danger/20' : 'border-line bg-panel'}`}>
      <div className="text-[calc(16px*var(--fs))] font-bold tracking-[0.2em] text-fog">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`font-bold leading-none tabular-nums ${alert ? 'text-danger' : tone}`} style={{ fontSize: 'clamp(56px, 15vh, 150px)' }}>
          {value}
        </span>
        {unit && <span className="text-[calc(22px*var(--fs))] font-bold text-fog">{unit}</span>}
      </div>
      <div className="truncate text-[calc(18px*var(--fs))] font-semibold text-paper">{sub || ' '}</div>
    </div>
  )
}

// Profondità della carta sotto la barca, ricalcolata ogni 20 m
function useChartDepth(lat, lon, skip) {
  const [d, setD] = useState(null)
  const last = useRef({ lat: null, lon: null, n: 0 })
  useEffect(() => {
    if (skip || lat == null) return
    const r = last.current
    if (r.lat != null && haversine(r.lat, r.lon, lat, lon) < 20) return
    r.lat = lat
    r.lon = lon
    const n = ++r.n
    depthAt(lat, lon)
      .then((res) => n === r.n && setD(res))
      .catch(() => n === r.n && setD(null))
  }, [lat, lon, skip])
  return skip ? null : d
}

export default function WetMode({ geo, depthLive, boat, liveWind, forecastWind, nav, mob, alarm, onMob, onClose }) {
  const chart = useChartDepth(geo.lat, geo.lon, Boolean(depthLive))
  const minDepth = (boat.draftM ?? 1.9) + (boat.safetyMarginM ?? 1)

  // Profondità: ecoscandaglio se c'è, altrimenti la carta
  let depthTile
  if (depthLive) {
    depthTile = <Tile label="PROFONDITÀ" value={fmt1(depthLive.depth)} unit="m" sub={`ECO · sotto ${depthLive.ref}`} alert={depthLive.shallow} />
  } else if (chart?.depth != null) {
    depthTile = <Tile label="PROFONDITÀ" value={fmt1(chart.depth)} unit="m" sub={`carta · ${chart.reliable ? chart.source : 'indicativa'}`} alert={chart.depth < minDepth} tone="text-paper" />
  } else {
    depthTile = <Tile label="PROFONDITÀ" value="--" unit="m" sub="nessun dato" tone="text-fog" />
  }

  // Vento: misurato a bordo se c'è, altrimenti la previsione
  let windTile
  if (liveWind) {
    windTile = <Tile label="VENTO REALE" value={Math.round(liveWind.tws)} unit="kn" sub={`da ${formatDeg(liveWind.twd)}° ${cardinal(liveWind.twd)}`} />
  } else if (forecastWind?.speed != null) {
    windTile = (
      <Tile
        label="VENTO PREVISTO"
        value={Math.round(forecastWind.speed)}
        unit="kn"
        sub={`${forecastWind.gust != null ? `raffica ${Math.round(forecastWind.gust)} kn · ` : ''}${forecastWind.dir != null ? `da ${cardinal(forecastWind.dir)}` : ''}`}
        tone="text-paper"
      />
    )
  } else {
    windTile = <Tile label="VENTO" value="--" unit="kn" sub="nessun dato" tone="text-fog" />
  }

  const sog = geo.sog != null ? fmt1(geo.sog) : '--'
  const cog = geo.cog != null ? `${formatDeg(geo.cog)}°` : '---'

  // Navigazione (anche verso il MOB): rotta e distanza al punto; senza, la COG
  let navTile
  if (nav) {
    const dist = nav.dtwNm < 1 ? `${Math.round(nav.dtwNm * 1852)} m` : `${fmt1(nav.dtwNm)} nm`
    navTile = (
      <Tile
        label={mob ? 'MOB' : `AL PUNTO${nav.dest?.name ? ` · ${nav.dest.name}` : ''}`}
        value={`${formatDeg(nav.btw)}°`}
        sub={`${dist} · COG ${cog}`}
        alert={Boolean(mob)}
        tone="text-paper"
      />
    )
  } else {
    navTile = <Tile label="ROTTA SUL FONDO" value={cog} sub={geo.cog != null ? cardinal(geo.cog) : 'serve il GPS'} tone="text-paper" />
  }

  return (
    <div className="fixed inset-0 z-[3000] flex flex-col gap-3 bg-ink p-3 text-paper" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
      {alarm && (
        <div className="alarm-flash flex-none rounded-xl border-2 border-danger bg-danger/20 py-2 text-center text-[calc(22px*var(--fs))] font-bold tracking-widest text-danger">
          {alarm}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">
        <Tile label="VELOCITÀ" value={sog} unit="kn" sub={nav ? '' : `COG ${cog}`} />
        {depthTile}
        {windTile}
        {navTile}
      </div>
      <div className="flex h-[22vh] min-h-[110px] flex-none gap-3">
        <button
          type="button"
          onClick={onMob}
          disabled={geo.lat == null}
          className="touch flex flex-[2] items-center justify-center gap-4 rounded-xl border-2 border-white/40 bg-[#D32F2F] text-white shadow-[0_4px_20px_rgba(211,47,47,0.5)] active:scale-[0.98] disabled:opacity-50"
        >
          <LifeBuoy size={56} />
          <span className="text-[calc(44px*var(--fs))] font-extrabold tracking-[0.15em]">{mob ? 'MOB ATTIVO' : 'MOB'}</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="touch flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-line bg-panel text-paper active:scale-[0.98]"
        >
          <MapIcon size={40} />
          <span className="text-[calc(24px*var(--fs))] font-bold tracking-[0.2em]">CARTA</span>
        </button>
      </div>
    </div>
  )
}

