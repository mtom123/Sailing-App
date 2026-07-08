# TIMONE v2 — Marine Weather Routing

PWA di navigazione marina professionale per iPad. Weather routing con algoritmo isocrone, polari della barca, e 3 opzioni di rotta (veloce/comoda/sicura).

## Stack

- **React 18** + **Vite 5**
- **MapLibre GL JS** — mappa vettoriale con stile nautico custom
- **Zustand** — state management
- **Tailwind CSS 4** — design system "Marine Ops"
- **Open-Meteo API** — vento, onde, pressione (gratuito, no API key)
- **EMODnet Bathymetry** + **OpenSeaMap** + **CARTO** — cartografia gratuita

## Funzionalità v2

### Weather Routing (NEW)
- Engine isocrone che calcola 3 rotte alternative: **veloce**, **comoda**, **sicura**
- Polare della barca (Dufour 41 Classic predefinito, espandibile)
- GRIB-like local wind grid 7×7 con dati orari 72h
- Penalità comfort/sicura basate su vento, onda, TWA, ora del giorno
- VMG ottimale lungo la rotta
- Visualizzazione rotte alternative sulla mappa

### Mappe (UPGRADED)
- MapLibre GL JS con stile nautico custom (vs Leaflet raster)
- Batimetria EMODnet HR fino a z14
- Seamarks OpenSeaMap con fari/boe
- CARTO Voyager come base (z fino a 20)
- Markers custom con rotazione, popup styled
- Wind canvas overlay con frecce colorate per intensità

### UI/UX (REDESIGNED)
- Design system "Marine Ops": deep navy + phosphor teal
- Glassmorphism pannelli galleggianti (vs sidebar rigide)
- Touch targets ≥44px (Apple HIG)
- Font: Inter (UI) + JetBrains Mono (dati)
- Layout responsive iPad landscape/portrait

### Weather Timeline (NEW)
- Scrubber animato -12h/+72h (stile Windy)
- Play con velocità 3×/6×/12×
- Tick marks a ore/giorni chiave
- Time display con data

### Components
- `MapView` — mappa MapLibre con tutti i layer
- `RoutePanel` — editor rotte + 3 weather routing options
- `WeatherTimeline` — scrubber animato
- `InstrumentPanel` — SOG/COG/vento/onda/pressione
- `AnchoragePanel` — ancoraggi con semaforo sicurezza
- `TrackPanel` — log con export GPX

## Routing Engine

L'algoritmo isocrone (`src/routing/isochroneEngine.js`):

1. Parte dal punto di start
2. Per ogni step (30 min) esplora 24 direzioni (15° ciascuna)
3. Per ogni direzione: legge vento dal GRIB, calcola TWA, risolve polar → boat speed
4. Dead reckoning per nuova posizione
5. Pruning Pareto: mantiene solo punti ottimali per cella 0.1°
6. Quando raggiunge il goal (entro 2nm), backtrack per ricostruire rotta

3 mode di routing:
- **VELOCE** — min tempo, max 35kn vento, max 4m onda
- **COMODA** — max 22kn vento, max 1.5m onda
- **SICURA** — max 18kn vento, max 1.0m onda, penalty notte

## Polar

Polar del Dufour 41 Classic in `src/routing/polarSolver.js`:
- TWS: 4-30 kn (10 righe)
- TWA: 0-180° (8 colonne)
- Interpolazione bilineare
- Espandibile con altre barche (cruiser-41-monohull placeholder)

## Avvio

```bash
npm install
npm run dev      # sviluppo su http://localhost:5173
npm run build    # build produzione in dist/
npm run preview  # anteprima build
```

## Installazione su iPad

1. Servire la build su HTTPS (GitHub Pages va bene)
2. Safari → Apri URL → Condividi → Aggiungi a schermata Home
3. Avviare dall'icona: schermo intero PWA
4. Concedere geolocalizzazione al primo avvio

## Sorgenti dati (tutte gratuite)

| Dato | Fonte |
|---|---|
| Cartografia base | CARTO Voyager (OSM) |
| Batimetria | EMODnet Bathymetry HR |
| Seamarks (fari/boe) | OpenSeaMap |
| Vento/onda/marea | Open-Meteo Marine + Forecast API |
| AIS | AISHub (con username) o NMEA via bridge |
| Pressione | Open-Meteo surface_pressure |

## Roadmap

- [x] M1: Mappe MapLibre + design system
- [x] M2: Routing engine isocrone + polare
- [x] M3: UX restyling Marine Ops
- [ ] M4: Correnti marine + land mask
- [ ] M5: GRIB offline + IndexedDB cache
- [ ] M6: iPad native via Capacitor (opzionale)

## License

MIT — sorgenti dati mantengono proprie licenze (OSM, EMODnet, OpenSeaMap, CARTO).
