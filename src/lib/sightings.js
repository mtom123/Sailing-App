/*
 * Avvistamenti: un marker per ogni specie di cetaceo, tartaruga e squalo che
 * si può incontrare in Mediterraneo. rare: presenza occasionale o localizzata.
 */

export const SIGHTING_GROUPS = [
  { id: 'cetacei', label: 'Cetacei', color: '#00A5B5' },
  { id: 'tartarughe', label: 'Tartarughe', color: '#2E9E5B' },
  { id: 'squali', label: 'Squali', color: '#5C6BC0' },
]

const species = (group, list) => {
  const { color } = SIGHTING_GROUPS.find((g) => g.id === group)
  return list.map(([id, label, latin, rare = false]) => ({ id: `s-${id}`, label, latin, rare, group, color, ...ID_CARDS[id] }))
}

// Scheda di identificazione: lunghezza, come riconoscerlo, dove, con chi si
// confonde. Fonti: manuale cetacei RAC/SPA, ACCOBAMS, Archipelagos, studi
// sull'area. Le misure degli squali sono indicative
const ID_CARDS = {
  fin: { size: 'Fino a 21–23 m', look: 'Soffio alto e colonnare. Dorso lungo e grigio scuro, pinna dorsale curva a due terzi del dorso, visibile poco dopo il soffio. Mandibola nera a sinistra e bianca a destra: è il segno più sicuro.', where: 'Mare aperto in gran parte del Mediterraneo, di cui è il cetaceo più grande.', similar: 'Capodoglio: soffio obliquo e niente vera pinna dorsale.' },
  sperm: { size: 'Maschi fino a 17 m, femmine fino a 10,5 m', look: 'Testa enorme e squadrata, un terzo del corpo. Sfiatatoio spostato a sinistra: soffio folto e obliquo in avanti. Al posto della dorsale una piccola gobba seguita da una fila di bozzi.', where: 'Acque profonde, lungo scarpate e canyon. Nel Mediterraneo orientale soprattutto la Fossa Ellenica.', similar: 'Balenottera comune: soffio dritto e pinna dorsale.' },
  cuvier: { size: 'Fino a 7 m', look: 'Corpo robusto grigio scuro, testa e mandibola più chiare, becco corto poco evidente, dorsale piccola e curva. I maschi hanno due denti sporgenti in punta alla mandibola e molti graffi doppi.', where: 'Mare aperto e profondo. È schivo e si vede di rado.', similar: 'Grampo: dorsale alta e niente becco.' },
  pilot: { size: '5–7 m', look: 'Scuro, testa tonda a globo, pinne pettorali lunghe, macchia bianca ad ancora sul petto. Vive in gruppi stretti, di solito da 9 a 23 animali.', where: 'Mediterraneo occidentale, soprattutto Alboran e Mar Ligure.', similar: 'Pseudorca: testa più conica, pinne pettorali con il gomito.' },
  risso: { size: 'Fino a 3,8 m', look: 'Corpo tozzo, testa arrotondata senza becco con una piega a V sulla fronte, dorsale alta e curva. Con l\'età schiarisce fino al grigio argento e si riempie di graffi.', where: 'Soprattutto sulla scarpata, a volte anche vicino a costa.', similar: 'Tursiope: ha il becco e meno segni.' },
  bottlenose: { size: 'Fino a 3,4 m', look: 'Robusto, dorso grigio scuro, fianchi più chiari e ventre quasi bianco, becco corto, dorsale falcata. Gli adulti hanno spesso segni di denti.', where: 'È il cetaceo più costiero del Mediterraneo.', similar: 'Stenella: più piccola e con le strisce.' },
  striped: { size: 'Fino a 2,3 m', look: 'Slanciata, becco lungo. Strisce scure dall\'occhio verso il ventre e una fiamma grigio chiaro lungo il fianco. Spesso in grandi gruppi.', where: 'Acque aperte oltre la piattaforma; a volte vicino a costa dove il fondo scende subito. È il delfino più abbondante.', similar: 'Delfino comune: disegno a clessidra.' },
  common: { size: '1,8–2,3 m', look: 'Disegno a clessidra sul fianco, giallo crema davanti. Dorso grigio scuro, ventre crema, becco lungo e sottile.', where: 'In tutto il bacino, ma in forte calo dagli anni Sessanta: oggi è in pericolo.', similar: 'Stenella: strisce scure e niente giallo.' },
  roughtoothed: { size: '2–2,6 m', look: 'Unico delfino a becco lungo con la fronte che scende senza stacco nel becco. Corpo robusto davanti, pinne pettorali grandi. Gruppi molto compatti.', where: 'Mediterraneo orientale, soprattutto Levante; avvistato anche al largo della Sicilia orientale.', similar: 'Tursiope: fronte e becco ben separati.' },
  orca: { size: 'Maschi fino a 8 m, femmine meno', look: 'Bianca e nera, con una sella grigia dietro la dorsale. Dorsale altissima nei maschi.', where: 'Stagionale nello Stretto di Gibilterra, visitatrice nel Mediterraneo occidentale, eccezionale a est.', similar: 'Inconfondibile da vicino.' },
  falsekiller: { size: '4–6 m', look: 'Nera e slanciata, testa conica. Pinne pettorali con un gomito evidente. Veloce, a volte salta.', where: 'Non è tra le specie regolari: incontro molto raro.', similar: 'Globicefalo: testa a globo e dorsale più larga.' },
  minke: { size: '7–9 m', look: 'Muso appuntito, dorsale falcata, banda bianca sulle pinne pettorali. Soffio poco visibile.', where: 'Non è tra le specie regolari: incontro raro.', similar: 'Balenottera comune: molto più grande, soffio alto.' },
  humpback: { size: '12–15 m', look: 'Pinne pettorali lunghissime, dorsale bassa su una gobba. Alza la coda e salta.', where: 'Non è tra le specie regolari: incontro molto raro.', similar: 'Le lunghe pinne la distinguono dalle balenottere.' },
  porpoise: { size: '1,4–1,7 m', look: 'Il cetaceo più piccolo: corpo tondeggiante senza becco, dorsale triangolare a metà dorso, striscia scura dalla bocca alle pinne.', where: 'Nel Mediterraneo solo nell\'Egeo settentrionale; regolare nel Mar Nero.', similar: 'Delfini: hanno il becco e la dorsale falcata.' },
  cetacean: { size: '—', look: 'Se non lo riconosci annota lunghezza, forma e posizione della dorsale, tipo di soffio e quanti erano. Una foto aiuta molto.', where: '—', similar: '—' },
  loggerhead: { size: 'Carapace fino a circa 85 cm', look: 'Carapace bruno-rossastro, testa grande e massiccia. Spesso ferma in superficie.', where: 'In tutto il Mediterraneo. Nidifica soprattutto a est: Grecia, Turchia, Cipro.', similar: 'Tartaruga verde: testa piccola.' },
  green: { size: 'Carapace circa 90 cm negli adulti', look: 'Testa piccola e muso corto. Carapace liscio e ovale, con placche che non si sovrappongono.', where: 'Mediterraneo orientale: nidifica soprattutto in Turchia orientale e a Cipro.', similar: 'Tartaruga comune: testa grande.' },
  leatherback: { size: 'Carapace oltre 1,5 m', look: 'Niente placche: pelle scura con creste lungo il dorso. Pinne anteriori lunghissime.', where: 'Rara: arriva dall\'Atlantico per nutrirsi e non nidifica qui.', similar: 'Inconfondibile per taglia e creste.' },
  blue: { size: 'Fino a circa 3,3 m', look: 'Dorso blu indaco, corpo slanciato, muso appuntito, pinne pettorali lunghe e strette.', where: 'Mare aperto, ma si avvicina dove la piattaforma è stretta.', similar: 'Mako: più tozzo, coda a mezzaluna.' },
  basking: { size: 'Circa 7 m', look: 'Bocca enorme aperta mentre filtra il plancton. Dalla superficie escono la dorsale e la punta della coda. Lento e innocuo.', where: 'Sulla piattaforma e al largo, spesso vicino a terra.', similar: 'Squalo bianco: bocca chiusa, nuoto deciso.' },
  mako: { size: 'Circa 2,7 m', look: 'Blu metallico, muso conico, coda a mezzaluna. È lo squalo più veloce e può saltare.', where: 'Soprattutto al largo, a volte vicino a costa.', similar: 'Squalo bianco: più massiccio.' },
  thresher: { size: 'Circa 4,5 m', look: 'Il lobo superiore della coda è circa metà della lunghezza totale. Occhio grande, muso corto.', where: 'Sopra la piattaforma, più frequente vicino a costa.', similar: 'La coda lo rende inconfondibile.' },
  sandbar: { size: 'Circa 2 m', look: 'Corpo robusto grigio-bruno, prima dorsale altissima e molto avanzata.', where: 'Costiero. Aree di nursery nell\'Adriatico nord-occidentale e nel Golfo di Gabès.', similar: 'Verdesca: blu e slanciata.' },
  sixgill: { size: 'Circa 3 m', look: 'Sei fessure branchiali invece di cinque, una sola dorsale molto arretrata, occhi verdi, muso largo.', where: 'Vicino al fondo in acque profonde, in superficie molto di rado.', similar: 'Gli altri squali hanno cinque fessure e due dorsali.' },
  white: { size: '4–6 m', look: 'Corpo massiccio, dorso grigio e ventre bianco con un confine netto, muso conico, coda a mezzaluna.', where: 'Presenza rara e irregolare, più segnalato in Adriatico e nel Canale di Sicilia, soprattutto d\'estate.', similar: 'Mako: più snello e blu.' },
  hammerhead: { size: 'Circa 3,3 m', look: 'Testa appiattita a forma di T, con gli occhi alle estremità.', where: 'Costiero e semi-oceanico; poche segnalazioni.', similar: 'Inconfondibile per la testa.' },
  shark: { size: '—', look: 'Se non lo riconosci annota lunghezza, colore, forma della coda e numero di dorsali. Una foto aiuta molto.', where: '—', similar: '—' },
}

