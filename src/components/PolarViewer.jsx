import { useState } from 'react'
import { X } from 'lucide-react'
import { getPolar, solvePolar } from '../routing/polarSolver.js'

/*
 * Polare della barca: diagramma (metà destra, vento dall'alto) con una curva
 * per intensità di vento, come i grafici ORC, e la tabella delle velocità.
 * Tocca una curva in legenda per evidenziarla.
 */

const CURVES = [
  [6, '#1F77B4'],
  [8, '#FF7F0E'],
  [10, '#2CA02C'],
  [12, '#D62728'],
  [16, '#9467BD'],
  [20, '#17BECF'],
  [24, '#E377C2'],
]

const SIZE = 340
const CX = 24 // centro a sinistra: si disegna la metà destra
const CY = SIZE / 2
const R = SIZE / 2 - 22
const MAX_KN = 10

const rad = (deg) => (deg * Math.PI) / 180
const pt = (twa, kn) => {
  const r = (Math.min(kn, MAX_KN) / MAX_KN) * R
  return [CX + r * Math.sin(rad(twa)), CY - r * Math.cos(rad(twa))]
}

export default function PolarViewer({ polarKey, title, subtitle, onClose }) {
  const [focus, setFocus] = useState(null) // TWS evidenziato
  const polar = getPolar(polarKey)

  const curve = (tws) => {
    let d = ''
    for (let twa = 30; twa <= 180; twa += 2) {
      const [x, y] = pt(twa, solvePolar(polarKey, tws, twa))
      d += `${d ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
    }
    return d
  }

  return (
    <div className="fixed inset-0 z-[3500] flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="glass-strong panel-scroll max-h-full w-full max-w-[760px] rounded-lg p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 pb-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-paper">{title}</div>
            {subtitle && <div className="text-[calc(10px*var(--fs))] text-fog">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} title="Chiudi" className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-line text-fog">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          {/* Diagramma */}
          <svg viewBox={`0 0 ${SIZE / 2 + 40} ${SIZE}`} className="w-full max-w-[260px] flex-none">
            {[2, 4, 6, 8, 10].map((kn) => (
              <g key={kn}>
                <path
                  d={`M${CX},${CY - (kn / MAX_KN) * R} A${(kn / MAX_KN) * R},${(kn / MAX_KN) * R} 0 0 1 ${CX},${CY + (kn / MAX_KN) * R}`}
                  fill="none"
                  stroke="var(--color-fog)"
                  strokeOpacity="0.3"
                  strokeDasharray="2 3"
                />
                <text x={CX + 3} y={CY - (kn / MAX_KN) * R + 10} fontSize="9" fill="var(--color-fog)">
                  {kn} kn
                </text>
              </g>
            ))}
            {[0, 30, 45, 60, 90, 120, 135, 150, 180].map((a) => {
              const [x, y] = pt(a, MAX_KN)
              const [lx, ly] = pt(a, MAX_KN + 1)
              return (
                <g key={a}>
                  <line x1={CX} y1={CY} x2={x} y2={y} stroke="var(--color-fog)" strokeOpacity="0.25" />
                  <text x={lx} y={ly + 3} fontSize="9" textAnchor="middle" fill="var(--color-fog)">
                    {a}°
                  </text>
                </g>
              )
            })}
            {CURVES.map(([tws, color]) => (
              <path
                key={tws}
                d={curve(tws)}
                fill="none"
                stroke={color}
                strokeWidth={focus === tws ? 3.2 : 2}
                strokeOpacity={focus == null || focus === tws ? 1 : 0.25}
                strokeLinejoin="round"
              />
            ))}
          </svg>

          {/* Legenda e angoli di bolina */}
          <div className="min-w-[160px] flex-1">
            <div className="label pb-1">Vento reale</div>
            <div className="flex flex-wrap gap-1.5 pb-3">
              {CURVES.map(([tws, color]) => (
                <button
                  key={tws}
                  type="button"
                  onClick={() => setFocus(focus === tws ? null : tws)}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[calc(10px*var(--fs))] font-semibold ${
                    focus === tws ? 'border-paper text-paper' : 'border-line text-fog'
                  }`}
                >
                  <span className="inline-block h-[3px] w-4" style={{ background: color }} />
                  {tws} kn
                </button>
              ))}
            </div>
            {polar.beat && (
              <>
                <div className="label pb-1">Angolo di bolina migliore</div>
                <div className="grid grid-cols-4 gap-1 pb-2 text-[calc(10px*var(--fs))] tabular-nums text-paper">
                  {polar.beat.tws.map((t, i) => (
                    <div key={t} className="rounded border border-line px-1.5 py-1 text-center">
                      <div className="text-fog">{t} kn</div>
                      <div className="font-semibold">{Math.round(polar.beat.angle[i])}°</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tabella */}
        <div className="label pb-1 pt-3">Velocità in nodi · righe: angolo dal vento · colonne: vento reale</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[calc(10px*var(--fs))] tabular-nums">
            <thead>
              <tr>
                <th className="border border-line px-1.5 py-1 text-left text-fog">TWA</th>
                {polar.tws.map((t) => (
                  <th key={t} className="border border-line px-1.5 py-1 text-right text-fog">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {polar.twa.map((a, j) =>
                a === 0 ? null : (
                  <tr key={a}>
                    <td className="border border-line px-1.5 py-1 text-fog">{a}°</td>
                    {polar.tws.map((t, i) => (
                      <td key={t} className="border border-line px-1.5 py-1 text-right text-paper">
                        {polar.speeds[i][j].toFixed(1).replace('.', ',')}
                      </td>
                    ))}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
