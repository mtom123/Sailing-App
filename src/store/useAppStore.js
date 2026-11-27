import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BAND_DEFAULTS } from '../lib/coastBand.js'
import { EMPTY_COURSE } from '../lib/race.js'
import { DEFAULT_DEPTH_ZONES } from '../lib/isobaths.js'
import { setUserZones } from '../lib/protectedAreas.js'

// Traccia all'ancora: chiave a parte (si aggiorna spesso, lo stato principale è grande)
const TRAIL_KEY = 'timone.anchorTrail'
const TRAIL_MAX = 3000
function loadAnchorTrail() {
  try {
    const t = JSON.parse(localStorage.getItem(TRAIL_KEY))
    return Array.isArray(t) ? t : []
  } catch {
    return []
  }
}
function saveAnchorTrail(t) {
  try {
    if (t.length) localStorage.setItem(TRAIL_KEY, JSON.stringify(t))
    else localStorage.removeItem(TRAIL_KEY)
  } catch {
    // spazio pieno o archiviazione non disponibile: la traccia resta in memoria
  }
}

/**
 * App store — single source of truth per stato globale
 * Sostituisce l'hook soup di v1 con stato persistente pulito
 */

export const useAppStore = create(
  persist(
    (set, get) => ({
      // === View state ===
      view: { center: { lat: 41.15, lon: 9.45 }, zoom: 11, bounds: null },
      setView: (view) => set({ view }),
      follow: true,
      setFollow: (follow) => set({ follow }),

      // === Map style ===
      baseStyle: 'timone', // 'timone' | 'chart' | 'dark' | 'satellite'
      // 1 = la Carta TIMONE è già stata proposta come sfondo (vedi merge)
      chartV: 1,
      setBaseStyle: (baseStyle) => set({ baseStyle }),

      // === Layers visibility ===
      layers: {
        bathy: true,
        isobaths: true,
        posidonia: true,
        seaTemp: false,
        chlorophyll: false,
        fronts: false,
        depthZones: true,
        shomRelief: true,
        seamarks: true,
        wind: true,
        ais: false,
        parks: true,
        coastBand: true,
        ordinances: true,
        beachBars: true,
        rain: false,
        current: false,
        offlineZones: true,
        marks: true,
        sightings: true,
      },
      toggleLayer: (key) =>
        set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
      setLayers: (layers) => set({ layers }),

      // === UI panels ===
      leftPanelOpen: true,
      setLeftPanelOpen: (leftPanelOpen) => set({ leftPanelOpen }),
      activeDrawer: null, // null | 'route' | 'anchors' | 'log' | 'weather' | 'boat'
      setActiveDrawer: (activeDrawer) => set({ activeDrawer }),
      settingsOpen: false,
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

      // === Night mode ===
      nightMode: false,
      // Notte e tema giorno (alto contrasto al sole) si escludono
      setNightMode: (nightMode) => set(nightMode ? { nightMode, dayTheme: false } : { nightMode }),
      dayTheme: false,
      // Dimensione del testo: moltiplica tutte le scritte (1 = originale)
      textScale: 1.2,
      setTextScale: (textScale) => set({ textScale }),
      setDayTheme: (dayTheme) => set(dayTheme ? { dayTheme, nightMode: false } : { dayTheme }),

      // === Time scrubber ===
      timeOffset: 0, // ms offset from now, -12h..+72h
      setTimeOffset: (timeOffset) => set({ timeOffset }),
      isPlaying: false,
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      playSpeed: 6, // ore per secondo
      setPlaySpeed: (playSpeed) => set({ playSpeed }),

      // === AIS ===
      aisMode: 'sim',
      setAisMode: (aisMode) => set({ aisMode }),
      wsUrl: 'ws://192.168.4.1:8484',
      setWsUrl: (wsUrl) => set({ wsUrl }),
      // Strumenti di bordo via Signal K (Raspberry + Quark-elec A027+)
      signalK: { enabled: false, url: '', useGps: true },
      setSignalK: (patch) => set((s) => ({ signalK: { ...s.signalK, ...patch } })),
      aishubUser: '',
      setAishubUser: (aishubUser) => set({ aishubUser }),

      // === Boat configuration ===
      boat: {
        // Identità della barca, nella posizione copiata (COPIA): si scrivono
        // nelle impostazioni e restano sul dispositivo, non nel codice
        vesselName: 'Best Shot',
        callSign: '',
        mmsi: '',
        type: 'dufour-41-classic',
        name: 'Dufour 41 Classic',
        polarProfile: 'cruiser-41-monohull',
        motoringSpeedKn: 6.5,
        // Ancoraggio (anchorPhysics.js): ancora, catena, musone, superficie al vento
        anchorKg: 20,
        anchorType: 'delta',
        chainMm: 10,
        chainLengthM: 60,
        bowHeightM: 1.2,
        windageM2: 12,
        loaM: 12.5,
        kelletKg: 0, // pesce (sentinella) sulla catena
        kelletOn: false, // messo in questo ancoraggio (pannello Ancora)
        // Cima tra gancio sulla catena e bitte (briglia a Y): lunghezza di un ramo e materiale
        snubberM: 4,
        snubberType: 'polyester',
        // Weather routing: 'sail', 'motor' o 'hybrid' (motore sotto motorBelowKn a vela)
        propulsion: 'hybrid',
        motorBelowKn: 4,
        upwindAngleDeg: 45,
        downwindAngleDeg: 150,
        // Rotta: avviso e aggiramento sotto pescaggio + margine
        draftM: 1.9,
        safetyMarginM: 1,
      },
      setBoat: (boat) => set((s) => ({ boat: { ...s.boat, ...boat } })),

      // === Fascia costiera (ordinanze balneari): distanze in metri ===
      coastBand: { ...BAND_DEFAULTS },
      setCoastBand: (coastBand) => set((s) => ({ coastBand: { ...s.coastBand, ...coastBand } })),

      // Punto della carta per il prossimo avvistamento (pressione lunga)
      sightingPoint: null,

      // === Route draft ===
      routeDraft: { name: '', waypoints: [] },
      // Valore o funzione (bozza precedente → nuova), come lo useState di React:
      // RoutePanel (annulla ultimo WP, salva) passa una funzione
      setRouteDraft: (routeDraft) =>
        set((s) => ({ routeDraft: typeof routeDraft === 'function' ? routeDraft(s.routeDraft) : routeDraft })),
      // Opzione meteo presa come rotta: la linea tracciata resta in `previous`
      routeApplied: null, // { option, waypoints, previous } | null
      applyRouteOption: (option, optionWaypoints) =>
        set((s) => {
          const current = s.routeDraft.waypoints
          const stamp = Date.now().toString(36)
          const waypoints = optionWaypoints.map((w, i) => ({ id: `w${stamp}${i}`, lat: w.lat, lon: w.lon, name: `WP${i + 1}` }))
          const previous = s.routeApplied?.waypoints === current ? s.routeApplied.previous : current
          return { routeDraft: { ...s.routeDraft, waypoints }, activeWaypointIdx: 1, routeApplied: { option, waypoints, previous } }
        }),
      restoreDrawnRoute: () =>
        set((s) =>
          s.routeApplied ? { routeDraft: { ...s.routeDraft, waypoints: s.routeApplied.previous }, activeWaypointIdx: 1, routeApplied: null } : s
        ),
      moveWaypointUp: (id) =>
        set((s) => {
          const wps = [...s.routeDraft.waypoints]
          const i = wps.findIndex((w) => w.id === id)
          if (i <= 0) return s
          ;[wps[i - 1], wps[i]] = [wps[i], wps[i - 1]]
          return { routeDraft: { ...s.routeDraft, waypoints: wps.map((w, idx) => ({ ...w, name: `WP${idx + 1}` })) } }
        }),
      moveWaypointDown: (id) =>
        set((s) => {
          const wps = [...s.routeDraft.waypoints]
          const i = wps.findIndex((w) => w.id === id)
          if (i < 0 || i >= wps.length - 1) return s
          ;[wps[i + 1], wps[i]] = [wps[i], wps[i + 1]]
          return { routeDraft: { ...s.routeDraft, waypoints: wps.map((w, idx) => ({ ...w, name: `WP${idx + 1}` })) } }
        }),
      routeEditing: false,
      setRouteEditing: (routeEditing) => set({ routeEditing }),
      routeNavigating: false,
      setRouteNavigating: (routeNavigating) => set({ routeNavigating }),
      activeWaypointIdx: 1,
      setActiveWaypointIdx: (activeWaypointIdx) => set({ activeWaypointIdx }),

      // === Saved routes ===
      savedRoutes: [],
      addSavedRoute: (route) =>
        set((s) => ({
          savedRoutes: [
            { ...route, id: `r${Date.now().toString(36)}`, createdAt: Date.now() },
            ...s.savedRoutes.filter((r) => r.name !== route.name),
          ],
        })),
      deleteSavedRoute: (id) =>
        set((s) => ({ savedRoutes: s.savedRoutes.filter((r) => r.id !== id) })),

      // === Routing computation ===
      routeOptions: null, // { fastest, comfortable, safest } | null
      setRouteOptions: (routeOptions) => set({ routeOptions }),
      activeRouteOption: 'fastest', // 'fastest' | 'comfortable' | 'safest'
      setActiveRouteOption: (activeRouteOption) => set({ activeRouteOption }),

      // === Plan speed (per ETA) ===
      planSpeed: 5,
      setPlanSpeed: (planSpeed) => set({ planSpeed }),

      // === Departure ===
      departureOffsetH: 0,
      setDepartureOffsetH: (departureOffsetH) => set({ departureOffsetH }),

      // === Regata: percorso, la VMG si calcola verso il prossimo punto ===
      raceCourse: EMPTY_COURSE, // { start, marks: [{ lat, lon }], next }
      setRaceCourse: (raceCourse) => set({ raceCourse }),
      racePicking: false, // 'start', 'mark' o { move: indice }: cosa fa il tocco sulla carta

      // === Mark personali: l'archivio è su IndexedDB (useMarks.js) ===
      marks: [],
      markEdit: null, // scheda aperta: un mark esistente o uno nuovo senza id
      markPicking: false, // il prossimo tocco sulla carta dà la posizione al mark

      // Rotta verso un punto: dalla rotta in corso, o dal centro carta se non c'è
      routeTo: (lat, lon) =>
        set((s) => ({
          routeDraft: {
            name: 'Destinazione',
            waypoints: s.routeDraft.waypoints.length >= 1
              ? [...s.routeDraft.waypoints, { id: `w${Date.now().toString(36)}`, lat, lon, name: `WP${s.routeDraft.waypoints.length + 1}` }]
              : [{ id: `w${Date.now().toString(36)}`, lat: s.view.center.lat, lon: s.view.center.lon, name: 'WP1' }, { id: `w${Date.now().toString(36)}x`, lat, lon, name: 'WP2' }],
          },
          activeDrawer: 'route',
        })),

      // Profondità scritte a mano nel pannello Ancoraggio, con la posizione:
      // TIMONE le ripropone tornando lì (AnchorPlan.jsx). [{ lat, lon, depth, at }]
      soundings: [],
      addSounding: (p) =>
        set((s) => {
          const kx = 111320 * Math.cos((p.lat * Math.PI) / 180)
          const far = (q) => Math.hypot((q.lat - p.lat) * 111320, (q.lon - p.lon) * kx) > 30
          // Una sola misura entro 30 m: la nuova sostituisce la vecchia
          return { soundings: [...s.soundings.filter(far), { ...p, at: Date.now() }].slice(-500) }
        }),

      // Le mie note sui baretti sulla spiaggia, per id del locale (beachBarsLayer.js):
      // { name, lat, lon, flags: { tender, buoys, … }, phone, text }
      barNotes: {},
      setBarNote: (id, patch) => set((s) => ({ barNotes: { ...s.barNotes, [id]: { ...s.barNotes[id], ...patch } } })),

      // Zone vietate inserite a mano dalla lente (avvisi ai naviganti):
      // [{ id, name, points: [[lat, lon]], created, until }]: until (ms) o null = finché non la togli
      userZones: [],
      updateUserZone: (id, patch) => set((s) => ({ userZones: s.userZones.map((z) => (z.id === id ? { ...z, ...patch } : z)) })),
      addUserZone: (z) => set((s) => ({ userZones: [...s.userZones, { id: `z${Date.now().toString(36)}`, created: Date.now(), ...z }] })),
      removeUserZone: (id) => set((s) => ({ userZones: s.userZones.filter((z) => z.id !== id) })),

      // === Alarms ===
      windAlarm: { on: false, threshold: 30 },
      setWindAlarm: (windAlarm) =>
        set((s) => ({ windAlarm: { ...s.windAlarm, ...windAlarm } })),
      anchorWatch: null, // { lat, lon, radius }: salvato, così l'allarme riparte se l'app si riapre
      setAnchorWatch: (anchorWatch) => {
        saveAnchorTrail([])
        set({ anchorWatch, anchorTrail: [] })
      },
      // Posizioni della barca all'ancora [[lat, lon, t]], per vedere il borneggio
      anchorTrail: loadAnchorTrail(),
      addAnchorTrail: (p) =>
        set((s) => {
          const anchorTrail = [...s.anchorTrail.slice(-(TRAIL_MAX - 1)), p]
          saveAnchorTrail(anchorTrail)
          return { anchorTrail }
        }),
      // Mani bagnate: aperta ora (non salvata) e apertura automatica sopra la soglia
      wetOn: false,
      setWetOn: (wetOn) => set({ wetOn }),
      wetAuto: { on: false, threshold: 25 },
      setWetAuto: (v) => set((s) => ({ wetAuto: { ...s.wetAuto, ...v } })),
      anchorRadius: 40,
      setAnchorRadius: (anchorRadius) => set({ anchorRadius }),
      // Fasce di profondità colorate (impostazioni): [{ id, name, from, to, color, on }]
      depthZones: DEFAULT_DEPTH_ZONES,
      setDepthZones: (depthZones) => set({ depthZones }),
      alarmMuted: false,
      setAlarmMuted: (alarmMuted) => set({ alarmMuted }),
    }),
    {
      name: 'timone.v2',
      // I campi nuovi (livelli, dati barca) prendono il default anche se c'è uno stato salvato
      merge: (persisted, current) => ({
        ...current,
        ...persisted,
        // Novembre 2026: la Carta TIMONE diventa lo sfondo, una volta sola;
        // chi poi sceglie un'altra carta la tiene
        ...(persisted && persisted.chartV !== 1 ? { baseStyle: 'timone', chartV: 1 } : {}),
        layers: { ...current.layers, ...persisted?.layers },
        boat: { ...current.boat, ...persisted?.boat },
        coastBand: { ...current.coastBand, ...persisted?.coastBand },
        signalK: { ...current.signalK, ...persisted?.signalK },
        // Prima c'era una boa sola
        raceCourse: persisted?.raceCourse ?? (persisted?.raceMark ? { ...EMPTY_COURSE, marks: [persisted.raceMark] } : current.raceCourse),
      }),
      partialize: (s) => ({
        baseStyle: s.baseStyle,
        chartV: s.chartV,
        layers: s.layers,
        boat: s.boat,
        coastBand: s.coastBand,
        raceCourse: s.raceCourse,
        savedRoutes: s.savedRoutes,
        planSpeed: s.planSpeed,
        aisMode: s.aisMode,
        wsUrl: s.wsUrl,
        signalK: s.signalK,
        aishubUser: s.aishubUser,
        windAlarm: s.windAlarm,
        dayTheme: s.dayTheme,
        textScale: s.textScale,
        anchorRadius: s.anchorRadius,
        wetAuto: s.wetAuto,
        anchorWatch: s.anchorWatch,
        depthZones: s.depthZones,
        userZones: s.userZones,
        barNotes: s.barNotes,
        soundings: s.soundings,
      }),
    }
  )
)

// Le zone inserite a mano valgono per allarmi e rotte (protectedAreas.js)
setUserZones(useAppStore.getState().userZones)
useAppStore.subscribe((s, prev) => {
  if (s.userZones !== prev.userZones) setUserZones(s.userZones)
})

// Una zona scaduta (l'avviso è finito) si toglie da sola, anche con l'app aperta
function dropExpiredZones() {
  const now = Date.now()
  const zones = useAppStore.getState().userZones
  if (zones.some((z) => z.until && z.until <= now)) useAppStore.setState({ userZones: zones.filter((z) => !z.until || z.until > now) })
}
dropExpiredZones()
setInterval(dropExpiredZones, 30000)
