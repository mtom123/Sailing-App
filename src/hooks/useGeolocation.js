import { useEffect, useRef, useState } from 'react'
import { msToKnots } from '../lib/geo.js'

/*
 * Geolocalizzazione live dell'iPad via watchPosition.
 * SOG dal campo speed (m/s → kn), COG dal campo heading del GPS.
 */
export default function useGeolocation() {
  const [fix, setFix] = useState({
    lat: null,
    lon: null,
    sog: null,
    cog: null,
    accuracy: null,
    ts: null,
    error: null,
  })
  const watchId = useRef(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setFix((f) => ({ ...f, error: 'Geolocalizzazione non supportata' }))
      return undefined
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords
        setFix({
          lat: c.latitude,
          lon: c.longitude,
          sog: c.speed != null && !Number.isNaN(c.speed) ? msToKnots(c.speed) : null,
          cog: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null,
          accuracy: c.accuracy,
          ts: pos.timestamp,
          error: null,
        })
      },
      (err) => {
        setFix((f) => ({ ...f, error: err.message || 'Errore GPS' }))
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 20000,
      }
    )

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  return fix
}
