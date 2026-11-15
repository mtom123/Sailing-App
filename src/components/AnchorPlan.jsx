import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore.js'
import { ANCHOR_TYPES, BOTTOMS, KELLET_M_PER_KG, anchorCheck, windAhead } from '../lib/anchorPhysics.js'
import { depthAt } from '../lib/depthAt.js'
import { coastalDepthEstimate } from '../lib/depthEstimate.js'
import { habitatAt } from '../lib/liguriaHabitat.js'
import { fineDepthAt } from '../lib/imagePixels.js'
import { cardinal } from '../lib/geo.js'

/*
 * Prima di dare fondo: con ancora, catena e barca (Impostazioni), profondità
 * e fondo nel punto e la raffica massima prevista nelle prossime 12 ore,
 * dice se la catena basta (catenaria) e se l'ancora dovrebbe tenere, e il
 * raggio di rotazione da usare per l'allarme. Tenuta solo indicativa.
 */

const LEVEL = {
  ok: { color: 'var(--color-phos)', text: 'Ancoraggio adeguato' },
  warn: { color: 'var(--color-warn)', text: 'Al limite' },
  danger: { color: 'var(--color-danger)', text: 'Non sicuro' },
}
const PART = {
  ok: { color: 'var(--color-phos)', chain: 'basta', hold: 'con margine' },
  warn: { color: 'var(--color-warn)', chain: 'al limite', hold: 'poco margine' },
  danger: { color: 'var(--color-danger)', chain: 'non basta', hold: 'insufficiente' },
}
// Profondità, fondo e catena dell'ultimo calcolo, per il marker di ANCORA CADUTA
export const lastAnchorPlan = { current: null }
const CELL = 0.05 // blocchi delle griglie di dettaglio (fineDepthZones.js)
const SOUNDING_M = 100 // una mia misura vale fin qui

// La mia misura più vicina entro SOUNDING_M, con la distanza
function nearestSounding(list, lat, lon) {
  if (lat == null || !list?.length) return null
  const kx = 111320 * Math.cos((lat * Math.PI) / 180)
  let best = null
  for (const q of list) {
    const d = Math.hypot((q.lat - lat) * 111320, (q.lon - lon) * kx)
    if (d <= SOUNDING_M && (!best || d < best.distM)) best = { ...q, distM: d }
  }
  return best
}
const HOURS = 12

// Profondità dallo scandaglio, misurata dalla superficie
function sounderDepth(depthLive, boat) {
  if (!depthLive) return null
  if (depthLive.ref === 'chiglia') return depthLive.depth + (boat.draftM ?? 1.9)
  if (depthLive.ref === 'trasduttore') return depthLive.depth + 0.5
  return depthLive.depth
}

// Profondità della griglia di dettaglio (Liguria, Baleari) se già calcolata qui
async function fineDepth(lat, lon) {
  const i = Math.floor(lon / CELL)
  const j = Math.floor(lat / CELL)
  const name = `${i},${j}`
  const bbox = [j * CELL, i * CELL, (j + 1) * CELL, (i + 1) * CELL]
  for (const key of [name, `1:${name}`]) {
    const d = await fineDepthAt(key, bbox, lat, lon).catch(() => null)
    if (Number.isFinite(d)) return d
  }
  return null
}

