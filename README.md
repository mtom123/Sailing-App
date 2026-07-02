# TIMONE — Marine PWA per iPad

App di navigazione marina in stile **Thermal Brutalist**, pensata per stare al
timone su iPad (Safari, PWA a schermo intero, orientamento orizzontale).
Integra in un'unica interfaccia le funzioni chiave di MarineTraffic, Windy,
Navionics e Navily usando **solo sorgenti dati gratuite**.

## Funzionalità

| Zona | Contenuto |
|---|---|
| Sidebar sinistra (25%) | SOG e COG giganti dal GPS dell'iPad, bussola del vento analogica, dati vento/onde, grafici 72h (vento, raffiche, onda) e curva di marea, selettore sorgente AIS |
| Area centrale (55%) | Mappa Leaflet con pinch-to-zoom: base CARTO Dark Matter, batimetria EMODnet, seamarks OpenSeaMap, overlay frecce vento, navi AIS (triangoli orientati sulla prua), posizione barca |
| Sidebar destra (20%) | Ancoraggi del Mediterraneo ordinati per distanza con semaforo Verde/Giallo/Rosso calcolato confrontando i settori di ridosso della baia con il vento attuale, e **Anchor Watch** (allarme scarroccio GPS con raggio regolabile) |

## Sorgenti dati (100% gratuite, nessuna chiave obbligatoria)

- **Cartografia**: [CARTO Dark Matter](https://carto.com/attributions) (base),
  [EMODnet Bathymetry](https://emodnet.ec.europa.eu) (linee batimetriche),
  [OpenSeaMap](https://www.openseamap.org) (fari, boe, seamarks).
- **Meteo/onde/maree**: [Open-Meteo Marine + Forecast API](https://open-meteo.com)
  — senza chiave, aggiornato sulle coordinate correnti della mappa.
- **AIS**: tre modalità — `DEMO` (flotta simulata), `NMEA` (AIS reale della barca
  via bridge WebSocket, vedi sotto), `AISHUB` (con username share personale).
- **Ancoraggi**: database locale in `src/data/anchorages.js` con settori di
  ridosso per il calcolo dinamico della sicurezza.

## Avvio

```bash
npm install
npm run dev        # sviluppo su http://localhost:5173
npm run build      # build di produzione in dist/
npm run preview    # anteprima della build
```

> La PWA (service worker, geolocalizzazione) richiede HTTPS o localhost.
> Il service worker usa strategia **network-first con fallback su cache**: i
> tasselli di mappa già visitati e l'ultima previsione restano disponibili offline.

## Installazione su iPad

1. Servire la build su HTTPS (es. any static host) e aprirla in Safari.
2. Condividi → **Aggiungi a schermata Home**.
3. Avviare dall'icona: l'app parte a schermo intero (`apple-mobile-web-app-capable`).
4. Al primo avvio concedere il permesso di geolocalizzazione.

## AIS reale della barca (NMEA0183 via UDP/TCP)

Safari non può aprire socket UDP/TCP: sul computer di bordo (nella stessa rete
Wi-Fi del multiplexer NMEA) eseguire il bridge incluso:

```bash
npm run bridge                                  # UDP 10110, TCP 10111 → ws://<ip>:8484
node tools/nmea-bridge.mjs --udp 2000 --ws 9000 # porte personalizzate
```

Poi nell'app: sorgente AIS **NMEA** → `ws://<ip-del-bridge>:8484`.
Il decoder di bordo gestisce i messaggi AIS 1/2/3 (Classe A), 18 (Classe B) e
5 (nome nave), inclusi i messaggi multi-frammento, con verifica del checksum.

## Anchor Watch

Con fix GPS attivo: regolare il raggio di scarroccio (15–120 m) e premere
**ANCORA CADUTA**. La posizione corrente diventa il punto di fonda; se l'iPad
esce dal raggio parte un allarme acustico (WebAudio, sbloccato dal tap) e il
pannello lampeggia in rosso. `RECUPERA` disattiva la guardia, `TACITA` silenzia
l'allarme mantenendola attiva.
