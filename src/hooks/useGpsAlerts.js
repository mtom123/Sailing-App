import { useEffect, useState } from 'react'
import { bandText } from '../lib/coastBand.js'
import { areaLookup, protectedAreas } from '../lib/protectedAreas.js'
import useCoastBandAt from './useCoastBandAt.js'

/*
 * Avvisi sulla posizione GPS:
 * - zone: zona vietata (zone A), zona militare o area marina protetta in cui
 *   si è ora (contorni OpenStreetMap), o null;
 * - band: bandText della fascia dalla costa qui (ordinanza balneare);
 * - stoppedInBand: fermi (< 1 nodo) da più di STOP_MS dentro la fascia
 *   mentre il divieto è in vigore: ancoraggio vietato.
 */

const STOP_MS = 2 * 60 * 1000

export default function useGpsAlerts(geo) {
  const ok = geo.lat != null && geo.lon != null
  const band = bandText(useCoastBandAt(ok ? geo.lat : null, ok ? geo.lon : null))

  // Aree protette e militari: ricontrolla ogni ~50 m
  const [zone, setZone] = useState(null)
  const key = ok ? `${(geo.lat / 0.0005).toFixed(0)},${(geo.lon / 0.0005).toFixed(0)}` : null
  useEffect(() => {
    if (!key) {
      setZone(null)
      return undefined
    }
    let alive = true
    const { lat, lon } = geo
    protectedAreas([lat - 0.02, lon - 0.02, lat + 0.02, lon + 0.02])
      .then((areas) => {
        if (!alive) return
        const civil = areaLookup(areas.filter((a) => a.kind !== 'military'))(lat, lon)
        const military = areaLookup(areas.filter((a) => a.kind === 'military'))(lat, lon)
        setZone(civil?.kind === 'nogo' ? civil : military || civil)
      })
      .catch(() => alive && setZone(null))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posizione arrotondata in key
  }, [key])

  // Fermi dentro la fascia
  const slow = geo.sog != null && geo.sog < 1
  const [stoppedSince, setStoppedSince] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (band?.warn && slow) setStoppedSince((s) => s ?? Date.now())
    else setStoppedSince(null)
  }, [band?.warn, slow])
  useEffect(() => {
    if (!stoppedSince) return undefined
    const id = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(id)
  }, [stoppedSince])

  return { zone, band, stoppedInBand: !!stoppedSince && now - stoppedSince > STOP_MS }
}
