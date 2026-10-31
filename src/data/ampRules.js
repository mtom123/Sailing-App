/*
 * Regole per zona delle aree marine protette italiane, per chi va in barca:
 * navigazione, velocità, ancoraggio, ormeggio, balneazione. Sintesi dei
 * regolamenti ufficiali pubblicati dal Ministero dell'Ambiente (MASE,
 * mase.gov.it → Aree marine istituite), letti articolo per articolo.
 *
 * match: riconosce il nome dell'area (o della sua zona) in OpenStreetMap.
 * zones[X].short: sintesi per gli avvisi; rules: elenco per la scheda.
 * Valgono sempre anche le ordinanze della Capitaneria e i disciplinari
 * annuali dell'ente gestore, che possono essere più restrittivi.
 */

const MASE = 'https://www.mase.gov.it/portale/documents/d/guest'

export const AMP_RULES = [
  // ---------------------------------------------------------------- Liguria
  {
    id: 'portofino',
    match: /portofino/i,
    name: 'AMP Portofino',
    manager: 'Ente Parco di Portofino',
    source: `${MASE}/portofino_dm_01-07-2008-pdf`,
    edition: 'Regolamento DM 1/7/2008 (GU 181/2008)',
    general: [
      'Vietati moto d’acqua, sci nautico e sport trainati',
      'Vietata la navigazione alle navi da diporto (oltre 24 m)',
      'Vietati accesso e transito nelle zone di balneazione (gavitelli rossi)',
    ],
    zones: {
      A: {
        label: 'riserva integrale',
        short: 'vietati navigazione, ancoraggio, ormeggio e balneazione',
        rules: ['Vietata la navigazione', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione', 'Vietate le immersioni individuali'],
      },
      B: {
        label: 'riserva generale',
        short: 'motore max 5 nodi, ancoraggio vietato, ormeggio solo ai gavitelli autorizzati',
        rules: [
          'Vela, remi, pedali ed elettrico: navigazione libera',
          'Motore: natanti e imbarcazioni con requisiti di eco-compatibilità (casse liquami, motore 2003/44/CE, antivegetativa a rilascio zero); gli altri solo per raggiungere gli ormeggi con rotta perpendicolare',
          'Velocità max 5 nodi, in dislocamento',
          'Ancoraggio vietato',
          'Ormeggio solo ai gavitelli: Punta Chiappa–Punta del Bussego (natanti), S. Fruttuoso lato Est (natanti < 7,5 m), Cala degli Inglesi (natanti), S. Fruttuoso lato Ovest (natanti e imbarcazioni)',
          'Balneazione consentita',
        ],
      },
      C: {
        label: 'riserva parziale',
        short: 'motore max 5 nodi; ancoraggio sì, tranne baia di Paraggi e campi boe',
        rules: [
          'Stesse regole di navigazione della zona B (max 5 nodi)',
          'Ancoraggio consentito a natanti e imbarcazioni, tranne: baia di Paraggi (cima tarozzata/boa gialla), zone di balneazione, dentro e vicino ai campi ormeggio, e per le imbarcazioni tra Punta Cannette e la Tonnarella (boe gialle)',
          'Ormeggio ai siti attrezzati dall’ente gestore',
          'Balneazione consentita',
        ],
      },
    },
  },
  {
    id: 'cinque-terre',
    match: /cinque terre/i,
    name: 'AMP Cinque Terre',
    manager: 'Parco Nazionale delle Cinque Terre',
    source: `${MASE}/cinque_terre_dm_24-2-2015-pdf`,
    edition: 'Regolamento DM 24/2/2015 (GU 62/2015)',
    general: [
      'Vietati moto d’acqua, sci nautico e sport trainati',
      'In stagione balneare navigazione solo oltre 100 m dalle coste a picco e 200 m dalle spiagge',
      'Vietata la navigazione alle navi da diporto (oltre 24 m) nelle zone B e C',
    ],
    zones: {
      A: {
        label: 'riserva integrale',
        short: 'vietata (solo residenti autorizzati, max 3 nodi)',
        rules: [
          'Navigazione solo per residenti e proprietari autorizzati: remi, pedali, vela o elettrico, max 3 nodi e ad almeno 150 m dalla costa',
          'Vietati ancoraggio e ormeggio',
          'Balneazione solo con autorizzazione, dal 1° maggio al 30 settembre',
        ],
      },
      B: {
        label: 'riserva generale',
        short: 'motore solo con autorizzazione, max 5 nodi; ancoraggio vietato',
        rules: [
          'Remi, vela, pedali ed elettrico: consentiti',
          'Motore solo con autorizzazione dell’ente gestore, natanti e imbarcazioni eco-compatibili, max 5 nodi in dislocamento',
          'Ancoraggio vietato',
          'Ormeggio solo ai campi boe, con autorizzazione',
          'Balneazione libera',
        ],
      },
      C: {
        label: 'riserva parziale',
        short: 'motore max 5 nodi entro 300 m, 10 oltre; ancoraggio solo con autorizzazione',
        rules: [
          'Motore: max 5 nodi entro 300 m dalla costa, max 10 nodi oltre, in dislocamento',
          'Ancoraggio solo con autorizzazione dell’ente gestore, fuori dalle aree con fondali sensibili segnalate',
          'Ormeggio solo ai campi boe, con autorizzazione',
          'Balneazione libera',
        ],
      },
    },
  },
  {
    id: 'bergeggi',
    match: /bergeggi/i,
    name: 'AMP Isola di Bergeggi',
    manager: 'Comune di Bergeggi',
    source: `${MASE}/bergeggi_dm_13-10-2008_amp-pdf`,
    edition: 'Regolamento DM 13/10/2008',
    general: [
      'Vietati moto d’acqua, sci nautico e sport trainati',
      'Vietata la navigazione alle navi da diporto',
      'Vietato l’accesso alle grotte marine con natanti e imbarcazioni',
      'Dal 1° maggio al 30 settembre vietato il transito tra l’isola e la costa (salvo remi e pedali)',
    ],
    zones: {
      A: {
        short: 'vietati navigazione, ancoraggio, ormeggio e balneazione',
        rules: ['Vietata la navigazione (anche a remi e a vela)', 'Vietati ancoraggio e ormeggio (salvo gavitelli per immersioni al confine)', 'Vietata la balneazione'],
      },
      B: {
        short: 'motore max 5 nodi, ancoraggio vietato',
        rules: ['Vela, remi, pedali, elettrico consentiti', 'Motore: natanti e imbarcazioni max 5 nodi', 'Ancoraggio vietato', 'Ormeggio solo ai gavitelli autorizzati', 'Balneazione libera'],
      },
      C: {
        short: 'motore max 10 nodi; ancoraggio sì tranne posidonia, coralligeno e campi boe',
        rules: [
          'Motore: natanti e imbarcazioni max 10 nodi in dislocamento',
          'Ancoraggio consentito, tranne su posidonia e coralligeno segnalati e vicino ai campi ormeggio',
          'Balneazione libera',
        ],
      },
    },
  },

  // ---------------------------------------------------------------- Toscana
  {
    id: 'meloria',
    match: /meloria/i,
    name: 'AMP Secche della Meloria',
    manager: 'Parco Migliarino San Rossore Massaciuccoli',
    source: `${MASE}/s_meloria_dm_18-4-2014-pdf`,
    edition: 'Regolamento DM 18/4/2014',
    general: ['Vietati moto d’acqua, sci nautico e sport trainati'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietata la navigazione', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione'] },
      B: {
        short: 'navigazione solo con autorizzazione; max 5 nodi entro 300 m dal Faro',
        rules: [
          'Navigazione solo con autorizzazione: vela, remi, pedali, elettrico, natanti e imbarcazioni eco-compatibili',
          'Velocità max 5 nodi entro 300 m dal Faro e dalla Torre della Meloria, max 10 nodi tra 300 e 600 m, in dislocamento',
          'Ancoraggio con autorizzazione, dall’alba al tramonto, solo su sabbia o ciottoli (mai su posidonia o coralligeno)',
          'Ormeggio ai campi boe, con autorizzazione',
        ],
      },
      C: {
        short: 'max 5 nodi entro 300 m dal Faro; ancoraggio con autorizzazione su sabbia',
        rules: [
          'Velocità max 5 nodi entro 300 m dal Faro e dalla Torre della Meloria, max 10 nodi tra 300 e 600 m, in dislocamento',
          'Ancoraggio con autorizzazione, dall’alba al tramonto, solo su sabbia o ciottoli',
          'Ormeggio ai campi boe, con autorizzazione (anche navi da diporto)',
          'Balneazione consentita',
        ],
      },
    },
  },

  // ---------------------------------------------------------------- Sardegna
  {
    id: 'tavolara',
    match: /tavolara|coda cavallo/i,
    name: 'AMP Tavolara – Punta Coda Cavallo',
    manager: 'Consorzio di gestione AMP Tavolara',
    source: `${MASE}/tavolara_dm_03-12-2014-pdf`,
    edition: 'Regolamento DM 3/12/2014 (GU 6/2015)',
    general: [
      'Vietati moto d’acqua, sci nautico e sport trainati',
      'Ancoraggio sempre vietato su posidonia e coralligeno',
      'Davanti a Porto San Paolo max 5 nodi',
    ],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietata la navigazione', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione'] },
      B: {
        short: 'motore max 5 nodi entro 300 m, 10 fino a 600 m; ancoraggio solo su sabbia (≤ 30 m)',
        rules: [
          'Natanti e imbarcazioni: a motore max 5 nodi entro 300 m dalla costa e 10 nodi tra 300 e 600 m, in dislocamento',
          'Navi da diporto solo con autorizzazione e rotta perpendicolare per raggiungere ormeggi e ancoraggi',
          'Ancoraggio solo su sabbia o ciottoli, unità fino a 30 m (Piscine di Molara: fino a 40 m nel cerchio indicato)',
          'Ormeggio solo nei campi attrezzati, con autorizzazione',
          'Balneazione libera',
        ],
      },
      C: {
        short: 'motore max 5 nodi entro 300 m, 10 fino a 600 m; ancoraggio su sabbia (≤ 40 m)',
        rules: [
          'Stessi limiti di velocità della zona B',
          'Ancoraggio solo su sabbia o ciottoli, unità fino a 40 m; oltre 40 m solo a La Cinta e Spalmatore di Terra (cerchi da 0,1 M)',
          'Ormeggio solo nei campi attrezzati, con autorizzazione',
          'Balneazione libera',
        ],
      },
    },
  },
  {
    id: 'sinis',
    match: /sinis|mal di ventre|malu entu|malu bentu/i,
    name: 'AMP Penisola del Sinis – Isola di Mal di Ventre',
    manager: 'Comune di Cabras',
    source: `${MASE}/sinis_dm_28-04-2017-pdf`,
    edition: 'Regolamento DM 28/4/2017',
    general: ['Vietati moto d’acqua, sci nautico e sport trainati', 'Ancoraggio vietato su posidonia, cymodocea e coralligeno'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietata la navigazione', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione'] },
      B: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m; ancoraggio solo nelle aree di sabbia indicate',
        rules: [
          'Vela, remi, pedali, elettrico, natanti e imbarcazioni eco-compatibili: max 5 nodi entro 300 m dalla costa, 10 nodi tra 300 e 600 m',
          'Vietata alle navi da diporto',
          'Ancoraggio solo su sabbia, nelle aree individuate dall’ente gestore',
          'Ormeggio nei siti attrezzati, con autorizzazione',
          'Balneazione libera',
        ],
      },
      C: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m; ancoraggio nelle aree di sabbia indicate',
        rules: [
          'Stessi limiti della zona B; ammesse anche le navi da diporto conformi MARPOL',
          'Ancoraggio solo su sabbia, nelle aree individuate',
          'Ormeggio con autorizzazione (anche navi da diporto)',
          'Balneazione libera',
        ],
      },
    },
  },
  {
    id: 'capo-caccia',
    match: /capo caccia|isola piana/i,
    name: 'AMP Capo Caccia – Isola Piana',
    manager: 'Parco di Porto Conte',
    source: `${MASE}/dm_20_09_2002_amp_capocaccia-pdf`,
    edition: 'Decreto istitutivo 20/9/2002',
    general: ['Vietati moto d’acqua e sci nautico'],
    zones: {
      A: { short: 'vietati navigazione, accesso, sosta, ancoraggio e balneazione', rules: ['Vietati navigazione, accesso e sosta di qualsiasi unità', 'Vietati ancoraggio e immersioni', 'Vietata la balneazione'] },
      B: {
        short: 'motore max 5 nodi; ancoraggio e ormeggio solo dove indicato',
        rules: [
          'Motore: natanti e imbarcazioni max 5 nodi, come disciplinato dall’ente gestore; vela e remi consentiti',
          'Ancoraggio solo nelle zone individuate dall’ente gestore',
          'Ormeggio ai gavitelli predisposti',
          'Balneazione consentita',
        ],
      },
      C: {
        short: 'motore max 10 nodi; ancoraggio solo nelle zone individuate',
        rules: ['Motore: natanti e imbarcazioni max 10 nodi', 'Ancoraggio e ormeggio come disciplinati dall’ente gestore, nelle zone individuate', 'Balneazione consentita'],
      },
    },
  },
  {
    id: 'capo-carbonara',
    match: /carbonara/i,
    name: 'AMP Capo Carbonara',
    manager: 'Comune di Villasimius',
    source: `${MASE}/capo_carbonara_dm_12-05-2017-pdf`,
    edition: 'Regolamento DM 12/5/2017',
    general: [
      'Vietati moto d’acqua, sci nautico e sport trainati',
      'Vietata la navigazione nelle zone di balneazione anche se non segnalate',
    ],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietata la navigazione', 'Vietato l’ancoraggio', 'Ormeggio solo ai gavitelli dei centri d’immersione', 'Vietata la balneazione'] },
      B: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m; ancoraggio solo su sabbia',
        rules: [
          'Vela, remi, natanti e imbarcazioni eco-compatibili: max 5 nodi entro 300 m dalla costa, 10 nodi tra 300 e 600 m, in dislocamento',
          'Vietata alle navi da diporto',
          'Ancoraggio solo su sabbia o ciottoli (natanti e imbarcazioni)',
          'Ormeggio ai campi boe, con autorizzazione',
          'Balneazione libera',
        ],
      },
      C: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m; ancoraggio nelle aree indicate',
        rules: [
          'Stessi limiti della zona B; ammesse anche le navi da diporto conformi MARPOL',
          'Ancoraggio su sabbia o ciottoli nelle aree indicate (Campulongu e altre), unità fino a 40 m; oltre 40 m solo nei cerchi indicati',
          'Ormeggio ai campi boe, con autorizzazione',
          'Balneazione libera',
        ],
      },
      D: { short: 'max 20 nodi', rules: ['Navigazione consentita, max 20 nodi', 'Balneazione libera'] },
    },
  },
  {
    id: 'asinara',
    match: /asinara/i,
    name: 'AMP Isola dell’Asinara',
    manager: 'Parco Nazionale dell’Asinara',
    source: `${MASE}/asinara_dm_30-7-2009-pdf`,
    edition: 'Regolamento DM 30/7/2009 (GU 199/2009)',
    general: [
      'Vietati moto d’acqua, sci nautico e sport trainati',
      'Vietata la navigazione alle navi da diporto',
      'Passaggio dei Fornelli (Punta Salippi–Punta Barbarossa): max 3 nodi',
    ],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietata la navigazione da diporto', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione'] },
      B: {
        short: 'solo vela/remi/elettrico, motore vietato; ancoraggio vietato',
        rules: [
          'Navigazione libera a vela, remi, pedali, elettrico',
          'Vietata la navigazione libera a motore (solo corridoi di lancio per Cala Reale e Cala d’Oliva, max 5 nodi, con autorizzazione)',
          'Ancoraggio vietato',
          'Ormeggio solo ai gavitelli autorizzati (Fornelli, Cala Reale, Cala d’Oliva)',
          'Balneazione consentita',
        ],
      },
      C: {
        short: 'motore con autorizzazione, max 10 nodi; ancoraggio nelle aree segnalate',
        rules: [
          'Motore: natanti e imbarcazioni con autorizzazione, max 10 nodi',
          'Ancoraggio a natanti e imbarcazioni solo nelle aree individuate e segnalate',
          'Ormeggio nei siti attrezzati, con autorizzazione',
          'Balneazione consentita',
        ],
      },
    },
  },

  // ---------------------------------------------------------------- Sicilia
  {
    id: 'egadi',
    match: /egadi/i,
    name: 'AMP Isole Egadi',
    manager: 'Comune di Favignana',
    source: `${MASE}/egadi_dm_01-06-2010-pdf`,
    edition: 'Regolamento DM 1/6/2010 (GU 145/2010)',
    general: ['Vietati moto d’acqua, sci nautico e sport trainati (transito solo perpendicolare)'],
    zones: {
      A: {
        short: 'vietati navigazione (residenti esclusi), ancoraggio e ormeggio',
        rules: ['Isola di Maraone: vietata la navigazione', 'Marettimo: navigazione solo natanti dei residenti autorizzati, max 5 nodi', 'Vietati ancoraggio e ormeggio'],
      },
      B: {
        short: 'entro 500 m motore solo residenti; ancoraggio solo oltre 500 m',
        rules: [
          'Vela, remi, pedali, elettrico: liberi',
          'Entro 500 m dalla costa motore solo ai natanti dei residenti autorizzati (Marettimo entro 300 m: natanti autorizzati, a numero chiuso)',
          'Oltre 500 m navigazione a motore libera',
          'Ancoraggio e ormeggio entro 500 m solo per natanti autorizzati; oltre 500 m consentiti fuori dai fondali di pregio',
        ],
      },
      C: {
        short: 'navigazione libera; ancoraggio fuori dai fondali di pregio',
        rules: ['Navigazione a motore libera', 'Ancoraggio consentito fuori dai fondali di rilevante interesse indicati dall’ente gestore', 'Ormeggio con autorizzazione'],
      },
      D: {
        short: 'navigazione libera; ancoraggio fuori dai fondali di pregio',
        rules: ['Navigazione a motore libera', 'Ancoraggio consentito fuori dai fondali di rilevante interesse', 'Ormeggio con autorizzazione'],
      },
    },
  },
  {
    id: 'capo-gallo',
    match: /capo gallo/i,
    name: 'AMP Capo Gallo – Isola delle Femmine',
    manager: 'Consorzio di gestione',
    source: `${MASE}/capo_gallo_dm_24-7-2002-pdf`,
    edition: 'Decreto istitutivo 24/7/2002',
    general: ['Vietati moto d’acqua e sci nautico'],
    zones: {
      A: {
        short: 'vietati navigazione, accesso, sosta e balneazione',
        rules: ['Vietati navigazione, accesso e sosta di qualsiasi unità', 'Vietata la balneazione', 'Vietate le immersioni'],
      },
      B: {
        short: 'motore solo per raggiungere gli ormeggi; vietati ancoraggio e ormeggio liberi',
        rules: [
          'Navigazione a motore solo ai natanti, per raggiungere con la rotta più breve gli ormeggi predisposti',
          'Vietati ancoraggio e ormeggio liberi',
          'Balneazione consentita',
        ],
      },
      C: {
        short: 'motore max 10 nodi; ancoraggio solo nelle zone individuate',
        rules: ['Motore: natanti e imbarcazioni max 10 nodi; vela consentita', 'Ancoraggio e ormeggio solo nelle zone individuate dall’ente gestore', 'Balneazione consentita'],
      },
    },
  },
  {
    id: 'pelagie',
    match: /pelagie|isola dei conigli/i,
    name: 'AMP Isole Pelagie',
    manager: 'Comune di Lampedusa e Linosa',
    source: `${MASE}/pelagie_dm_04-02-2008-pdf`,
    edition: 'Regolamento DM 4/2/2008',
    general: ['Vietati moto d’acqua e sci nautico', 'Navigazione dei non residenti soggetta ad autorizzazione dell’ente gestore'],
    zones: {
      A: {
        short: 'vietati navigazione (anche a vela), ancoraggio, ormeggio e balneazione',
        rules: ['Vietata la navigazione a remi, vela, pedali e motore', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione (Isola dei Conigli: secondo le regole dell’ente gestore)'],
      },
      B: {
        short: 'motore max 5 nodi entro 300 m, 10 oltre; ormeggio solo ai campi boe',
        rules: ['Motore max 5 nodi entro 300 m dalla costa, max 10 nodi oltre, in dislocamento', 'Ormeggio solo ai campi boe, con autorizzazione', 'Balneazione consentita'],
      },
      C: {
        short: 'motore max 10 nodi; ormeggio solo ai campi boe',
        rules: ['Motore max 10 nodi in dislocamento', 'Ormeggio solo ai campi boe, con autorizzazione', 'Balneazione consentita'],
      },
    },
  },

  // ---------------------------------------------------------------- Lazio
  {
    id: 'ventotene',
    match: /area marina protetta isole di ventotene|ventotene e santo stefano/i,
    name: 'AMP Isole di Ventotene e Santo Stefano',
    manager: 'Comune di Ventotene',
    source: `${MASE}/ventotene_dm_18-04-2014-pdf`,
    edition: 'Regolamento DM 18/4/2014',
    general: ['Vietati moto d’acqua e sci nautico'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio e balneazione', rules: ['Vietata la navigazione', 'Vietato l’ancoraggio', 'Vietata la balneazione', 'Vietate le immersioni'] },
      B: {
        short: 'motore solo residenti o autorizzati, max 5 nodi entro 300 m; ancoraggio su sabbia con autorizzazione',
        rules: [
          'Vela, remi, elettrico consentiti; motore ai natanti dei residenti',
          'Altri natanti e imbarcazioni entro 500 m dalla costa solo con autorizzazione, per raggiungere approdi e ormeggi',
          'Velocità max 5 nodi entro 300 m dalla costa',
          'Ancoraggio con autorizzazione, natanti e imbarcazioni, solo su sabbia o ciottoli',
          'Balneazione libera',
        ],
      },
      C: {
        short: 'max 5 nodi entro 300 m; ancoraggio su sabbia con autorizzazione',
        rules: ['Natanti, imbarcazioni e navi da diporto MARPOL: max 5 nodi entro 300 m dalla costa', 'Ancoraggio con autorizzazione, solo su sabbia o ciottoli', 'Balneazione libera'],
      },
    },
  },
  {
    id: 'tor-paterno',
    match: /tor paterno/i,
    name: 'AMP Secche di Tor Paterno',
    manager: 'Ente Roma Natura',
    source: `${MASE}/s_paterno_dm_16-9-2014-pdf`,
    edition: 'Regolamento DM 16/9/2014',
    general: [
      'Vela, remi, pedali ed elettrico: navigazione libera',
      'Motore solo alle unità autorizzate (immersioni, pesca, visite guidate), max 4 nodi',
      'Ancoraggio vietato; ormeggio solo ai gavitelli (entro 100 m vietata la libera navigazione)',
      'Vietati moto d’acqua e sci nautico',
    ],
    zones: {},
  },

  // ---------------------------------------------------------------- Campania
  {
    id: 'punta-campanella',
    match: /campanella|vervece|li galli|ieranto|massa lubrense|marina del cantone|tordigliano/i,
    name: 'AMP Punta Campanella',
    manager: 'Consorzio AMP Punta Campanella',
    source: `${MASE}/p_campanella_dm_30-07-2010-pdf`,
    edition: 'Regolamento DM 30/7/2010',
    general: ['Vietati moto d’acqua e sci nautico', 'Avvicinamento ai gavitelli max 3 nodi, rotta perpendicolare alla costa'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietata la navigazione (scoglio Vervece: aperta il 15 agosto e la prima domenica di settembre)', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione'] },
      B: {
        short: 'motore solo natanti, max 5 nodi entro 300 m; ancoraggio vietato',
        rules: [
          'Vela, remi, pedali, elettrico liberi',
          'Motore solo ai natanti, max 5 nodi entro 300 m dalla costa (vietato tra Punta Campanella, Ieranto, Punta Montalto e Mortelle)',
          'Ancoraggio vietato',
          'Ormeggio dei natanti ai siti attrezzati, con autorizzazione',
          'Balneazione libera',
        ],
      },
      C: {
        short: 'max 5 nodi entro 300 m, 10 oltre; ancoraggio 8–20 lontano da costa e posidonia',
        rules: [
          'Natanti, imbarcazioni e navi da diporto MARPOL: max 5 nodi entro 300 m dalla costa, 10 nodi oltre',
          'Ancoraggio dalle 8 alle 20, ma vietato entro 100 m dalle spiagge e 50 m dalle coste a picco, su posidonia e coralligeno e vicino ai campi boe',
          'Ormeggio ai siti attrezzati, con autorizzazione',
          'Balneazione libera',
        ],
      },
    },
  },
  {
    id: 'regno-di-nettuno',
    match: /regno di nettuno/i,
    name: 'AMP Regno di Nettuno (Ischia, Procida, Vivara)',
    manager: 'Consorzio AMP Regno di Nettuno',
    source: `${MASE}/r_nettuno_dm_30-7-2009-pdf`,
    edition: 'Regolamento DM 30/7/2009',
    general: ['Vietati moto d’acqua e sci nautico (transito solo perpendicolare)', 'Avvicinamento ai gavitelli max 3 nodi, rotta perpendicolare alla costa'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietata la navigazione', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione'] },
      B: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m; ancoraggio dall’alba al tramonto con autorizzazione',
        rules: [
          'Motore (natanti e imbarcazioni eco-compatibili): max 5 nodi entro 300 m, 10 nodi tra 300 e 600 m, in dislocamento',
          'Ancoraggio con autorizzazione, dall’alba al tramonto, fuori da posidonia, coralligeno e campi boe (zona B n.t.: vietato)',
          'Ormeggio con autorizzazione, dall’alba al tramonto, ai siti attrezzati',
          'Balneazione libera',
        ],
      },
      C: {
        short: 'max 5 nodi entro 300 m; ancoraggio con autorizzazione',
        rules: [
          'Natanti, imbarcazioni e navi da diporto MARPOL: max 5 nodi entro 300 m dalla costa',
          'Ancoraggio con autorizzazione, fuori da posidonia, coralligeno e campi boe',
          'Ormeggio ai siti attrezzati',
          'Balneazione libera',
        ],
      },
      D: {
        short: 'max 10 nodi; ormeggio libero',
        rules: ['Motore max 10 nodi in dislocamento', 'Ancoraggio fuori da posidonia, coralligeno e campi boe', 'Ormeggio libero', 'Balneazione libera'],
      },
    },
  },

  // ---------------------------------------------------------------- Abruzzo
  {
    id: 'torre-del-cerrano',
    match: /cerrano/i,
    name: 'AMP Torre del Cerrano',
    manager: 'Consorzio AMP Torre del Cerrano',
    source: `${MASE}/t_cerrano_dm_12-1-2017-pdf`,
    edition: 'Regolamento DM 12/1/2017',
    general: ['Motore max 5 nodi entro 350 m dalla costa e 10 nodi tra 350 e 600 m, in dislocamento'],
    zones: {
      B: { short: 'accesso con autorizzazione; ancoraggio vietato', rules: ['Accesso a natanti e imbarcazioni eco-compatibili con autorizzazione', 'Ancoraggio vietato', 'Ormeggio ai gavitelli, con autorizzazione'] },
      C: {
        short: 'accesso con autorizzazione; ancoraggio su sabbia',
        rules: ['Accesso con autorizzazione (anche navi da diporto conformi)', 'Ancoraggio su fondali sabbiosi, fuori dalle aree sensibili segnalate', 'Ormeggio ai gavitelli, con autorizzazione'],
      },
      D: { short: 'accesso libero; ancoraggio su sabbia', rules: ['Accesso consentito alle unità da diporto', 'Ancoraggio su fondali sabbiosi, fuori dalle aree sensibili'] },
    },
  },
]

