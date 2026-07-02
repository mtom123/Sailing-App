/*
 * Aree Marine Protette e zone regolamentate del Mediterraneo occidentale.
 * ATTENZIONE: perimetri SEMPLIFICATI e regole SINTETICHE, a scopo di
 * preallarme. Fanno fede esclusivamente i decreti istitutivi e le ordinanze
 * delle Capitanerie di Porto (www.guardiacostiera.gov.it/ordinanze).
 * polygon: vertici [lat, lon] del perimetro esterno approssimato.
 */

export const MARINE_PARKS = [
  {
    id: 'amp-portofino',
    name: 'AMP Portofino',
    authority: 'Capitaneria di Genova',
    rules:
      'Zona A (Cala dell\'Oro): divieto assoluto di navigazione, ancoraggio e balneazione. Zone B/C: navigazione <10 kn entro 300 m da costa, ancoraggio solo su gavitelli o zone autorizzate.',
    polygon: [
      [44.325, 9.145],
      [44.325, 9.225],
      [44.290, 9.225],
      [44.290, 9.145],
    ],
  },
  {
    id: 'amp-cinque-terre',
    name: 'AMP Cinque Terre',
    authority: 'Capitaneria di La Spezia',
    rules:
      'Zone A (Punta Mesco, Capo Montenero): accesso vietato. Zone B/C: velocità max 10 kn, ancoraggio vietato su posidonia, scarico vietato.',
    polygon: [
      [44.145, 9.630],
      [44.145, 9.760],
      [44.060, 9.760],
      [44.060, 9.630],
    ],
  },
  {
    id: 'pn-arcipelago-toscano',
    name: 'Parco Naz. Arcipelago Toscano (Montecristo/Pianosa)',
    authority: 'Capitaneria di Portoferraio',
    rules:
      'Montecristo: divieto di navigazione e sosta entro 1 miglio. Pianosa: navigazione e ancoraggio vietati entro 1 miglio salvo autorizzazione.',
    polygon: [
      [42.400, 10.050],
      [42.400, 10.350],
      [42.300, 10.350],
      [42.300, 10.050],
    ],
  },
  {
    id: 'amp-secche-meloria',
    name: 'AMP Secche della Meloria',
    authority: 'Capitaneria di Livorno',
    rules:
      'Zona A: divieto di navigazione, ancoraggio e pesca. Zone B/C: ancoraggio regolamentato, velocità max 10 kn.',
    polygon: [
      [43.590, 10.190],
      [43.590, 10.260],
      [43.520, 10.260],
      [43.520, 10.190],
    ],
  },
  {
    id: 'pn-la-maddalena',
    name: 'PN Arcipelago di La Maddalena',
    authority: 'Ente Parco / Capitaneria La Maddalena',
    rules:
      'Accesso a pagamento (ticket giornaliero). Zone Mb: ancoraggio vietato su posidonia. Budelli (Spiaggia Rosa): divieto assoluto di sbarco e ancoraggio. Velocità max 7-15 kn a seconda delle zone.',
    polygon: [
      [41.290, 9.330],
      [41.290, 9.520],
      [41.160, 9.520],
      [41.160, 9.330],
    ],
  },
  {
    id: 'amp-tavolara',
    name: 'AMP Tavolara - Punta Coda Cavallo',
    authority: 'Capitaneria di Olbia',
    rules:
      'Zona A (Tavolara Est): divieto totale. Zone B/C: ancoraggio solo in aree autorizzate o gavitelli, velocità max 10 kn entro 300 m.',
    polygon: [
      [40.930, 9.650],
      [40.930, 9.780],
      [40.850, 9.780],
      [40.850, 9.650],
    ],
  },
  {
    id: 'amp-capo-carbonara',
    name: 'AMP Capo Carbonara (Villasimius)',
    authority: 'Capitaneria di Cagliari',
    rules:
      'Zona A (Isola dei Cavoli SE, Secca di Mezzo): divieto totale. Zone B/C: ancoraggio regolamentato, obbligo gavitelli dove presenti.',
    polygon: [
      [39.140, 9.470],
      [39.140, 9.580],
      [39.060, 9.580],
      [39.060, 9.470],
    ],
  },
  {
    id: 'amp-penisola-sinis',
    name: 'AMP Penisola del Sinis - Mal di Ventre',
    authority: 'Capitaneria di Oristano',
    rules:
      'Zona A (Mal di Ventre Ovest): divieto totale. Zone B/C: velocità max 10 kn, ancoraggio vietato su posidonia.',
    polygon: [
      [40.060, 8.290],
      [40.060, 8.470],
      [39.870, 8.470],
      [39.870, 8.290],
    ],
  },
  {
    id: 'amp-ustica',
    name: 'AMP Isola di Ustica',
    authority: 'Capitaneria di Palermo',
    rules:
      'Zona A (costa O): divieto di navigazione e ancoraggio. Zone B/C: ancoraggio solo su fondi sabbiosi autorizzati.',
    polygon: [
      [38.730, 13.140],
      [38.730, 13.220],
      [38.680, 13.220],
      [38.680, 13.140],
    ],
  },
  {
    id: 'amp-egadi',
    name: 'AMP Isole Egadi',
    authority: 'Capitaneria di Trapani',
    rules:
      'Zone A (Marettimo O, Favignana N): divieto totale. Zone B: velocità max 10 kn, ancoraggio su gavitelli. Divieto ancoraggio su posidonia ovunque.',
    polygon: [
      [38.070, 12.000],
      [38.070, 12.350],
      [37.880, 12.350],
      [37.880, 12.000],
    ],
  },
  {
    id: 'amp-plemmirio',
    name: 'AMP Plemmirio (Siracusa)',
    authority: 'Capitaneria di Siracusa',
    rules:
      'Zona A (Capo Murro di Porco): divieto totale. Zone B/C: navigazione <10 kn, ancoraggio regolamentato.',
    polygon: [
      [37.030, 15.290],
      [37.030, 15.350],
      [36.980, 15.350],
      [36.980, 15.290],
    ],
  },
  {
    id: 'amp-punta-campanella',
    name: 'AMP Punta Campanella',
    authority: 'Capitaneria di Castellammare di Stabia',
    rules:
      'Zone A (Vervece, Punta Campanella): divieto totale. Zone B/C: ancoraggio vietato su posidonia, gavitelli obbligatori dove presenti.',
    polygon: [
      [40.610, 14.300],
      [40.610, 14.420],
      [40.550, 14.420],
      [40.550, 14.300],
    ],
  },
  {
    id: 'amp-ventotene',
    name: 'AMP Ventotene e S. Stefano',
    authority: 'Capitaneria di Gaeta',
    rules:
      'Zona A (S. Stefano E): divieto totale. Zone B/C: velocità max 10 kn, ancoraggio regolamentato.',
    polygon: [
      [40.820, 13.400],
      [40.820, 13.470],
      [40.770, 13.470],
      [40.770, 13.400],
    ],
  },
  {
    id: 'pnm-port-cros',
    name: 'Parc National de Port-Cros (FR)',
    authority: 'Préfecture Maritime Méditerranée',
    rules:
      'Ancoraggio vietato su posidonia (multe severe, controlli con drone). Gavitelli obbligatori a Port-Cros. Velocità max 5 kn entro 300 m. Divieto jet-ski.',
    polygon: [
      [43.030, 6.350],
      [43.030, 6.440],
      [42.980, 6.440],
      [42.980, 6.350],
    ],
  },
  {
    id: 'rn-scandola',
    name: 'Réserve de Scandola (Corsica, FR)',
    authority: 'Préfecture Maritime / PNR Corse',
    rules:
      'Zona integrale: divieto di sosta, ancoraggio e immersione. Navigazione consentita solo in transito, velocità ridotta.',
    polygon: [
      [42.395, 8.520],
      [42.395, 8.590],
      [42.330, 8.590],
      [42.330, 8.520],
    ],
  },
  {
    id: 'rn-bonifacio',
    name: 'Réserve des Bouches de Bonifacio (FR)',
    authority: 'Préfecture Maritime / OEC',
    rules:
      'Zone di protezione rafforzata (Lavezzi): ancoraggio regolamentato, gavitelli. Divieto ancoraggio su posidonia. Isole Cerbicale: sbarco vietato.',
    polygon: [
      [41.480, 9.070],
      [41.480, 9.330],
      [41.320, 9.330],
      [41.320, 9.070],
    ],
  },
  {
    id: 'pn-cabrera',
    name: 'PN Archipiélago de Cabrera (ES)',
    authority: 'Autoridad Portuaria Baleares',
    rules:
      'Accesso solo con permesso e ormeggio su gavitello prenotato (no ancoraggio libero). Velocità max 3 kn in rada.',
    polygon: [
      [39.180, 2.900],
      [39.180, 3.000],
      [39.110, 3.000],
      [39.110, 2.900],
    ],
  },
]
