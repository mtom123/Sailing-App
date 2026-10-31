import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { CloudDownload } from 'lucide-react'
import { haversine } from '../../lib/geo.js'
import { downloadArea, estimateArea } from '../../lib/offlinePack.js'

/**
 * Zona offline a rettangolo: tap su due angoli opposti (poi trascinabili),
 * dimensioni e peso stimato, poi due scelte: BASE (zone grandi, fino a
 * zoom 14) o DETTAGLIO (tutti gli zoom, zone più piccole, come le rotte).
 * I tap vanno solo qui finché è aperto.
 */

const COLOR = '#5EE6C8'

const cornerIcon = L.divIcon({
  className: 'timone-marker',
  html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center"><div style="width:16px;height:16px;border-radius:3px;background:${COLOR};border:2px solid #0a1620;box-shadow:0 1px 4px rgba(0,0,0,0.6)"></div></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

const fmtNm = (m) => (m / 1852).toLocaleString('it-IT', { maximumFractionDigits: m < 18520 ? 1 : 0 })
const fmtMb = (mb) => `${mb.toLocaleString('it-IT', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`

export default function AreaDownloadTool({ map, onClose }) {
  const [corners, setCorners] = useState([]) // [{ lat, lon }] fino a 2
  const [job, setJob] = useState(null) // { status: 'running'|'done'|'error', progress, info, error }
  const layersRef = useRef(null)
  const ctrlRef = useRef(null)
  const running = job?.status === 'running'

  // Tap sulla carta: primo e secondo angolo
  useEffect(() => {
    if (!map) return undefined
    const group = L.layerGroup().addTo(map)
    const rect = L.rectangle([[0, 0], [0, 0]], { color: COLOR, weight: 2, dashArray: '6 5', fillOpacity: 0.12, interactive: false })
    layersRef.current = { group, rect, markers: [] }
    const onClick = (e) => setCorners((c) => (c.length < 2 ? [...c, { lat: e.latlng.lat, lon: e.latlng.lng }] : c))
    map.on('click', onClick)
    map.getContainer().classList.add('cursor-crosshair')
    return () => {
      map.off('click', onClick)
      map.getContainer().classList.remove('cursor-crosshair')
      if (map.hasLayer(group)) group.remove()
      layersRef.current = null
      ctrlRef.current?.abort()
    }
  }, [map])

  // Angoli trascinabili (gli stessi marker, per non interrompere il trascinamento) e rettangolo
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    const { group, rect, markers } = layers
    while (markers.length > corners.length) group.removeLayer(markers.pop())
    corners.forEach((p, i) => {
      if (!markers[i]) {
        const m = L.marker([p.lat, p.lon], { icon: cornerIcon, draggable: true, zIndexOffset: 1500 }).addTo(group)
        m.on('drag', (e) => {
          const { lat, lng } = e.target.getLatLng()
          setCorners((list) => list.map((q, j) => (j === i ? { lat, lon: lng } : q)))
        })
        markers[i] = m
      } else {
        const cur = markers[i].getLatLng()
        if (cur.lat !== p.lat || cur.lng !== p.lon) markers[i].setLatLng([p.lat, p.lon])
      }
      markers[i].dragging?.[running ? 'disable' : 'enable']()
    })
    if (corners.length === 2) {
      rect.setBounds([[corners[0].lat, corners[0].lon], [corners[1].lat, corners[1].lon]])
      if (!group.hasLayer(rect)) rect.addTo(group)
    } else if (group.hasLayer(rect)) group.removeLayer(rect)
  }, [corners, running])

  // Rettangolo spostato dopo uno scaricamento: si torna alla stima
  useEffect(() => {
    setJob((j) => (j?.status === 'running' ? j : null))
  }, [corners])

  const bounds = corners.length === 2 ? L.latLngBounds([corners[0].lat, corners[0].lon], [corners[1].lat, corners[1].lon]) : null
  const est = bounds ? { wide: estimateArea(bounds, 'wide'), detail: estimateArea(bounds, 'detail') } : null
  const widthM = bounds ? haversine(bounds.getCenter().lat, bounds.getWest(), bounds.getCenter().lat, bounds.getEast()) : 0
  const heightM = bounds ? haversine(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getWest()) : 0

  const start = async (level) => {
    if (!bounds || est[level].tooBig) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setJob({ status: 'running', level, progress: { done: 0, total: 0, bytes: 0 } })
    let last = 0
    try {
      const info = await downloadArea(bounds, {
        signal: ctrl.signal,
        onProgress: (progress) => {
          const now = Date.now()
          if (now - last < 300 && progress.done < progress.total) return
          last = now
          if (!ctrl.signal.aborted) setJob({ status: 'running', level, progress })
        },
      }, level)
      if (!ctrl.signal.aborted) setJob({ status: 'done', level, info })
    } catch (err) {
      if (!ctrl.signal.aborted) setJob({ status: 'error', error: err.message || String(err) })
    }
  }

  const cancel = () => {
    ctrlRef.current?.abort()
    setJob(null)
  }

  const btn = 'touch rounded-md border px-3 py-1.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest disabled:opacity-40'
  const pct = job?.progress?.total ? Math.round((100 * job.progress.done) / job.progress.total) : 0

  return (
    <div className="glass-strong absolute left-1/2 top-3 z-[950] flex w-[min(420px,calc(100%-140px))] -translate-x-1/2 flex-col gap-1.5 rounded-lg px-4 py-2 slide-up">
      <div className="flex items-center gap-2">
        <CloudDownload size={14} className="text-phos" />
        <span className="text-[calc(11px*var(--fs))] font-semibold tracking-wider text-phos">ZONA OFFLINE</span>
        <span className="ml-auto flex gap-1.5">
          {running ? (
            <button type="button" onClick={cancel} className={`${btn} border-line text-fog`}>
              ANNULLA
            </button>
          ) : (
            <button type="button" onClick={onClose} className={`${btn} border-warn bg-warn/15 text-warn`}>
              FINE
            </button>
          )}
        </span>
      </div>
      {!bounds && (
        <div className="text-[calc(11px*var(--fs))] text-fog">
          {corners.length ? 'tocca l’angolo opposto' : 'tocca un angolo della zona da scaricare'}
        </div>
      )}
      {bounds && !running && (
        <>
          <div className="text-[calc(11px*var(--fs))] tabular-nums text-paper">
            {fmtNm(widthM)} × {fmtNm(heightM)} nm <span className="text-fog">· trascina gli angoli per correggere</span>
          </div>
          {[
            ['wide', 'BASE', 'fino a zoom 14, per zone grandi', 'border-[#4A9EFF] bg-[#4A9EFF]/15 text-[#4A9EFF]'],
            ['detail', 'DETTAGLIO', 'tutti gli zoom, porti e passaggi', 'border-phos bg-phos/15 text-phos'],
          ].map(([level, label, hint, color]) => (
            <div key={level} className="flex items-center gap-2 border-t border-line pt-1.5">
              <div className="min-w-0 flex-1 text-[calc(10px*var(--fs))] leading-snug text-fog">
                <span className="font-semibold text-paper">{label}</span> · {hint}
                <br />
                {est[level].tooBig ? (
                  <span className="text-warn">zona troppo grande, stringi il rettangolo</span>
                ) : (
                  <span className="tabular-nums">circa {fmtMb(est[level].mb)}</span>
                )}
              </div>
              <button type="button" disabled={est[level].tooBig} onClick={() => start(level)} className={`${btn} ${color}`}>
                {job?.status === 'done' && job.level === level ? 'RISCARICA' : 'SCARICA'}
              </button>
            </div>
          ))}
        </>
      )}
      {running && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-phos transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="pt-1 text-[calc(10px*var(--fs))] tabular-nums text-fog">
            {job.progress.total ? `${pct}%` : 'preparo…'} · {fmtMb(job.progress.bytes / 1e6)}
          </div>
        </div>
      )}
      {job?.status === 'done' && (
        <div className="text-[calc(11px*var(--fs))] text-paper">
          {job.level === 'wide' ? 'Base scaricata' : 'Dettaglio scaricato'} · {fmtMb(job.info.bytes / 1e6)}
          {job.info.failed > 0 && <span className="text-warn"> · {job.info.failed} pezzi non scaricati: riprova</span>}
        </div>
      )}
      {job?.status === 'error' && <div className="text-[calc(11px*var(--fs))] text-danger">Errore: {job.error}</div>}
    </div>
  )
}
