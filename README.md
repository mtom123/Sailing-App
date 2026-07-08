# TIMONE v2.1 — Marine Weather Routing

PWA di navigazione marina professionale per iPad. Weather routing con algoritmo isocrone, polari della barca, 3 opzioni di rotta (veloce/comoda/sicura), land mask e correnti marine.

**Live demo**: https://mtom123.github.io/Sailing-App/

## Stack

- **React 18** + **Vite 5**
- **MapLibre GL JS** — mappa vettoriale con stile nautico custom
- **Zustand** — state management
- **Tailwind CSS 4** — design system "Marine Ops"
- **Open-Meteo API** — vento, onde, pressione, correnti (gratuito, no API key)
- **EMODnet Bathymetry** + **OpenSeaMap** + **CARTO** — cartografia gratuita
- **Natural Earth 50m** — land mask Mediterranean

## Cosa c'è in v2.1

### Mappe
- MapLibre GL JS con stile nautico custom
- Batimetria EMODnet HR fino a z14
- Seamarks OpenSeaMap con fari/boe
- CARTO Voyager come base (z fino a 20)
- Markers custom con rotazione, popup styled

### Weather Routing (engine isocrone)
- Algoritmo isocrone: 24 direzioni × 30min steps × Pareto pruning
- 3 rotte alternative: **veloce**, **comoda**, **sicura**
- Polare Dufour 41 Classic interpolata bilinearmente
- Penalità comfort/sicurezza su vento, onda, TWA, notte
- VMG ottimale lungo la rotta
- Land mask con grid spatial index (no attraversamento costa)
- Correnti marine integrate (vector addizione a boat speed)
- Cache IndexedDB per GRIB (TTL 6h)

### Wind + Current visualization
- Particle animation stile Windy per vento (180 particelle, fade trail)
- Color coding per intensità: teal (light) → amber → red (strong)
- Static arrows overlay per lettura direzione
- Frecce blu per correnti marine (toggle layer)
- Time-aware: campiona vento/corrente all'ora selezionata nella timeline

### UI/UX "Marine Ops"
- Palette deep navy + phosphor teal
- Glassmorphism pannelli galleggianti
- Touch targets ≥44px (Apple HIG)
- Font: Inter (UI) + JetBrains Mono (dati)
- Layout responsive iPad landscape/portrait
- Connectivity indicator ONLINE/OFFLINE/PARTIAL

### Weather Timeline
- Scrubber animato -12h/+72h (stile Windy)
- Play con velocità 3×/6×/12×
- Tick marks ore/giorni

### Boat Configuration
- Selezione polar dalla library (Dufour 41 Classic predefinito)
- Velocità motore configurabile
- Angoli bolina/poppa configurabili
- Espandibile con .pol upload (todo)

### Route Comparison
- 3 opzioni visualizzate su mappa con colori diversi
- Tabella comparativa: ETA, distanza, comfort score
- Selezione rotta attiva con click

## Architettura

```
src/
├── components/
│   ├── v2/                    # Componenti nuovi
│   │   ├── MapView.jsx        # MapLibre + layers + markers
│   │   ├── RoutePanel.jsx     # Editor + routing options
│   │   ├── WeatherTimeline.jsx # Scrubber -12h/+72h
│   │   └── ConnectivityIndicator.jsx
│   ├── InstrumentPanel.jsx    # SOG/COG/vento/onda
│   ├── AnchoragePanel.jsx     # Ancoraggi con semaforo
│   ├── SettingsSheet.jsx      # Config barca/AIS/allarmi
│   └── TrackPanel.jsx         # Log con GPX export
├── routing/
│   ├── isochroneEngine.js     # Algoritmo isocrone
│   └── polarSolver.js         # Polar Dufour 41
├── store/
│   └── useAppStore.js         # Zustand global state
├── hooks/
│   ├── useGrib.js             # 7×7 wind + current grid + cache
│   ├── useWeatherRouting.js   # Async routing computation
│   ├── useOpenMeteo.js        # Weather station data
│   ├── useWindField.js        # Light wind field for display
│   ├── useRoute.js            # Route draft + nav logic
│   └── ...
├── lib/
│   ├── landMask.js            # Point-in-polygon + grid index
│   ├── cache.js               # IndexedDB wrapper
│   ├── geo.js                 # Haversine, bearing, etc.
│   ├── route.js               # Route legs, ETA, GPX
│   └── ...
├── data/
│   ├── geo/
│   │   └── mediterranean-land.json  # 114KB land mask
│   ├── anchorages.js
│   └── marineParks.js
├── map/
│   └── marine-style.json      # MapLibre style nautico
└── styles/
    └── globals.css            # Tailwind 4 + design tokens
```

## Avvio

```bash
npm install
npm run dev      # sviluppo su http://localhost:5173
npm run build    # build produzione in dist/
npm run preview  # anteprima build
```

## Installazione su iPad

1. Apri https://mtom123.github.io/Sailing-App/ in Safari
2. Condividi → Aggiungi a schermata Home
3. Avvia dall'icona: schermo intero PWA
4. Concedi geolocalizzazione al primo avvio

## Sorgenti dati (tutte gratuite)

| Dato | Fonte |
|---|---|
| Cartografia base | CARTO Voyager (OSM) |
| Batimetria | EMODnet Bathymetry HR |
| Seamarks (fari/boe) | OpenSeaMap |
| Vento/onda/marea | Open-Meteo Marine + Forecast API |
| Correnti marine | Open-Meteo Marine (ocean_current_*) |
| Land mask | Natural Earth 50m (semplificato) |
| AIS | AISHub (con username) o NMEA via bridge |
| Pressione | Open-Meteo surface_pressure |
| Pioggia | RainViewer |

## Roadmap

- [x] M1: Mappe MapLibre + design system
- [x] M2: Routing engine isocrone + polare
- [x] M3: UX restyling Marine Ops
- [x] M4: Correnti marine + land mask
- [x] M5a: IndexedDB cache GRIB + connectivity indicator
- [x] Polish: wind particle animation, route comparison, boat config UI
- [ ] M5b: UI download GRIB area (selezione bbox manuale)
- [ ] M6: iPad native via Capacitor (opzionale)
- [ ] Polar upload .pol file (custom)
- [ ] Web Worker per routing lungo (>24h)
- [ ] AIS collide alert
- [ ] Meteogramma per punto (tap → 7gg grafico)

## License

MIT — sorgenti dati mantengono proprie licenze (OSM, EMODnet, OpenSeaMap, CARTO, Natural Earth).
