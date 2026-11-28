import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { CloudDownload } from 'lucide-react'
import { downloadArea, estimateArea, estimateSurround, polygonAreaM2 } from '../../lib/offlinePack.js'

/**
 * Zona offline a poligono: un tap per ogni punto attorno alla zona (si
 * chiude da solo), punti trascinabili, il pallino a metà di un lato si
 * trascina (o si tocca) per aggiungere lì un punto, INDIETRO toglie l'ultimo. Poi superficie, peso
 * stimato e due scelte: BASE (zone grandi, fino a zoom 14) o DETTAGLIO
 * (tutti gli zoom, zone più piccole, come le rotte; con la base attorno,
 * per allargare la vista offline).
 * I tap vanno solo qui finché è aperto.
 */

const COLOR = '#5EE6C8'

const cornerIcon = L.divIcon({
  className: 'timone-marker',
  html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center"><div style="width:16px;height:16px;border-radius:3px;background:${COLOR};border:2px solid #0a1620;box-shadow:0 1px 4px rgba(0,0,0,0.6)"></div></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

// A metà dei lati: trascinato (o toccato) diventa un punto in più
const midIcon = L.divIcon({
  className: 'timone-marker',
  html: `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center"><div style="width:16px;height:16px;border-radius:50%;background:rgba(10,22,32,0.7);border:2px solid ${COLOR}"></div></div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
})

const fmtNm2 = (m2) => (m2 / 1852 ** 2).toLocaleString('it-IT', { maximumFractionDigits: m2 < 1852 ** 2 * 10 ? 1 : 0 })
const fmtMb = (mb) => `${mb.toLocaleString('it-IT', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`

export default function AreaDownloadTool({ map, onClose }) {
  const [points, setPoints] = useState([]) // [{ lat, lon }] in ordine attorno alla zona
  const [job, setJob] = useState(null) // { status: 'running'|'done'|'error', progress, info, error }
  const layersRef = useRef(null)
  const ctrlRef = useRef(null)
  const running = job?.status === 'running'
  const runningRef = useRef(false)
  runningRef.current = running

  // Tap sulla carta: un punto in più (non mentre scarica)
  useEffect(() => {
    if (!map) return undefined
    const group = L.layerGroup().addTo(map)
    const style = { color: COLOR, weight: 2, dashArray: '6 5', fillOpacity: 0.12, interactive: false }
    const shape = L.polygon([], style)
    const line = L.polyline([], style)
    layersRef.current = { group, shape, line, markers: [], mids: L.layerGroup().addTo(group) }
    const onClick = (e) => {
      if (!runningRef.current) setPoints((c) => [...c, { lat: e.latlng.lat, lon: e.latlng.lng }])
    }
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

  // Punti trascinabili (gli stessi marker, per non interrompere il trascinamento), lati e pallini
  useEffect(() => {
    const layers = layersRef.current
    if (!layers) return
    const { group, shape, line, markers, mids } = layers
    while (markers.length > points.length) group.removeLayer(markers.pop())
    points.forEach((p, i) => {
      if (!markers[i]) {
        const m = L.marker([p.lat, p.lon], { icon: cornerIcon, draggable: true, zIndexOffset: 1500 }).addTo(group)
        m.on('drag', (e) => {
          const { lat, lng } = e.target.getLatLng()
          setPoints((list) => list.map((q, j) => (j === i ? { lat, lon: lng } : q)))
        })
        markers[i] = m
      } else {
        const cur = markers[i].getLatLng()
        if (cur.lat !== p.lat || cur.lng !== p.lon) markers[i].setLatLng([p.lat, p.lon])
      }
      markers[i].dragging?.[running ? 'disable' : 'enable']()
    })
    const ll = points.map((p) => [p.lat, p.lon])
    const closed = points.length >= 3
    shape.setLatLngs(closed ? ll : [])
    line.setLatLngs(points.length === 2 ? ll : [])
    if (closed && !group.hasLayer(shape)) shape.addTo(group)
    if (points.length === 2 && !group.hasLayer(line)) line.addTo(group)
    mids.clearLayers()
    if (!running && points.length >= 2) {
      const edges = closed ? points.length : 1
      for (let i = 0; i < edges; i++) {
        const a = points[i]
        const b = points[(i + 1) % points.length]
        const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }
        const insert = (p) => setPoints((list) => [...list.slice(0, i + 1), p, ...list.slice(i + 1)])
        // Trascinabile come i punti: sull'iPad un tocco fermo non esiste (il
        // dito si sposta di qualche pixel) e Leaflet lo prendeva per un
        // trascinamento della carta, perdendo il tocco. Così il pallino si
        // tira dove serve e diventa un punto; il tocco fermo lo aggiunge lì
        const m = L.marker([mid.lat, mid.lon], { icon: midIcon, draggable: true, zIndexOffset: 1400 })
        m.on('click', () => insert(mid))
        m.on('drag', (e) => {
          const { lat, lng } = e.target.getLatLng()
          const ll2 = [...ll.slice(0, i + 1), [lat, lng], ...ll.slice(i + 1)]
          if (closed) shape.setLatLngs(ll2)
          else {
            line.setLatLngs([])
            shape.setLatLngs(ll2)
            if (!group.hasLayer(shape)) shape.addTo(group)
          }
        })
        m.on('dragend', (e) => {
          const { lat, lng } = e.target.getLatLng()
          insert({ lat, lon: lng })
        })
        m.addTo(mids)
      }
    }
  }, [points, running])

  // Zona cambiata dopo uno scaricamento: si torna alla stima
  useEffect(() => {
    setJob((j) => (j?.status === 'running' ? j : null))
  }, [points])

  const ready = points.length >= 3
  const est = useMemo(() => {
    if (!ready) return null
    const detail = estimateArea(points, 'detail')
    // col dettaglio si scarica anche la base attorno
    const around = estimateSurround(points)
    return { wide: estimateArea(points, 'wide'), detail: { ...detail, mb: detail.mb + (around?.mb || 0) }, around }
  }, [points, ready])
  const areaM2 = ready ? polygonAreaM2(points) : 0

  const start = async (level) => {
    if (!ready || est[level].tooBig) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setJob({ status: 'running', level, progress: { done: 0, total: 0, bytes: 0 } })
    let last = 0
    try {
      const info = await downloadArea(points, {
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
          {!running && points.length > 0 && (
            <button type="button" onClick={() => setPoints((c) => c.slice(0, -1))} className={`${btn} border-line text-fog`}>
              INDIETRO
            </button>
          )}
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
      {!ready && (
        <div className="text-[calc(11px*var(--fs))] text-fog">
          {points.length ? 'tocca il punto successivo (ne servono almeno 3)' : 'tocca i punti attorno alla zona da scaricare, uno dopo l’altro'}
        </div>
      )}
      {ready && !running && (
        <>
          <div className="text-[calc(11px*var(--fs))] tabular-nums text-paper">
            {fmtNm2(areaM2)} nm² <span className="text-fog">· trascina i punti; tira il ○ di un lato per aggiungerne uno</span>
          </div>
          {[
            ['wide', 'BASE', 'fino a zoom 14, per zone grandi', 'border-[#4A9EFF] bg-[#4A9EFF]/15 text-[#4A9EFF]'],
            ['detail', 'DETTAGLIO', `tutti gli zoom, porti e passaggi${est.around ? `; con la base per ${est.around.nm} miglia attorno` : ''}`, 'border-phos bg-phos/15 text-phos'],
          ].map(([level, label, hint, color]) => (
            <div key={level} className="flex items-center gap-2 border-t border-line pt-1.5">
              <div className="min-w-0 flex-1 text-[calc(10px*var(--fs))] leading-snug text-fog">
                <span className="font-semibold text-paper">{label}</span> · {hint}
                <br />
                {est[level].tooBig ? (
                  <span className="text-warn">zona troppo grande, stringi il poligono</span>
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
          {job.level === 'wide' ? 'Base scaricata' : est?.around ? 'Dettaglio e base attorno scaricati' : 'Dettaglio scaricato'} · {fmtMb(job.info.bytes / 1e6)}
          {job.info.failed > 0 && <span className="text-warn"> · {job.info.failed} pezzi non scaricati: riprova</span>}
        </div>
      )}
      {job?.status === 'error' && <div className="text-[calc(11px*var(--fs))] text-danger">Errore: {job.error}</div>}
    </div>
  )
}
