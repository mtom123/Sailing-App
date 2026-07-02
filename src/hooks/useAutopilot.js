import { useEffect, useRef, useState } from 'react'
import { buildAPB, buildRMB, buildXTE } from '../lib/nmeaOut.js'
import { metersToNm } from '../lib/geo.js'

/*
 * Pilota automatico (Raymarine e compatibili NMEA0183 in modalità Track/NAV).
 * Quando ingaggiato, apre un WebSocket verso il bridge di bordo e trasmette
 * APB + RMB + XTE ogni 2 secondi verso il waypoint attivo; il bridge le
 * inoltra via UDP al multiplexer collegato al pilota.
 */

const SEND_INTERVAL_MS = 2000

export default function useAutopilot({ wsUrl, nav, waypoints, geo }) {
  const [engaged, setEngaged] = useState(false)
  const [status, setStatus] = useState({ state: 'idle', detail: '' })
  const wsRef = useRef(null)
  const navRef = useRef(null)
  navRef.current = { nav, waypoints, geo }

  useEffect(() => {
    if (!engaged) {
      setStatus({ state: 'idle', detail: '' })
      return undefined
    }
    if (!wsUrl) {
      setStatus({ state: 'error', detail: 'Indirizzo bridge mancante' })
      setEngaged(false)
      return undefined
    }

    let ws
    let closed = false
    try {
      ws = new WebSocket(wsUrl)
    } catch (err) {
      setStatus({ state: 'error', detail: `URL non valido: ${err.message}` })
      setEngaged(false)
      return undefined
    }
    wsRef.current = ws
    setStatus({ state: 'connecting', detail: wsUrl })

    let timer = null
    ws.onopen = () => {
      setStatus({ state: 'engaged', detail: 'Pilota in Track — sentenze APB/RMB attive' })
      timer = setInterval(() => {
        const { nav: n, waypoints: wps, geo: g } = navRef.current
        if (!n || g.lat == null || ws.readyState !== ws.OPEN) return
        const xteNm = metersToNm(n.xte)
        const prev = wps[n.idx - 1]
        const legBrg = n.btw // riferimento pratico: rilevamento attuale
        ws.send(
          buildAPB({
            xteNm,
            bearingOrigDest: legBrg,
            bearingToDest: n.btw,
            destId: n.dest.name,
            arrived: n.arrived,
          }) +
            buildRMB({
              xteNm,
              originId: prev ? prev.name : 'ORIG',
              destId: n.dest.name,
              destLat: n.dest.lat,
              destLon: n.dest.lon,
              rangeNm: n.dtwNm,
              bearingToDest: n.btw,
              vmgKn: g.sog != null ? g.sog : 0,
              arrived: n.arrived,
            }) +
            buildXTE({ xteNm })
        )
      }, SEND_INTERVAL_MS)
    }
    ws.onerror = () => {
      setStatus({ state: 'error', detail: 'Bridge non raggiungibile' })
    }
    ws.onclose = () => {
      if (timer) clearInterval(timer)
      if (!closed) {
        setStatus({ state: 'error', detail: 'Connessione al bridge persa' })
        setEngaged(false)
      }
    }

    return () => {
      closed = true
      if (timer) clearInterval(timer)
      ws.close()
      wsRef.current = null
    }
  }, [engaged, wsUrl])

  // Sicurezza: disingaggia se la rotta sparisce o manca il GPS
  useEffect(() => {
    if (engaged && (!nav || geo.lat == null)) setEngaged(false)
  }, [engaged, nav == null, geo.lat == null])

  return { engaged, setEngaged, status }
}
