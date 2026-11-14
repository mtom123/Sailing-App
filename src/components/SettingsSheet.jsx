import { Radio, Ship, Wifi, X, Sailboat, Gauge, Database, Activity, Upload, FileText, Trash, Type, Cable, Layers, Plus } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore.js'
import { BOAT_LIBRARY, registerCustomPolar, listAvailablePolars } from '../routing/polarSolver.js'
import { parsePolarFile, saveCustomPolar, listCustomPolars } from '../lib/polarParser.js'
import PolarViewer from './PolarViewer.jsx'
import { clearStalls, readStalls } from '../lib/stallLog.js'
import { clearStarts, readStarts } from '../lib/startLog.js'
import { lastBackupAt, makeBackup, markBackupDone, readBackup, restoreBackup } from '../lib/backup.js'
import { shareFile } from '../lib/route.js'
import { DEFAULT_DEPTH_ZONES } from '../lib/isobaths.js'

/*
 * Foglio impostazioni: tutto ciò che si configura una volta e poi si dimentica
 * (sorgente AIS, bridge NMEA, allarme raffica, polar barca, dati offline) esce
 * dalla plancia e vive qui.
 */

const AIS_MODES = [
  { id: 'sim', label: 'DEMO', icon: Ship, hint: 'Flotta simulata per provare l\'app' },
  { id: 'nmea', label: 'NMEA', icon: Wifi, hint: 'AIS reale via bridge WebSocket di bordo' },
  { id: 'aishub', label: 'AISHUB', icon: Radio, hint: 'Feed AISHub con username personale' },
  { id: 'signalk', label: 'SIGNAL K', icon: Cable, hint: 'AIS dal server di bordo (A027+ via Raspberry)' },
]

const SK_DEMO = 'wss://demo.signalk.org'

// Cosa arriva dagli strumenti, in breve
function signalKSummary(data, vessels) {
  const parts = []
  if (data.lat != null) parts.push('GPS')
  if (data.depthKeel != null || data.depthTransducer != null || data.depthSurface != null) parts.push('profondità')
  if (data.stw != null) parts.push('velocità')
  if (data.aws != null) parts.push('vento')
  if (data.hdg != null || data.hdgMag != null) parts.push('prua')
  if (vessels) parts.push(`${vessels} navi AIS`)
  return parts.length ? parts.join(' · ') : 'collegato, in attesa dei dati'
}

// Blocchi registrati sull'iPad: si copiano e si mandano per capirne la causa
const PROPULSION = [
  { key: 'sail', label: 'VELA', hint: 'Polari, vento, onda e corrente. Motore solo senza vento.' },
  { key: 'hybrid', label: 'VELA E MOTORE', hint: 'A vela; a motore quando verso la rotta si andrebbe più piano della soglia.' },
  { key: 'motor', label: 'MOTORE', hint: 'Velocità del motore, frenata dall\'onda, più la corrente. Il vento conta solo come limite di sicurezza.' },
]

const BACKUP_DUE_DAYS = 14

