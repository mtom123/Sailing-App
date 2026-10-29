import { useEffect, useRef, useState } from 'react'
import { checkLeg } from '../lib/routeHazards.js'

/*
 * Controllo della rotta: per ogni tratta, terra, zone vietate, fondali sotto minDepth
 * (pescaggio + margine). Ricalcola mezzo secondo dopo l'ultima modifica e
 * solo le tratte cambiate.
 *
 * Restituisce { legs: [risultato checkLeg | undefined per tratta], checking }.
 */

const DEBOUNCE_MS = 500
const cache = new Map() // "lat,lon>lat,lon@minDepth" -> Promise<risultato>

const legKey = (a, b, minDepth) => `${a.lat.toFixed(6)},${a.lon.toFixed(6)}>${b.lat.toFixed(6)},${b.lon.toFixed(6)}@${minDepth}`

export default function useRouteHazards(waypoints, minDepth) {
  const [state, setState] = useState({ legs: [], checking: false })
  const reqRef = useRef(0)

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
        const key = legKey(waypoints[i], waypoints[i + 1], minDepth)
        if (!cache.has(key)) {
          const p = checkLeg(waypoints[i], waypoints[i + 1], minDepth)
          p.catch(() => cache.delete(key))
          cache.set(key, p)
        }
        try {
          legs.push(await cache.get(key))
        } catch {
          legs.push(undefined)
        }
        if (req !== reqRef.current) return
        setState({ legs: [...legs], checking: i < waypoints.length - 2 })
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [waypoints, minDepth])

  return state
}
