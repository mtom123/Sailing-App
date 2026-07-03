import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Anchor,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Layers,
  LifeBuoy,
  Moon,
  Navigation2,
  Route as RouteIcon,
  ScrollText,
  Settings,
  X,
} from 'lucide-react'
import MapView from './components/MapView.jsx'
import InstrumentPanel from './components/InstrumentPanel.jsx'
import AnchoragePanel from './components/AnchoragePanel.jsx'
import RoutePanel from './components/RoutePanel.jsx'
import TrackPanel from './components/TrackPanel.jsx'
import SettingsSheet from './components/SettingsSheet.jsx'
import usePersistentState from './hooks/usePersistentState.js'
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
  { key: 'bathy', label: 'Batimetria (fondali)' },
  { key: 'seamarks', label: 'Seamarks (fari/boe)' },
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
      className={`flex h-11 w-11 items-center justify-center rounded-sm border shadow-lg shadow-black/40 transition-colors ${
        danger
          ? 'border-danger bg-danger/25 text-danger'
          : active
            ? 'border-phos bg-ink text-phos'
            : 'border-line bg-ink/95 text-fog active:text-paper'
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
  // Preferenze persistenti: sopravvivono a riavvii dell'app
  const [baseStyle, setBaseStyle] = usePersistentState('timone.base.v2', 'chart') // 'chart' | 'dark'
  const [layers, setLayers] = usePersistentState('timone.layers.v3', {
    bathy: true,
    seamarks: true,
    wind: true,
    ais: false,
    parks: true,
    rain: false,
  })
  const [layersOpen, setLayersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [leftOpen, setLeftOpen] = useState(true)
  const [drawer, setDrawer] = useState('route') // null | 'route' | 'anchors' | 'log'
  const [follow, setFollow] = useState(true)
  const [nightMode, setNightMode] = useState(false)
  const [focusTarget, setFocusTarget] = useState(null)

  const [aisMode, setAisMode] = usePersistentState('timone.aisMode.v1', 'sim')
  const [wsUrl, setWsUrl] = usePersistentState('timone.wsUrl.v1', 'ws://192.168.4.1:8484')
  const [aishubUser, setAishubUser] = usePersistentState('timone.aishub.v1', '')

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
  const routeWx = useRouteWeather(route.waypoints, route.planSpeed, route.departureMs)
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
      status: geo.lat != null ? fenceStatus(geo.lat, geo.lon, p.polygon) : null,
    }))
  }, [geo.lat != null ? geo.lat.toFixed(3) : null, geo.lon != null ? geo.lon.toFixed(3) : null])
  const parkAlert =
    parks.find((p) => p.status === 'inside') || parks.find((p) => p.status === 'near')

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
  const windAlarmActive = windAlarmOn && gustNow != null && gustNow >= windThreshold
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

  const toggleRouteEditing = () => {
    if (route.editing) {
      route.setEditing(false)
      return
    }
    if (route.waypoints.length === 0) route.newRoute()
    else route.setEditing(true)
    setDrawer('route')
  }

  const gpsOk = geo.lat != null

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-ink text-paper">
      {/* PANNELLO STRUMENTI (richiudibile) */}
      {leftOpen && (
        <div className="h-full w-[300px] min-w-[240px] max-w-[28%] flex-none">
          <InstrumentPanel geo={geo} weather={weather} sun={sun} moon={moon} />
        </div>
      )}

      {/* MAPPA A TUTTO SCHERMO */}
      <div className="relative h-full min-w-0 flex-1">
        <MapView
          initialCenter={DEFAULT_CENTER}
          baseStyle={baseStyle}
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

        {/* Maniglia apri/chiudi strumenti */}
        <button
          type="button"
          title={leftOpen ? 'Nascondi strumenti' : 'Mostra strumenti'}
          onClick={() => setLeftOpen((o) => !o)}
          className="absolute left-0 top-1/2 z-[950] flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-sm border border-l-0 border-line bg-ink/95 text-fog shadow-lg shadow-black/40 active:text-paper"
        >
          {leftOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        {/* Strumenti compatti quando il pannello è chiuso */}
        {!leftOpen && (
          <button
            type="button"
            onClick={() => setLeftOpen(true)}
            className="absolute left-9 top-2 z-[900] flex items-center gap-3 rounded-sm border border-line bg-ink/95 px-3 py-2 shadow-lg shadow-black/40"
          >
            <span
              className={`h-2 w-2 rounded-full ${gpsOk ? 'bg-phos' : 'bg-danger'}`}
            />
            <span className="text-left">
              <span className="label block">SOG</span>
              <span className="text-lg font-bold leading-none text-phos tabular-nums">
                {geo.sog != null ? geo.sog.toFixed(1) : '--'}
              </span>
            </span>
            <span className="text-left">
              <span className="label block">COG</span>
              <span className="text-lg font-bold leading-none text-paper tabular-nums">
                {geo.cog != null ? formatDeg(geo.cog) : '---'}°
              </span>
            </span>
            <span className="text-left">
              <span className="label block">Vento</span>
              <span className="text-lg font-bold leading-none text-paper tabular-nums">
                {weather.wind ? `${Math.round(weather.wind.speed)}` : '--'}
                <span className="text-[10px] text-fog">
                  {' '}
                  {weather.wind ? cardinal(weather.wind.dir) : ''}
                </span>
              </span>
            </span>
          </button>
        )}

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
            onClick={toggleRouteEditing}
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

        {/* Menu layer */}
        {layersOpen && (
          <>
            <button
              type="button"
              aria-label="Chiudi menu layer"
              onClick={() => setLayersOpen(false)}
              className="absolute inset-0 z-[990] cursor-default"
            />
            <div className="absolute right-16 top-2 z-[1000] w-52 rounded-sm border border-line bg-ink/95 p-1 shadow-lg shadow-black/40">
              <div className="label px-2 pb-1 pt-1.5">Carta base</div>
              <div className="flex gap-1 px-1 pb-1.5">
                {[
                  ['chart', 'CHIARA'],
                  ['dark', 'SCURA'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBaseStyle(id)}
                    className={`flex-1 border py-2 text-[10px] font-bold tracking-widest ${
                      baseStyle === id
                        ? 'border-phos bg-phos/10 text-phos'
                        : 'border-line bg-panel text-fog'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="label px-2 pb-1">Overlay</div>
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

        {/* Barra modalità rotta */}
        {route.editing && (
          <div className="absolute left-1/2 top-2 z-[950] flex -translate-x-1/2 items-center gap-2 rounded-sm border border-warn bg-ink/95 py-1.5 pl-3 pr-1.5 shadow-lg shadow-black/40">
            <span className="text-[11px] font-bold tracking-wider text-warn">
              ROTTA · tocca il mare
            </span>
            <span className="text-[11px] font-bold text-paper tabular-nums">
              {route.waypoints.length} WP · {route.totalNm.toFixed(1)} nm
            </span>
            <button
              type="button"
              disabled={!route.waypoints.length}
              onClick={route.undoWaypoint}
              className="border border-line bg-panel px-3 py-1.5 text-[10px] font-bold tracking-widest text-paper disabled:opacity-40"
            >
              ↶ UNDO
            </button>
            <button
              type="button"
              onClick={() => {
                route.setEditing(false)
                setDrawer('route')
              }}
              className="border border-warn bg-warn/15 px-3 py-1.5 text-[10px] font-bold tracking-widest text-warn"
            >
              FINE
            </button>
          </div>
        )}

        {/* Barra NAV rotta attiva */}
        {route.nav && !route.editing && !mob && (
          <div className="absolute left-1/2 top-2 z-[900] -translate-x-1/2 rounded-sm border border-phosdim bg-ink/95 px-4 py-2 text-[13px] shadow-lg shadow-black/40 tabular-nums">
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
          <div className="alarm-flash absolute left-1/2 top-2 z-[1100] -translate-x-1/2 border-2 border-danger bg-ink px-4 py-2 text-center">
            <div className="text-[14px] font-bold tracking-[0.25em] text-danger">
              ⊕ UOMO A MARE
            </div>
            {mobInfo && (
              <div className="text-[13px] text-paper tabular-nums">
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
            className={`absolute bottom-8 left-1/2 z-[900] -translate-x-1/2 rounded-sm border px-3 py-1.5 text-center text-[11px] shadow-lg shadow-black/40 ${
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
          <div className="absolute left-2 top-2 z-[900] rounded-sm border border-warn bg-warn/15 px-3 py-1.5 text-[11px] font-bold text-warn">
            ⚠ RAFFICHE {Math.round(gustNow)} kn
          </div>
        )}

        {/* Rail schede (destra, centrato) */}
        {!drawer && (
          <div className="absolute right-0 top-1/2 z-[950] flex -translate-y-1/2 flex-col gap-1">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDrawer(t.id)}
                  className="flex h-14 w-12 flex-col items-center justify-center gap-0.5 rounded-l-sm border border-r-0 border-line bg-ink/95 text-fog shadow-lg shadow-black/40 active:text-paper"
                >
                  <Icon size={16} />
                  <span className="text-[7px] font-bold tracking-widest">{t.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Drawer schede */}
        {drawer && (
          <div className="absolute right-0 top-0 z-[1050] flex h-full w-[320px] max-w-[75%] flex-col border-l border-line bg-ink shadow-2xl shadow-black/60">
            <div className="flex flex-none items-center border-b border-line">
              {TABS.map((t) => {
                const Icon = t.icon
                const active = drawer === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDrawer(t.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-[10px] font-bold tracking-widest ${
                      active
                        ? 'border-phos text-phos'
                        : 'border-transparent text-fog active:text-paper'
                    }`}
                  >
                    <Icon size={13} />
                    {t.label}
                  </button>
                )
              })}
              <button
                type="button"
                aria-label="Chiudi pannello"
                onClick={() => setDrawer(null)}
                className="flex h-full w-11 flex-none items-center justify-center border-l border-line text-fog active:text-paper"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {drawer === 'route' && (
                <RoutePanel
                  route={route}
                  routeWx={routeWx}
                  autopilot={autopilot}
                  gpsOk={gpsOk}
                  bridgeConfigured={Boolean(wsUrl)}
                />
              )}
              {drawer === 'anchors' && (
                <AnchoragePanel
                  anchorages={anchorages}
                  onSelect={selectAnchorage}
                  gpsOk={gpsOk}
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
              {drawer === 'log' && <TrackPanel track={track} gpsOk={gpsOk} />}
            </div>
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

      {/* Modalità notte: overlay in blend-mode (i filtri CSS sull'intera app
          rompono il compositing della mappa su Safari iOS) */}
      {nightMode && (
        <>
          <div className="night-red pointer-events-none absolute inset-0 z-[3000]" />
          <div className="night-dim pointer-events-none absolute inset-0 z-[3001]" />
        </>
      )}
    </div>
  )
}
