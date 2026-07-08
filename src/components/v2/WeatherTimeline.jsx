import { useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore.js'
import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react'

const MIN_H = -12
const MAX_H = 72

function fmtLabel(offsetH) {
  if (offsetH === 0) return 'ORA'
  const sign = offsetH > 0 ? '+' : ''
  const abs = Math.abs(offsetH)
  if (abs < 24) return `${sign}${offsetH}h`
  const d = Math.floor(abs / 24)
  const h = abs % 24
  return h === 0 ? `${sign}${d}g` : `${sign}${d}g${h}h`
}

function fmtTime(offsetH) {
  const ms = Date.now() + offsetH * 3600 * 1000
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(offsetH) {
  const ms = Date.now() + offsetH * 3600 * 1000
  return new Date(ms).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}

const TICKS = [-12, -6, -3, 0, 3, 6, 12, 18, 24, 36, 48, 60, 72]

export default function WeatherTimeline() {
  const { timeOffset, setTimeOffset, isPlaying, setIsPlaying, playSpeed, setPlaySpeed } = useAppStore()
  const rafRef = useRef(null)
  const lastTickRef = useRef(0)

  // Play animation
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return undefined
    }
    lastTickRef.current = performance.now()
    const tick = (now) => {
      const dt = now - lastTickRef.current
      lastTickRef.current = now
      // playSpeed = ore per secondo → ms di offset aggiunti per ms reale
      const addOffsetH = (dt / 1000) * playSpeed
      setTimeOffset(Math.min(MAX_H, timeOffset + addOffsetH))
      if (timeOffset + addOffsetH >= MAX_H) {
        setIsPlaying(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playSpeed])

  const progress = ((timeOffset - MIN_H) / (MAX_H - MIN_H)) * 100

  return (
    <div className="glass-strong border-t border-line flex items-center gap-3 px-3 py-2.5">
      {/* Play controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Indietro 1h"
          onClick={() => setTimeOffset(Math.max(MIN_H, Math.round(timeOffset) - 1))}
          className="touch rounded-md hover:bg-raised text-fog hover:text-paper p-1.5"
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          title={isPlaying ? 'Pausa' : 'Play animazione'}
          onClick={() => setIsPlaying(!isPlaying)}
          className="touch rounded-md bg-phos/15 border border-phos/50 text-phos hover:bg-phos/25 p-1.5"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          type="button"
          title="Avanti 1h"
          onClick={() => setTimeOffset(Math.min(MAX_H, Math.round(timeOffset) + 1))}
          className="touch rounded-md hover:bg-raised text-fog hover:text-paper p-1.5"
        >
          <SkipForward size={16} />
        </button>
      </div>

      {/* Time display */}
      <div className="flex flex-col min-w-[100px]">
        <div className="flex items-center gap-1.5 text-paper font-mono">
          <Clock size={12} className="text-phos" />
          <span className="text-sm font-bold">{fmtTime(timeOffset)}</span>
        </div>
        <div className="label">{fmtDate(timeOffset)}</div>
      </div>

      {/* Scrubber */}
      <div className="flex-1 relative h-9">
        {/* Tick marks */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
          <div className="relative h-1.5 rounded-full bg-line">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-phos/40"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${progress}%` }}
            >
              <div className="w-5 h-5 rounded-full bg-phos border-2 border-abyss shadow-[0_0_12px_rgba(94,230,200,0.5)]" />
            </div>
          </div>
        </div>
        {/* Tick labels */}
        <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9px] text-fog-dim">
          {TICKS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTimeOffset(t)}
              className={`hover:text-phos ${t === 0 ? 'text-phos font-bold' : ''}`}
            >
              {fmtLabel(t)}
            </button>
          ))}
        </div>
        {/* Hidden range for accessibility / drag */}
        <input
          type="range"
          min={MIN_H}
          max={MAX_H}
          step={0.5}
          value={timeOffset}
          onChange={(e) => setTimeOffset(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Play speed */}
      <div className="flex items-center gap-1">
        {[3, 6, 12].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setPlaySpeed(s)}
            className={`rounded-md px-2 py-1 text-[10px] font-mono font-bold transition-all ${
              playSpeed === s
                ? 'bg-phos/15 text-phos border border-phos/50'
                : 'text-fog hover:text-paper border border-transparent'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )
}