function BackupSection() {
  const [ready, setReady] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [last, setLast] = useState(lastBackupAt)
  const fileRef = useRef(null)
  const btn = 'touch flex-1 rounded-md border border-line bg-surface py-2 text-[calc(10px*var(--fs))] font-semibold tracking-widest text-paper disabled:opacity-40'
  const due = !last || Date.now() - last > BACKUP_DUE_DAYS * 86400000
  const prepare = async () => {
    setBusy(true)
    setNote(null)
    try {
      setReady(await makeBackup())
    } catch (err) {
      setNote(`Copia non riuscita: ${err.message}`)
    }
    setBusy(false)
  }
  // Tocco a parte: dopo un'attesa lunga l'iPad non apre il foglio di condivisione
  const save = async () => {
    if (await shareFile(ready.filename, ready.blob, 'application/octet-stream')) {
      markBackupDone()
      setLast(lastBackupAt())
      setNote('Copia salvata. Controlla che il file sia in File o iCloud Drive.')
      setReady(null)
    }
  }
  const load = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setNote(null)
    try {
      const backup = await readBackup(file)
      const withSettings = window.confirm('Sostituire anche barca e impostazioni con quelle della copia? Annulla per aggiungere solo marker, foto, rotte e tracce.')
      const n = await restoreBackup(backup, { withSettings })
      setNote(`Aggiunti: ${n.marks} marker, ${n.photos} foto, ${n.routes} rotte, ${n.tracks} tracce.`)
    } catch (err) {
      setNote(`Caricamento non riuscito: ${err.message}`)
    }
    setBusy(false)
  }
  return (
    <Section title="Copia di sicurezza">
      <div className={`pb-1.5 text-[calc(10px*var(--fs))] leading-relaxed ${due ? 'text-warn' : 'text-fog'}`}>
        {last ? `Ultima copia: ${new Date(last).toLocaleDateString('it-IT')}.` : 'Nessuna copia salvata.'} Marker, foto, rotte, tracce, polari e impostazioni in un file da tenere su File o iCloud Drive. Le carte offline non sono incluse.
      </div>
      <div className="flex gap-1.5">
        {ready ? (
          <button type="button" onClick={save} className={btn}>
            SALVA IL FILE ({(ready.blob.size / 1048576).toFixed(1).replace('.', ',')} MB)
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={prepare} className={btn}>
            {busy ? 'ATTENDI…' : 'PREPARA COPIA'}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={btn}>
          CARICA COPIA
        </button>
      </div>
      <input ref={fileRef} type="file" onChange={load} className="hidden" aria-label="File della copia di sicurezza" />
      {ready && (
        <div className="pt-1.5 text-[calc(10px*var(--fs))] leading-relaxed text-fog">
          Pronta: {ready.counts.marks} marker, {ready.counts.photos} foto, {ready.counts.routes} rotte, {ready.counts.tracks} tracce.
        </div>
      )}
      {note && <div className="pt-1.5 text-[calc(10px*var(--fs))] leading-relaxed text-paper">{note}</div>}
    </Section>
  )
}

function StartsSection() {
  const [starts, setStarts] = useState(readStarts)
  const [copied, setCopied] = useState(false)
  const btn = 'touch flex-1 rounded-md border border-line bg-surface py-2 text-[calc(10px*var(--fs))] font-semibold tracking-widest text-paper disabled:opacity-40'
  const last = starts[0]
  return (
    <Section title="Tempi di apertura">
      <div className="pb-1.5 text-[calc(10px*var(--fs))] leading-relaxed text-fog">
        {last ? `${starts.length} registrate. Ultima: pronta in ${(last.ready / 1000).toFixed(1).replace('.', ',')} s.` : 'Nessuna apertura registrata.'}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={!starts.length}
          onClick={async () => {
            await navigator.clipboard.writeText(JSON.stringify(starts, null, 1))
            setCopied(true)
          }}
          className={btn}
        >
          {copied ? 'COPIATI' : 'COPIA'}
        </button>
        <button
          type="button"
          disabled={!starts.length}
          onClick={() => {
            clearStarts()
            setStarts([])
            setCopied(false)
          }}
          className={btn}
        >
          AZZERA
        </button>
      </div>
    </Section>
  )
}

function StallsSection() {
  const [stalls, setStalls] = useState(readStalls)
  const [copied, setCopied] = useState(false)
  const btn = 'touch flex-1 rounded-md border border-line bg-surface py-2 text-[calc(10px*var(--fs))] font-semibold tracking-widest text-paper disabled:opacity-40'
  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(stalls, null, 1))
    setCopied(true)
  }
  return (
    <Section title="Blocchi della carta">
      <div className="pb-1.5 text-[calc(10px*var(--fs))] leading-relaxed text-fog">
        {stalls.length
          ? `${stalls.length} registrati, il più lungo di ${(Math.max(...stalls.map((s) => s.ms)) / 1000).toFixed(1).replace('.', ',')} s. Fino alla chiusura dell'app: ${stalls.filter((s) => s.closed).length}. Ultimo a scala ${stalls[0].scale}.`
          : 'Nessun blocco registrato.'}
      </div>
      <div className="flex gap-1.5">
        <button type="button" disabled={!stalls.length} onClick={copy} className={btn}>
          {copied ? 'COPIATI' : 'COPIA'}
        </button>
        <button
          type="button"
          disabled={!stalls.length}
          onClick={() => {
            clearStalls()
            setStalls([])
            setCopied(false)
          }}
          className={btn}
        >
          AZZERA
        </button>
      </div>
    </Section>
  )
}

