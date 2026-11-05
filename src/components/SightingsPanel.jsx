import { useState } from 'react'
import { ChevronLeft, Search } from 'lucide-react'
import { MarkEditor, MarkIcon, MarkRow } from './MarksPanel.jsx'
import { newSighting, searchMarks } from '../lib/marks.js'
import { SIGHTING_GROUPS, SIGHTING_RULES, SPECIES, isSighting } from '../lib/sightings.js'
import { useAppStore } from '../store/useAppStore.js'

/*
 * Avvistamenti: si sceglie la specie, si legge la scheda di identificazione e
 * si segna dove la barca è adesso (o sulla carta, senza GPS). Sotto, quelli
 * già segnati, dal più recente.
 */

const PAGE = 100
const btn = 'touch flex items-center justify-center gap-1.5 rounded-md border py-2.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest'

function Fact({ label, text }) {
  if (text === '—') return null
  return (
    <div className="border-t border-line py-2">
      <div className="label pb-0.5">{label}</div>
      <div className="text-[calc(12px*var(--fs))] leading-relaxed text-paper">{text}</div>
    </div>
  )
}

function SpeciesCard({ species, onBack, onLog }) {
  return (
    <div className="p-2">
      <button type="button" onClick={onBack} className="touch flex items-center gap-1 pb-2 text-[calc(11px*var(--fs))] font-semibold text-fog">
        <ChevronLeft size={14} /> Specie
      </button>
      <div className="flex items-center gap-3 pb-3">
        <MarkIcon type={species.id} size={72} />
        <div className="min-w-0">
          <div className="text-[calc(16px*var(--fs))] font-bold leading-tight text-paper">{species.label}</div>
          {species.latin && <div className="pt-0.5 text-[calc(11px*var(--fs))] italic text-fog">{species.latin}</div>}
          {species.rare && <div className="pt-0.5 text-[calc(10px*var(--fs))] font-semibold text-warn">Presenza occasionale</div>}
        </div>
      </div>
      <Fact label="Lunghezza" text={species.size} />
      <Fact label="Come riconoscerlo" text={species.look} />
      <Fact label="Dove" text={species.where} />
      <Fact label="Si confonde con" text={species.similar} />
      <button type="button" onClick={onLog} className={`${btn} mt-2 w-full border-phos bg-phos/15 text-phos`}>
        SEGNA AVVISTAMENTO
      </button>
      <div className="pt-2 text-[calc(10px*var(--fs))] leading-relaxed text-fog">{SIGHTING_RULES}</div>
    </div>
  )
}

export default function SightingsPanel({ geo, depthLive, draftM }) {
  const marks = useAppStore((s) => s.marks)
  const markEdit = useAppStore((s) => s.markEdit)
  const [card, setCard] = useState(null)
  const [text, setText] = useState('')
  const [limit, setLimit] = useState(PAGE)

  if (markEdit) return <MarkEditor mark={markEdit} geo={geo} depthLive={depthLive} draftM={draftM} />

  const log = (species) => {
    setCard(null)
    if (geo.lat != null) useAppStore.setState({ markEdit: newSighting(species.id, geo) })
    else useAppStore.setState({ markEdit: newSighting(species.id, {}), markPicking: true, activeDrawer: null })
  }
  if (card) return <SpeciesCard species={card} onBack={() => setCard(null)} onLog={() => log(card)} />

  const seen = marks.filter(isSighting)
  const found = searchMarks(seen, { type: null, text }, { lat: null })
  const open = (mark) => {
    useAppStore.setState((s) => ({ markEdit: mark, follow: false, view: { ...s.view, center: { lat: mark.lat, lon: mark.lon } } }))
  }

  return (
    <div className="p-2">
      <div className="text-[calc(14px*var(--fs))] font-bold text-paper">Avvistamenti</div>
      <div className="pb-1 text-[calc(10px*var(--fs))] text-fog">Tocca una specie per la scheda di identificazione.</div>
      {SIGHTING_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="label pb-1 pt-2">{g.label}</div>
          <div className="grid grid-cols-4 gap-1">
            {SPECIES.filter((s) => s.group === g.id).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCard(s)}
                className="touch flex flex-col items-center gap-0.5 rounded-md border border-line bg-surface px-0.5 py-1.5 text-[calc(9px*var(--fs))] font-semibold leading-tight text-paper"
              >
                <MarkIcon type={s.id} size={36} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {seen.length > 0 && (
        <>
          <div className="label pb-1 pt-3">{seen.length} avvistamenti segnati</div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-3 text-fog" />
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cerca negli avvistamenti"
              className="w-full min-w-0 rounded-md border border-line bg-surface py-2.5 pl-8 pr-2.5 text-xs text-paper outline-none focus:border-phos"
            />
          </div>
          {found.slice(0, limit).map((m) => (
            <MarkRow key={m.id} mark={m} geo={geo} onOpen={() => open(m)} />
          ))}
          {found.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE)} className={`${btn} mt-2 w-full border-line bg-surface text-paper`}>
              MOSTRA ALTRI
            </button>
          )}
        </>
      )}
    </div>
  )
}
