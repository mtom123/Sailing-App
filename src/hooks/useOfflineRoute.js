import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { downloadCorridor, offlineInfo } from '../lib/offlinePack.js'

/*
 * Carta offline per la rotta in uso: appena la rotta è pronta (2+ waypoint,
 * fuori dalla modifica) e c'è rete, scarica da sola la fascia attorno ai
 * tratti, una volta per rotta. Si può anche lanciare o annullare a mano.
 */

const AUTO_DELAY_MS = 3000
const PROGRESS_EVERY_MS = 300 // aggiornamenti a schermo, non uno per tassello

export default function useOfflineRoute(waypoints, { editing }) {
  const points = useMemo(() => waypoints.map((w) => ({ lat: w.lat, lon: w.lon })), [waypoints])
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';')
  const [state, setState] = useState(() => ({ status: 'idle', progress: null, info: offlineInfo(points), error: null }))
  const ctrlRef = useRef(null)
  const pointsRef = useRef(points)
  pointsRef.current = points

  const start = useCallback(async () => {
    const pts = pointsRef.current
    if (pts.length < 2) return
    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setState({ status: 'running', progress: { done: 0, total: 0, bytes: 0, failed: 0 }, info: null, error: null })
    let last = 0
    try {
      const info = await downloadCorridor(pts, {
        signal: ctrl.signal,
        onProgress: (progress) => {
          const now = Date.now()
          if (now - last < PROGRESS_EVERY_MS && progress.done < progress.total) return
          last = now
          if (!ctrl.signal.aborted) setState((s) => ({ ...s, progress }))
        },
      })
      if (!ctrl.signal.aborted) setState({ status: 'done', progress: null, info, error: null })
    } catch (err) {
      if (ctrl.signal.aborted) return
      setState({ status: 'error', progress: null, info: null, error: err.message || String(err) })
    }
  }, [])

  const cancel = useCallback(() => {
    ctrlRef.current?.abort()
    setState({ status: 'idle', progress: null, info: offlineInfo(pointsRef.current), error: null })
  }, [])

  // Rotta cambiata: si ferma lo scaricamento in corso e si rilegge lo stato
  useEffect(() => {
    ctrlRef.current?.abort()
    setState({ status: 'idle', progress: null, info: offlineInfo(pointsRef.current), error: null })
  }, [key])

  // Automatico: rotta stabile, online, mai scaricata
  useEffect(() => {
    if (editing || pointsRef.current.length < 2 || !navigator.onLine || offlineInfo(pointsRef.current)) return undefined
    const timer = setTimeout(start, AUTO_DELAY_MS)
    return () => clearTimeout(timer)
  }, [key, editing, start])

  useEffect(() => () => ctrlRef.current?.abort(), [])

  return { ...state, start, cancel, available: points.length >= 2 }
}