// Fasce di profondità colorate sulla carta (ancoraggio), come le "aree di
// pesca" di Navionics: nome, da–a metri, colore, accesa o spenta
function DepthZonesSection() {
  const zones = useAppStore((s) => s.depthZones)
  const setZones = useAppStore((s) => s.setDepthZones)
  const layerOn = useAppStore((s) => s.layers.depthZones)
  const toggleLayer = useAppStore((s) => s.toggleLayer)
  const update = (id, patch) => setZones(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)))
  const num = (v) => {
    const n = Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }
  const add = () => {
    const last = zones.reduce((m, z) => Math.max(m, z.to), 0)
    setZones([...zones, { id: `z${Date.now()}`, name: 'Nuova fascia', from: last, to: last + 5, color: '#22b8e6', on: true }])
  }
  const field = 'min-w-0 rounded-md border border-line bg-surface px-1.5 py-2 text-xs text-paper outline-none focus:border-phos'
  return (
    <Section title="Fasce di profondità" icon={Layers}>
      <label className="mb-2 flex items-center justify-between gap-2 text-xs text-paper">
        <span>Mostra sulla carta (da circa 3 miglia di scala)</span>
        <input type="checkbox" checked={!!layerOn} onChange={() => toggleLayer('depthZones')} className="h-5 w-5 accent-[var(--color-phos)]" />
      </label>
      <div className="space-y-1.5">
        {zones.map((z) => (
          <div key={z.id} className="flex items-center gap-1.5">
            <input type="checkbox" checked={z.on} onChange={() => update(z.id, { on: !z.on })} className="h-5 w-5 flex-none accent-[var(--color-phos)]" />
            <input
              type="color"
              value={z.color}
              onChange={(e) => update(z.id, { color: e.target.value })}
              className="h-8 w-8 flex-none cursor-pointer rounded border border-line bg-transparent p-0"
              aria-label={`Colore ${z.name}`}
            />
            <input type="text" value={z.name} onChange={(e) => update(z.id, { name: e.target.value })} className={`${field} flex-1`} />
            <input
              type="text"
              inputMode="decimal"
              value={z.from}
              onChange={(e) => update(z.id, { from: num(e.target.value) })}
              className={`${field} w-11 text-right tabular-nums`}
              aria-label="Da metri"
            />
            <span className="text-fog">–</span>
            <input
              type="text"
              inputMode="decimal"
              value={z.to}
              onChange={(e) => update(z.id, { to: num(e.target.value) })}
              className={`${field} w-11 text-right tabular-nums`}
              aria-label="A metri"
            />
            <span className="text-[calc(10px*var(--fs))] text-fog">m</span>
            <button
              type="button"
              onClick={() => setZones(zones.filter((x) => x.id !== z.id))}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-line text-fog hover:text-danger"
              aria-label={`Togli ${z.name}`}
            >
              <Trash size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <button type="button" onClick={add} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-line py-2 text-xs text-paper hover:bg-raised">
          <Plus size={13} /> Aggiungi fascia
        </button>
        <button type="button" onClick={() => setZones(DEFAULT_DEPTH_ZONES)} className="flex-1 rounded-md border border-line py-2 text-xs text-fog hover:bg-raised">
          Ripristina le predefinite
        </button>
      </div>
      <div className="pt-1 text-[calc(10px*var(--fs))] text-fog-dim">
        Colori pieni: fasce di dettaglio (griglia di ~10 m ricostruita dalle isobate dei rilievi), solo dove il rilievo c'è. In
        Liguria dai rilievi multibeam della Regione, con isobate ogni metro o ogni 5 m a seconda del tratto: dove la prima è a 5 m,
        più sotto la profondità è stimata tra la riva e l'isobata. A Ibiza, Formentera e Menorca dai rilievi MITECO del 2008, con
        un'isobata ogni metro da 1 m (Mallorca e Cabrera escluse). Colori tenui: griglia europea EMODnet (~115 m), solo indicativa
        sotto costa. Controlla sempre lo scandaglio: fanno fede le carte ufficiali.
      </div>
    </Section>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="border-b border-line p-3">
      <div className="label pb-2 flex items-center gap-1.5">
        {Icon && <Icon size={11} />}
        {title}
      </div>
      {children}
    </div>
  )
}

// [etichetta, fattore] per la dimensione del testo
const TEXT_SIZES = [
  ['Normale', 1],
  ['Grande', 1.2],
  ['Molto grande', 1.4],
  ['Massimo', 1.6],
]

export default function SettingsSheet({
  open,
  onClose,
  aisMode,
  onAisModeChange,
  wsUrl,
  onWsUrlChange,
  aishubUser,
  onAishubUserChange,
  aisStatus,
  signalK,
  onSignalKChange,
  signalKStatus,
  signalKData,
  signalKVessels,
  windAlarm,
  weatherError,
  gribStatus,
}) {
  const { boat, setBoat, coastBand, setCoastBand, textScale, setTextScale } = useAppStore()
  const [customPolars, setCustomPolars] = useState([])
  const [showPolar, setShowPolar] = useState(false)
  const [uploadStatus, setUploadStatus] = useState(null)
  const fileInputRef = useRef(null)

  // Load custom polars from IndexedDB
  useEffect(() => {
    if (open) {
      listCustomPolars().then((p) => setCustomPolars(p))
    }
  }, [open])

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus({ type: 'loading', msg: 'Parsing file...' })
    try {
      const content = await file.text()
      const polar = parsePolarFile(content, file.name)
      const key = `custom-${file.name.replace(/\.[^.]+$/, '')}`
      registerCustomPolar(key, polar)
      await saveCustomPolar(key, file.name, polar)
      setCustomPolars(await listCustomPolars())
      setUploadStatus({
        type: 'success',
        msg: `Caricato! ${polar.tws.length} TWS × ${polar.twa.length} TWA`,
      })
      // Auto-select new polar
      setBoat({ type: key, name: file.name, polarProfile: key })
      setTimeout(() => setUploadStatus(null), 3000)
    } catch (err) {
      setUploadStatus({ type: 'error', msg: err.message })
      setTimeout(() => setUploadStatus(null), 5000)
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (!open) return null

  return (
    <div className="absolute inset-0 z-[1200]">
      <button
        type="button"
        aria-label="Chiudi impostazioni"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="absolute right-0 top-0 flex h-full w-80 max-w-[85%] flex-col border-l border-line bg-abyss slide-up">
        <div className="flex flex-none items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-xs font-bold tracking-[0.25em] text-phos">
            IMPOSTAZIONI
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-fog hover:text-paper hover:bg-raised"
          >
            <X size={16} />
          </button>
        </div>

        <div className="scroll-y min-h-0 flex-1">
          <Section title="Dimensione testo" icon={Type}>
            <div className="grid grid-cols-4 gap-1">
              {TEXT_SIZES.map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTextScale(value)}
                  className={`rounded-md border px-1 py-2.5 font-semibold ${
                    textScale === value ? 'border-phos bg-phos/10 text-phos' : 'border-line text-paper hover:bg-raised'
                  }`}
                  style={{ fontSize: `${12 * value}px` }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pt-1 text-[calc(10px*var(--fs))] text-fog-dim">Ingrandisce menu, pannelli e schede della carta</div>
          </Section>

          <DepthZonesSection />

          <Section title="Configurazione barca" icon={Sailboat}>
            <div className="label pb-1">Nome, nominativo radio e MMSI</div>
            <div className="mb-1 grid grid-cols-3 gap-1.5">
              {[
                ['vesselName', 'Best Shot'],
                ['callSign', 'Call Sign'],
                ['mmsi', 'MMSI'],
              ].map(([key, placeholder]) => (
                <input
                  key={key}
                  type="text"
                  value={boat[key] ?? ''}
                  onChange={(e) => setBoat({ [key]: e.target.value })}
                  placeholder={placeholder}
                  autoCapitalize={key === 'callSign' ? 'characters' : 'none'}
                  inputMode={key === 'mmsi' ? 'numeric' : 'text'}
                  className="min-w-0 rounded-md border border-line bg-surface px-2 py-2.5 text-xs text-paper outline-none focus:border-phos"
                />
              ))}
            </div>
            <div className="whitespace-pre-line pb-3 text-[calc(9px*var(--fs))] text-fog">
              {`Con COPIA:\n${boat.vesselName ? `SAIL BOAT "${boat.vesselName.toUpperCase()}"\n` : ''}POSITION: 44°16.002' N 009°23.700' E${boat.callSign ? `\nCALL SIGN: ${boat.callSign.toUpperCase()}` : ''}${boat.mmsi ? `\nMMSI: ${boat.mmsi}` : ''}`}
            </div>
            <div className="flex items-center justify-between pb-1">
              <span className="label">Polar</span>
              <button
                type="button"
                onClick={() => setShowPolar(true)}
                className="flex items-center gap-1 rounded-md border border-phos bg-phos/10 px-2.5 py-1.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest text-phos"
              >
                <Activity size={12} /> VEDI POLARE
              </button>
            </div>
            {showPolar && (
              <PolarViewer
                polarKey={boat.polarProfile}
                title={`Polare · ${boat.name}`}
                subtitle={BOAT_LIBRARY.find((b) => b.key === boat.type)?.type}
                onClose={() => setShowPolar(false)}
              />
            )}
            <div className="flex flex-col gap-1">
              {BOAT_LIBRARY.map((b) => {
                const active = boat.type === b.key
                return (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setBoat({ type: b.key, name: b.name, polarProfile: b.key })}
                    className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-all ${
                      active ? 'border-phos bg-phos/10' : 'border-line bg-surface hover:bg-raised'
                    }`}
                  >
                    <Sailboat size={15} className={active ? 'text-phos' : 'text-fog'} />
                    <span className="flex-1">
                      <span className={`block text-xs font-semibold ${active ? 'text-phos' : 'text-paper'}`}>
                        {b.name}
                      </span>
                      <span className="block text-[calc(10px*var(--fs))] text-fog">
                        {b.type} · {b.length} · {b.year}
                      </span>
                    </span>
                  </button>
                )
              })}
              {/* Custom polars */}
              {customPolars.map((p) => {
                const active = boat.type === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setBoat({ type: p.key, name: p.name, polarProfile: p.key })}
                    className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-all ${
                      active ? 'border-phos bg-phos/10' : 'border-line bg-surface hover:bg-raised'
                    }`}
                  >
                    <FileText size={15} className={active ? 'text-phos' : 'text-fog'} />
                    <span className="flex-1">
                      <span className={`block text-xs font-semibold ${active ? 'text-phos' : 'text-paper'}`}>
                        {p.name}
                      </span>
                      <span className="block text-[calc(10px*var(--fs))] text-fog">
                        Custom · {p.polarData?.tws?.length || 0} TWS × {p.polarData?.twa?.length || 0} TWA
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Upload custom polar */}
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.pol,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5 text-xs font-semibold text-paper hover:bg-raised touch"
              >
                <Upload size={13} className="text-phos" />
                CARICA POLAR (.csv / .pol)
              </button>
              {uploadStatus && (
                <div
                  className={`mt-1.5 text-[calc(10px*var(--fs))] ${
                    uploadStatus.type === 'success' ? 'text-phos' :
                    uploadStatus.type === 'error' ? 'text-danger' : 'text-fog'
                  }`}
                >
                  {uploadStatus.msg}
                </div>
              )}
              <div className="mt-1 text-[calc(9px*var(--fs))] text-fog-dim leading-snug">
                Format: CSV (TWA col × TWS row) o MaxSea .pol (TWS TWA BS per riga).
                La polar viene salvata localmente (IndexedDB) e usata dal routing engine.
              </div>
            </div>
            <div className="label pt-3 pb-1 flex items-center gap-1.5">
              <Gauge size={11} /> Propulsione nel weather routing
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {PROPULSION.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setBoat({ propulsion: p.key })}
                  className={`touch rounded-md border py-2 text-[calc(10px*var(--fs))] font-semibold tracking-wider ${
                    boat.propulsion === p.key ? 'border-phos bg-phos/15 text-phos' : 'border-line bg-surface text-paper'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="pt-1 text-[calc(10px*var(--fs))] leading-relaxed text-fog">
              {PROPULSION.find((p) => p.key === boat.propulsion)?.hint}
            </div>
            {boat.propulsion === 'hybrid' && (
              <>
                <div className="label pt-3 pb-1 flex items-center gap-1.5">
                  <Gauge size={11} /> Motore sotto i
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="2"
                    max="6"
                    step="0.5"
                    value={boat.motorBelowKn}
                    onChange={(e) => setBoat({ motorBelowKn: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="font-mono text-xs font-bold text-paper w-16 text-right">
                    {boat.motorBelowKn.toFixed(1)} kn
                  </span>
                </div>
              </>
            )}
            <div className="label pt-3 pb-1 flex items-center gap-1.5">
              <Gauge size={11} /> Velocità motore
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="4"
                max="9"
                step="0.5"
                value={boat.motoringSpeedKn}
                onChange={(e) => setBoat({ motoringSpeedKn: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="font-mono text-xs font-bold text-paper w-16 text-right">
                {boat.motoringSpeedKn.toFixed(1)} kn
              </span>
            </div>
            <div className="label pt-3 pb-1 flex items-center gap-1.5">
              <Gauge size={11} /> Angoli bolina / poppa
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="35"
                max="55"
                value={boat.upwindAngleDeg}
                onChange={(e) => setBoat({ upwindAngleDeg: Number(e.target.value) })}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs text-paper outline-none focus:border-phos"
              />
              <span className="text-[calc(10px*var(--fs))] text-fog">° bolina</span>
              <input
                type="number"
                min="140"
                max="180"
                value={boat.downwindAngleDeg}
                onChange={(e) => setBoat({ downwindAngleDeg: Number(e.target.value) })}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs text-paper outline-none focus:border-phos"
              />
              <span className="text-[calc(10px*var(--fs))] text-fog">° poppa</span>
            </div>
            <div className="label pt-3 pb-1 flex items-center gap-1.5">
              <Gauge size={11} /> Pescaggio e margine (rotte)
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0.5"
                max="6"
                step="0.1"
                value={boat.draftM ?? 1.9}
                onChange={(e) => setBoat({ draftM: Number(e.target.value) })}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs text-paper outline-none focus:border-phos"
              />
              <span className="text-[calc(10px*var(--fs))] text-fog">m pescaggio</span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={boat.safetyMarginM ?? 1}
                onChange={(e) => setBoat({ safetyMarginM: Number(e.target.value) })}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs text-paper outline-none focus:border-phos"
              />
              <span className="text-[calc(10px*var(--fs))] text-fog">m margine</span>
            </div>
            <div className="pt-1 text-[calc(10px*var(--fs))] text-fog-dim">
              La rotta segnala e aggira terra e fondali sotto{' '}
              {((boat.draftM ?? 1.9) + (boat.safetyMarginM ?? 1)).toFixed(1)} m
            </div>
            <div className="label pt-3 pb-1 flex items-center gap-1.5">
              <Gauge size={11} /> Fascia dalla costa: Capitanerie non in elenco
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <input
                type="number"
                min="50"
                max="1000"
                step="50"
                value={coastBand.beach}
                onChange={(e) => setCoastBand({ beach: Number(e.target.value) })}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs text-paper outline-none focus:border-phos"
              />
              <span className="text-[calc(10px*var(--fs))] text-fog">m spiagge</span>
              <input
                type="number"
                min="50"
                max="1000"
                step="50"
                value={coastBand.beachSicily}
                onChange={(e) => setCoastBand({ beachSicily: Number(e.target.value) })}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs text-paper outline-none focus:border-phos"
              />
              <span className="text-[calc(10px*var(--fs))] text-fog">m spiagge Sicilia</span>
              <input
                type="number"
                min="50"
                max="1000"
                step="50"
                value={coastBand.cliff}
                onChange={(e) => setCoastBand({ cliff: Number(e.target.value) })}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs text-paper outline-none focus:border-phos"
              />
              <span className="text-[calc(10px*var(--fs))] text-fog">m coste a picco</span>
            </div>
            <div className="pt-1 text-[calc(10px*var(--fs))] text-fog-dim">
              Dove l'app ha l'ordinanza balneare della Capitaneria (Liguria, Toscana, Sardegna, Catania, Eolie, Licata,
              Porto Empedocle, Lazio sud, Soverato) usa le sue distanze, stagione e orari; altrove queste. Francia e
              Corsica: 300 m, max 5 nodi.
            </div>
          </Section>

          <Section title="Strumenti di bordo (Signal K)" icon={Cable}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onSignalKChange({ enabled: !signalK.enabled })}
                className={`h-7 w-12 flex-none rounded-full border transition-colors ${
                  signalK.enabled ? 'border-phos bg-phos/25' : 'border-line bg-surface'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full transition-transform ${
                    signalK.enabled ? 'translate-x-6 bg-phos' : 'translate-x-1 bg-fog'
                  }`}
                />
              </button>
              <span className="text-[calc(11px*var(--fs))] text-paper">
                {signalK.enabled ? 'Collegamento attivo' : 'Spento'}
              </span>
            </div>
            <input
              type="text"
              value={signalK.url}
              onChange={(e) => onSignalKChange({ url: e.target.value })}
              placeholder="wss://openplotter.local:3443"
              autoCapitalize="none"
              autoCorrect="off"
              className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-2.5 text-xs text-paper outline-none focus:border-phos"
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => onSignalKChange({ url: SK_DEMO, enabled: true, useGps: false })}
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest text-fog hover:text-paper"
              >
                PROVA CON LA DEMO
              </button>
              <button
                type="button"
                onClick={() => onSignalKChange({ useGps: !signalK.useGps })}
                className={`rounded-md border px-2.5 py-1.5 text-[calc(10px*var(--fs))] font-semibold tracking-widest ${
                  signalK.useGps ? 'border-phos bg-phos/10 text-phos' : 'border-line bg-surface text-fog'
                }`}
              >
                {signalK.useGps ? '✓ ' : ''}POSIZIONE DA SIGNAL K
              </button>
            </div>
            <div
              className={`mt-2 text-[calc(10px*var(--fs))] leading-snug ${
                signalKStatus.state === 'error' ? 'text-danger' : signalKStatus.state === 'connected' ? 'text-phos' : 'text-fog'
              }`}
            >
              {signalKStatus.state === 'connected' && `Collegato: ${signalKSummary(signalKData, signalKVessels)}`}
              {signalKStatus.state === 'connecting' && 'Connessione…'}
              {signalKStatus.state === 'error' && signalKStatus.detail}
            </div>
            <div className="mt-1 text-[calc(9px*var(--fs))] leading-relaxed text-fog">
              Raspberry Pi con Signal K (o OpenPlotter) collegato al Wi-Fi del Quark-elec A027+ (TCP 192.168.1.100:2000).
              Sull'iPad apri una volta l'indirizzo https del Raspberry in Safari e accetta il certificato.
              "Posizione da Signal K" usa il GPS dell'A027+ al posto di quello dell'iPad; spento (o con il collegamento spento) torna quello dell'iPad.
              La demo è una barca in Finlandia: per provarla tieni spenta la posizione da Signal K.
            </div>
          </Section>

          <Section title="Sorgente AIS" icon={Radio}>
            <div className="flex flex-col gap-1">
              {AIS_MODES.map((m) => {
                const Icon = m.icon
                const active = aisMode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onAisModeChange(m.id)}
                    className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-all ${
                      active ? 'border-phos bg-phos/10' : 'border-line bg-surface hover:bg-raised'
                    }`}
                  >
                    <Icon size={15} className={active ? 'text-phos' : 'text-fog'} />
                    <span className="flex-1">
                      <span
                        className={`block text-[calc(11px*var(--fs))] font-bold tracking-widest ${
                          active ? 'text-phos' : 'text-paper'
                        }`}
                      >
                        {m.label}
                      </span>
                      <span className="block text-[calc(9px*var(--fs))] text-fog">{m.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            {aisMode === 'nmea' && (
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => onWsUrlChange(e.target.value)}
                placeholder="ws://192.168.4.1:8484"
                autoCapitalize="none"
                autoCorrect="off"
                className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-2.5 text-xs text-paper outline-none focus:border-phos"
              />
            )}
            {aisMode === 'aishub' && (
              <input
                type="text"
                value={aishubUser}
                onChange={(e) => onAishubUserChange(e.target.value)}
                placeholder="Username AISHub"
                autoCapitalize="none"
                autoCorrect="off"
                className="mt-2 w-full rounded-md border border-line bg-surface px-2.5 py-2.5 text-xs text-paper outline-none focus:border-phos"
              />
            )}
            <div
              className={`mt-2 text-[calc(10px*var(--fs))] leading-snug ${
                aisStatus.state === 'error' ? 'text-danger' : 'text-fog'
              }`}
            >
              {aisStatus.state === 'sim' && `Demo attiva: ${aisStatus.detail}`}
              {aisStatus.state === 'connected' && `Collegato: ${aisStatus.detail}`}
              {aisStatus.state === 'connecting' && `Connessione a ${aisStatus.detail}…`}
              {aisStatus.state === 'error' && aisStatus.detail}
              {aisStatus.state === 'idle' && 'In attesa'}
            </div>
          </Section>

          <Section title="Allarme raffica" icon={Activity}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => windAlarm.setOn(!windAlarm.on)}
                className={`h-7 w-12 flex-none rounded-full border transition-colors ${
                  windAlarm.on ? 'border-phos bg-phos/25' : 'border-line bg-surface'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full transition-transform ${
                    windAlarm.on ? 'translate-x-6 bg-phos' : 'translate-x-0.5 bg-fog'
                  }`}
                />
              </button>
              <span className="flex-1 text-xs text-paper">Avvisa oltre</span>
              <input
                type="number"
                min="10"
                max="60"
                value={windAlarm.threshold}
                onChange={(e) => windAlarm.setThreshold(Number(e.target.value) || 30)}
                className="w-16 rounded-md border border-line bg-surface px-2 py-2 text-center text-sm text-paper outline-none focus:border-phos"
              />
              <span className="text-[calc(10px*var(--fs))] text-fog">kn</span>
            </div>
            <div className="pt-1.5 text-[calc(10px*var(--fs))] text-fog">
              Triplo segnale acustico e banner quando le raffiche superano la soglia.
            </div>
          </Section>

          {gribStatus && (
            <Section title="Stato dati weather routing" icon={Database}>
              <div className="space-y-1 text-[calc(10px*var(--fs))]">
                <div className="flex justify-between">
                  <span className="text-fog">Vento (GRIB):</span>
                  <span className={gribStatus.wind ? 'text-phos' : 'text-warn'}>
                    {gribStatus.wind ? `${gribStatus.windPoints} punti · ${gribStatus.windHours}h` : 'non disponibile'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fog">Correnti marine:</span>
                  <span className={gribStatus.current ? 'text-phos' : 'text-warn'}>
                    {gribStatus.current ? `${gribStatus.currentPoints} punti` : 'non disponibile'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-fog">Land mask:</span>
                  <span className="text-phos">Mediterraneo {gribStatus.polygons} poligoni</span>
                </div>
                {gribStatus.updatedAt && (
                  <div className="flex justify-between">
                    <span className="text-fog">Ultimo update:</span>
                    <span className="text-paper">
                      {new Date(gribStatus.updatedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {weatherError && (
            <Section title="Avvisi">
              <div className="text-[calc(10px*var(--fs))] text-warn">{weatherError}</div>
            </Section>
          )}

          <BackupSection />
          <StallsSection />
          <StartsSection />

          <Section title="Informazioni">
            <div className="text-[calc(10px*var(--fs))] leading-relaxed text-fog">
              <b className="text-paper">TIMONE v2.1</b> — PWA di navigazione con weather routing
              isocrone. Dati: Open-Meteo, OpenSeaMap, EMODnet, Esri, RainViewer, Natural Earth.
              Ausilio alla navigazione: non sostituisce le carte ufficiali né le ordinanze delle
              Capitanerie. Perimetri delle aree protette indicativi.
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
