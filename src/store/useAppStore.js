import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
      baseStyle: 'chart', // 'chart' | 'dark' | 'satellite' (future)
      setBaseStyle: (baseStyle) => set({ baseStyle }),

      // === Layers visibility ===
      layers: {
        bathy: true,
        seamarks: true,
        wind: true,
        ais: false,
        parks: true,
        rain: false,
        current: false,
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
      setNightMode: (nightMode) => set({ nightMode }),

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
      aishubUser: '',
      setAishubUser: (aishubUser) => set({ aishubUser }),

      // === Boat configuration ===
      boat: {
        type: 'dufour-41-classic',
        name: 'Dufour 41 Classic',
        polarProfile: 'cruiser-41-monohull',
        motoringSpeedKn: 6.5,
        upwindAngleDeg: 45,
        downwindAngleDeg: 150,
      },
      setBoat: (boat) => set((s) => ({ boat: { ...s.boat, ...boat } })),

      // === Route draft ===
      routeDraft: { name: '', waypoints: [] },
      setRouteDraft: (routeDraft) => set({ routeDraft }),
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

      // === Alarms ===
      windAlarm: { on: false, threshold: 30 },
      setWindAlarm: (windAlarm) =>
        set((s) => ({ windAlarm: { ...s.windAlarm, ...windAlarm } })),
      anchorWatch: null,
      setAnchorWatch: (anchorWatch) => set({ anchorWatch }),
      anchorRadius: 40,
      setAnchorRadius: (anchorRadius) => set({ anchorRadius }),
      alarmMuted: false,
      setAlarmMuted: (alarmMuted) => set({ alarmMuted }),
    }),
    {
      name: 'timone.v2',
      partialize: (s) => ({
        baseStyle: s.baseStyle,
        layers: s.layers,
        boat: s.boat,
        savedRoutes: s.savedRoutes,
        planSpeed: s.planSpeed,
        aisMode: s.aisMode,
        wsUrl: s.wsUrl,
        aishubUser: s.aishubUser,
        windAlarm: s.windAlarm,
        anchorRadius: s.anchorRadius,
      }),
    }
  )
)
