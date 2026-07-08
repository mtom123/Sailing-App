import { useEffect, useMemo, useState } from 'react'
import MapView from './components/v2/MapView.jsx'
import RoutePanel from './components/v2/RoutePanel.jsx'
import WeatherTimeline from './components/v2/WeatherTimeline.jsx'
import ConnectivityIndicator from './components/v2/ConnectivityIndicator.jsx'
import InstrumentPanel from './components/InstrumentPanel.jsx'
import AnchoragePanel from './components/AnchoragePanel.jsx'
import SettingsSheet from './components/SettingsSheet.jsx'
import TrackPanel from './components/TrackPanel.jsx'
import { useAppStore } from './store/useAppStore.js'
import { registerCustomPolar } from './routing/polarSolver.js'
import { listCustomPolars } from './lib/polarParser.js'

// Hooks riusabili
import useGeolocation from './hooks/useGeolocation.js'
import useOpenMeteo from './hooks/useOpenMeteo.js'
import useWindField from './hooks/useWindField.js'
import useAIS from './hooks/useAIS.js'
import useAutopilot from './hooks/useAutopilot.js'
import useTrack from './hooks/useTrack.js'
import useRainRadar from './hooks/useRainRadar.js'
import useGrib from './hooks/useGrib.js'
import useWeatherRouting from './hooks/useWeatherRouting.js'

// Libs
import { ANCHORAGES } from './data/anchorages.js'
import { MARINE_PARKS } from './data/marineParks.js'
import { evaluateAnchorage } from './lib/anchorageSafety.js'
import { fenceStatus } from './lib/geoFence.js'
import { haversine, bearing, formatDeg, cardinal, metersToNm } from './lib/geo.js'
import { armAudio, startAlarm, stopAlarm, warnBeep } from './lib/alarm.js'
import { sunTimes, moonPhase } from './lib/sun.js'
import { routeLegs, routeTotalNm, crossTrackError } from './lib/route.js'

// Adaptive hooks: gli hook leggono dallo store
function useRouteAdapter(geo) {
  const { routeDraft, routeEditing, routeNavigating, activeWaypointIdx, planSpeed, departureOffsetH, savedRoutes, addSavedRoute, deleteSavedRoute, setRouteDraft, setRouteEditing, setRouteNavigating, setActiveWaypointIdx, setPlanSpeed, setDepartureOffsetH } = useAppStore()
  const waypoints = routeDraft.waypoints

  const legs = useMemo(() => routeLegs(waypoints), [waypoints])
  const totalNm = useMemo(() => routeTotalNm(waypoints), [waypoints])
  const departureMs = Date.now() + departureOffsetH * 3600 * 1000

  const nav = useMemo(() => {
    if (!routeNavigating || waypoints.length < 2 || geo.lat == null) return null
    const idx = Math.min(Math.max(activeWaypointIdx, 1), waypoints.length - 1)
    const prev = waypoints[idx - 1]
    const dest = waypoints[idx]
    const dtw = haversine(geo.lat, geo.lon, dest.lat, dest.lon)
    const btw = bearing(geo.lat, geo.lon, dest.lat, dest.lon)
    const xte = crossTrackError({ lat: geo.lat, lon: geo.lon }, prev, dest)
    const speed = geo.sog != null && geo.sog > 1 ? geo.sog : planSpeed
    const remaining =
      dtw + routeLegs(waypoints.slice(idx)).reduce((sum, leg) => sum + leg.dist, 0)
    return {
      idx,
      dest,
      dtwNm: metersToNm(dtw),
      btw,
      xte,
      etaMs: Date.now() + (metersToNm(remaining) / speed) * 3600 * 1000,
      remainingNm: metersToNm(remaining),
      arrived: dtw < 100,
      isLast: idx === waypoints.length - 1,
    }
  }, [routeNavigating, waypoints, activeWaypointIdx, geo.lat, geo.lon, geo.sog, planSpeed])

  // Auto-advance
  useEffect(() => {
    if (nav && nav.arrived && !nav.isLast && activeWaypointIdx === nav.idx) {
      setActiveWaypointIdx(nav.idx + 1)
    }
  }, [nav, activeWaypointIdx, setActiveWaypointIdx])

  return {
    waypoints,
    routeName: routeDraft.name,
    savedRoutes,
    legs,
    totalNm,
    editing: routeEditing,
    setEditing: setRouteEditing,
    navigating: routeNavigating,
    startNav: () => {
      setActiveWaypointIdx(1)
      setRouteNavigating(true)
      setRouteEditing(false)
    },
    stopNav: () => setRouteNavigating(false),
    activeIdx: activeWaypointIdx,
    planSpeed,
    setPlanSpeed,
    departureOffsetH,
    setDepartureOffsetH,
    departureMs,
    addSavedRoute,
    deleteSavedRoute,
    setRouteDraft,
    nav,
  }
}

