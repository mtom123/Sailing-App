import { Radio, Ship, Wifi, X, Sailboat, Gauge, Database, Activity, Upload, FileText, Trash } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore.js'
import { BOAT_LIBRARY, registerCustomPolar, listAvailablePolars } from '../routing/polarSolver.js'
import { parsePolarFile, saveCustomPolar, listCustomPolars } from '../lib/polarParser.js'

/*
 * Foglio impostazioni: tutto ciò che si configura una volta e poi si dimentica
 * (sorgente AIS, bridge NMEA, allarme raffica, polar barca, dati offline) esce
 * dalla plancia e vive qui.
 */

const AIS_MODES = [
  { id: 'sim', label: 'DEMO', icon: Ship, hint: 'Flotta simulata per provare l\'app' },
  { id: 'nmea', label: 'NMEA', icon: Wifi, hint: 'AIS reale via bridge WebSocket di bordo' },
  { id: 'aishub', label: 'AISHUB', icon: Radio, hint: 'Feed AISHub con username personale' },
]

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
  windAlarm,
  weatherError,
  gribStatus,
}) {
  const { boat, setBoat } = useAppStore()
  const [customPolars, setCustomPolars] = useState([])
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
          <Section title="Configurazione barca" icon={Sailboat}>
            <div className="label pb-1">Polar</div>
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
                      <span className="block text-[10px] text-fog">
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
                      <span className="block text-[10px] text-fog">
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
                  className={`mt-1.5 text-[10px] ${
                    uploadStatus.type === 'success' ? 'text-phos' :
                    uploadStatus.type === 'error' ? 'text-danger' : 'text-fog'
                  }`}
                >
                  {uploadStatus.msg}
                </div>
              )}
              <div className="mt-1 text-[9px] text-fog-dim leading-snug">
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
              <span className="text-[10px] text-fog">° bolina</span>
              <input
                type="number"
                min="140"
                max="180"
                value={boat.downwindAngleDeg}
                onChange={(e) => setBoat({ downwindAngleDeg: Number(e.target.value) })}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-xs text-paper outline-none focus:border-phos"
              />
              <span className="text-[10px] text-fog">° poppa</span>
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
                        className={`block text-[11px] font-bold tracking-widest ${
                          active ? 'text-phos' : 'text-paper'
                        }`}
                      >
                        {m.label}
                      </span>
                      <span className="block text-[9px] text-fog">{m.hint}</span>
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
              className={`mt-2 text-[10px] leading-snug ${
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
              <span className="text-[10px] text-fog">kn</span>
            </div>
            <div className="pt-1.5 text-[10px] text-fog">
              Triplo segnale acustico e banner quando le raffiche superano la soglia.
            </div>
          </Section>

          {gribStatus && (
            <Section title="Stato dati weather routing" icon={Database}>
              <div className="space-y-1 text-[10px]">
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
              <div className="text-[10px] text-warn">{weatherError}</div>
            </Section>
          )}

          <Section title="Informazioni">
            <div className="text-[10px] leading-relaxed text-fog">
              <b className="text-paper">TIMONE v2.1</b> — PWA di navigazione con weather routing
              isocrone. Dati: Open-Meteo, OpenSeaMap, EMODnet, CARTO, RainViewer, Natural Earth.
              Ausilio alla navigazione: non sostituisce le carte ufficiali né le ordinanze delle
              Capitanerie. Perimetri delle aree protette indicativi.
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
