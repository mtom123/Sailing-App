import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BAND_DEFAULTS } from '../lib/coastBand.js'
import { EMPTY_COURSE } from '../lib/race.js'
import { DEFAULT_DEPTH_ZONES } from '../lib/isobaths.js'

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
      baseStyle: 'chart', // 'chart' | 'dark' | 'satellite'
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

      // === Alarms ===
      windAlarm: { on: false, threshold: 30 },
      setWindAlarm: (windAlarm) =>
        set((s) => ({ windAlarm: { ...s.windAlarm, ...windAlarm } })),
      anchorWatch: null,
      setAnchorWatch: (anchorWatch) => set({ anchorWatch }),
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
        layers: { ...current.layers, ...persisted?.layers },
        boat: { ...current.boat, ...persisted?.boat },
        coastBand: { ...current.coastBand, ...persisted?.coastBand },
        signalK: { ...current.signalK, ...persisted?.signalK },
        // Prima c'era una boa sola
        raceCourse: persisted?.raceCourse ?? (persisted?.raceMark ? { ...EMPTY_COURSE, marks: [persisted.raceMark] } : current.raceCourse),
      }),
      partialize: (s) => ({
        baseStyle: s.baseStyle,
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
        depthZones: s.depthZones,
      }),
    }
  )
)
