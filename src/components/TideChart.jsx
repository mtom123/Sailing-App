import { useMemo, useState } from 'react'

/*
 * Curva di marea (livello del mare MSL, Marine API di Open-Meteo) a 3 giorni.
 * Serie singola: il titolo la identifica, nessuna legenda necessaria.
 */

const C_TIDE = '#3A86EA'
const C_GRID = '#242424'
const C_TEXT = '#9BA0A6'

const W = 320
const H = 92
const PAD_L = 30
const PAD_R = 6
const PAD_T = 10
const PAD_B = 16

export default function TideChart({ hourly }) {
  const [hoverIdx, setHoverIdx] = useState(null)

  const data = useMemo(() => {
    if (!hourly) return null
    const levels = hourly.map((h) => h.seaLevel)
    const valid = levels.filter((v) => v != null)
    if (valid.length < 2) return null
    const min = Math.min(...valid)
    const max = Math.max(...valid)
    const span = Math.max(max - min, 0.2)
    let nowIdx = 0
    const now = Date.now()
    hourly.forEach((h, i) => {
      if (Math.abs(new Date(h.t) - now) < Math.abs(new Date(hourly[nowIdx].t) - now)) nowIdx = i
    })
    return { levels, min, max, span, nowIdx, n: hourly.length }
  }, [hourly])

  if (!data) {
    return (
      <div className="label p-2">
        Marea non disponibile per questa zona
      </div>
    )
  }

  const sx = (i) => PAD_L + (i / (data.n - 1)) * (W - PAD_L - PAD_R)
  const sy = (v) =>
    PAD_T + (1 - (v - data.min) / data.span) * (H - PAD_T - PAD_B)

  let lineD = ''
  let areaD = ''
  let pen = false
  data.levels.forEach((v, i) => {
    if (v == null) {
      pen = false
      return
    }
    const seg = `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`
    lineD += `${pen ? 'L' : 'M'}${seg}`
    areaD += `${pen ? 'L' : `M${sx(i).toFixed(1)},${H - PAD_B} L`}${seg}`
    pen = true
  })
  if (pen) areaD += ` L${sx(data.n - 1).toFixed(1)},${H - PAD_B} Z`

  const handlePointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.round(((x - PAD_L) / (W - PAD_L - PAD_R)) * (data.n - 1))
    setHoverIdx(Math.max(0, Math.min(data.n - 1, idx)))
  }

  const idx = hoverIdx != null ? hoverIdx : data.nowIdx
  const level = data.levels[idx]

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="label">Marea (msl)</span>
        <span className="text-[10px] text-paper tabular-nums">
          {level != null ? `${level >= 0 ? '+' : ''}${level.toFixed(2)} m` : '--'}
          {' · '}
          {new Date(hourly[idx].t).toLocaleString('it-IT', {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        onPointerMove={handlePointer}
        onPointerDown={handlePointer}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke={C_GRID} />
        <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T} y2={PAD_T} stroke={C_GRID} />
        <text x={PAD_L - 3} y={PAD_T + 3} textAnchor="end" fontSize="7" fill={C_TEXT}>
          {data.max.toFixed(1)}
        </text>
        <text x={PAD_L - 3} y={H - PAD_B + 3} textAnchor="end" fontSize="7" fill={C_TEXT}>
          {data.min.toFixed(1)}
        </text>
        <path d={areaD} fill={C_TIDE} opacity="0.16" />
        <path d={lineD} fill="none" stroke={C_TIDE} strokeWidth="2" strokeLinejoin="round" />
        <line
          x1={sx(data.nowIdx)}
          x2={sx(data.nowIdx)}
          y1={PAD_T}
          y2={H - PAD_B}
          stroke="#F2F2F2"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.6"
        />
        {hoverIdx != null && level != null && (
          <circle
            cx={sx(hoverIdx)}
            cy={sy(level)}
            r="3.5"
            fill={C_TIDE}
            stroke="#121212"
            strokeWidth="2"
          />
        )}
      </svg>
    </div>
  )
}