/*
 * Aree marine protette di cui l'app non ha ancora le regole per zona:
 * la scheda rimanda alla pagina del Ministero con decreti e regolamento.
 */
export const AMP_PAGES = [
  [/ustica/i, 'area-marina-protetta-isola-di-ustica'],
  [/plemmirio/i, 'area-marina-protetta-plemmirio'],
  [/ciclopi|lachea/i, 'area-marina-protetta-isole-ciclopi'],
  [/milazzo/i, 'area-marina-protetta-capo-milazzo'],
  [/capo testa|punta falcone/i, 'area-marina-protetta-capo-testa-punta-falcone'],
  [/tremiti/i, 'area-marina-protetta-isole-tremiti'],
  [/porto cesareo/i, 'area-marina-protetta-porto-cesareo'],
  [/guaceto/i, 'area-marina-protetta-torre-guaceto'],
  [/castellabate/i, 'area-marina-protetta-santa-maria-di-castellabate'],
  [/infreschi|masseta/i, 'area-marina-protetta-costa-degli-infreschi-e-della-masseta'],
  [/capo rizzuto/i, 'area-marina-protetta-capo-rizzuto'],
  [/gaiola/i, 'parco-sommerso-di-gaiola'],
  [/\bbaia\b/i, 'parco-sommerso-di-baia'],
  [/miramare/i, 'area-marina-protetta-miramare'],
  [/spartivento/i, 'area-marina-protetta-capo-spartivento'],
].map(([match, page]) => ({ match, url: `https://www.mase.gov.it/portale/web/guest/${page}` }))
