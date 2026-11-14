import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/useAppStore.js'
import { ANCHOR_TYPES, BOTTOMS, KELLET_M_PER_KG, anchorCheck, windAhead } from '../lib/anchorPhysics.js'
import { depthAt } from '../lib/depthAt.js'
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
const CELL = 0.05 // blocchi delle griglie di dettaglio (fineDepthZones.js)
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
  const [chart, setChart] = useState(null) // { depth, source }
  const [habitat, setHabitat] = useState(undefined)
  const [depthInput, setDepthInput] = useState('')
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
        const d = await depthAt(lat, lon).catch(() => null)
        if (alive && d) setChart({ depth: d.depth, source: d.reliable ? d.source : `${d.source}, indicativa` })
      }
      const h = await habitatAt(lat, lon).catch(() => null)
      if (alive) setHabitat(h)
    })()
    return () => {
      alive = false
    }
    // La posizione si arrotonda a ~10 m: non si ricalcola a ogni fix
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat == null ? null : lat.toFixed(4), lon == null ? null : lon.toFixed(4)])

  const sounder = sounderDepth(depthLive, boat)
  const typed = Number(String(depthInput).replace(',', '.'))
  const depth = depthInput !== '' && typed > 0 ? typed : sounder ?? chart?.depth ?? null
  const depthSource = depthInput !== '' && typed > 0 ? 'inserita' : sounder != null ? 'scandaglio' : chart?.source
  const bottom = bottomPick ?? habitat?.bottom ?? 'unknown'
  const wind = useMemo(() => windAhead(weather?.hourly, HOURS), [weather?.hourly])
  const typedGust = Number(String(gustInput).replace(',', '.'))
  const manualGust = gustInput !== '' && typedGust > 0 ? typedGust : null
  // Con la raffica inserita a mano l'onda prevista per oggi non vale: strappi medi
  const gustKn = manualGust ?? wind?.gustKn ?? null
  const waveM = manualGust != null ? null : wind?.waveM ?? null
  const h = (depth ?? 0) + (boat.bowHeightM ?? 1.2)
  const chain = Math.min(boat.chainLengthM ?? 60, chainM ?? Math.round(Math.max(h * 5, 20)))

  const result = useMemo(() => {
    if (depth == null || gustKn == null) return null
    return anchorCheck({
      depthM: depth,
      bowHeightM: boat.bowHeightM ?? 1.2,
      chainM: chain,
      chainMm: boat.chainMm ?? 10,
      anchorKg: boat.anchorKg ?? 20,
      anchorType: boat.anchorType ?? 'delta',
      bottom,
      gustKn,
      windageM2: boat.windageM2 ?? 12,
      loaM: boat.loaM ?? 12.5,
      kelletKg: boat.kelletOn ? boat.kelletKg ?? 0 : 0,
      waveM,
    })
  }, [depth, gustKn, waveM, chain, bottom, boat])

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
        <input
          type="text"
          inputMode="decimal"
          placeholder={depth != null ? depth.toFixed(1).replace('.', ',') : '—'}
          value={depthInput}
          onChange={(e) => setDepthInput(e.target.value)}
          className={`${field} w-14 text-right tabular-nums`}
          aria-label="Profondità in metri"
        />
        <span className="text-fog">m</span>
        <span className="min-w-0 flex-1 truncate text-fog-dim">{depthSource || 'nessun dato: inseriscila'}</span>
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
            ? `Pesce messo (${boat.kelletKg} kg, come ~${Math.round(boat.kelletKg * KELLET_M_PER_KG)} m di catena in più)`
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
            {result.holdMaxKn != null && (
              <>
                <span>L'ancora regge fino a</span>
                <span className="text-right text-paper">~{Math.round(result.holdMaxKn)} kn di raffica</span>
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
