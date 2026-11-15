import { useEffect, useMemo, useRef, useState } from 'react'
import { Anchor, Bookmark, Crosshair, MapPin, Search, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore.js'
import { parseCoords, searchLocal, searchOnline } from '../../lib/placeSearch.js'
import { formatCoord } from '../../lib/geo.js'

/*
 * Lente sulla carta: coordinate, i miei marker e gli ancoraggi subito (anche
 * senza rete), luoghi OpenStreetMap con CERCA. Toccando un risultato la carta
 * ci va e lo segna con una spilla.
 */

const ICON = { coords: Crosshair, mark: Bookmark, anchorage: Anchor, place: MapPin }

export default function SearchBox({ onPick, onClose }) {
  const [text, setText] = useState('')
  const [online, setOnline] = useState({ q: null, list: [], state: 'idle' }) // idle | loading | done | error
  const inputRef = useRef(null)
  const marks = useAppStore((s) => s.marks)
  const view = useAppStore((s) => s.view)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const coords = useMemo(() => parseCoords(text), [text])
  const local = useMemo(() => (coords ? [] : searchLocal(text, marks)), [text, coords, marks])
  const results = [
    ...(coords ? [{ ...coords, name: `${formatCoord(coords.lat, true)}  ${formatCoord(coords.lon, false)}`, detail: 'Coordinate', kind: 'coords' }] : []),
    ...local,
    ...(online.q === text.trim() ? online.list : []),
  ]

  const searchNet = async () => {
    const q = text.trim()
    if (q.length < 2 || coords) return
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

  return (
    <div className="glass-strong absolute left-1/2 top-3 z-[1150] w-[min(520px,calc(100%-140px))] -translate-x-1/2 rounded-xl border border-line p-2 shadow-xl">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (coords) onPick(results[0])
          else searchNet()
        }}
      >
        <Search size={18} className="flex-none text-fog" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Località, marker o coordinate (44°10,5'N 8°19,6'E)"
          className="min-w-0 flex-1 bg-transparent py-2 text-[calc(14px*var(--fs))] text-paper outline-none placeholder:text-fog"
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button type="submit" className="touch flex-none rounded-md border border-phos bg-phos/15 px-3 py-2 text-[calc(11px*var(--fs))] font-bold tracking-widest text-phos">
          {coords ? 'VAI' : 'CERCA'}
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
                onClick={() => onPick(r)}
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
      {!coords && text.trim().length >= 2 && online.q !== text.trim() && (
        <div className="px-1 pt-1 text-[calc(10px*var(--fs))] text-fog">CERCA per i luoghi online (porti, paesi, capi, baie)</div>
      )}
    </div>
  )
}
