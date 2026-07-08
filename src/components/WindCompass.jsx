import { cardinal, formatDeg } from '../lib/geo.js'

/*
 * Bussola del vento analogica: ago fosforescente = direzione di provenienza
 * del vento, rombo blu = direzione di provenienza dell'onda, TWS al centro.
 */

const C_WIND = '#3DFF7A'
const C_WAVE = '#3A86EA'

export default function WindCompass({ wind, wave }) {
  const size = 200
  const c = size / 2
  const rOuter = 92
  const rTick = 84

  const ticks = []
  for (let a = 0; a < 360; a += 15) {
    const major = a % 45 === 0
    const rad = (a * Math.PI) / 180
    const r1 = major ? rTick - 8 : rTick - 4
    ticks.push(
      <line
        key={a}
        x1={c + r1 * Math.sin(rad)}
        y1={c - r1 * Math.cos(rad)}
        x2={c + rTick * Math.sin(rad)}
        y2={c - rTick * Math.cos(rad)}
        stroke={major ? '#F2F2F2' : '#3A3A3A'}
        strokeWidth={major ? 2 : 1}
      />
    )
  }

  const labels = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['O', 270],
  ].map(([txt, a]) => {
    const rad = (a * Math.PI) / 180
    return (
      <text
        key={txt}
        x={c + (rTick - 20) * Math.sin(rad)}
        y={c - (rTick - 20) * Math.cos(rad) + 4}
        textAnchor="middle"
        fontSize="12"
        fill="#9BA0A6"
        fontWeight="bold"
      >
        {txt}
      </text>
    )
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[180px] mx-auto block">
      <circle cx={c} cy={c} r={rOuter} fill="#121212" stroke="#2A2A2A" strokeWidth="2" />
      {ticks}
      {labels}

      {wave && wave.dir != null && (
        <g transform={`rotate(${wave.dir} ${c} ${c})`}>
          <path
            d={`M${c},${c - rTick + 2} l6,9 l-6,9 l-6,-9 Z`}
            fill={C_WAVE}
            stroke="#0D0D0D"
            strokeWidth="1.5"
          />
        </g>
      )}

      {wind && wind.dir != null && (
        <g transform={`rotate(${wind.dir} ${c} ${c})`}>
          <path
            d={`M${c},${c - rTick + 4} L${c + 9},${c - 30} L${c},${c - 40} L${c - 9},${c - 30} Z`}
            fill={C_WIND}
            stroke="#0D0D0D"
            strokeWidth="1.5"
          />
        </g>
      )}

      <circle cx={c} cy={c} r={40} fill="#0D0D0D" stroke="#2A2A2A" strokeWidth="1.5" />
      <text
        x={c}
        y={c - 2}
        textAnchor="middle"
        fontSize="26"
        fill="#F2F2F2"
        fontWeight="bold"
        className="tabular-nums"
      >
        {wind && wind.speed != null ? wind.speed.toFixed(0) : '--'}
      </text>
      <text x={c} y={c + 14} textAnchor="middle" fontSize="9" fill="#9BA0A6">
        kn · {wind && wind.dir != null ? `${formatDeg(wind.dir)}° ${cardinal(wind.dir)}` : '---'}
      </text>
    </svg>
  )
}
