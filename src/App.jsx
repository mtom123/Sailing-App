import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Anchor,
  Crosshair,
  Layers,
  LifeBuoy,
  Moon,
  Navigation2,
  Route as RouteIcon,
  ScrollText,
  Settings,
} from 'lucide-react'
import SettingsSheet from './components/SettingsSheet.jsx'
import MapView from './components/MapView.jsx'
import InstrumentPanel from './components/InstrumentPanel.jsx'
import AnchoragePanel from './components/AnchoragePanel.jsx'
import RoutePanel from './components/RoutePanel.jsx'
import TrackPanel from './components/TrackPanel.jsx'
import useGeolocation from './hooks/useGeolocation.js'
import useOpenMeteo from './hooks/useOpenMeteo.js'
import useWindField from './hooks/useWindField.js'
import useAIS from './hooks/useAIS.js'
import useRoute from './hooks/useRoute.js'
import useRouteWeather from './hooks/useRouteWeather.js'
import useAutopilot from './hooks/useAutopilot.js'
import useTrack from './hooks/useTrack.js'
import useRainRadar from './hooks/useRainRadar.js'
import { ANCHORAGES } from './data/anchorages.js'
import { MARINE_PARKS } from './data/marineParks.js'
import { evaluateAnchorage } from './lib/anchorageSafety.js'
import { fenceStatus } from './lib/geoFence.js'
import { bearing, cardinal, formatDeg, haversine, metersToNm } from './lib/geo.js'
import { armAudio, startAlarm, stopAlarm, warnBeep } from './lib/alarm.js'
import { sunTimes, moonPhase } from './lib/sun.js'

// Centro di default: Bocche di Bonifacio / Costa Smeralda
const DEFAULT_CENTER = { lat: 41.15, lon: 9.45 }

const LAYER_DEFS = [
  { key: 'bathy', label: 'Batimetria' },
  { key: 'seamarks', label: 'Seamarks' },
  { key: 'wind', label: 'Vettore vento' },
  { key: 'ais', label: 'Navi AIS' },
  { key: 'parks', label: 'Aree protette' },
  { key: 'rain', label: 'Radar pioggia' },
]

const TABS = [
  { id: 'route', label: 'ROTTA', icon: RouteIcon },
  { id: 'anchors', label: 'ANCORE', icon: Anchor },
  { id: 'log', label: 'LOG', icon: ScrollText },
]

