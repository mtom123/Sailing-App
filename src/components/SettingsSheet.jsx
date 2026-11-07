import { Radio, Ship, Wifi, X, Sailboat, Gauge, Database, Activity, Upload, FileText, Trash, Type, Cable } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore.js'
import { BOAT_LIBRARY, registerCustomPolar, listAvailablePolars } from '../routing/polarSolver.js'
import { parsePolarFile, saveCustomPolar, listCustomPolars } from '../lib/polarParser.js'
import PolarViewer from './PolarViewer.jsx'
import { clearStalls, readStalls } from '../lib/stallLog.js'

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

          <StallsSection />

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
