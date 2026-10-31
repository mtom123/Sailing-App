import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { haversine } from '../lib/geo.js'
import { CURRENT, deleteTrack, getTrack, listTracks, putTrack } from '../lib/trackStore.js'
import { trackStats } from '../lib/trackStats.js'

/*
 * Registro di bordo, come i plotter: registra, metti in pausa, riprendi,
 * ferma e salva la traccia GPS. La traccia in corso si salva in IndexedDB
 * ogni pochi punti (non si perde se l'app si ricarica), le tracce salvate
 * restano in archivio e si possono mostrare sulla carta.
 *
 * Un punto ogni MIN_STEP_M, o ogni MAX_GAP_MS anche da fermi (per la
 * durata), scartando i fix poco precisi. Mentre registra tiene lo schermo
 * acceso: su iPad un'app web a schermo spento non riceve il GPS.
 */

const MIN_STEP_M = 10
const MAX_GAP_MS = 120000
const MAX_ACCURACY_M = 50
const SAVE_EVERY = 10 // punti

const defaultName = (ts) =>
  `Traccia ${new Date(ts).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`

export default function useTrack(geo) {
  const [status, setStatus] = useState('idle') // 'idle' | 'recording' | 'paused'
  const [current, setCurrent] = useState(null) // { id, name, start, segments }
  const [saved, setSaved] = useState([]) // elenco senza punti
  const [shown, setShown] = useState({}) // id -> traccia completa mostrata sulla carta
  const [wakeLock, setWakeLock] = useState(null) // 'on' | 'unsupported' | null
  const sinceSave = useRef(0)
  const currentRef = useRef(null)
  currentRef.current = current

  // Avvio: archivio e traccia rimasta a metà (si riprende da dove era)
  useEffect(() => {
    listTracks().then(setSaved).catch(() => {})
    getTrack(CURRENT)
      .then((t) => {
        if (!t) return
        setCurrent({ id: CURRENT, name: t.name, start: t.start, segments: t.segments })
        setStatus(t.status === 'recording' ? 'recording' : 'paused')
      })
      .catch(() => {})
  }, [])

  const persist = useCallback((track, st) => {
    if (track) putTrack({ ...track, id: CURRENT, status: st }).catch(() => {})
  }, [])

  // Nuovo punto GPS
  useEffect(() => {
    if (status !== 'recording' || geo.lat == null || !currentRef.current) return
    if (geo.accuracy != null && geo.accuracy > MAX_ACCURACY_M) return
    const ts = geo.ts || Date.now()
    const track = currentRef.current
    const seg = track.segments[track.segments.length - 1]
    const last = seg[seg.length - 1]
    if (last) {
      const d = haversine(last[0], last[1], geo.lat, geo.lon)
      if (d < MIN_STEP_M && ts - last[2] < MAX_GAP_MS) return
    }
    const point = [Math.round(geo.lat * 1e6) / 1e6, Math.round(geo.lon * 1e6) / 1e6, ts, geo.sog != null ? Math.round(geo.sog * 10) / 10 : null]
    const next = { ...track, segments: [...track.segments.slice(0, -1), [...seg, point]] }
    setCurrent(next)
    if (++sinceSave.current >= SAVE_EVERY) {
      sinceSave.current = 0
      persist(next, 'recording')
    }
  }, [status, geo.lat, geo.lon, geo.ts, geo.accuracy, geo.sog, persist])

  // Schermo sempre acceso mentre registra (Screen Wake Lock)
  useEffect(() => {
    if (status !== 'recording') return undefined
    if (!('wakeLock' in navigator)) {
      setWakeLock('unsupported')
      return undefined
    }
    let lock = null
    let alive = true
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (!alive) return l.release()
          lock = l
          setWakeLock('on')
          return undefined
        })
        .catch(() => setWakeLock('unsupported'))
    acquire()
    // Il blocco cade quando la pagina va in secondo piano: si riprende al ritorno
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire()
      else persist(currentRef.current, 'recording')
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
      setWakeLock(null)
    }
  }, [status, persist])

  const start = () => {
    const now = Date.now()
    const track = { id: CURRENT, name: defaultName(now), start: now, segments: [[]] }
    setCurrent(track)
    setStatus('recording')
    persist(track, 'recording')
  }

  const pause = () => {
    setStatus('paused')
    persist(currentRef.current, 'paused')
  }

  // Ripresa: nuovo tratto, la linea non unisce i punti prima e dopo la pausa
  const resume = () => {
    const track = currentRef.current
    const next = { ...track, segments: [...track.segments.filter((s) => s.length), []] }
    setCurrent(next)
    setStatus('recording')
    persist(next, 'recording')
  }

  const stopAndSave = async () => {
    const track = currentRef.current
    setStatus('idle')
    setCurrent(null)
    const segments = track.segments.filter((s) => s.length)
    if (segments.flat().length >= 2) {
      const end = Date.now()
      const done = { id: `t${track.start}`, name: track.name, start: track.start, end, segments, stats: trackStats(segments, track.start, end) }
      await putTrack(done).catch(() => {})
    }
    await deleteTrack(CURRENT).catch(() => {})
    setSaved(await listTracks().catch(() => []))
  }

  const discard = async () => {
    setStatus('idle')
    setCurrent(null)
    await deleteTrack(CURRENT).catch(() => {})
  }

  const remove = async (id) => {
    await deleteTrack(id).catch(() => {})
    setShown(({ [id]: _, ...rest }) => rest)
    setSaved(await listTracks().catch(() => []))
  }

  const rename = async (id, name) => {
    const t = await getTrack(id)
    if (!t) return
    await putTrack({ ...t, name })
    setSaved(await listTracks().catch(() => []))
  }

  const toggleShown = async (id) => {
    if (shown[id]) {
      setShown(({ [id]: _, ...rest }) => rest)
      return
    }
    const t = await getTrack(id)
    if (t) setShown((s) => ({ ...s, [id]: t }))
  }

  const getFull = (id) => getTrack(id)

  const stats = useMemo(() => (current ? trackStats(current.segments, current.start) : null), [current])

  return {
    status,
    current,
    stats,
    wakeLock,
    saved,
    shown: Object.values(shown),
    shownIds: shown,
    start,
    pause,
    resume,
    stopAndSave,
    discard,
    remove,
    rename,
    toggleShown,
    getFull,
  }
}