// Codice di buona condotta per il whale watching in Mediterraneo, valido dentro e fuori Pelagos
export const SIGHTING_RULES = 'Cetacei: rallenta entro 300 m, non avvicinarti a meno di 100 m, una sola barca entro i 300 m, osserva al massimo 30 minuti (15 se altre barche aspettano). Non toccarli, non nutrirli, non nuotare con loro.'

export const SPECIES = [
  ...species('cetacei', [
    ['fin', 'Balenottera comune', 'Balaenoptera physalus'],
    ['sperm', 'Capodoglio', 'Physeter macrocephalus'],
    ['cuvier', 'Zifio', 'Ziphius cavirostris'],
    ['pilot', 'Globicefalo', 'Globicephala melas'],
    ['risso', 'Grampo', 'Grampus griseus'],
    ['bottlenose', 'Tursiope', 'Tursiops truncatus'],
    ['striped', 'Stenella striata', 'Stenella coeruleoalba'],
    ['common', 'Delfino comune', 'Delphinus delphis'],
    ['roughtoothed', 'Steno', 'Steno bredanensis', true],
    ['orca', 'Orca', 'Orcinus orca', true],
    ['falsekiller', 'Pseudorca', 'Pseudorca crassidens', true],
    ['minke', 'Balenottera minore', 'Balaenoptera acutorostrata', true],
    ['humpback', 'Megattera', 'Megaptera novaeangliae', true],
    ['porpoise', 'Focena', 'Phocoena phocoena', true],
    ['cetacean', 'Altro cetaceo', '', true],
  ]),
  ...species('tartarughe', [
    ['loggerhead', 'Tartaruga comune', 'Caretta caretta'],
    ['green', 'Tartaruga verde', 'Chelonia mydas'],
    ['leatherback', 'Tartaruga liuto', 'Dermochelys coriacea', true],
  ]),
  ...species('squali', [
    ['blue', 'Verdesca', 'Prionace glauca'],
    ['basking', 'Squalo elefante', 'Cetorhinus maximus'],
    ['mako', 'Mako', 'Isurus oxyrinchus'],
    ['thresher', 'Squalo volpe', 'Alopias vulpinus'],
    ['sandbar', 'Squalo grigio', 'Carcharhinus plumbeus'],
    ['sixgill', 'Capopiatto', 'Hexanchus griseus'],
    ['white', 'Squalo bianco', 'Carcharodon carcharias', true],
    ['hammerhead', 'Squalo martello', 'Sphyrna zygaena', true],
    ['shark', 'Altro squalo', '', true],
  ]),
]

export const isSightingType = (type) => String(type).startsWith('s-')
export const isSighting = (mark) => isSightingType(mark.type)
