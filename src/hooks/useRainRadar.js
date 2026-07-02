import { useEffect, useState } from 'react'

/*
 * Radar pioggia in tempo reale via RainViewer (gratuito, senza chiave).
 * Recupera il timestamp dell'ultimo frame disponibile; il layer tile viene
 * costruito in mappa. Aggiornamento ogni 10 minuti.
 */

const REFRESH_MS = 10 * 60 * 1000

export default function useRainRadar(enabled) {
  const [tileUrl, setTileUrl] = useState(null)

  useEffect(() => {
    if (!enabled) {
      setTileUrl(null)
      return undefined
    }
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json')
        if (!res.ok) return
        const data = await res.json()
        const frames = data?.radar?.past
        if (cancelled || !frames || !frames.length) return
        const latest = frames[frames.length - 1]
        setTileUrl(
          `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`
        )
      } catch {
        // offline: nessun radar
      }
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled])

  return tileUrl
}
