import { Radio, Ship, Wifi, X } from 'lucide-react'

/*
 * Foglio impostazioni: tutto ciò che si configura una volta e poi si dimentica
 * (sorgente AIS, bridge NMEA, allarme raffica) esce dalla plancia e vive qui.
 */

const AIS_MODES = [
  { id: 'sim', label: 'DEMO', icon: Ship, hint: 'Flotta simulata per provare l\'app' },
  { id: 'nmea', label: 'NMEA', icon: Wifi, hint: 'AIS reale via bridge WebSocket di bordo' },
  { id: 'aishub', label: 'AISHUB', icon: Radio, hint: 'Feed AISHub con username personale' },
]

function Section({ title, children }) {
  return (
    <div className="border-b border-line p-3">
      <div className="label pb-2">{title}</div>
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
}) {
  if (!open) return null

  return (
    <div className="absolute inset-0 z-[1200]">
      <button
        type="button"
        aria-label="Chiudi impostazioni"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="absolute right-0 top-0 flex h-full w-80 max-w-[85%] flex-col border-l border-line bg-ink">
        <div className="flex flex-none items-center justify-between border-b border-line px-3 py-2.5">
          <span className="text-[12px] font-bold tracking-[0.25em] text-phos">
            IMPOSTAZIONI
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center border border-line text-fog active:text-paper"
          >
            <X size={16} />
          </button>
        </div>

        <div className="panel-scroll min-h-0 flex-1">
          <Section title="Sorgente AIS">
            <div className="flex flex-col gap-1">
              {AIS_MODES.map((m) => {
                const Icon = m.icon
                const active = aisMode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onAisModeChange(m.id)}
                    className={`flex items-center gap-2.5 border px-3 py-2.5 text-left ${
                      active
                        ? 'border-phos bg-phos/10'
                        : 'border-line bg-panel active:bg-raised'
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
                className="mt-2 w-full border border-line bg-panel px-2.5 py-2.5 text-[12px] text-paper outline-none focus:border-phos"
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
                className="mt-2 w-full border border-line bg-panel px-2.5 py-2.5 text-[12px] text-paper outline-none focus:border-phos"
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

          <Section title="Allarme raffica">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => windAlarm.setOn(!windAlarm.on)}
                className={`h-7 w-12 flex-none border transition-colors ${
                  windAlarm.on ? 'border-phos bg-phos/25' : 'border-line bg-panel'
                }`}
              >
                <span
                  className={`block h-5 w-5 transition-transform ${
                    windAlarm.on ? 'translate-x-6 bg-phos' : 'translate-x-0.5 bg-fog'
                  }`}
                />
              </button>
              <span className="flex-1 text-[11px] text-paper">
                Avvisa oltre
              </span>
              <input
                type="number"
                min="10"
                max="60"
                value={windAlarm.threshold}
                onChange={(e) => windAlarm.setThreshold(Number(e.target.value) || 30)}
                className="w-16 border border-line bg-panel px-2 py-2 text-center text-[13px] text-paper outline-none focus:border-phos"
              />
              <span className="text-[10px] text-fog">kn</span>
            </div>
            <div className="pt-1.5 text-[9px] text-fog">
              Triplo segnale acustico e banner quando le raffiche superano la soglia.
            </div>
          </Section>

          {weatherError && (
            <Section title="Stato dati">
              <div className="text-[10px] text-warn">{weatherError}</div>
            </Section>
          )}

          <Section title="Informazioni">
            <div className="text-[10px] leading-relaxed text-fog">
              TIMONE — PWA di navigazione. Dati: Open-Meteo, OpenSeaMap, EMODnet,
              CARTO, RainViewer. Ausilio alla navigazione: non sostituisce le
              carte ufficiali né le ordinanze delle Capitanerie. Perimetri delle
              aree protette indicativi.
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
