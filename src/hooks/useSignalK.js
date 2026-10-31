import { useEffect, useRef, useState } from 'react'

/*
 * Strumenti di bordo via Signal K (es. Raspberry Pi collegato al Quark-elec
 * A027+, che converte il SeaTalk1 degli strumenti Autohelm/Raymarine):
 * posizione GPS, profondità, velocità sull'acqua, vento, prua e AIS.
 *
 * Signal K manda "delta" in unità SI (m/s, radianti, kelvin): qui si
 * convertono in nodi e gradi. I valori si raccolgono e passano all'app una
 * volta al secondo; ognuno ha la sua ora, così si scartano quelli vecchi.
 * Da una pagina https serve wss:// (certificato del server accettato).
 */

const MS_TO_KN = 1.943844
const DEG = 180 / Math.PI
const FLUSH_MS = 1000
const VESSEL_TTL_MS = 10 * 60 * 1000
export const FRESH_MS = 10000 // oltre, un dato degli strumenti non vale più

/** URL dello stream da quello scritto nelle impostazioni (host:porta, http(s), ws(s)) */
export function streamUrl(input) {
  let url = (input || '').trim()
  if (!url) return null
  if (!/^[a-z]+:\/\//i.test(url)) url = `wss://${url}`
  url = url.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')
  if (!/\/signalk\//.test(url)) url = `${url.replace(/\/+$/, '')}/signalk/v1/stream`
  return `${url}${url.includes('?') ? '&' : '?'}subscribe=all`
}

const deg = (rad) => ((rad * DEG) % 360 + 360) % 360

// Valori della propria barca: percorso Signal K → [campo, conversione]
const SELF_PATHS = {
  'navigation.speedOverGround': ['sog', (v) => v * MS_TO_KN],
  'navigation.courseOverGroundTrue': ['cog', deg],
  'navigation.headingTrue': ['hdg', deg],
  'navigation.headingMagnetic': ['hdgMag', deg],
  'navigation.speedThroughWater': ['stw', (v) => v * MS_TO_KN],
  'environment.depth.belowKeel': ['depthKeel', (v) => v],
  'environment.depth.belowTransducer': ['depthTransducer', (v) => v],
  'environment.depth.belowSurface': ['depthSurface', (v) => v],
  'environment.wind.angleApparent': ['awa', (v) => v * DEG], // -180..180, + a dritta
  'environment.wind.speedApparent': ['aws', (v) => v * MS_TO_KN],
  'environment.wind.speedTrue': ['tws', (v) => v * MS_TO_KN],
  'environment.wind.directionTrue': ['twd', deg],
  'environment.water.temperature': ['waterTemp', (v) => v - 273.15],
  'navigation.log': ['logNm', (v) => v / 1852],
}

export default function useSignalK({ enabled, url }) {
  const [status, setStatus] = useState({ state: 'off', detail: '' })
  const [self, setSelf] = useState({}) // campo -> { value, ts }
  const [vessels, setVessels] = useState({})
  const pending = useRef({ self: {}, vessels: {}, dirty: false })
  const [, setTick] = useState(0)

  // Ridisegna ogni tanto anche senza dati nuovi: quelli vecchi devono sparire
  useEffect(() => {
    if (!enabled) return undefined
    const t = setInterval(() => setTick((n) => n + 1), FRESH_MS / 2)
    return () => clearInterval(t)
  }, [enabled])

  useEffect(() => {
    const target = enabled ? streamUrl(url) : null
    setSelf({})
    setVessels({})
    if (!target) {
      setStatus({ state: enabled ? 'error' : 'off', detail: enabled ? 'Indirizzo mancante' : '' })
      return undefined
    }
    if (location.protocol === 'https:' && target.startsWith('ws:')) {
      setStatus({ state: 'error', detail: 'Da TIMONE in https serve un indirizzo wss:// (Signal K con certificato)' })
      return undefined
    }

    let ws = null
    let selfContext = 'vessels.self'
    let retry = null
    let attempt = 0
    let stopped = false
    pending.current = { self: {}, vessels: {}, dirty: false }

    const onDelta = (msg) => {
      if (msg.self) {
        selfContext = msg.self.startsWith('vessels.') ? msg.self : `vessels.${msg.self}`
        return
      }
      if (!msg.updates) return
      const ctx = msg.context || 'vessels.self'
      const isSelf = ctx === 'vessels.self' || ctx === selfContext
      const mmsi = !isSelf && ctx.match(/mmsi:(\d+)/)?.[1]
      const p = pending.current
      // Ora di arrivo, non quella del messaggio: un Raspberry senza orologio
      // (o una registrazione) può avere date sbagliate
      const ts = Date.now()
      for (const u of msg.updates) {
        for (const { path, value } of u.values || []) {
          if (value == null) continue
          if (isSelf) {
            if (path === 'navigation.position' && Number.isFinite(value.latitude)) {
              p.self.lat = { value: value.latitude, ts }
              p.self.lon = { value: value.longitude, ts }
            } else if (SELF_PATHS[path] && typeof value === 'number') {
              const [key, conv] = SELF_PATHS[path]
              p.self[key] = { value: conv(value), ts }
            }
          } else if (mmsi) {
            const v = (p.vessels[mmsi] ||= { mmsi: Number(mmsi) })
            v.ts = Date.now()
            if (path === 'navigation.position' && Number.isFinite(value.latitude)) {
              v.lat = value.latitude
              v.lon = value.longitude
            } else if (path === 'navigation.speedOverGround') v.sog = value * MS_TO_KN
            else if (path === 'navigation.courseOverGroundTrue') v.cog = deg(value)
            else if (path === 'navigation.headingTrue') v.hdg = deg(value)
            else if (path === '' && value.name) v.name = value.name
          }
          p.dirty = true
        }
      }
    }

    const connect = () => {
      if (stopped) return
      setStatus({ state: 'connecting', detail: target })
      try {
        ws = new WebSocket(target)
      } catch (err) {
        setStatus({ state: 'error', detail: `Indirizzo non valido: ${err.message}` })
        return
      }
      ws.onopen = () => {
        attempt = 0
        setStatus({ state: 'connected', detail: target })
      }
      ws.onmessage = (e) => {
        try {
          onDelta(JSON.parse(e.data))
        } catch {
          // messaggio non JSON: ignorato
        }
      }
      ws.onerror = () => setStatus({ state: 'error', detail: 'Connessione fallita: server acceso e certificato accettato?' })
      ws.onclose = () => {
        if (stopped) return
        // Riprova con attese crescenti (2, 4, 8… fino a 30 s)
        const wait = Math.min(30000, 2000 * 2 ** attempt++)
        setStatus((s) => (s.state === 'error' ? s : { state: 'error', detail: 'Connessione persa, riprovo…' }))
        retry = setTimeout(connect, wait)
      }
    }
    connect()

    // Passa i dati raccolti all'app una volta al secondo
    const flush = setInterval(() => {
      const p = pending.current
      if (!p.dirty) return
      p.dirty = false
      const selfPatch = p.self
      const vesselPatch = p.vessels
      p.self = {}
      p.vessels = {}
      if (Object.keys(selfPatch).length) setSelf((s) => ({ ...s, ...selfPatch }))
      if (Object.keys(vesselPatch).length) {
        setVessels((prev) => {
          const now = Date.now()
          const next = {}
          for (const [k, v] of Object.entries(prev)) if (now - v.ts < VESSEL_TTL_MS) next[k] = v
          for (const [k, v] of Object.entries(vesselPatch)) next[k] = { ...next[k], ...v }
          return next
        })
      }
    }, FLUSH_MS)

    return () => {
      stopped = true
      clearTimeout(retry)
      clearInterval(flush)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [enabled, url])

  // Solo i valori ancora freschi, come numeri
  const now = Date.now()
  const fresh = {}
  for (const [k, { value, ts }] of Object.entries(self)) if (now - ts < FRESH_MS) fresh[k] = value
  if (fresh.lat != null) fresh.posTs = self.lat.ts

  return { status, data: fresh, vessels }
}
