/*
 * Regole per zona delle aree marine protette italiane (e regole delle aree
 * francesi e corse), per chi va in barca:
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

  {
    id: 'la-maddalena',
    match: /maddalena/i,
    name: 'Parco nazionale dell’Arcipelago di La Maddalena',
    manager: 'Ente Parco Nazionale dell’Arcipelago di La Maddalena',
    source: 'https://www.guardiacostiera.gov.it/portale/documents/126613/0/033-2026+ORD.+Disciplina+della+navigazione+-+ormeggi+e+attivita%27marittime+LMD.pdf/6d0ee26f-ea8a-51e6-cd1a-42f2',
    edition: 'Ordinanza Capitaneria di La Maddalena 33/2026 (sperimentale 2026-2027) e Regolamento del Parco',
    general: [
      'Velocità max 7 nodi entro 500 m dalla costa e 10 nodi tra 500 e 1000 m',
      'Ancoraggio vietato su posidonia e fondali sensibili mappati dal Parco: solo su sabbia o fango',
      'Ancoraggio vietato nei corridoi e nelle fasce di rispetto segnalati (boe gialle) per i mezzi di soccorso e la balneazione',
      'Accosti riservati alle unità di trasporto passeggeri (boe gialle): Cala Corsara, Cala Connari, Cala Alga (Spargi), Cala Santa Maria, Spiaggia dei Cavalieri e Cala Liò (Budelli), Cala Coticcio e Cala Garibaldi (Caprera); vietato sostare e ancorare durante le loro manovre',
      'Spiaggia Rosa (Budelli): divieti permanenti del Parco',
      'Dal 1° giugno al 30 settembre limiti di orario per ancoraggio e ormeggio fissati dal Parco',
      'Navigazione notturna (22–6) solo nei tratti consentiti dal Parco',
    ],
    zones: {
      MA: {
        label: 'tutela integrale marina',
        short: 'vietati navigazione, accesso, sosta, ormeggio e ancoraggio',
        rules: ['Vietati navigazione, accesso, sosta, ormeggio e ancoraggio, salvo quanto previsto dal Regolamento del Parco'],
      },
      MB: {
        label: 'tutela generale marina',
        short: 'max 7 nodi entro 500 m; ancoraggio solo su sabbia, fuori dai corridoi',
        rules: [
          'Navigazione, ormeggio e ancoraggio consentiti alle condizioni dell’ordinanza e del Regolamento del Parco',
          'Ancoraggio solo su fondali sabbiosi o fangosi, fuori da posidonia, corridoi e fasce di rispetto',
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

  // ---------------------------------------------------------------- Sicilia (2)
  {
    id: 'plemmirio',
    match: /plemmirio/i,
    name: 'AMP Plemmirio',
    manager: 'Consorzio Plemmirio (Comune di Siracusa)',
    source: `${MASE}/plemmirio_dm_15-09-2004-pdf`,
    edition: 'Decreto istitutivo 15/9/2004 (GU 32/2005)',
    general: ['Vietati moto d’acqua e sci nautico', 'Vietate le attività non elencate per ciascuna zona'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Consentiti solo soccorso, sorveglianza, ricerca e visite guidate subacquee autorizzate: vietati navigazione, ancoraggio, ormeggio e balneazione'] },
      B: {
        short: 'motore max 5 nodi; ancoraggio vietato; ormeggio ai campi boe',
        rules: ['Vela e remi consentiti', 'Motore: natanti e imbarcazioni max 5 nodi', 'Ancoraggio non consentito', 'Ormeggio solo nei campi boe autorizzati', 'Balneazione consentita'],
      },
      C: {
        short: 'motore max 10 nodi; ancoraggio nelle zone individuate',
        rules: ['Motore: natanti e imbarcazioni max 10 nodi', 'Ancoraggio nelle zone individuate dall’ente gestore', 'Ormeggio nei campi boe', 'Balneazione consentita'],
      },
    },
  },
  {
    id: 'ciclopi',
    match: /ciclopi|lachea/i,
    name: 'AMP Isole Ciclopi',
    manager: 'Consorzio AMP Isole Ciclopi',
    source: `${MASE}/ciclopi_dm_9-11-2004-pdf`,
    edition: 'Decreto 9/11/2004 (GU 16/2005)',
    general: ['Vietati moto d’acqua e sci nautico', 'Vietate le attività non elencate per ciascuna zona'],
    zones: {
      A: {
        short: 'vietata la navigazione (solo remi per le aree di balneazione)',
        rules: ['Navigazione vietata, salvo natanti a remi per raggiungere le aree di balneazione', 'Balneazione solo nelle aree segnalate (Lachea lato ovest, Punta Cornera, entro 30 m dalla scogliera)', 'Vietati ancoraggio e ormeggio'],
      },
      B: {
        short: 'motore max 5 nodi; ancoraggio vietato; ormeggio ai campi boe',
        rules: ['Vela e remi consentiti', 'Motore: natanti e imbarcazioni max 5 nodi', 'Ancoraggio non consentito', 'Ormeggio nei campi boe autorizzati', 'Balneazione consentita'],
      },
      C: {
        short: 'motore max 10 nodi; ancoraggio nelle zone individuate',
        rules: ['Motore: natanti e imbarcazioni max 10 nodi', 'Ancoraggio nelle zone individuate dall’ente gestore', 'Balneazione consentita'],
      },
    },
  },
  {
    id: 'ustica',
    match: /area marina protetta isola di ustica|riserva marina isola di ustica|\bamp\b.*ustica/i,
    name: 'AMP Isola di Ustica',
    manager: 'Comune di Ustica',
    source: `${MASE}/ustica_dm_12-11-1986-pdf`,
    edition: 'Decreto istitutivo 12/11/1986',
    general: ['Le regole di ormeggio e ancoraggio sono fissate dai disciplinari annuali dell’ente gestore'],
    zones: {
      A: {
        short: 'vietati navigazione, accesso, sosta e balneazione',
        rules: ['Vietati navigazione, accesso e sosta di qualsiasi unità', 'Vietata la balneazione (ammessa controllata a Cala Sidoti e alla Caletta)', 'Ammesso solo il transito delle imbarcazioni di servizio autorizzate'],
      },
      B: { short: 'navigazione non limitata dal decreto; pesca subacquea vietata', rules: ['Il decreto vieta la pesca subacquea e la pesca non autorizzata; navigazione e ancoraggio secondo i disciplinari dell’ente gestore'] },
      C: { short: 'navigazione non limitata dal decreto', rules: ['Vietata la pesca professionale non autorizzata; pesca sportiva consentita'] },
    },
  },
  {
    id: 'capo-milazzo',
    match: /milazzo/i,
    name: 'AMP Capo Milazzo',
    manager: 'Comune di Milazzo',
    source: 'https://www.comune.milazzo.me.it/media/zmsmgavn/amp-disciplinare-provvisorio-attivit%C3%A0-consentite-area-marina-protetta-capo-milazzo-proroga.pdf',
    edition: 'Disciplinare provvisorio (DM 17/5/2018, regolamento DM 153/2018)',
    general: ['Vietati moto d’acqua e sci nautico', 'Avvicinamento alle zone di ancoraggio max 3 nodi, rotta perpendicolare'],
    zones: {
      A: { short: 'vietati navigazione e ancoraggio', rules: ['Navigazione vietata a qualsiasi unità', 'Ancoraggio vietato'] },
      B: {
        short: 'motore max 5 nodi entro 300 m; ancoraggio solo nell’area indicata (Bs: vietato)',
        rules: [
          'Vela e remi consentiti',
          'Motore: natanti e imbarcazioni in dislocamento, max 5 nodi entro 300 m dalla costa',
          'Ancoraggio solo per natanti e imbarcazioni su fondali inerti nell’area indicata a Capo Milazzo; nella sottozona Bs vietato',
        ],
      },
      C: {
        short: 'come zona B, anche navi da diporto; ancoraggio solo a Covo degli Dei',
        rules: ['Navigazione come zona B, ammesse anche le navi da diporto conformi MARPOL', 'Ancoraggio solo su sabbia o ciottoli nell’area di Covo degli Dei'],
      },
    },
  },

  // ---------------------------------------------------------------- Sardegna (2)
  {
    id: 'capo-testa',
    match: /capo testa|punta falcone/i,
    name: 'AMP Capo Testa – Punta Falcone',
    manager: 'Comune di Santa Teresa Gallura',
    source: `${MASE}/c_testa_dm_17-5-2018-pdf`,
    edition: 'Regolamento di disciplina DM 102 del 17/5/2018',
    general: ['Vietati moto d’acqua e sci nautico'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Consentiti solo soccorso, sorveglianza e ricerca'] },
      B: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m; ancoraggio fuori dalle aree sensibili',
        rules: [
          'Vela, remi, elettrico; natanti e imbarcazioni eco-compatibili',
          'Velocità max 5 nodi entro 300 m dalla costa, 10 nodi tra 300 e 600 m, in dislocamento',
          'Ancoraggio per natanti e imbarcazioni fuori dalle aree sensibili segnalate',
          'Ormeggio ai campi boe',
          'Balneazione consentita',
        ],
      },
      C: {
        short: 'come zona B, anche navi da diporto eco-compatibili',
        rules: ['Regole della zona B, ammesse anche le navi da diporto eco-compatibili', 'Ormeggio ai campi boe'],
      },
    },
  },

  // ---------------------------------------------------------------- Calabria e Puglia
  {
    id: 'capo-rizzuto',
    match: /capo rizzuto/i,
    name: 'AMP Capo Rizzuto',
    manager: 'Provincia di Crotone',
    source: `${MASE}/capo_rizzuto_dm_26-5-2009-pdf`,
    edition: 'Regolamento DM 26/5/2009',
    general: ['Vietati moto d’acqua e sci nautico', 'Vietata la navigazione alle navi da diporto'],
    zones: {
      A: { short: 'vietati navigazione e ancoraggio', rules: ['Navigazione vietata', 'Ancoraggio vietato'] },
      B: {
        short: 'motore solo eco-compatibili, max 5 nodi; ancoraggio su fondali inerti',
        rules: ['Vela, remi, elettrico liberi', 'Motore: natanti e imbarcazioni eco-compatibili max 5 nodi (gli altri solo per raggiungere gli ormeggi)', 'Ancoraggio su fondali inerti, fuori da posidonia e campi boe, per unità eco-compatibili'],
      },
      C: {
        short: 'max 5 nodi entro 300 m, 10 oltre; ancoraggio su sabbia di giorno',
        rules: ['Motore: max 5 nodi entro 300 m dalla costa, 10 nodi oltre, in dislocamento', 'Ancoraggio su sabbia, fuori dalle aree sensibili, solo nella fascia diurna (dalle 8)'],
      },
    },
  },
  {
    id: 'tremiti',
    match: /tremiti/i,
    name: 'AMP Isole Tremiti',
    manager: 'Parco Nazionale del Gargano',
    source: `${MASE}/tremiti_dm_14-07-1989-pdf`,
    edition: 'Decreto istitutivo 14/7/1989',
    general: [],
    zones: {
      A: { short: 'vietati navigazione, accesso, sosta e balneazione (Pianosa)', rules: ['Isola di Pianosa: vietati navigazione, accesso, sosta e balneazione'] },
      B: { short: 'navigazione solo autorizzata', rules: ['Vietata la navigazione non autorizzata dall’ente gestore', 'Vietata la pesca non autorizzata'] },
      C: { short: 'navigazione libera; pesca professionale solo autorizzata', rules: ['Il decreto limita solo la pesca'] },
    },
  },

  // ---------------------------------------------------------------- Campania (2)
  {
    id: 'infreschi',
    match: /infreschi|masseta/i,
    name: 'AMP Costa degli Infreschi e della Masseta',
    manager: 'Parco Nazionale del Cilento',
    source: `${MASE}/infreschi_dm_9-4-2015-pdf`,
    edition: 'Regolamento DM 9/4/2015 (GU 98/2015)',
    general: ['Vietati moto d’acqua e sci nautico', 'Vietato l’accesso alle grotte', 'Avvicinamento ai gavitelli max 3 nodi'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio e ormeggio', rules: ['Navigazione vietata', 'Ancoraggio e ormeggio vietati (gavitelli solo per i diving alla Grotta dell’Alabastro)'] },
      B: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m; sottozona B solo vela/remi',
        rules: [
          'Sottozona B: solo vela, remi, pedali, elettrico; vietati ancoraggio e ormeggio',
          'Zona B: motore per natanti e imbarcazioni eco-compatibili, max 5 nodi entro 300 m e 10 nodi tra 300 e 600 m',
          'Ancoraggio fuori da posidonia, coralligeno e campi boe',
          'Ormeggio con autorizzazione ai siti attrezzati',
        ],
      },
      C: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m',
        rules: ['Motore: natanti, imbarcazioni e navi da diporto MARPOL, max 5 nodi entro 300 m e 10 nodi tra 300 e 600 m', 'Ancoraggio fuori da posidonia, coralligeno e campi boe', 'Ormeggio ai siti attrezzati'],
      },
    },
  },
  {
    id: 'gaiola',
    match: /gaiola/i,
    name: 'Parco sommerso di Gaiola',
    manager: 'Ente gestore Parco sommerso di Gaiola',
    source: 'https://www.mase.gov.it/portale/web/guest/parco-sommerso-di-gaiola',
    edition: 'Decreto istitutivo 7/8/2002',
    general: [],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietati navigazione, accesso e sosta', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione'] },
      B: {
        short: 'motore solo autorizzato, max 5 nodi; ancoraggio nelle zone individuate',
        rules: ['Vela e remi consentiti', 'Motore: natanti e imbarcazioni autorizzati, max 5 nodi', 'Ancoraggio nelle zone individuate dall’ente gestore', 'Ormeggio ai gavitelli predisposti'],
      },
    },
  },
  {
    id: 'baia',
    match: /parco sommerso di baia|\bbaia sommersa/i,
    name: 'Parco sommerso di Baia',
    manager: 'Parco archeologico dei Campi Flegrei',
    source: 'https://www.mase.gov.it/portale/web/guest/parco-sommerso-di-baia',
    edition: 'Decreto istitutivo 7/8/2002',
    general: [],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Vietati navigazione, accesso e sosta', 'Vietati ancoraggio e ormeggio', 'Vietata la balneazione'] },
      B: { short: 'motore solo autorizzato, max 5 nodi; ancoraggio vietato', rules: ['Remi consentiti', 'Motore: natanti e imbarcazioni autorizzati, max 5 nodi', 'Ancoraggio e ormeggio vietati'] },
      C: { short: 'ancoraggio e ormeggio nelle zone individuate', rules: ['Vietata la navigazione libera', 'Ancoraggio e ormeggio solo nelle zone individuate dall’ente gestore'] },
    },
  },

  {
    id: 'castellabate',
    match: /castellabate/i,
    name: 'AMP Santa Maria di Castellabate',
    manager: 'Parco Nazionale del Cilento',
    source: `${MASE}/dm_09_04_2015_amp_castellabate-pdf`,
    edition: 'Regolamento DM 9/4/2015 (GU 99/2015)',
    general: ['Vietati moto d’acqua e sci nautico', 'Ancoraggio vietato alle navi da diporto', 'Avvicinamento ai gavitelli max 3 nodi, rotta perpendicolare'],
    zones: {
      A: { short: 'vietati navigazione, ancoraggio, ormeggio e balneazione', rules: ['Navigazione vietata', 'Ancoraggio e ormeggio vietati (anche nelle sottozone B e Bs)', 'Balneazione vietata (anche nella sottozona Bs)'] },
      B: {
        short: 'max 5 nodi entro 300 m, 10 fino a 600 m (eco-compatibili); ancoraggio fuori da posidonia',
        rules: [
          'Vela, remi, pedali, elettrico consentiti',
          'Motore: natanti e imbarcazioni eco-compatibili, max 5 nodi entro 300 m e 10 nodi tra 300 e 600 m, in dislocamento',
          'Ancoraggio per natanti e imbarcazioni fuori da posidonia, coralligeno e campi boe (sottozone B e Bs: vietato)',
          'Ormeggio con autorizzazione ai siti attrezzati',
        ],
      },
      C: {
        short: 'max 5 nodi entro 300 m, 10 oltre; ancoraggio fuori da posidonia',
        rules: [
          'Motore: natanti, imbarcazioni e navi da diporto MARPOL, max 5 nodi entro 300 m, 10 nodi oltre',
          'Corridoio di attraversamento delle zone B e C: max 10 nodi',
          'Ancoraggio per natanti e imbarcazioni fuori da posidonia, coralligeno e campi boe',
          'Ormeggio ai siti attrezzati',
        ],
      },
    },
  },
  {
    id: 'porto-cesareo',
    match: /porto cesareo/i,
    name: 'AMP Porto Cesareo',
    manager: 'Consorzio AMP Porto Cesareo',
    source: 'https://www.mase.gov.it/portale/web/guest/area-marina-protetta-porto-cesareo',
    edition: 'Decreto istitutivo 12/12/1997',
    general: [],
    zones: {
      A: { short: 'vietati navigazione, accesso e sosta', rules: ['Vietati navigazione, accesso e sosta di qualsiasi unità (Torre S. Isidoro–Casa Giorgella e Penisola della Strega)'] },
      B: { short: 'navigazione max 10 nodi', rules: ['Accesso e navigazione max 10 nodi', 'Balneazione consentita'] },
      C: { short: 'max 10 nodi per raggiungere gli ormeggi', rules: ['Accesso e transito max 10 nodi per raggiungere le zone di ormeggio regolamentato'] },
    },
  },
  {
    id: 'torre-guaceto',
    match: /guaceto/i,
    name: 'AMP Torre Guaceto',
    manager: 'Consorzio di gestione di Torre Guaceto',
    source: 'https://www.mase.gov.it/portale/web/guest/area-marina-protetta-torre-guaceto',
    edition: 'Decreto istitutivo 4/12/1991',
    general: ['Navigazione a motore vietata in tutta la riserva (salvo servizio, vigilanza e pescatori autorizzati)'],
    zones: {
      A: { short: 'vietati navigazione, accesso, sosta e approdo', rules: ['Vietati navigazione, accesso, sosta e approdo di qualsiasi unità'] },
      B: { short: 'motore vietato', rules: ['Navigazione a motore vietata (solo pescatori professionisti autorizzati)'] },
      C: { short: 'motore vietato', rules: ['Navigazione a motore vietata'] },
    },
  },

  // ---------------------------------------------------------------- Friuli
  {
    id: 'miramare',
    match: /miramare/i,
    name: 'AMP Miramare',
    manager: 'WWF Area Marina Protetta Miramare',
    source: `${MASE}/miramare_dm_26-05-2009-pdf`,
    edition: 'Regolamento DM 26/5/2009',
    general: ['Vietati transito e navigazione da diporto in tutta l’area (solo unità autorizzate)', 'Ancoraggio vietato'],
    zones: {},
  },

  // ---------------------------------------------------------------- Francia e Corsica
  // Niente zone A/B/C: regole dell'area intera da parchi e Préfecture maritime
  {
    id: 'port-cros-ama',
    match: /port-cros.*(aire maritime|adjacente)/i,
    name: 'Parc national de Port-Cros · area marina adiacente',
    manager: 'Parc national de Port-Cros',
    source: 'https://portcros-parcnational.fr/sites/portcros-parcnational.fr/files/2026-05/2026_FR_PORQUEROLLES_%20REGLEMENTATION%20MARINE_KM_web.pdf',
    edition: 'Réglementation marine Porquerolles 2026',
    general: [
      'Nessun divieto di navigazione specifico (fuori dai cuori marini dei 600 m)',
      'Rada di Hyères: ancoraggio vietato alle navi di 24 m e oltre',
      'Bande des 300 m: max 5 nodi',
    ],
    zones: {},
  },
  {
    id: 'port-cros',
    match: /port-cros|porquerolles/i,
    name: 'Parc national de Port-Cros · cuore marino',
    manager: 'Parc national de Port-Cros',
    source: 'https://portcros-parcnational.fr/sites/portcros-parcnational.fr/files/2025-05/2025_DEPLIANT%20PORT-CROS_REGLEMENTATION%20MARINE_FRANCAIS.pdf',
    edition: 'Réglementation marine Port-Cros 2025 e Porquerolles 2026 (AP 116 e 117/2023)',
    general: [
      'Max 12 nodi tra 300 e 600 m dalla costa, 5 nodi entro 300 m e nella ZMEL, 3 nodi in porto',
      'Vietati moto d’acqua, scooter e mezzi trainati nel cuore marino (600 m)',
      'Ancoraggio vietato alle navi di 24 m e oltre; a Port-Cros ancoraggio solo per unità con cassa delle acque nere',
      'Zone segnate sulla carta del parco: ancoraggio vietato, vietato oltre 12 m, o solo ai dispositivi per le immersioni',
      'ZMEL di Bagaud (15 aprile–15 ottobre): vietato ancorare, solo boe, una persona sempre a bordo',
      'Vietato ormeggiarsi alle boe di balisage; niente sbarchi sugli isolotti tranne al molo',
      'Porquerolles: vietato ancorare entro 100 m dai siti di immersione; ormeggio vietato oltre 15 m',
      'Vietato qualsiasi scarico in mare',
    ],
    zones: {},
  },
  {
    id: 'calanques',
    match: /calanques/i,
    name: 'Parc national des Calanques · cuore marino',
    manager: 'Parc national des Calanques',
    source: 'https://www.calanques-parcnational.fr/fr/plaisance-naviguer-dans-les-calanques-de-marseille-cassis-la-ciotat',
    edition: 'Regole di navigazione del Parco e AP 099/2021',
    general: [
      'Max 5 nodi nella fascia dei 300 m',
      'Ancoraggio vietato nelle zone segnate sulla carta del parco (boe gialle); vietato sempre a En-Vau e Port-Pin',
      'Navi di 24 m e oltre: ancoraggio solo al largo, oltre la posidonia (AP 099/2021)',
      'Zone di non prelievo (ZNP): vietata ogni pesca',
      'Ancoraggio preferibilmente su sabbia, mai su posidonia',
    ],
    zones: {},
  },
  {
    id: 'cote-bleue',
    match: /carry-le-rouet|cap couronne|c[ôo]te bleue/i,
    name: 'Parc marin de la Côte Bleue · riserva',
    manager: 'Parc marin de la Côte Bleue',
    source: 'https://provence-alpes-cotedazur.com/decouvrir/espaces-naturels/patrimoine-naturel/parc-marin-de-la-cote-bleue-carry-le-rouet-fr-3261601/',
    edition: 'Riserve di Carry-le-Rouet e Cap Couronne',
    general: ['Vietati ancoraggio, pesca e immersioni con autorespiratore', 'Fuori dalle riserve ancoraggio regolato da AP 159/2016 e 123/2019'],
    zones: {},
  },
  {
    id: 'scandola',
    match: /scandola/i,
    name: 'Réserve naturelle de Scandola',
    manager: 'Parc naturel régional de Corse',
    source: 'https://www.pnr.corsica/fr/patrimoine-naturel-culturel/gestion-des-sites/scandola',
    edition: 'Arrêté préfectoral 17/2000 (mouillage)',
    general: [
      'Ancoraggio consentito solo dall’alba al tramonto; vietato di notte in tutta la riserva',
      'Riserva integrale (isola di Gargalu–Punta Palazzu): ancoraggio vietato giorno e notte',
      'Possibili divieti stagionali di navigazione e ancoraggio in zone segnalate (es. 1° maggio–31 luglio, arrêtés della Préfecture maritime)',
      'Pesca vietata; vietato lo sbarco nella riserva integrale',
    ],
    zones: {},
  },
  {
    id: 'bonifacio',
    match: /bouches de bonifacio|lavezzi/i,
    name: 'Réserve naturelle des Bouches de Bonifacio',
    manager: 'Office de l’Environnement de la Corse',
    source: 'https://www.premar-mediterranee.gouv.fr/communiques-presse/le-prefet-maritime-de-la-mediterranee-reglemente-la-frequentation-autour-des-iles-lavezzi-en-corse-du-sud-afin-de-preserver-plusieurs-especes-d-oiseaux-protegees',
    edition: 'AP 235/2023 (Lavezzi), AP 206/2020 (navi ≥ 24 m)',
    general: [
      'Lavezzi: vietati navigazione, ancoraggio e sosta in 4 zone (nord di Lavezzi, isolotti di Ratino, Porraggia e Perduto) per gli uccelli marini',
      'Navi di 24 m e oltre: ancoraggio e sosta regolati (AP 206/2020)',
      'Bande des 300 m: max 5 nodi',
    ],
    zones: {},
  },
  {
    id: 'cerbicale',
    match: /cerbicale/i,
    name: 'Réserve naturelle des îles Cerbicale',
    manager: 'Office de l’Environnement de la Corse',
    source: 'https://aida.ineris.fr/reglementation/decret-ndeg81-205-030381-portant-creation-reserve-naturelle-iles-cerbicale-corse-sud',
    edition: 'Decreto 81-205 del 3/3/1981',
    general: ['Il decreto tutela soprattutto flora e fauna degli isolotti: rispetta i divieti di sbarco segnalati', 'Bande des 300 m: max 5 nodi; ancoraggio mai su posidonia'],
    zones: {},
  },
  {
    id: 'cap-corse',
    match: /cap corse|agriate/i,
    name: 'Parc naturel marin du Cap Corse et de l’Agriate',
    manager: 'Office français de la biodiversité',
    source: 'https://ofb.gouv.fr/le-parc-naturel-marin-du-cap-corse-et-de-agriate',
    edition: 'AP 95/2021 modificato da AP 131/2022 (navi ≥ 24 m)',
    general: [
      'Ancoraggio vietato sulla posidonia',
      'Navi di 24 m e oltre: ancoraggio e sosta regolati (AP 95/2021 e 131/2022)',
      'Bande des 300 m: max 5 nodi',
    ],
    zones: {},
  },
]

/*
 * Aree marine protette di cui l'app non ha ancora le regole per zona:
 * la scheda rimanda alla pagina del Ministero con decreti e regolamento.
 */
export const AMP_PAGES = [
  [/spartivento/i, 'area-marina-protetta-capo-spartivento'],
].map(([match, page]) => ({ match, url: `https://www.mase.gov.it/portale/web/guest/${page}` }))