// weather: la previsione oraria che l'app ha già (zona della carta), senza
// una richiesta in più al servizio meteo
export default function AnchorPlan({ position, depthLive, weather, onUseRadius }) {
  const boat = useAppStore((s) => s.boat)
  const soundings = useAppStore((s) => s.soundings)
  const [chart, setChart] = useState(null) // { depth, source }
  const [habitat, setHabitat] = useState(undefined)
  const [depthInput, setDepthInput] = useState('')
  const [depthFocus, setDepthFocus] = useState(false)
  const [bottomPick, setBottomPick] = useState(null)
  const [chainM, setChainM] = useState(null)
  const [gustInput, setGustInput] = useState('') // raffica inserita a mano (es. quella di domani)

  const lat = position?.lat
  const lon = position?.lon
  useEffect(() => {
    if (lat == null) return undefined
    let alive = true
    setChart(null)
    setHabitat(undefined)
    ;(async () => {
      const fine = await fineDepth(lat, lon)
      if (fine != null) {
        if (alive) setChart({ depth: fine, source: 'rilievo di dettaglio' })
      } else {
        // Vicino a riva EMODnet non vale (celle che mescolano mare e terra):
        // si stima tra la riva e il primo fondale affidabile al largo
        const d = await depthAt(lat, lon).catch(() => null)
        if (d?.reliable) {
          if (alive) setChart({ depth: d.depth, source: d.source })
        } else {
          const est = await coastalDepthEstimate(lat, lon).catch(() => null)
          if (alive && est?.harbor) setChart({ harbor: true })
          else if (alive && est) setChart(est)
          else if (alive && d) setChart({ depth: d.depth, source: `${d.source}, indicativa` })
        }
      }
      const h = await habitatAt(lat, lon).catch(() => null)
      if (alive) setHabitat(h)
    })()
    return () => {
      alive = false
    }
    // La posizione si arrotonda a ~50 m: all'ancora la barca gira e la stima
    // non deve saltare (1,6 → 1,2 → 0,6 m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat == null ? null : Math.round(lat / 0.0005), lon == null ? null : Math.round(lon / 0.0005)])

  const sounder = sounderDepth(depthLive, boat)
  const typed = Number(String(depthInput).replace(',', '.'))
  // Dove galleggia la barca c'è almeno il pescaggio: una carta che dice meno
  // sbaglia (e consiglierebbe poca catena), meglio non proporla
  const minFloat = (boat.draftM ?? 1.9) + 0.5
  const chartBad = !!chart && !chart.harbor && !position?.fromMap && chart.depth < minFloat
  const chartDepth = chartBad || chart?.harbor ? null : chart?.depth ?? null
  // Una profondità che ho scritto qui (entro 100 m) vale più della carta
  const mine = nearestSounding(soundings, lat, lon)
  const mineText = mine
    ? `tua misura del ${new Date(mine.at).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}${mine.distM >= 15 ? ` (a ${Math.round(mine.distM)} m)` : ''}`
    : null
  const depth = depthInput !== '' && typed > 0 ? typed : sounder ?? mine?.depth ?? chartDepth
  const depthSource =
    depthInput !== '' && typed > 0
      ? 'inserita: la ricordo per questo punto'
      : sounder != null
        ? 'scandaglio'
        : mine
          ? mineText
          : chart?.harbor
          ? 'in porto la carta non vale: scrivi quella dello scandaglio'
          : chartBad
          ? `la carta qui dà ${chart.depth.toFixed(1).replace('.', ',')} m, meno del pescaggio: non vale. Scrivi quella dello scandaglio`
          : chart?.source
  const bottom = bottomPick ?? habitat?.bottom ?? 'unknown'
  const wind = useMemo(() => windAhead(weather?.hourly, HOURS), [weather?.hourly])
  const typedGust = Number(String(gustInput).replace(',', '.'))
  const manualGust = gustInput !== '' && typedGust > 0 ? typedGust : null
  // Con la raffica inserita a mano l'onda prevista per oggi non vale: strappi medi
  const gustKn = manualGust ?? wind?.gustKn ?? null
  const waveM = manualGust != null ? null : wind?.waveM ?? null
  const h = (depth ?? 0) + (boat.bowHeightM ?? 1.2)
  const maxChain = boat.chainLengthM ?? 60
  const input = useMemo(() => {
    if (depth == null || gustKn == null) return null
    return {
      depthM: depth,
      bowHeightM: boat.bowHeightM ?? 1.2,
      chainMm: boat.chainMm ?? 10,
      anchorKg: boat.anchorKg ?? 20,
      anchorType: boat.anchorType ?? 'delta',
      bottom,
      gustKn,
      windageM2: boat.windageM2 ?? 12,
      loaM: boat.loaM ?? 12.5,
      kelletKg: boat.kelletOn ? boat.kelletKg ?? 0 : 0,
      waveM,
      snubberM: boat.snubberM ?? 4,
      snubberType: boat.snubberType ?? 'polyester',
    }
  }, [depth, gustKn, waveM, bottom, boat])
  // La catena consigliata non dipende da quella calata: la barra parte da lì
  // (e la segue) finché non la si sposta a mano
  const recommended = input ? anchorCheck({ ...input, chainM: maxChain }).chainNeededM : Math.round(Math.max(h * 5, 20))
  const chainAuto = chainM == null
  const chain = Math.max(10, Math.min(maxChain, chainM ?? recommended))
  const result = useMemo(() => (input ? anchorCheck({ ...input, chainM: chain }) : null), [input, chain])
  // Per il marker che ANCORA CADUTA salva da solo (senza ridisegnare l'app)
  lastAnchorPlan.current = { depth, depthSource, bottom, chainM: chain, at: lat == null ? null : { lat, lon } }

  const openSettings = () => {
    useAppStore.getState().setSettingsOpen(true)
    setTimeout(() => document.getElementById('settings-anchor')?.scrollIntoView({ block: 'start' }), 150)
  }
  const hhmm = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const field = 'rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-paper outline-none focus:border-phos'

  if (!position) {
    return <div className="text-[calc(10px*var(--fs))] text-fog">Serve la posizione (GPS) per pianificare l'ancoraggio.</div>
  }
  return (
    <div className="space-y-1.5 text-[calc(10px*var(--fs))]">
      <div className="flex items-center gap-1.5">
        <span className="w-16 text-fog">Profondità</span>
        {/* La stima (scandaglio o carta) si vede come valore; toccando il
            campo si svuota (stima in grigio) e si scrive; lasciato vuoto torna la stima */}
        <input
          type="text"
          inputMode="decimal"
          placeholder={depth != null ? depth.toFixed(1).replace('.', ',') : '—'}
          value={depthInput !== '' || depthFocus ? depthInput : depth != null ? depth.toFixed(1).replace('.', ',') : ''}
          onFocus={() => setDepthFocus(true)}
          onBlur={() => {
            setDepthFocus(false)
            // Si ricorda con la posizione: tornando qui la ripropone
            if (typed > 0 && lat != null) useAppStore.getState().addSounding({ lat, lon, depth: typed })
          }}
          onChange={(e) => setDepthInput(e.target.value)}
          className={`${field} w-14 text-right tabular-nums`}
          aria-label="Profondità in metri"
        />
        <span className="text-fog">m</span>
        <span className="min-w-0 flex-1 leading-tight text-fog-dim">{depthSource || 'nessun dato: inseriscila'}</span>
        {depthInput !== '' && (sounder != null || mine || chartDepth != null) && (
          <button type="button" onClick={() => setDepthInput('')} className="flex-none text-phos">
            {sounder != null ? 'Scandaglio' : mine ? 'Mia misura' : 'Carta'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-16 text-fog">Fondo</span>
        <select value={bottom} onChange={(e) => setBottomPick(e.target.value)} className={`${field} min-w-0 flex-1`}>
          {BOTTOMS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
              {habitat?.bottom === b.key && !bottomPick ? ' (Atlante Regione)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-16 text-fog">Catena</span>
        <input
          type="range"
          min="10"
          max={boat.chainLengthM ?? 60}
          step="1"
          value={chain}
          onChange={(e) => setChainM(Number(e.target.value))}
          className="min-w-0 flex-1"
        />
        <span className="w-20 text-right font-mono text-paper">
          {chain} m · {depth != null ? `${(chain / h).toFixed(1).replace('.', ',')}:1` : '—'}
        </span>
      </div>
      <div className="-mt-1 pl-[4.375rem] text-fog-dim">
        {chainAuto ? (
          recommended > maxChain ? (
            <span className="text-warn">Consigliati {recommended} m: a bordo ne hai {maxChain}</span>
          ) : (
            'Consigliata per fondo, raffica e pesce'
          )
        ) : (
          <button type="button" onClick={() => setChainM(null)} className="text-phos">
            Torna alla consigliata ({Math.min(recommended, maxChain)} m)
          </button>
        )}
      </div>
      <label className={`flex items-center gap-1.5 ${boat.kelletKg > 0 ? 'text-paper' : 'text-fog-dim'}`}>
        <input
          type="checkbox"
          disabled={!(boat.kelletKg > 0)}
          checked={!!boat.kelletOn && boat.kelletKg > 0}
          onChange={() => useAppStore.getState().setBoat({ kelletOn: !boat.kelletOn })}
          className="h-5 w-5 accent-[var(--color-phos)]"
        />
        <span>
          {boat.kelletKg > 0
            ? `Pesce messo (${String(boat.kelletKg).replace('.', ',')} kg, come ~${Math.round(boat.kelletKg * KELLET_M_PER_KG)} m di catena in più)`
            : 'Pesce: imposta il peso in Ancora ›'}
        </span>
      </label>
      <div className="flex items-center gap-1.5">
        <span className="w-16 text-fog">Raffica</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder={wind ? String(Math.round(wind.gustKn)) : '—'}
          value={gustInput}
          onChange={(e) => setGustInput(e.target.value)}
          className={`${field} w-14 text-right tabular-nums`}
          aria-label="Raffica in nodi"
        />
        <span className="text-fog">kn</span>
        <span className="min-w-0 flex-1 truncate text-fog-dim">
          {manualGust != null ? 'inserita (es. quella di domani)' : wind ? `prevista nelle prossime ${HOURS} h` : 'inseriscila'}
        </span>
        {manualGust != null && (
          <button type="button" onClick={() => setGustInput('')} className="flex-none text-phos">
            Prevista
          </button>
        )}
      </div>
      <div className="text-fog">
        {wind
          ? `Prossime ${HOURS} h: raffica max ${Math.round(wind.gustKn)} kn alle ${hhmm(wind.at)}${
              Number.isFinite(wind.dir) ? ` da ${cardinal(wind.dir)}` : ''
            }${wind.dirSpan >= 45 ? ` · il vento ruota di ${Math.round(wind.dirSpan)}°` : ''}${
              Number.isFinite(wind.waveM) ? ` · onda fino a ${wind.waveM.toFixed(1).replace('.', ',')} m` : ''
            }`
          : weather?.loading
          ? 'Previsione in arrivo…'
          : 'Previsione del vento non disponibile'}
      </div>

      {result && (
        <div className="rounded-md border p-2" style={{ borderColor: LEVEL[result.level].color }}>
          <div className="font-bold" style={{ color: LEVEL[result.level].color }}>
            {LEVEL[result.level].text}
          </div>
          <div className="mt-0.5 grid grid-cols-2 gap-x-2">
            <span>
              Catena: <b style={{ color: PART[result.chainLevel].color }}>{PART[result.chainLevel].chain}</b>
            </span>
            <span>
              Tenuta ancora: <b style={{ color: PART[result.holdLevel].color }}>{PART[result.holdLevel].hold}</b>
            </span>
          </div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-paper">
            {result.reasons.length ? result.reasons.map((r) => <li key={r}>{r}</li>) : <li>Alla raffica resta catena sul fondo e la tenuta ha margine</li>}
          </ul>
          <div className="mt-1 grid grid-cols-2 gap-x-2 text-fog tabular-nums">
            <span>Carico alla raffica</span>
            <span className="text-right text-paper">~{Math.round(result.loadKgf)} kg</span>
            <span>Tenuta indicativa</span>
            <span className="text-right text-paper">~{Math.round(result.holdKgf)} kg</span>
            <span>Strappi sul carico</span>
            <span className="text-right text-paper">
              +{Math.round((result.shock.factor - 1) * 100)}%{result.shock.absorbed >= 0.05 ? ` (smorzati ${Math.round(result.shock.absorbed * 100)}%)` : ''}
            </span>
            {result.holdMaxKn != null && (
              <>
                <span>Regge, con margine, fino a</span>
                <span className="text-right text-paper">~{Math.round(result.holdMaxKn)} kn di raffica</span>
                <span>Senza margine arerebbe verso</span>
                <span className="text-right text-paper">~{Math.round(result.dragKn)} kn</span>
              </>
            )}
            <span>Catena consigliata</span>
            <span className="text-right text-paper">{result.chainNeededM} m</span>
            <span>Raggio di rotazione</span>
            <span className="text-right text-paper">{Math.round(result.radiusM)} m</span>
          </div>
          <button
            type="button"
            onClick={() => onUseRadius(Math.round(result.radiusM))}
            className="touch mt-1.5 w-full rounded-md border border-line bg-surface py-1.5 font-semibold text-paper"
          >
            USA {Math.round(result.radiusM)} M COME RAGGIO ALLARME
          </button>
        </div>
      )}
      <button type="button" onClick={openSettings} className="flex w-full justify-between text-left text-fog hover:text-paper">
        <span className="truncate">
          {ANCHOR_TYPES.find((t) => t.key === boat.anchorType)?.label.split(' (')[0] ?? 'Ancora'} {boat.anchorKg ?? 20} kg · catena{' '}
          {boat.chainMm ?? 10} mm × {boat.chainLengthM ?? 60} m
        </span>
        <span className="flex-none text-phos">Ancora ›</span>
      </button>
      <div className="text-fog-dim">
        Tenuta e carico sono stime: dopo aver dato fondo prova sempre in marcia indietro, e tieni d'occhio scandaglio e allarme.
      </div>
    </div>
  )
}
