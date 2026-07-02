import { useEffect, useRef, useState } from 'react'
import { decodeNMEABlock } from '../lib/ais.js'
import { destination } from '../lib/geo.js'

/*
 * Traffico navale AIS con tre sorgenti:
 * - 'sim'   : flotta dimostrativa generata intorno al centro mappa.
 * - 'nmea'  : WebSocket verso un bridge di bordo (multiplexer Wi-Fi o
 *             tools/nmea-bridge.mjs) che inoltra sentenze NMEA0183 !AIVDM
 *             ricevute via UDP/TCP.
 * - 'aishub': polling del feed AISHub con username personale (1 req/min).
 */

const VESSEL_TTL_MS = 10 * 60 * 1000
const SIM_NAMES = [
  ['MV TAVOLARA', 9.5],
  ['SY MAESTRALE', 6.2],
  ['MT CORSARA', 12.1],
  ['SY LIBECCIO', 5.4],
  ['MV GALLURA EXPRESS', 18.0],
  ['FV STELLA DEL MARE', 7.3],
  ['SY GRECALE', 6.8],
  ['MV ICHNUSA', 14.2],
]

function pruneVessels(map) {
  const now = Date.now()
  const next = {}
  for (const [mmsi, v] of Object.entries(map)) {
    if (now - v.ts < VESSEL_TTL_MS) next[mmsi] = v
  }
  return next
}

export default function useAIS({ mode, wsUrl, aishubUser, center, bounds }) {
  const [vessels, setVessels] = useState({})
  const [status, setStatus] = useState({ state: 'idle', detail: '' })
  const simFleetRef = useRef(null)
  const wsRef = useRef(null)

  // --- Modalità simulazione -------------------------------------------------
  useEffect(() => {
    if (mode !== 'sim') {
      simFleetRef.current = null
      return undefined
    }
    if (!center) return undefined

    if (!simFleetRef.current) {
      simFleetRef.current = SIM_NAMES.map(([name, sog], i) => {
        const spawn = destination(
          center.lat,
          center.lon,
          (i * 360) / SIM_NAMES.length,
          2000 + Math.random() * 9000
        )
        return {
          mmsi: 247000100 + i,
          name,
          lat: spawn.lat,
          lon: spawn.lon,
          sog,
          cog: Math.floor(Math.random() * 360),
          hdg: null,
          ts: Date.now(),
        }
      })
    }

    setStatus({ state: 'sim', detail: `${SIM_NAMES.length} navi simulate` })
    const initial = {}
    for (const v of simFleetRef.current) initial[v.mmsi] = v
    setVessels(initial)

    const timer = setInterval(() => {
      simFleetRef.current = simFleetRef.current.map((v) => {
        const cog = (v.cog + (Math.random() - 0.5) * 8 + 360) % 360
        const meters = (v.sog * 1852 * 3) / 3600 // avanzamento in 3 s
        const next = destination(v.lat, v.lon, cog, meters)
        return { ...v, lat: next.lat, lon: next.lon, cog, ts: Date.now() }
      })
      const map = {}
      for (const v of simFleetRef.current) map[v.mmsi] = v
      setVessels(map)
    }, 3000)

    return () => clearInterval(timer)
  }, [mode, center ? `${center.lat.toFixed(1)},${center.lon.toFixed(1)}` : null])

  // --- Modalità NMEA via WebSocket -----------------------------------------
  useEffect(() => {
    if (mode !== 'nmea') return undefined
    setVessels({})
    if (!wsUrl) {
      setStatus({ state: 'error', detail: 'Indirizzo WebSocket mancante' })
      return undefined
    }

    let ws
    let closed = false
    try {
      ws = new WebSocket(wsUrl)
    } catch (err) {
      setStatus({ state: 'error', detail: `URL non valido: ${err.message}` })
      return undefined
    }
    wsRef.current = ws
    setStatus({ state: 'connecting', detail: wsUrl })

    ws.onopen = () => setStatus({ state: 'connected', detail: wsUrl })
    ws.onerror = () =>
      setStatus({ state: 'error', detail: 'Connessione fallita (bridge attivo?)' })
    ws.onclose = () => {
      if (!closed) setStatus({ state: 'error', detail: 'Connessione chiusa' })
    }
    ws.onmessage = (event) => {
      const messages = decodeNMEABlock(event.data)
      if (!messages.length) return
      setVessels((prev) => {
        const next = pruneVessels(prev)
        for (const m of messages) {
          const existing = next[m.mmsi] || {}
          if (m.type === 5) {
            next[m.mmsi] = { ...existing, mmsi: m.mmsi, name: m.name, ts: Date.now() }
          } else {
            next[m.mmsi] = {
              ...existing,
              mmsi: m.mmsi,
              lat: m.lat,
              lon: m.lon,
              sog: m.sog,
              cog: m.cog,
              hdg: m.hdg,
              ts: Date.now(),
            }
          }
        }
        return next
      })
    }

    return () => {
      closed = true
      ws.close()
      wsRef.current = null
    }
  }, [mode, wsUrl])

  // --- Modalità AISHub -------------------------------------------------------
  useEffect(() => {
    if (mode !== 'aishub') return undefined
    setVessels({})
    if (!aishubUser) {
      setStatus({ state: 'error', detail: 'Username AISHub mancante' })
      return undefined
    }
    if (!bounds) return undefined

    let cancelled = false

    async function poll() {
      const p = new URLSearchParams({
        username: aishubUser,
        format: '1',
        output: 'json',
        compress: '0',
        latmin: bounds.south.toFixed(2),
        latmax: bounds.north.toFixed(2),
        lonmin: bounds.west.toFixed(2),
        lonmax: bounds.east.toFixed(2),
      })
      try {
        const res = await fetch(`https://data.aishub.net/ws.php?${p}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        const rows = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : []
        setVessels((prev) => {
          const next = pruneVessels(prev)
          for (const r of rows) {
            next[r.MMSI] = {
              mmsi: r.MMSI,
              name: r.NAME || null,
              lat: Number(r.LATITUDE),
              lon: Number(r.LONGITUDE),
              sog: r.SOG != null ? Number(r.SOG) : null,
              cog: r.COG != null ? Number(r.COG) : null,
              hdg: r.HEADING != null ? Number(r.HEADING) : null,
              ts: Date.now(),
            }
          }
          return next
        })
        setStatus({ state: 'connected', detail: `AISHub: ${rows.length} navi` })
      } catch (err) {
        if (!cancelled) {
          setStatus({
            state: 'error',
            detail: `AISHub non raggiungibile (${err.message}). Se il browser blocca CORS, usare il bridge di bordo.`,
          })
        }
      }
    }

    poll()
    const timer = setInterval(poll, 61000) // limite AISHub: 1 richiesta/min
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [mode, aishubUser, bounds ? `${bounds.south.toFixed(1)},${bounds.west.toFixed(1)}` : null])

  return { vessels: Object.values(vessels), status }
}
