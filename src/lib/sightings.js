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

// Scheda di identificazione: lunghezza, come riconoscerlo, dove, con chi si confonde
const ID_CARDS = {
  fin: { size: '18–22 m', look: 'Soffio alto e dritto, fino a 6 m. Dorso lunghissimo e grigio, pinna dorsale piccola e molto arretrata che esce dopo il soffio. Mandibola destra chiara.', where: 'Mare aperto, soprattutto Mar Ligure e Santuario Pelagos in estate.', similar: 'Capodoglio: soffio obliquo e niente pinna dorsale.' },
  sperm: { size: 'Maschi 15–18 m, femmine 10–12 m', look: 'Testa enorme e squadrata, pelle rugosa. Soffio basso, obliquo in avanti e a sinistra. Al posto della dorsale una gobba. Prima di immergersi alza la coda.', where: 'Sopra scarpate e canyon, con fondali oltre i 1000 m.', similar: 'Balenottera comune: soffio dritto e pinna dorsale.' },
  cuvier: { size: '5–7 m', look: 'Corpo robusto color ruggine o grigio, testa chiara con becco corto. Dorsale piccola e arretrata. I maschi hanno lunghi graffi bianchi.', where: 'Canyon profondi, per esempio Mar Ligure e Ionio. Schivo, sta sotto a lungo.', similar: 'Grampo: più chiaro e con dorsale alta.' },
  pilot: { size: '4–6 m', look: 'Nero, testa tonda a globo senza becco. Dorsale larga e bassa, spostata in avanti. Vive in gruppi compatti, spesso fermi in superficie.', where: 'Acque profonde, soprattutto Mediterraneo occidentale e Alboran.', similar: 'Pseudorca: testa più conica, dorsale più sottile.' },
  risso: { size: '3–4 m', look: 'Testa arrotondata senza becco. Corpo grigio che diventa quasi bianco, coperto di graffi. Dorsale alta e scura.', where: 'Scarpata continentale, di solito oltre i 500 m.', similar: 'Tursiope: ha il becco e meno segni.' },
  bottlenose: { size: '2–3,5 m', look: 'Grigio uniforme, becco corto e robusto, dorsale falcata al centro del dorso. Si avvicina volentieri alle barche.', where: 'Vicino a costa e sulla piattaforma, spesso attorno a pescherecci e allevamenti.', similar: 'Stenella: più piccola e con le strisce.' },
  striped: { size: '1,8–2,2 m', look: 'Striscia scura dall\'occhio alla pancia e fiamma chiara sul fianco. Gruppi veloci che saltano fuori dall\'acqua.', where: 'Mare aperto: è il delfino più frequente al largo.', similar: 'Delfino comune: disegno a clessidra.' },
  common: { size: '1,7–2,3 m', look: 'Disegno a clessidra sul fianco, giallo-ocra davanti e grigio dietro. Becco sottile.', where: 'Oggi raro in gran parte del bacino; più facile in Alboran, Ionio ed Egeo.', similar: 'Stenella: striscia scura e niente giallo.' },
  roughtoothed: { size: '2–2,6 m', look: 'Becco lungo che continua la fronte senza stacco, testa quasi conica. Macchie chiare sui fianchi.', where: 'Soprattutto Mediterraneo orientale.', similar: 'Tursiope: fronte e becco ben separati.' },
  orca: { size: 'Maschi 6–8 m, femmine 5–7 m', look: 'Nera e bianca, macchia chiara dietro l\'occhio. Dorsale altissima nei maschi, fino a 1,8 m.', where: 'Stretto di Gibilterra; altrove visite eccezionali.', similar: 'Inconfondibile da vicino.' },
  falsekiller: { size: '4–6 m', look: 'Nera e slanciata, testa conica. Pinne pettorali con un gomito evidente. Veloce, a volte salta.', where: 'Molto rara, acque profonde.', similar: 'Globicefalo: testa a globo e dorsale più larga.' },
  minke: { size: '7–9 m', look: 'Muso appuntito, dorsale falcata, banda bianca sulle pinne pettorali. Soffio quasi invisibile.', where: 'Rara, per lo più Mediterraneo occidentale.', similar: 'Balenottera comune: molto più grande, soffio alto.' },
  humpback: { size: '12–15 m', look: 'Pinne pettorali lunghissime e chiare, testa con tubercoli, dorsale bassa su una gobba. Alza la coda e salta.', where: 'Visitatore rarissimo.', similar: 'Le lunghe pinne la distinguono dalle balenottere.' },
  porpoise: { size: '1,4–1,8 m', look: 'Piccola, senza becco, dorsale bassa e triangolare. Sale in superficie senza saltare.', where: 'Mar Nero, Marmara ed Egeo settentrionale.', similar: 'Delfini: hanno il becco e la dorsale falcata.' },
  cetacean: { size: '—', look: 'Se non lo riconosci annota lunghezza, forma e posizione della dorsale, tipo di soffio e quanti erano. Una foto aiuta molto.', where: '—', similar: '—' },
  loggerhead: { size: 'Carapace 60–90 cm', look: 'Carapace bruno-rossastro a forma di cuore, testa grande e massiccia. Spesso ferma in superficie a scaldarsi.', where: 'Tutto il Mediterraneo: è la tartaruga più frequente.', similar: 'Tartaruga verde: testa piccola.' },
  green: { size: 'Carapace 80–110 cm', look: 'Testa piccola e muso corto. Carapace liscio e ovale, con placche che non si sovrappongono.', where: 'Soprattutto Mediterraneo orientale.', similar: 'Tartaruga comune: testa grande.' },
  leatherback: { size: 'Fino a 2 m', look: 'Niente placche: pelle nera con macchie chiare e cinque creste lungo il dorso. Pinne anteriori lunghissime.', where: 'Rara, in mare aperto, spesso dietro alle meduse.', similar: 'Inconfondibile per taglia e creste.' },
  blue: { size: '2–3,5 m', look: 'Dorso blu intenso, corpo slanciato, muso appuntito, pinne pettorali lunghe e strette.', where: 'Mare aperto, a volte in superficie con la dorsale fuori.', similar: 'Mako: più tozzo, coda a mezzaluna.' },
  basking: { size: '6–9 m', look: 'Bocca enorme aperta mentre filtra il plancton. Dalla superficie escono la dorsale e la punta della coda. Lento e innocuo.', where: 'In primavera anche vicino a costa, seguendo il plancton.', similar: 'Squalo bianco: bocca chiusa, nuoto deciso.' },
  mako: { size: '2–3,5 m', look: 'Blu metallico, muso conico, coda a mezzaluna. Velocissimo, può saltare fuori dall\'acqua.', where: 'Mare aperto.', similar: 'Squalo bianco: più massiccio.' },
  thresher: { size: '3–5 m', look: 'Il lobo superiore della coda è lungo quanto il corpo. Occhio grande, muso corto.', where: 'Mare aperto, a volte vicino a costa.', similar: 'La coda lo rende inconfondibile.' },
  sandbar: { size: '2–2,5 m', look: 'Corpo robusto grigio-bruno, prima dorsale altissima e molto avanzata.', where: 'Fondali bassi e costieri, soprattutto Mediterraneo centrale e meridionale.', similar: 'Verdesca: blu e slanciata.' },
  sixgill: { size: '3–5 m', look: 'Sei fessure branchiali e una sola dorsale molto arretrata. Occhi verdi, muso largo.', where: 'Acque profonde, in superficie molto di rado.', similar: 'Gli altri squali hanno cinque fessure e due dorsali.' },
  white: { size: '4–6 m', look: 'Corpo massiccio, dorso grigio e ventre bianco con un confine netto, muso conico, coda a mezzaluna.', where: 'Raro: Canale di Sicilia e Adriatico. Non avvicinarlo.', similar: 'Mako: più snello e blu.' },
  hammerhead: { size: '2,5–4 m', look: 'Testa appiattita a forma di T, con gli occhi alle estremità.', where: 'Molto raro, più facile nel sud del bacino.', similar: 'Inconfondibile per la testa.' },
  shark: { size: '—', look: 'Se non lo riconosci annota lunghezza, colore, forma della coda e numero di dorsali. Una foto aiuta molto.', where: '—', similar: '—' },
}

export const SIGHTING_RULES = 'Rallenta, resta ad almeno 100 m, non tagliare la rotta agli animali e non inseguirli.'

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
