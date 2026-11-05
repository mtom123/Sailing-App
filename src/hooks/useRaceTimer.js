import { useEffect, useState } from 'react'
import { armAudio, raceBeep } from '../lib/alarm.js'

/*
 * Timer di partenza: i millisecondi al via, e i segnali sonori. I segnali
 * girano a parte, senza stato: suonano anche a pannello chiuso e non fanno
 * ridisegnare l'app ogni secondo.
 */

const TICK_MS = 200
const SIGNALS = [
  [300000, 300, 2],
  [180000, 300, 2],
  [60000, 300, 2],
  [30000, 300, 1],
  ...[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => [s * 1000, 120, 1]),
  [0, 900, 1],
]

export function useCountdown(startAt) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!startAt) return undefined
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(t)
  }, [startAt])
  return startAt ? startAt - now : null
}

export function useRaceSignals(startAt) {
  useEffect(() => {
    if (!startAt || startAt <= Date.now()) return undefined
    // iOS: il suono si sblocca solo con un tocco (dopo un ricaricamento serve il primo)
    document.addEventListener('pointerdown', armAudio, { once: true })
    let prev = startAt - Date.now()
    const t = setInterval(() => {
      const left = startAt - Date.now()
      const signal = SIGNALS.find(([at]) => prev > at && left <= at)
      if (signal) raceBeep(signal[1], signal[2])
      prev = left
    }, TICK_MS)
    return () => {
      clearInterval(t)
      document.removeEventListener('pointerdown', armAudio)
    }
  }, [startAt])
}
