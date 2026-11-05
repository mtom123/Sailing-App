import { useCountdown } from '../hooks/useRaceTimer.js'
import { fmtClock } from '../lib/race.js'

// Conto alla rovescia al via: giallo nell'ultimo minuto, rosso negli ultimi secondi
export default function RaceClock({ startAt, className = '' }) {
  const left = useCountdown(startAt)
  if (left == null) return null
  const tone = left <= 0 ? 'text-phos' : left <= 10000 ? 'text-danger' : left <= 60000 ? 'text-warn' : 'text-paper'
  return <span className={`tabular-nums ${tone} ${className}`}>{fmtClock(left)}</span>
}
