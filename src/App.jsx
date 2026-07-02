import { useEffect, useMemo, useState } from 'react'
import { Crosshair, Layers } from 'lucide-react'
import MapView from './components/MapView.jsx'
import InstrumentPanel from './components/InstrumentPanel.jsx'
import AnchoragePanel from './components/AnchoragePanel.jsx'
import useGeolocation from './hooks/useGeolocation.js'
import useOpenMeteo from './hooks/useOpenMeteo.js'
import useWindField from './hooks/useWindField.js'
import useAIS from './hooks/useAIS.js'
import { ANCHORAGES } from './data/anchorages.js'
import { evaluateAnchorage } from './lib/anchorageSafety.js'
import { bearing, haversine } from './lib/geo.js'
import { armAudio, startAlarm, stopAlarm } from './lib/alarm.js'

// Centro di default: Bocche di Bonifacio / Costa Smeralda
const DEFAULT_CENTER = { lat: 41.15, lon: 9.45 }

const LAYER_DEFS = [
  { key: 'bathy', label: 'Batimetria' },
  { key: 'seamarks', label: 'Seamarks' },
  { key: 'wind', label: 'Vettore vento' },
  { key: 'ais', label: 'Navi AIS' },
]

export default function App() {
  const geo = useGeolocation()

  const [view, setView] = useState({ center: DEFAULT_CENTER, bounds: null })
  const [layers, setLayers] = useState({
    bathy: true,
    seamarks: true,
    wind: true,
    ais: true,
  })
  const [layersOpen, setLayersOpen] = useState(false)
  const [follow, setFollow] = useState(true)
  const [focusTarget, setFocusTarget] = useState(null)

  const [aisMode, setAisMode] = useState('sim')
  const [wsUrl, setWsUrl] = useState('ws://192.168.4.1:8484')
  const [aishubUser, setAishubUser] = useState('')

  const weather = useOpenMeteo(view.center.lat, view.center.lon)
  const windField = useWindField(view.bounds, layers.wind)
  const { vessels, status: aisStatus } = useAIS({
    mode: aisMode,
    wsUrl,
    aishubUser,
    center: view.center,
    bounds: view.bounds,
  })

  // --- Ancoraggi: sicurezza dinamica dal vento + distanza dalla barca -------
  const refPoint = geo.lat != null ? { lat: geo.lat, lon: geo.lon } : view.center
  const anchorages = useMemo(() => {
    return ANCHORAGES.map((a) => ({
      ...a,
      safety: evaluateAnchorage(a, weather.wind),
      distance: haversine(refPoint.lat, refPoint.lon, a.lat, a.lon),
      bearing: bearing(refPoint.lat, refPoint.lon, a.lat, a.lon),
    })).sort((x, y) => x.distance - y.distance)
  }, [weather.wind, refPoint.lat, refPoint.lon])

  // --- Anchor Watch ----------------------------------------------------------
  const [radius, setRadius] = useState(40)
  const [anchorWatch, setAnchorWatch] = useState(null)
  const [alarmMuted, setAlarmMuted] = useState(false)

  const watchDistance =
    anchorWatch && geo.lat != null
      ? haversine(geo.lat, geo.lon, anchorWatch.lat, anchorWatch.lon)
      : null
  const outsideRadius = watchDistance != null && watchDistance > anchorWatch.radius
  const alarmActive = Boolean(anchorWatch) && outsideRadius

  useEffect(() => {
    if (alarmActive && !alarmMuted) startAlarm()
    else stopAlarm()
    return () => stopAlarm()
  }, [alarmActive, alarmMuted])

  const dropAnchor = () => {
    if (geo.lat == null) return
    armAudio() // gesto utente: sblocca l'audio su iOS
    setAlarmMuted(false)
    setAnchorWatch({ lat: geo.lat, lon: geo.lon, radius })
  }
  const raiseAnchor = () => {
    setAnchorWatch(null)
    setAlarmMuted(false)
  }

  const selectAnchorage = (a) => {
    setFollow(false)
    setFocusTarget({ id: a.id, lat: a.lat, lon: a.lon, ts: Date.now() })
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-ink text-paper">
      {/* SIDEBAR SINISTRA 25%: strumenti di navigazione */}
      <div className="h-full w-1/4 flex-none">
        <InstrumentPanel
          geo={geo}
          weather={weather}
          aisMode={aisMode}
          onAisModeChange={setAisMode}
          wsUrl={wsUrl}
          onWsUrlChange={setWsUrl}
          aishubUser={aishubUser}
          onAishubUserChange={setAishubUser}
          aisStatus={aisStatus}
        />
      </div>

      {/* AREA CENTRALE 55%: mappa */}
      <div className="relative h-full min-w-0 flex-1">
        <MapView
          initialCenter={DEFAULT_CENTER}
          boat={geo}
          follow={follow}
          layers={layers}
          windField={windField}
          vessels={vessels}
          anchorages={anchorages}
          anchorWatch={anchorWatch}
          focusTarget={focusTarget}
          onViewChange={setView}
          onUserPan={() => setFollow(false)}
        />

        {/* Selettore layer */}
        <div className="absolute right-2 top-2 z-[1000]">
          <button
            type="button"
            onClick={() => setLayersOpen((o) => !o)}
            className={`flex h-11 w-11 items-center justify-center border ${
              layersOpen ? 'border-phos bg-ink text-phos' : 'border-line bg-ink text-paper'
            }`}
          >
            <Layers size={18} />
          </button>
          {layersOpen && (
            <div className="mt-1 w-44 border border-line bg-ink/95 p-1">
              {LAYER_DEFS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  onClick={() => setLayers((s) => ({ ...s, [l.key]: !s[l.key] }))}
                  className="flex w-full items-center gap-2 px-2 py-2.5 text-left text-[11px] tracking-widest active:bg-raised"
                >
                  <span
                    className={`flex h-4 w-4 flex-none items-center justify-center border text-[10px] ${
                      layers[l.key] ? 'border-phos text-phos' : 'border-line text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                  <span className={layers[l.key] ? 'text-paper' : 'text-fog'}>
                    {l.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Segui barca */}
        <button
          type="button"
          onClick={() => setFollow((f) => !f)}
          className={`absolute right-2 top-16 z-[1000] flex h-11 w-11 items-center justify-center border ${
            follow ? 'border-phos bg-ink text-phos' : 'border-line bg-ink text-fog'
          }`}
        >
          <Crosshair size={18} />
        </button>
      </div>

      {/* SIDEBAR DESTRA 20%: ancoraggi e allarmi */}
      <div className="h-full w-1/5 flex-none">
        <AnchoragePanel
          anchorages={anchorages}
          onSelect={selectAnchorage}
          gpsOk={geo.lat != null}
          anchorWatch={anchorWatch}
          radius={radius}
          onRadiusChange={setRadius}
          onDropAnchor={dropAnchor}
          onRaiseAnchor={raiseAnchor}
          watchDistance={watchDistance}
          alarmActive={alarmActive}
          onMuteAlarm={() => setAlarmMuted(true)}
        />
      </div>
    </div>
  )
}
