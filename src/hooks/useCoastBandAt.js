import { useEffect, useState } from 'react'
import { bandAt, bandText } from '../lib/coastBand.js'
import { useAppStore } from '../store/useAppStore.js'

/*
 * Fascia dalla costa (ordinanze balneari) nel punto dato: risultato di
 * bandAt, o null. Ricalcola solo quando il punto si sposta di ~30 m.
 */
export default function useCoastBandAt(lat, lon) {
  const cfg = useAppStore((s) => s.coastBand)
  const [band, setBand] = useState(null)
  const key = lat == null || lon == null ? null : `${(lat / 0.0003).toFixed(0)},${(lon / 0.0003).toFixed(0)}`
  useEffect(() => {
    if (!key) {
      setBand(null)
      return undefined
    }
    let alive = true
    bandAt(lat, lon, cfg)
      .catch(() => null)
      .then((b) => alive && setBand(b ?? null))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lat/lon arrotondati in key
  }, [key, cfg])
  return band
}

const waypointCache = new Map() // "lat,lon@cfg" -> Promise<bandAt>

/**
 * Fascia dalla costa per ogni waypoint: [{ id, name, text, detail, warn }]
 * dei soli waypoint dentro la fascia italiana (ancoraggio vietato in stagione).
 */
export function useWaypointBands(waypoints) {
  const cfg = useAppStore((s) => s.coastBand)
  const [inside, setInside] = useState([])
  useEffect(() => {
    let alive = true
    const timer = setTimeout(async () => {
      const out = []
      for (const w of waypoints) {
        const key = `${w.lat.toFixed(5)},${w.lon.toFixed(5)}@${JSON.stringify(cfg)}`
        if (!waypointCache.has(key)) waypointCache.set(key, bandAt(w.lat, w.lon, cfg).catch(() => null))
        const b = await waypointCache.get(key)
        if (!alive) return
        const t = bandText(b)
        // Dentro la fascia italiana: in stagione è un divieto, fuori un promemoria
        if (t?.inside && b.region !== 'france') out.push({ id: w.id, name: w.name, text: t.text, detail: t.detail, warn: t.warn })
      }
      setInside(out)
    }, 500)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [waypoints, cfg])
  return inside
}
