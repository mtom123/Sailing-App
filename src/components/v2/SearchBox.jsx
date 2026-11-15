import { useEffect, useMemo, useRef, useState } from 'react'
import { Anchor, Bookmark, Crosshair, MapPin, Search, TriangleAlert, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore.js'
import { parseCoords, parseZone, searchLocal, searchOnline } from '../../lib/placeSearch.js'
import { formatCoord } from '../../lib/geo.js'

/*
 * Lente sulla carta: coordinate, i miei marker e gli ancoraggi subito (anche
 * senza rete), luoghi OpenStreetMap con CERCA. Toccando un risultato la carta
 * ci va e lo segna con una spilla. ZONA apre i riquadri dei punti di un avviso
 * ai naviganti o di un'ordinanza: la zona diventa vietata per allarme e rotte.
 */

const fmt = ([lat, lon]) => `${formatCoord(lat, true)}  ${formatCoord(lon, false)}`
const LETTER = (i) => String.fromCharCode(65 + i)
const MAX_POINTS = 12

/** Riquadri dei punti della zona, nome e scadenza */
function ZoneForm({ initial, onPick, onBack }) {
  const [name, setName] = useState(initial?.name || '')
  const [pts, setPts] = useState(() => {
    const list = (initial?.points || []).map(fmt)
    return [...list, ...Array(Math.max(0, 4 - list.length)).fill('')]
  })
  const [until, setUntil] = useState('') // datetime-local; vuoto = finché non la togli
  const firstRef = useRef(null)
  useEffect(() => {
    if (!initial) firstRef.current?.focus()
  }, [initial])

  const parsed = pts.map((t) => (t.trim() ? parseCoords(t) : null))
  const bad = pts.some((t, i) => t.trim() && !parsed[i])
  const points = parsed.filter(Boolean).map((p) => [p.lat, p.lon])
  const ready = points.length >= 3 && !bad

  const setPoint = (i, value) => {
    // Incollato tutto l'avviso in un riquadro: si distribuisce sui riquadri
    const z = parseZone(value)
    if (z) {
      setPts([...z.points.map(fmt), ...Array(Math.max(0, 4 - z.points.length)).fill('')])
      if (z.name && !name) setName(z.name)
      return
    }
    setPts((list) => list.map((t, j) => (j === i ? value : t)))
  }

  const input =
    'min-w-0 flex-1 rounded-md border border-line bg-transparent px-2 py-1.5 text-[calc(13px*var(--fs))] text-paper outline-none placeholder:text-fog focus:border-phos'
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (ready)
          onPick({
            kind: 'zone',
            zoneName: name.trim(),
            points,
            until: until ? new Date(until).getTime() : null,
          })
      }}
    >
      <div className="flex items-center gap-2">
        <TriangleAlert size={18} className="flex-none text-danger" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome (es. Esercitazione, Lavori porto)" className={input} />
        <button type="button" onClick={onBack} className="touch flex-none p-2 text-fog" aria-label="Torna alla ricerca">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[45vh] overflow-y-auto">
        {pts.map((t, i) => (
          <div key={i} className="py-0.5">
            <div className="flex items-center gap-2">
              <span className="w-5 flex-none text-center text-[calc(13px*var(--fs))] font-bold text-danger">{LETTER(i)}</span>
              <input
                ref={i === 0 ? firstRef : undefined}
                value={t}
                onChange={(e) => setPoint(i, e.target.value)}
                placeholder={i === 0 ? '44 10,5 N 8 19,6 E' : 'lat N  lon E'}
                className={input}
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
            {/* Come l'ha letto: si vede subito se un numero è sbagliato */}
            {t.trim() && (
              <div className={`pl-7 pt-0.5 font-mono text-[calc(10px*var(--fs))] ${parsed[i] ? 'text-fog' : 'text-danger'}`}>
                {parsed[i] ? `${formatCoord(parsed[i].lat, true)}   ${formatCoord(parsed[i].lon, false)}` : 'Non la leggo: gradi primi N, poi gradi primi E'}
              </div>
            )}
          </div>
        ))}
      </div>
      {pts.length < MAX_POINTS && (
        <button type="button" onClick={() => setPts([...pts, ''])} className="touch self-start px-1 text-[calc(11px*var(--fs))] font-semibold text-phos">
          + Aggiungi punto
        </button>
      )}
      <label className="flex flex-wrap items-center gap-2 border-t border-line px-1 pt-1.5 text-[calc(11px*var(--fs))] text-fog">
        <span className="font-semibold text-paper">Valida fino al</span>
        <input
          type="datetime-local"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="rounded-md border border-line bg-transparent px-2 py-1 text-paper"
        />
        <span>{until ? 'poi si toglie da sola' : 'vuoto: finché non la togli'}</span>
      </label>
      <button
        type="submit"
        disabled={!ready}
        className="touch mt-0.5 rounded-md border border-danger bg-danger/15 py-2 text-[calc(11px*var(--fs))] font-bold tracking-widest text-danger disabled:opacity-40"
      >
        {ready ? `DISEGNA LA ZONA (${points.length} PUNTI)` : bad ? 'CORREGGI I PUNTI IN ROSSO' : 'SERVONO ALMENO 3 PUNTI'}
      </button>
    </form>
  )
}

