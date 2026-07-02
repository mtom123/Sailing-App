# TIMONE — Marine PWA per iPad

App di navigazione marina in stile **Thermal Brutalist**, pensata per stare al
timone su iPad (Safari, PWA a schermo intero, orientamento orizzontale).
Integra in un'unica interfaccia le funzioni chiave di MarineTraffic, Windy,
Navionics e Navily usando **solo sorgenti dati gratuite**.

## Funzionalità

| Zona | Contenuto |
|---|---|
| Sidebar sinistra (25%) | SOG e COG giganti dal GPS dell'iPad, bussola del vento analogica, vento/onde/barometro con tendenza, alba/tramonto e fase lunare, allarme raffica configurabile, grafici 72h e curva di marea, selettore sorgente AIS |
| Area centrale (55%) | Mappa Leaflet con pinch-to-zoom: base CARTO Dark Matter, batimetria EMODnet, seamarks OpenSeaMap, radar pioggia RainViewer, frecce vento, navi AIS, aree marine protette con preallarme, rotta editabile, traccia GPS, MOB, modalità notte (rosso) |
| Sidebar destra (20%) | Tre schede: **ROTTA** (tratte con weather routing assistito, finestra di partenza consigliata, guida live DTW/BTW/XTE, pilota automatico), **ANCORE** (ancoraggi con semaforo + Anchor Watch), **LOG** (registro di bordo con export GPX) |

## Rotta e weather routing assistito

Attivare la modalità rotta (pulsante bussola sulla mappa) e toccare il mare
per aggiungere waypoint; trascinarli per correggerli, toccarli per eliminarli.
Per ogni tratta l'app interroga Open-Meteo **all'orario di passaggio previsto**
(vento, raffiche, onda) e assegna un giudizio Buono/Impegnativo/Critico,
segnalando le tratte di bolina stretta. Valuta inoltre le partenze nelle
successive 24 ore e suggerisce la finestra migliore. Con rotta attiva, la
barra NAV mostra waypoint attivo, distanza, rilevamento, XTE ed ETA, con
avanzamento automatico al waypoint successivo.

## Pilota automatico (Raymarine e compatibili NMEA0183)

Con rotta attiva e bridge configurato, il pulsante **VAI — PILOTA** trasmette
le sentenze standard `APB`, `RMB` e `XTE` ogni 2 secondi via
WebSocket → bridge → UDP → multiplexer di bordo. Il pilota in modalità
**Track/NAV** segue il waypoint attivo con correzione del cross-track error.

Requisiti hardware: un multiplexer/gateway NMEA con ingresso di rete (o il
bridge incluso su un computer di bordo) collegato al pilota via NMEA0183
(per SeaTalk1 serve un convertitore, es. Raymarine E85001 o gateway
SeaTalk-NG). Avvio del bridge con uscita pilota:

```bash
node tools/nmea-bridge.mjs --fwd <ip-multiplexer>:10110
```

⚠ Il pilota va sempre sorvegliato: mantenere una guardia attiva al timone.

## Aree marine protette

Layer con i perimetri **indicativi** di 17 AMP/parchi (Italia, Corsica,
Baleari) e sintesi delle regole (zone A/B/C, limiti di velocità, divieti di
ancoraggio su posidonia). Con GPS attivo l'app avvisa quando la barca è a
meno di 1 nm o dentro un'area. **Fanno fede esclusivamente i decreti e le
ordinanze delle Capitanerie** (guardiacostiera.gov.it/ordinanze).

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