function MapButton({ active, danger, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center border transition-colors ${
        danger
          ? 'border-danger bg-danger/20 text-danger'
          : active
            ? 'border-phos bg-ink text-phos'
            : 'border-line bg-ink/90 text-fog active:text-paper'
      }`}
    >
      {children}
    </button>
  )
}

export default function App() {
  const geo = useGeolocation()

  // Wake lock: al timone lo schermo dell'iPad non deve mai spegnersi.
  useEffect(() => {
    let lock = null
    async function acquire() {
      try {
        if ('wakeLock' in navigator) {
          lock = await navigator.wakeLock.request('screen')
        }
      } catch {
        // negato o non supportato: nessun fallback possibile
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (lock) lock.release().catch(() => {})
    }
  }, [])

  const [view, setView] = useState({ center: DEFAULT_CENTER, bounds: null })
  const [layers, setLayers] = useState({
    bathy: true,
    seamarks: true,
    wind: true,
    ais: true,
    parks: true,
    rain: false,
  })
  const [layersOpen, setLayersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [follow, setFollow] = useState(true)
  const [nightMode, setNightMode] = useState(false)
  const [focusTarget, setFocusTarget] = useState(null)
  const [tab, setTab] = useState('route')

  const [aisMode, setAisMode] = useState('sim')
  const [wsUrl, setWsUrl] = useState('ws://192.168.4.1:8484')
  const [aishubUser, setAishubUser] = useState('')

  const weather = useOpenMeteo(view.center.lat, view.center.lon)
  const windField = useWindField(view.bounds, layers.wind)
  const rainTileUrl = useRainRadar(layers.rain)
  const { vessels, status: aisStatus } = useAIS({
    mode: aisMode,
    wsUrl,
    aishubUser,
    center: view.center,
    bounds: view.bounds,
  })

  // --- Rotta, weather routing e pilota ---------------------------------------
  const route = useRoute(geo)
  const routeWx = useRouteWeather(route.waypoints, route.planSpeed)
  const autopilot = useAutopilot({
    wsUrl,
    nav: route.nav,
    waypoints: route.waypoints,
    geo,
  })

  // --- Traccia GPS ------------------------------------------------------------
  const track = useTrack(geo)

  // --- Effemeridi -------------------------------------------------------------
  const refPoint = geo.lat != null ? { lat: geo.lat, lon: geo.lon } : view.center
  const sun = useMemo(
    () => sunTimes(new Date(), refPoint.lat, refPoint.lon),
    [Math.floor(Date.now() / 3600000), refPoint.lat.toFixed(1), refPoint.lon.toFixed(1)]
  )
  const moon = useMemo(() => moonPhase(new Date()), [Math.floor(Date.now() / 86400000)])

  // --- Ancoraggi: sicurezza dinamica dal vento + distanza dalla barca ---------
  // Chiave arrotondata (~1 km): niente ricalcoli/re-render a ogni tick GPS
  const refKey = `${refPoint.lat.toFixed(2)},${refPoint.lon.toFixed(2)}`
  const anchorages = useMemo(() => {
    const [rLat, rLon] = refKey.split(',').map(Number)
    return ANCHORAGES.map((a) => ({
      ...a,
      safety: evaluateAnchorage(a, weather.wind),
      distance: haversine(rLat, rLon, a.lat, a.lon),
      bearing: bearing(rLat, rLon, a.lat, a.lon),
    })).sort((x, y) => x.distance - y.distance)
  }, [weather.wind, refKey])

  // --- Aree marine protette: stato rispetto alla posizione --------------------
  const parks = useMemo(() => {
    return MARINE_PARKS.map((p) => ({
      ...p,
      status:
        geo.lat != null ? fenceStatus(geo.lat, geo.lon, p.polygon) : null,
    }))
  }, [geo.lat != null ? geo.lat.toFixed(3) : null, geo.lon != null ? geo.lon.toFixed(3) : null])
  const parkAlert = parks.find((p) => p.status === 'inside') || parks.find((p) => p.status === 'near')

  // --- MOB (uomo a mare) -------------------------------------------------------
  const [mob, setMob] = useState(null)
  const mobInfo =
    mob && geo.lat != null
      ? {
          dist: haversine(geo.lat, geo.lon, mob.lat, mob.lon),
          brg: bearing(geo.lat, geo.lon, mob.lat, mob.lon),
        }
      : null
  const dropMob = () => {
    if (geo.lat == null) return
    armAudio()
    warnBeep()
    setMob({ lat: geo.lat, lon: geo.lon, ts: Date.now() })
    setFollow(true)
  }

  // --- Allarme vento -----------------------------------------------------------
  const [windAlarmOn, setWindAlarmOn] = useState(false)
  const [windThreshold, setWindThreshold] = useState(30)
  const gustNow = weather.wind?.gust ?? weather.wind?.speed ?? null
  const windAlarmActive =
    windAlarmOn && gustNow != null && gustNow >= windThreshold
  const windAlarmPrev = useRef(false)
  useEffect(() => {
    if (windAlarmActive && !windAlarmPrev.current) warnBeep()
    windAlarmPrev.current = windAlarmActive
  }, [windAlarmActive])

  // --- Anchor Watch --------------------------------------------------------------
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
    <div
      className={`flex h-full w-full overflow-hidden bg-ink text-paper ${
        nightMode ? 'night-mode' : ''
      }`}
    >
      {/* SIDEBAR SINISTRA 25%: strumenti di navigazione */}
      <div className="h-full w-1/4 flex-none">
        <InstrumentPanel geo={geo} weather={weather} sun={sun} moon={moon} />
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
          route={route}
          parks={parks}
          trackPoints={track.points}
          mob={mob}
          rainTileUrl={layers.rain ? rainTileUrl : null}
          onViewChange={setView}
          onUserPan={() => setFollow(false)}
        />

        {/* Colonna comandi mappa */}
        <div className="absolute right-2 top-2 z-[1000] flex flex-col gap-1.5">
          <MapButton
            title="Layer"
            active={layersOpen}
            onClick={() => setLayersOpen((o) => !o)}
          >
            <Layers size={18} />
          </MapButton>
          <MapButton
            title="Segui barca"
            active={follow}
            onClick={() => setFollow((f) => !f)}
          >
            <Crosshair size={18} />
          </MapButton>
          <MapButton
            title="Modifica rotta"
            active={route.editing}
            onClick={() => {
              const next = !route.editing
              route.setEditing(next)
              if (next) setTab('route')
            }}
          >
            <Navigation2 size={18} />
          </MapButton>
          <MapButton
            title="Modalità notte"
            active={nightMode}
            onClick={() => setNightMode((n) => !n)}
          >
            <Moon size={18} />
          </MapButton>
          <MapButton title="Uomo a mare" danger={Boolean(mob)} onClick={dropMob}>
            <LifeBuoy size={18} />
          </MapButton>
          <MapButton
            title="Impostazioni"
            active={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={18} />
          </MapButton>
        </div>

        {layersOpen && (
          <>
            <button
              type="button"
              aria-label="Chiudi menu layer"
              onClick={() => setLayersOpen(false)}
              className="absolute inset-0 z-[990] cursor-default"
            />
            <div className="absolute right-16 top-2 z-[1000] w-44 border border-line bg-ink/95 p-1">
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
          </>
        )}

        {/* Hint modalità rotta */}
        {route.editing && (
          <div className="absolute left-1/2 top-14 z-[900] -translate-x-1/2 border border-warn bg-ink/95 px-3 py-1.5 text-[10px] tracking-wider text-warn">
            MODALITÀ ROTTA — tocca il mare per aggiungere waypoint
          </div>
        )}

        {/* Barra NAV rotta attiva */}
        {route.nav && !mob && (
          <div className="absolute left-1/2 top-2 z-[900] -translate-x-1/2 border border-phosdim bg-ink/90 px-3 py-1.5 text-[11px] tabular-nums">
            <span className="font-bold text-phos">→ {route.nav.dest.name}</span>
            <span className="text-paper">
              {' '}
              {route.nav.dtwNm.toFixed(1)} nm · {formatDeg(route.nav.btw)}°
            </span>
            <span className="text-fog">
              {' '}
              · ETA{' '}
              {new Date(route.nav.etaMs).toLocaleTimeString('it-IT', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {/* Banner MOB */}
        {mob && (
          <div className="alarm-flash absolute left-1/2 top-2 z-[1100] -translate-x-1/2 border-2 border-danger bg-ink px-3 py-2 text-center">
            <div className="text-[13px] font-bold tracking-[0.25em] text-danger">
              ⊕ UOMO A MARE
            </div>
            {mobInfo && (
              <div className="text-[12px] text-paper tabular-nums">
                {formatDeg(mobInfo.brg)}° {cardinal(mobInfo.brg)} ·{' '}
                {mobInfo.dist < 1852
                  ? `${mobInfo.dist.toFixed(0)} m`
                  : `${metersToNm(mobInfo.dist).toFixed(2)} nm`}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMob(null)}
              className="mt-1 border border-line bg-panel px-3 py-1 text-[9px] tracking-widest text-fog"
            >
              ANNULLA
            </button>
          </div>
        )}

        {/* Banner area protetta */}
        {parkAlert && !mob && (
          <div
            className={`absolute bottom-8 left-1/2 z-[900] -translate-x-1/2 border px-3 py-1.5 text-center text-[11px] ${
              parkAlert.status === 'inside'
                ? 'border-danger bg-danger/20 text-danger'
                : 'border-warn bg-warn/10 text-warn'
            }`}
          >
            <b>
              {parkAlert.status === 'inside' ? '⚠ DENTRO ' : '⚠ VICINO A '}
              {parkAlert.name}
            </b>
            <div className="text-[9px] opacity-80">
              Verifica le ordinanze — tocca l'area sulla mappa per le regole
            </div>
          </div>
        )}

        {/* Banner allarme vento */}
        {windAlarmActive && !mob && (
          <div className="absolute left-2 top-2 z-[900] border border-warn bg-warn/15 px-3 py-1.5 text-[11px] font-bold text-warn">
            ⚠ RAFFICHE {Math.round(gustNow)} kn
          </div>
        )}

        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          aisMode={aisMode}
          onAisModeChange={setAisMode}
          wsUrl={wsUrl}
          onWsUrlChange={setWsUrl}
          aishubUser={aishubUser}
          onAishubUserChange={setAishubUser}
          aisStatus={aisStatus}
          windAlarm={{
            on: windAlarmOn,
            setOn: setWindAlarmOn,
            threshold: windThreshold,
            setThreshold: setWindThreshold,
          }}
          weatherError={weather.error}
        />
      </div>

      {/* SIDEBAR DESTRA 20%: rotta / ancoraggi / log */}
      <div className="flex h-full w-1/5 flex-none flex-col border-l border-line bg-ink">
        <div className="flex flex-none border-b border-line">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-2.5 text-[9px] font-bold tracking-widest ${
                  active
                    ? 'border-phos text-phos'
                    : 'border-transparent text-fog active:text-paper'
                }`}
              >
                <Icon size={12} />
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'route' && (
            <RoutePanel
              route={route}
              routeWx={routeWx}
              autopilot={autopilot}
              gpsOk={geo.lat != null}
              bridgeConfigured={Boolean(wsUrl)}
            />
          )}
          {tab === 'anchors' && (
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
          )}
          {tab === 'log' && <TrackPanel track={track} gpsOk={geo.lat != null} />}
        </div>
      </div>
    </div>
  )
}