const ICON = {
  coords: Crosshair,
  zone: TriangleAlert,
  mark: Bookmark,
  anchorage: Anchor,
  place: MapPin,
}

export default function SearchBox({ onPick, onClose }) {
  const [text, setText] = useState('')
  const [zoneForm, setZoneForm] = useState(null) // { initial } con i riquadri dei punti aperti
  const [online, setOnline] = useState({ q: null, list: [], state: 'idle' }) // idle | loading | done | error
  const inputRef = useRef(null)
  const marks = useAppStore((s) => s.marks)
  const view = useAppStore((s) => s.view)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const coords = useMemo(() => parseCoords(text), [text])
  const zone = useMemo(() => (coords ? null : parseZone(text)), [text, coords])
  const fixed = coords || zone
  const local = useMemo(() => (fixed ? [] : searchLocal(text, marks)), [text, fixed, marks])
  const results = [
    ...(zone
      ? [
          {
            ...zone,
            lat: zone.points[0][0],
            lon: zone.points[0][1],
            name: `Zona vietata da ${zone.points.length} punti${zone.name ? ` · ${zone.name}` : ''}`,
            detail: 'Tocca per controllare i punti e la scadenza',
            kind: 'zone',
          },
        ]
      : []),
    ...(coords
      ? [
          {
            ...coords,
            name: `${formatCoord(coords.lat, true)}  ${formatCoord(coords.lon, false)}`,
            detail: 'Coordinate',
            kind: 'coords',
          },
        ]
      : []),
    ...local,
    ...(online.q === text.trim() ? online.list : []),
  ]

  const searchNet = async () => {
    const q = text.trim()
    if (q.length < 2 || fixed) return
    setOnline({ q, list: [], state: 'loading' })
    try {
      const list = await searchOnline(q, view?.bounds)
      setOnline({ q, list, state: 'done' })
    } catch {
      setOnline({ q, list: [], state: 'error' })
    }
  }

  const status =
    online.q === text.trim() && online.state === 'loading'
      ? 'Cerco…'
      : online.q === text.trim() && online.state === 'error'
        ? 'Ricerca online non disponibile (rete?): restano coordinate, marker e ancoraggi'
        : online.q === text.trim() && online.state === 'done' && !online.list.length
          ? 'Nessun luogo trovato'
          : null

  // Una zona riconosciuta nel testo si apre nei riquadri, per controllarla
  const pick = (r) => (r.kind === 'zone' ? setZoneForm({ initial: { name: zone?.name, points: r.points } }) : onPick(r))

  return (
    <div className="glass-strong absolute left-1/2 top-3 z-[1150] w-[min(520px,calc(100%-140px))] -translate-x-1/2 rounded-xl border border-line p-2 shadow-xl">
      {zoneForm ? (
        <ZoneForm initial={zoneForm.initial} onPick={onPick} onBack={() => setZoneForm(null)} />
      ) : (
        <>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (fixed) pick(results[0])
              else searchNet()
            }}
          >
            <Search size={18} className="flex-none text-fog" />
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Località, marker, coordinate o i punti di un avviso"
              className="min-w-0 flex-1 bg-transparent py-2 text-[calc(14px*var(--fs))] text-paper outline-none placeholder:text-fog"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button
              type="submit"
              className="touch flex-none rounded-md border border-phos bg-phos/15 px-3 py-2 text-[calc(11px*var(--fs))] font-bold tracking-widest text-phos"
            >
              {fixed ? 'VAI' : 'CERCA'}
            </button>
            <button
              type="button"
              onClick={() => setZoneForm({ initial: null })}
              className="touch flex flex-none items-center gap-1 rounded-md border border-danger/60 px-2 py-2 text-[calc(11px*var(--fs))] font-bold tracking-widest text-danger"
              title="Zona da un avviso ai naviganti"
            >
              <TriangleAlert size={14} /> ZONA
            </button>
            <button type="button" onClick={onClose} className="touch flex-none p-2 text-fog" aria-label="Chiudi ricerca">
              <X size={18} />
            </button>
          </form>
          {(results.length > 0 || status) && (
            <div className="mt-1.5 max-h-[50vh] overflow-y-auto border-t border-line pt-1">
              {results.map((r, i) => {
                const Icon = ICON[r.kind] || MapPin
                return (
                  <button
                    key={`${r.kind}-${i}-${r.lat}-${r.lon}`}
                    type="button"
                    onClick={() => pick(r)}
                    className="touch flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-phos/10"
                  >
                    <Icon size={16} className="flex-none text-phos" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[calc(13px*var(--fs))] font-semibold text-paper">{r.name}</span>
                      {r.detail && <span className="block truncate text-[calc(10px*var(--fs))] text-fog">{r.detail}</span>}
                    </span>
                  </button>
                )
              })}
              {status && <div className="px-2 py-1.5 text-[calc(11px*var(--fs))] text-fog">{status}</div>}
            </div>
          )}
          {!fixed && text.trim().length >= 2 && online.q !== text.trim() && (
            <div className="px-1 pt-1 text-[calc(10px*var(--fs))] text-fog">
              CERCA per i luoghi online (porti, paesi, capi, baie). ZONA per i punti di un avviso ai naviganti
            </div>
          )}
        </>
      )}
    </div>
  )
}