export default function App() {
  const geo = useGeolocation()
  const {
    view,
    leftPanelOpen,
    activeDrawer,
    setActiveDrawer,
    nightMode,
    settingsOpen,
    setSettingsOpen,
    layers,
    layers: { wind: windLayerOn, ais: aisLayerOn, rain: rainLayerOn },
    aisMode,
    wsUrl,
    aishubUser,
    windAlarm,
    anchorWatch,
    setAnchorWatch,
    anchorRadius,
    alarmMuted,
    setAlarmMuted,
    boat,
    routeDraft,
    activeRouteOption,
    setActiveRouteOption,
    routeOptions: storedRouteOptions,
    setRouteOptions,
  } = useAppStore()

  // Wake lock
  useEffect(() => {
    let lock = null
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen')
      } catch {}
    }
    const onVis = () => document.visibilityState === 'visible' && acquire()
    acquire()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (lock) lock.release().catch(() => {})
    }
  }, [])

  // Load custom polars from IndexedDB on app start
  useEffect(() => {
    listCustomPolars().then((polars) => {
      for (const p of polars) {
        try {
          registerCustomPolar(p.key, p.polarData)
        } catch (e) {
          console.warn('Failed to register polar:', p.key, e)
        }
      }
    }).catch(() => {})
  }, [])

  // Data hooks
  const weather = useOpenMeteo(view.center.lat, view.center.lon)
  const windField = useWindField(view.bounds, windLayerOn)
  const gribData = useGrib(view.bounds, true)
  const grib = gribData?.grib || null
  const currentField = gribData?.currentField || null
  const rainTileUrl = useRainRadar(rainLayerOn)
  const { vessels, status: aisStatus } = useAIS({
    mode: aisMode,
    wsUrl,
    aishubUser,
    center: view.center,
    bounds: view.bounds,
  })

  // Route + routing
  const route = useRouteAdapter(geo)
  const autopilot = useAutopilot({ wsUrl, nav: route.nav, waypoints: route.waypoints, geo })
  const track = useTrack(geo)

  // Weather routing computation: start = boat (or first WP), goal = last WP
  const start = geo.lat != null
    ? { lat: geo.lat, lon: geo.lon }
    : route.waypoints[0]
    ? { lat: route.waypoints[0].lat, lon: route.waypoints[0].lon }
    : null
  const goal = route.waypoints.length >= 2
    ? { lat: route.waypoints[route.waypoints.length - 1].lat, lon: route.waypoints[route.waypoints.length - 1].lon }
    : null
  const { routeOptions, computing, duration } = useWeatherRouting({
    start,
    goal,
    grib,
    currentField,
    enabled: route.waypoints.length >= 2,
  })

  // Push to store (so MapView + RoutePanel can read)
  useEffect(() => {
    setRouteOptions(routeOptions)
  }, [routeOptions, setRouteOptions])

  // Sun/moon
  const refPoint = geo.lat != null ? { lat: geo.lat, lon: geo.lon } : view.center
  const sun = useMemo(
    () => sunTimes(new Date(), refPoint.lat, refPoint.lon),
    [Math.floor(Date.now() / 3600000), refPoint.lat.toFixed(1), refPoint.lon.toFixed(1)]
  )
  const moon = useMemo(() => moonPhase(new Date()), [Math.floor(Date.now() / 86400000)])

  // Anchorages with safety
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

  // Marine parks
  const parks = useMemo(() => {
    return MARINE_PARKS.map((p) => ({
      ...p,
      status: geo.lat != null ? fenceStatus(geo.lat, geo.lon, p.polygon) : null,
    }))
  }, [geo.lat != null ? geo.lat.toFixed(3) : null, geo.lon != null ? geo.lon.toFixed(3) : null])
  const parkAlert = parks.find((p) => p.status === 'inside') || parks.find((p) => p.status === 'near')

  // MOB
  const [mob, setMob] = useState(null)
  const dropMob = () => {
    if (geo.lat == null) return
    armAudio()
    warnBeep()
    setMob({ lat: geo.lat, lon: geo.lon, ts: Date.now() })
    useAppStore.getState().setFollow(true)
  }
  const mobInfo =
    mob && geo.lat != null
      ? {
          dist: haversine(geo.lat, geo.lon, mob.lat, mob.lon),
          brg: bearing(geo.lat, geo.lon, mob.lat, mob.lon),
        }
      : null

  // Wind alarm
  const gustNow = weather.wind?.gust ?? weather.wind?.speed ?? null
  const windAlarmActive = windAlarm.on && gustNow != null && gustNow >= windAlarm.threshold
  useEffect(() => {
    if (windAlarmActive) warnBeep()
  }, [windAlarmActive])

  // Anchor watch alarm
  const watchDistance =
    anchorWatch && geo.lat != null
      ? haversine(geo.lat, geo.lon, anchorWatch.lat, anchorWatch.lon)
      : null
  const anchorAlarmActive = Boolean(anchorWatch) && watchDistance != null && watchDistance > anchorWatch.radius
  useEffect(() => {
    if (anchorAlarmActive && !alarmMuted) startAlarm()
    else stopAlarm()
    return () => stopAlarm()
  }, [anchorAlarmActive, alarmMuted])

  const dropAnchor = () => {
    if (geo.lat == null) return
    armAudio()
    setAlarmMuted(false)
    setAnchorWatch({ lat: geo.lat, lon: geo.lon, radius: anchorRadius })
  }
  const raiseAnchor = () => {
    setAnchorWatch(null)
    setAlarmMuted(false)
  }

  const gpsOk = geo.lat != null

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-abyss text-paper" style={{ minHeight: 0 }}>
      {/* LEFT panel (instruments) */}
      {leftPanelOpen && (
        <div className="h-full w-[280px] min-w-[200px] max-w-[35%] flex-none" style={{ minHeight: 0 }}>
          <InstrumentPanel geo={geo} weather={weather} sun={sun} moon={moon} />
        </div>
      )}

      {/* CENTER map */}
      <div className="relative flex min-w-0 min-h-0 flex-1 flex-col">
        <div className="relative flex-1" style={{ minHeight: 0 }}>
          <MapView
            geo={geo}
            weather={weather}
            windField={windField}
            currentField={currentField}
            vessels={vessels}
            anchorages={anchorages}
            route={route}
            parks={parks}
            trackPoints={track.points}
            mob={mob}
            routeOptions={routeOptions}
            onDropMob={dropMob}
          />

          {/* Park alert banner */}
          {parkAlert && !mob && (
            <div
              className={`glass absolute bottom-8 left-1/2 z-[900] flex -translate-x-1/2 items-center gap-2 rounded-lg px-3 py-1.5 text-xs slide-up ${
                parkAlert.status === 'inside'
                  ? 'border-danger/50 text-danger'
                  : 'border-warn/50 text-warn'
              }`}
            >
              <b>
                {parkAlert.status === 'inside' ? '⚠ DENTRO ' : '⚠ VICINO A '}
                {parkAlert.name}
              </b>
              <span className="text-[10px] opacity-70">Tocca l'area per le regole</span>
            </div>
          )}

          {/* Wind alarm */}
          {windAlarmActive && !mob && (
            <div className="glass-strong absolute left-3 bottom-20 z-[900] rounded-lg border border-warn/50 px-3 py-1.5 text-xs font-bold text-warn">
              ⚠ RAFFICHE {Math.round(gustNow)} kn
            </div>
          )}

          {/* Anchor alarm banner */}
          {anchorAlarmActive && (
            <div className="alarm-flash glass-strong absolute left-1/2 bottom-20 z-[1100] flex -translate-x-1/2 items-center gap-3 rounded-lg border-2 border-danger px-4 py-2 text-center">
              <div>
                <div className="text-sm font-bold tracking-widest text-danger">
                  ⊕ ANCORA SCARROCCIA
                </div>
                <div className="text-xs text-paper tabular">
                  {watchDistance.toFixed(0)} m · raggio {anchorRadius} m
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAlarmMuted(true)}
                className="touch rounded-md border border-line bg-surface px-3 py-1.5 text-[10px] tracking-widest text-fog"
              >
                TACITA
              </button>
              <button
                type="button"
                onClick={raiseAnchor}
                className="touch rounded-md border border-danger bg-danger/20 px-3 py-1.5 text-[10px] tracking-widest text-danger"
              >
                RECUPERA
              </button>
            </div>
          )}

          {/* MOB banner */}
          {mob && (
            <div className="alarm-flash glass-strong absolute left-1/2 top-3 z-[1100] flex -translate-x-1/2 items-center gap-3 rounded-lg border-2 border-danger px-4 py-2 text-center">
              <div>
                <div className="text-sm font-bold tracking-[0.25em] text-danger">
                  ⊕ UOMO A MARE
                </div>
                {mobInfo && (
                  <div className="text-xs text-paper tabular">
                    {formatDeg(mobInfo.brg)}° {cardinal(mobInfo.brg)} ·{' '}
                    {mobInfo.dist < 1852
                      ? `${mobInfo.dist.toFixed(0)} m`
                      : `${metersToNm(mobInfo.dist).toFixed(2)} nm`}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMob(null)}
                className="touch rounded-md border border-line bg-surface px-3 py-1.5 text-[10px] tracking-widest text-fog"
              >
                ANNULLA
              </button>
            </div>
          )}
        </div>

        {/* BOTTOM timeline */}
        <WeatherTimeline />

        {/* RIGHT drawer */}
        {activeDrawer && activeDrawer !== 'layers' && (
          <div className="glass-strong absolute right-0 top-0 z-[1050] flex h-full w-[340px] max-w-[75%] flex-col border-l border-line slide-up">
            <div className="flex flex-none items-center border-b border-line">
              {[
                { id: 'route', label: 'ROTTA' },
                { id: 'anchors', label: 'ANCORE' },
                { id: 'weather', label: 'METEO' },
                { id: 'log', label: 'LOG' },
              ].map((t) => {
                const active = activeDrawer === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveDrawer(t.id)}
                    className={`flex-1 border-b-2 py-3 text-[10px] font-semibold tracking-widest transition-all ${
                      active
                        ? 'border-phos text-phos'
                        : 'border-transparent text-fog hover:text-paper'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
              <button
                type="button"
                aria-label="Chiudi"
                onClick={() => setActiveDrawer(null)}
                className="flex h-full w-11 flex-none items-center justify-center border-l border-line text-fog hover:text-paper"
              >
                ✕
              </button>
            </div>
            <div className="scroll-y min-h-0 flex-1">
              {activeDrawer === 'route' && (
                <RoutePanel
                  route={route}
                  routeOptions={routeOptions}
                  computing={computing}
                  duration={duration}
                  gpsOk={gpsOk}
                  bridgeConfigured={Boolean(wsUrl)}
                  autopilot={autopilot}
                />
              )}
              {activeDrawer === 'anchors' && (
                <AnchoragePanel
                  anchorages={anchorages}
                  onSelect={(a) =>
                    useAppStore.setState({
                      follow: false,
                      view: { ...view, center: { lat: a.lat, lon: a.lon } },
                    })
                  }
                  gpsOk={gpsOk}
                  anchorWatch={anchorWatch}
                  radius={anchorRadius}
                  onRadiusChange={useAppStore.getState().setAnchorRadius}
                  onDropAnchor={dropAnchor}
                  onRaiseAnchor={raiseAnchor}
                  watchDistance={watchDistance}
                  alarmActive={anchorAlarmActive}
                  onMuteAlarm={() => setAlarmMuted(true)}
                />
              )}
              {activeDrawer === 'weather' && (
                <WeatherDetail weather={weather} />
              )}
              {activeDrawer === 'log' && <TrackPanel track={track} gpsOk={gpsOk} />}
            </div>
          </div>
        )}
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        aisMode={aisMode}
        onAisModeChange={useAppStore.getState().setAisMode}
        wsUrl={wsUrl}
        onWsUrlChange={useAppStore.getState().setWsUrl}
        aishubUser={aishubUser}
        onAishubUserChange={useAppStore.getState().setAishubUser}
        aisStatus={aisStatus}
        windAlarm={{
          on: windAlarm.on,
          setOn: (v) => useAppStore.getState().setWindAlarm({ on: v }),
          threshold: windAlarm.threshold,
          setThreshold: (v) => useAppStore.getState().setWindAlarm({ threshold: v }),
        }}
        weatherError={weather.error}
        gribStatus={{
          wind: !!grib,
          windPoints: grib?.grid?.length || 0,
          windHours: grib?.grid?.[0]?.times?.length || 0,
          current: !!(currentField && currentField.grid.some(p => p.currSpeed)),
          currentPoints: currentField?.grid?.length || 0,
          polygons: 1,
          updatedAt: grib?.updatedAt,
        }}
      />

      {nightMode && (
        <>
          <div className="night-overlay absolute inset-0 z-[3000]" />
          <div className="night-dim absolute inset-0 z-[3001]" />
        </>
      )}
    </div>
  )
}

function WeatherDetail({ weather }) {
  const { wind, wave, pressure, hourly } = weather
  if (!hourly) return <div className="p-4 text-sm text-fog">Caricamento meteo…</div>
  const now = Date.now()
  const next24 = hourly.filter((h) => new Date(h.t + 'Z').getTime() < now + 24 * 3600 * 1000)
  return (
    <div className="p-3 space-y-3">
      <div>
        <div className="label pb-1">Vento attuale</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-line bg-surface p-2">
            <div className="label">Velocità</div>
            <div className="font-mono text-lg font-bold text-phos">
              {wind?.speed != null ? wind.speed.toFixed(0) : '--'}
              <span className="text-[10px] text-fog ml-1">kn</span>
            </div>
          </div>
          <div className="rounded-md border border-line bg-surface p-2">
            <div className="label">Raffica</div>
            <div className="font-mono text-lg font-bold text-warn">
              {wind?.gust != null ? wind.gust.toFixed(0) : '--'}
              <span className="text-[10px] text-fog ml-1">kn</span>
            </div>
          </div>
          <div className="rounded-md border border-line bg-surface p-2">
            <div className="label">Direz.</div>
            <div className="font-mono text-lg font-bold text-paper">
              {wind?.dir != null ? formatDeg(wind.dir) : '---'}°
              <div className="text-[10px] text-fog">{wind?.dir != null ? cardinal(wind.dir) : ''}</div>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="label pb-1">Onda</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border border-line bg-surface p-2">
            <div className="label">Altezza</div>
            <div className="font-mono text-lg font-bold text-paper">
              {wave?.height != null ? wave.height.toFixed(1) : '--'}
              <span className="text-[10px] text-fog ml-1">m</span>
            </div>
          </div>
          <div className="rounded-md border border-line bg-surface p-2">
            <div className="label">Periodo</div>
            <div className="font-mono text-lg font-bold text-paper">
              {wave?.period != null ? wave.period.toFixed(0) : '--'}
              <span className="text-[10px] text-fog ml-1">s</span>
            </div>
          </div>
          <div className="rounded-md border border-line bg-surface p-2">
            <div className="label">Direz.</div>
            <div className="font-mono text-lg font-bold text-paper">
              {wave?.dir != null ? formatDeg(wave.dir) : '---'}°
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="label pb-1">Pressione</div>
        <div className="rounded-md border border-line bg-surface p-2">
          <div className="font-mono text-lg font-bold text-paper">
            {pressure ? pressure.value.toFixed(0) : '--'}
            <span className="text-[10px] text-fog ml-1">hPa</span>
          </div>
          {pressure?.trend3h != null && (
            <div className={`text-xs ${pressure.trend3h < -0.8 ? 'text-danger' : pressure.trend3h > 0.8 ? 'text-phos' : 'text-fog'}`}>
              Tendenza 3h: {pressure.trend3h > 0 ? '+' : ''}{pressure.trend3h.toFixed(1)} hPa
            </div>
          )}
        </div>
      </div>
      <div>
        <div className="label pb-1">Prossime 24h</div>
        <div className="rounded-md border border-line bg-surface p-2 space-y-1 max-h-[300px] scroll-y">
          {next24.map((h, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-fog font-mono w-12">
                {new Date(h.t + 'Z').toLocaleTimeString('it-IT', { hour: '2-digit' })}
              </span>
              <span className="font-mono text-phos">{h.wind?.toFixed(0) ?? '--'}kn</span>
              <span className="font-mono text-warn">↑{h.gust?.toFixed(0) ?? '--'}</span>
              <span className="text-fog text-[10px] w-8">{h.windDir != null ? cardinal(h.windDir) : ''}</span>
              <span className="font-mono text-paper text-[10px]">{h.wave?.toFixed(1) ?? '--'}m</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
