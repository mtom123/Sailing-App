import { useMemo, useState } from 'react'

/*
 * Previsione a 3 giorni: due pannelli impilati (small multiples) con asse
 * tempo condiviso — vento/raffiche in nodi sopra, altezza onda in metri sotto.
 * Palette serie validata per surface scuro; le raffiche portano anche il
 * tratteggio come codifica secondaria oltre al colore.
 */

const C_WIND = '#17A845'
const C_GUST = '#CC6B27'
const C_WAVE = '#3A86EA'
const C_GRID = '#242424'
const C_TEXT = '#9BA0A6'

const W = 320
const PAD_L = 26
const PAD_R = 6
const PANEL_H = 74
const GAP = 26
const AXIS_H = 16
const H = PANEL_H * 2 + GAP + AXIS_H + 8

function linePath(values, sx, sy) {
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v == null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`
    pen = true
  })
  return d
}

function Panel({ top, values, maxValue, unit, series, sx, hoverIdx }) {
  const sy = (v) => top + PANEL_H - (v / maxValue) * (PANEL_H - 12)
  const gridLines = [0.5, 1].map((f) => maxValue * f)
  return (
    <g>
      {gridLines.map((gv) => (
        <g key={gv}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={sy(gv)}
            y2={sy(gv)}
            stroke={C_GRID}
            strokeWidth="1"
          />
          <text x={PAD_L - 3} y={sy(gv) + 3} textAnchor="end" fontSize="7" fill={C_TEXT}>
            {gv % 1 === 0 ? gv : gv.toFixed(1)}
          </text>
        </g>
      ))}
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={top + PANEL_H}
        y2={top + PANEL_H}
        stroke={C_GRID}
        strokeWidth="1"
      />
      <text x={PAD_L} y={top - 3} fontSize="7" fill={C_TEXT}>
        {unit}
      </text>
      {series.map((s) => (
        <path
          key={s.key}
          d={linePath(values[s.key], sx, sy)}
          fill="none"
          stroke={s.color}
          strokeWidth="2"
          strokeDasharray={s.dashed ? '4 3' : 'none'}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {hoverIdx != null &&
        series.map((s) => {
          const v = values[s.key][hoverIdx]
          if (v == null) return null
          return (
            <circle
              key={s.key}
              cx={sx(hoverIdx)}
              cy={sy(v)}
              r="3.5"
              fill={s.color}
              stroke="#121212"
              strokeWidth="2"
            />
          )
        })}
    </g>
  )
}

export default function ForecastChart({ hourly }) {
  const [hoverIdx, setHoverIdx] = useState(null)

  const data = useMemo(() => {
    if (!hourly || !hourly.length) return null
    const wind = hourly.map((h) => h.wind)
    const gust = hourly.map((h) => h.gust)
    const wave = hourly.map((h) => h.wave)
    const windMax = Math.max(10, ...wind.filter((v) => v != null), ...gust.filter((v) => v != null))
    const waveMax = Math.max(0.5, ...wave.filter((v) => v != null))
    const days = []
    hourly.forEach((h, i) => {
      if (h.t.endsWith('T00:00') || i === 0) {
        days.push({ i, label: new Date(h.t).toLocaleDateString('it-IT', { weekday: 'short' }) })
      }
    })
    const nowIdx = (() => {
      const now = Date.now()
      let best = 0
      hourly.forEach((h, i) => {
        if (Math.abs(new Date(h.t) - now) < Math.abs(new Date(hourly[best].t) - now)) best = i
      })
      return best
    })()
    return { wind, gust, wave, windMax: Math.ceil(windMax / 5) * 5, waveMax: Math.ceil(waveMax * 2) / 2, days, nowIdx, n: hourly.length }
  }, [hourly])

  if (!data) {
    return <div className="label p-2">Previsioni non disponibili</div>
  }

  const sx = (i) => PAD_L + (i / (data.n - 1)) * (W - PAD_L - PAD_R)

  const handlePointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round(((x - PAD_L) / (W - PAD_L - PAD_R)) * (data.n - 1))
    setHoverIdx(Math.max(0, Math.min(data.n - 1, idx)))
  }

  const idx = hoverIdx != null ? hoverIdx : data.nowIdx
  const readout = hourly[idx]
  const topWind = 12
  const topWave = topWind + PANEL_H + GAP

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="label">Previsione 72h</span>
        <span className="text-[10px] text-paper tabular-nums">
          {new Date(readout.t).toLocaleString('it-IT', {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <div className="flex gap-3 px-1 pb-1 text-[9px] uppercase tracking-widest text-fog">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[3px] w-4" style={{ background: C_WIND }} />
          Vento {readout.wind != null ? `${readout.wind.toFixed(0)} kn` : '--'}
        </span>
        <span className="flex items-center gap-1">
          <svg width="16" height="3">
            <line x1="0" y1="1.5" x2="16" y2="1.5" stroke={C_GUST} strokeWidth="3" strokeDasharray="4 3" />
          </svg>
          Raffiche {readout.gust != null ? `${readout.gust.toFixed(0)} kn` : '--'}
        </span>
      </div>
      <div className="flex gap-3 px-1 pb-1 text-[9px] uppercase tracking-widest text-fog">
        <span className="flex items-center gap-1">
          <span className="inline-block h-[3px] w-4" style={{ background: C_WAVE }} />
          Onda {readout.wave != null ? `${readout.wave.toFixed(1)} m` : '--'}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <Panel
          top={topWind}
          values={{ wind: data.wind, gust: data.gust }}
          maxValue={data.windMax}
          unit="kn"
          series={[
            { key: 'wind', color: C_WIND },
            { key: 'gust', color: C_GUST, dashed: true },
          ]}
          sx={sx}
          hoverIdx={hoverIdx}
        />
        <Panel
          top={topWave}
          values={{ wave: data.wave }}
          maxValue={data.waveMax}
          unit="m"
          series={[{ key: 'wave', color: C_WAVE }]}
          sx={sx}
          hoverIdx={hoverIdx}
        />
        {data.days.map((d) => (
          <g key={d.i}>
            <line
              x1={sx(d.i)}
              x2={sx(d.i)}
              y1={topWind}
              y2={topWave + PANEL_H}
              stroke={C_GRID}
              strokeWidth="1"
            />
            <text
              x={sx(d.i) + 2}
              y={topWave + PANEL_H + 12}
              fontSize="8"
              fill={C_TEXT}
              style={{ textTransform: 'uppercase' }}
            >
              {d.label}
            </text>
          </g>
        ))}
        <line
          x1={sx(data.nowIdx)}
          x2={sx(data.nowIdx)}
          y1={topWind}
          y2={topWave + PANEL_H}
          stroke="#F2F2F2"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.6"
        />
        {hoverIdx != null && (
          <line
            x1={sx(hoverIdx)}
            x2={sx(hoverIdx)}
            y1={topWind}
            y2={topWave + PANEL_H}
            stroke="#F2F2F2"
            strokeWidth="1"
            opacity="0.35"
          />
        )}
      </svg>
    </div>
  )
}
