import { useEffect, useRef, useState } from 'react'
import { checkLeg } from '../lib/routeHazards.js'
import { userZonesVersion } from '../lib/protectedAreas.js'
import { useAppStore } from '../store/useAppStore.js'

/*
 * Controllo della rotta: per ogni tratta, terra, zone vietate, fondali sotto minDepth
 * (pescaggio + margine), scogli e bassi della Carta TIMONE, e il margine
 * laterale (opts.clearanceM, fascia balneare con opts.bandCfg). Ricalcola
 * mezzo secondo dopo l'ultima modifica e solo le tratte cambiate.
 *
 * Restituisce { legs: [risultato checkLeg | undefined per tratta], checking };
 * ogni risultato porta from/to, i waypoint della tratta controllata.
 */

const DEBOUNCE_MS = 500
const cache = new Map() // "lat,lon>lat,lon@minDepth" -> Promise<risultato>

// Con la versione delle zone inserite a mano: aggiunta o tolta una, si ricontrolla
const legKey = (a, b, minDepth, opts) =>
  `${a.lat.toFixed(6)},${a.lon.toFixed(6)}>${b.lat.toFixed(6)},${b.lon.toFixed(6)}@${minDepth}/${opts.clearanceM || 0}/${JSON.stringify(opts.bandCfg || '')}#${userZonesVersion}`

export default function useRouteHazards(waypoints, minDepth, opts = {}) {
  const [state, setState] = useState({ legs: [], checking: false })
  const reqRef = useRef(0)
  const userZones = useAppStore((s) => s.userZones)

  useEffect(() => {
    const req = ++reqRef.current
    if (waypoints.length < 2) {
      setState({ legs: [], checking: false })
      return undefined
    }
    setState((s) => ({ ...s, checking: true }))
    const timer = setTimeout(async () => {
      const legs = []
      for (let i = 0; i < waypoints.length - 1; i++) {
        const key = legKey(waypoints[i], waypoints[i + 1], minDepth, opts)
        if (!cache.has(key)) {
          const p = checkLeg(waypoints[i], waypoints[i + 1], minDepth, opts)
          p.catch(() => cache.delete(key))
          cache.set(key, p)
        }
        try {
          legs.push({ ...(await cache.get(key)), from: waypoints[i], to: waypoints[i + 1] })
        } catch {
          legs.push(undefined)
        }
        if (req !== reqRef.current) return
        setState({ legs: [...legs], checking: i < waypoints.length - 2 })
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userZones: la versione è in legKey
  }, [waypoints, minDepth, userZones, opts.clearanceM, JSON.stringify(opts.bandCfg || '')])

  return state
}
