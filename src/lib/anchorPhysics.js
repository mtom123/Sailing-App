/**
 * Fisica dell'ancoraggio, per decidere PRIMA di dare fondo.
 *
 * - Carico del vento sulla barca all'ancora: F = ½ ρ Cd A v², con un fattore
 *   per l'imbardata (la barca "veleggia" sull'ancora e prende il vento più di
 *   traverso). Le onde e gli strappi aggiungono carichi dinamici: qui non ci
 *   sono, per questo si chiede margine sulla tenuta.
 * - Catenaria della catena: con il carico orizzontale H e il peso in acqua w,
 *   la catena sospesa tra fondo e musone per un dislivello h è lunga
 *   s = √(h² + 2·h·H/w). Se la catena calata è più corta, alla raffica tira
 *   l'ancora verso l'alto (la fa "arare"); se è più lunga, il resto resta
 *   adagiato sul fondo, che è quello che si vuole.
 * - Tenuta: SOLO INDICATIVA. Peso dell'ancora × coefficiente del tipo × fondo,
 *   da prove pubblicate in sabbia buona; nella realtà dipende da come ha
 *   fatto presa. Fanno fede le prove a marcia indietro.
 */

const RHO_AIR = 1.225
const G = 9.81
const STEEL_IN_WATER = 0.87 // peso apparente dell'acciaio in acqua di mare
// Resistenza della barca vista di prua con l'imbardata all'ancora (Cd × imbardata).
// Tarato sull'esperienza dell'utente (Le Grazie, fango, 63 kn, Ultra con 50 m
// di catena e pesce da 8 kg: ha tenuto): 1,7 dava carichi e catene troppo abbondanti
const CD_YAW = 1.0
// Raffica / vento medio: la forma della catena tra una raffica e l'altra
const GUST_FACTOR = 1.3
// Catena da lasciare sul fondo a vento medio, per smorzare gli strappi
const RESERVE_M = 10

// Cima tra gancio sulla catena e bitte (briglia a Y o singola): quanto si
// allunga sotto carico forte. Il nylon è fatto per allungarsi, il poliestere
// (una vecchia scotta) quasi no
export const SNUBBER_TYPES = [
  { key: 'nylon3', label: 'Nylon a tre legnoli', stretch: 0.2 },
  { key: 'nylonBraid', label: 'Nylon intrecciato', stretch: 0.14 },
  { key: 'polyester', label: 'Poliestere (es. vecchia scotta)', stretch: 0.04 },
  { key: 'none', label: 'Nessuna (catena sul verricello)', stretch: 0 },
]

/**
 * Strappi di onda, raffica e imbardata sopra il carico del vento: dall'onda
 * prevista (senza dato, valore medio), smorzati da ciò che li assorbe prima
 * che arrivino all'ancora:
 * - catena che a vento medio resta sul fondo (la pancia si solleva e frena);
 * - pesce sulla catena;
 * - allungamento della cima tra gancio e bitte.
 * Tarato su Le Grazie (50 m, pesce, vecchia scotta, 63 kn: ha tenuto), dove
 * dà gli stessi carichi di prima (+50%).
 */
export function shockFactor({ waveM = null, lyingMeanM = 0, kellet = false, snubStretchM = 0 }) {
  const excess = Number.isFinite(waveM) ? 0.25 + 0.35 * Math.min(2, Math.max(0, waveM)) : 0.6
  const byChain = 0.35 * Math.min(1, Math.max(0, lyingMeanM) / 20)
  const byKellet = kellet ? 0.15 : 0
  const bySnubber = 0.4 * Math.min(1, Math.max(0, snubStretchM) / 1.5)
  const kept = (1 - byChain) * (1 - byKellet) * (1 - bySnubber)
  return { factor: 1 + excess * kept, absorbed: 1 - kept, byChain, byKellet, bySnubber }
}
// Angolo della catena sull'ancora: sotto questo le ancore tengono ancora bene
export const MAX_ANGLE_DEG = 12
// Angolo che va ancora bene: con 50 m di catena e 8–9 m di fondo a 63 kn la
// catena arrivava all'ancora a 7–8° e l'Ultra ha tenuto senza problemi
export const GOOD_ANGLE_DEG = 8
// Pesce: metri di catena equivalenti per kg (Ultra Marine: ~10 m per 8 kg)
export const KELLET_M_PER_KG = 1.25
const KN = 0.5144

// Massa della catena (kg/m) dal diametro del filo (mm), catena calibrata a
// maglia corta (ISO 4565 / DIN 766): ~0,0219 · d² (8 mm 1,4 · 10 mm 2,2 · 12 mm 3,2)
export const chainKgPerM = (mm) => 0.0219 * mm * mm

// kgf di tenuta per kg di ancora, in sabbia compatta (indicativi), e quanto
// ne resta nel fango (mud). Nel fango le ancore tradizionali tengono molto
// meno: prova comparativa a Sestri Levante (fango compatto, 5 m, catena 8 mm,
// 30 m): Danforth 20 kg ara a 115 kg, CQR 22 kg a 136 kg, Bruce 20 kg a
// 168 kg; l'Ultra 21 kg oltre 460 kg senza arare (si è rotta la cima del
// dinamometro), anche girando la barca di 180°
export const ANCHOR_TYPES = [
  { key: 'ultra', label: 'Ultra (Ultra Marine)', factor: 75, mud: 1 },
  { key: 'newgen', label: 'Nuova generazione (Rocna, Spade, Mantus, Vulcan)', factor: 75, mud: 1 },
  { key: 'delta', label: 'Delta', factor: 45, mud: 0.3 },
  { key: 'cqr', label: 'CQR / aratro', factor: 40, mud: 0.25 },
  { key: 'bruce', label: 'Bruce / artiglio', factor: 35, mud: 0.35 },
  { key: 'danforth', label: 'Danforth / Fortress', factor: 50, mud: 0.2 },
]
const MUDDY = new Set(['mud', 'softmud'])

// Fondo: moltiplicatore della tenuta dell'ancora, attrito della catena
// adagiata (coefficiente) e calumo minimo da buona pratica
export const BOTTOMS = [
  { key: 'sand', label: 'Sabbia', factor: 1, friction: 0.7, minScope: 3 },
  // Fango buon tenitore: tiene come la sabbia (Le Grazie, Ultra 21 kg, 63 kn: ha tenuto senza problemi)
  { key: 'mud', label: 'Fango (buon tenitore)', factor: 1, friction: 0.5, minScope: 4 },
  { key: 'softmud', label: 'Fango molle', factor: 0.45, friction: 0.4, minScope: 5 },
  { key: 'weed', label: 'Posidonia / alghe', factor: 0.3, friction: 0.4, minScope: 5 },
  { key: 'rock', label: 'Roccia / coralligeno', factor: 0.2, friction: 0.5, minScope: 5 },
  { key: 'unknown', label: 'Non so', factor: 0.6, friction: 0.5, minScope: 4 },
]
// Margine voluto tra tenuta (ancora + catena sul fondo) e carico alla raffica.
// Il carico comprende già gli strappi (fattore dinamico): 1,5 li contava due
// volte e dava "poco margine" anche a Le Grazie, dove l'ancora ha tenuto bene
const HOLD_MARGIN = 1.3

/**
 * Carico orizzontale (N) del vento in nodi sulla superficie esposta (m²).
 * dynamic: con raffiche, onda e strappi (per la tenuta dell'ancora); senza,
 * il carico medio che decide la forma della catena (gli strappi brevi la
 * catena li assorbe sollevandosi un momento)
 */
export function windLoadN(windKn, windageM2, dynamic = 1) {
  const v = windKn * KN
  return 0.5 * RHO_AIR * CD_YAW * dynamic * windageM2 * v * v
}

/**
 * Angolo (gradi) della catena sull'ancora: catenaria con tensione orizzontale
 * H (N), peso in acqua w (N/m), catena L (m), dislivello h (m). 0 = tratto
 * adagiato sul fondo. Con u = pendenza (sinh): h = a(√(1+u₂²) − √(1+u₁²)),
 * L = a(u₂ − u₁), a = H/w; si cerca u₁ ≥ 0.
 */
export function anchorAngleDeg(H, w, L, h) {
  if (L <= h) return 90
  const a = H / w
  const rise = (u1) => a * (Math.sqrt(1 + (u1 + L / a) ** 2) - Math.sqrt(1 + u1 * u1))
  if (rise(0) >= h) return 0 // con l'ancora orizzontale arriva già al musone: c'è catena sul fondo
  let lo = 0
  let hi = 1
  while (rise(hi) < h && hi < 1e6) hi *= 2
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    if (rise(mid) < h) lo = mid
    else hi = mid
  }
  return (Math.atan((lo + hi) / 2) * 180) / Math.PI
}

/**
 * Verifica dell'ancoraggio alla raffica.
 * @returns {{
 *   loadKgf, holdKgf, holdRatio,           // carico e tenuta indicativa
 *   suspendedM, lyingM, angleDeg, chainOk, chainNeededM,
 *   scope,                                  // rapporto catena / dislivello
 *   radiusM,                                // raggio di rotazione (ancora → poppa) a catena tesa
 *   level: 'ok' | 'warn' | 'danger', reasons: string[]
 * }}
 */
export function anchorCheck({
  depthM,
  bowHeightM,
  chainM,
  chainMm,
  anchorKg,
  anchorType,
  bottom,
  gustKn,
  windageM2,
  loaM,
  kelletKg = 0,
  waveM = null,
  snubberM = 0,
  snubberType = 'none',
}) {
  const h = Math.max(0.5, depthM + bowHeightM)
  const w = chainKgPerM(chainMm > 0 ? chainMm : 10) * G * STEEL_IN_WATER // N/m
  // Il pesce (sentinella) a metà calumo abbassa la catena molto più del suo
  // peso: Ultra Marine lo dà come ~10 m di catena in più per 8 kg. Conta come
  // catena in più nella catenaria (non nel raggio di rotazione)
  const kelletM = kelletKg > 0 ? KELLET_M_PER_KG * kelletKg : 0
  const effChainM = chainM + kelletM
  const type = ANCHOR_TYPES.find((t) => t.key === anchorType)
  const typeF = type?.factor ?? 25
  const bt = BOTTOMS.find((b) => b.key === bottom) ?? BOTTOMS[BOTTOMS.length - 1]
  // Nel fango conta anche il tipo di ancora (le tradizionali arano presto)
  const mudF = MUDDY.has(bt.key) ? type?.mud ?? 0.3 : 1
  const bottomF = bt.factor * mudF
  const anchorHoldKgf = anchorKg * typeF * bottomF
  // La catena adagiata sul fondo tiene anche lei, per attrito: dove l'ancora
  // tiene poco (posidonia, fango, roccia) ne serve di più
  const frictionKgf = (lying) => (lying * w * bt.friction) / G
  const snubStretchM = Math.max(0, snubberM || 0) * (SNUBBER_TYPES.find((t) => t.key === snubberType)?.stretch ?? 0)
  const suspendedAt = (H) => Math.sqrt(h * h + (2 * h * H) / w)
  // Tutto alla raffica g: catena sospesa e sul fondo, strappi, carico e tenuta
  const at = (g) => {
    const H = windLoadN(g, windageM2, 1)
    const suspended = suspendedAt(H)
    const lying = Math.max(0, effChainM - suspended)
    const lyingMean = Math.max(0, effChainM - suspendedAt(windLoadN(g / GUST_FACTOR, windageM2, 1)))
    const shock = shockFactor({ waveM, lyingMeanM: lyingMean, kellet: kelletM > 0, snubStretchM })
    const loadKgf = windLoadN(g, windageM2, shock.factor) / G
    const holdKgf = anchorHoldKgf + frictionKgf(lying)
    return { H, suspended, lying, lyingMean, shock, loadKgf, holdKgf, ratio: holdKgf / Math.max(1, loadKgf) }
  }
  const now = at(gustKn)
  const H = now.H
  const suspendedM = now.suspended
  const lyingM = now.lying
  const angleDeg = anchorAngleDeg(H, w, effChainM, h)
  const chainOk = angleDeg <= MAX_ANGLE_DEG
  const loadKgf = now.loadKgf
  const holdKgf = now.holdKgf
  const holdRatio = now.ratio
  // Raffica a cui il rapporto tenuta / carico scende a `target` (cala con la
  // raffica: più carico, meno catena sul fondo, strappi meno smorzati)
  const gustFor = (target) => {
    let lo = 1
    let hi = 200
    if (at(hi).ratio >= target) return hi
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (at(mid).ratio >= target) lo = mid
      else hi = mid
    }
    return lo
  }
  // Raffica che l'ancora regge con il margine voluto, e quella a cui
  // secondo la stima comincerebbe ad arare
  const holdMaxKn = gustKn > 0 ? gustFor(HOLD_MARGIN) : null
  const dragKn = gustKn > 0 ? gustFor(1) : null
  // Catena consigliata: catena sul fondo alla raffica (catenaria) e calumo
  // minimo del fondo. L'attrito della catena adagiata è piccolo (pochi kg):
  // se l'ancora non tiene, più catena non basta, serve un fondo o un'ancora migliore
  // Catena che tiene l'angolo sull'ancora entro GOOD_ANGLE_DEG alla raffica
  let catNeedM = Math.ceil(h * 2)
  while (catNeedM < 400 && anchorAngleDeg(H, w, catNeedM + kelletM, h) > GOOD_ANGLE_DEG) catNeedM += 1
  const scopeNeedM = Math.ceil(h * bt.minScope)
  // Riserva: a vento medio deve restare catena sul fondo, la pancia che si
  // solleva e smorza gli strappi della raffica (con poca catena arrivano pieni)
  const reserveNeedM = Math.ceil(suspendedAt(windLoadN(gustKn / GUST_FACTOR, windageM2, 1)) + RESERVE_M - kelletM)
  const chainNeededM = Math.max(catNeedM, scopeNeedM, reserveNeedM)
  // Raggio massimo: catena tutta tesa più la barca
  const radiusM = Math.sqrt(Math.max(0, chainM * chainM - h * h)) + loaM

  // Due giudizi separati: la catena (si corregge filandone di più) e la
  // tenuta dell'ancora (con più catena non cambia: contano ancora e fondo)
  const reasons = []
  const worst = (a, b) => (a === 'danger' || b === 'danger' ? 'danger' : a === 'warn' || b === 'warn' ? 'warn' : 'ok')
  let chainLevel = 'ok'
  if (!chainOk) {
    chainLevel = 'danger'
    reasons.push(`Alla raffica la catena tira l'ancora verso l'alto (${angleDeg.toFixed(0)}°): servono almeno ${catNeedM} m`)
  } else if (angleDeg > GOOD_ANGLE_DEG) {
    chainLevel = 'warn'
    reasons.push(`Alla raffica la catena arriva all'ancora a ${angleDeg.toFixed(0)}°: meglio ${catNeedM} m`)
  }
  if (chainM < scopeNeedM) {
    chainLevel = worst(chainLevel, 'warn')
    reasons.push(`Su ${bt.label.toLowerCase()} si consiglia almeno ${bt.minScope}:1, cioè ${scopeNeedM} m`)
  }
  let holdLevel = 'ok'
  const upTo = holdMaxKn != null ? ` (regge fino a ~${Math.round(holdMaxKn)} kn di raffica)` : ''
  const better =
    mudF < 1 ? "nel fango un'ancora di nuova generazione tiene molto di più, " : bt.factor < 1 ? 'cerca un fondo migliore (sabbia o fango buono), ' : ''
  // Cima che si allunga poco: gli strappi arrivano quasi pieni all'ancora
  const softer = snubStretchM < 1 ? ' Una cima di nylon più lunga tra gancio e bitte smorzerebbe gli strappi.' : ''
  if (holdRatio < 1) {
    holdLevel = 'danger'
    reasons.push(`L'ancora da sola non tiene questa raffica${upTo}, e più catena non serve: ${better}dai una seconda ancora o usa un'ancora più pesante.${softer}`)
  } else if (holdRatio < HOLD_MARGIN) {
    holdLevel = 'warn'
    reasons.push(`Tenuta dell'ancora con poco margine${upTo}; più catena non la cambia: dai marcia indietro decisa per farla affondare bene.${softer}`)
  }
  const level = worst(chainLevel, holdLevel)
  if (mudF < 1) reasons.push(`Nel fango ${type.label.split(' (')[0]} tiene poco: in prova le ancore tradizionali hanno arato tra 100 e 170 kg di tiro`)
  if (bottom === 'weed') reasons.push("Su posidonia l'ancora tiene male, e in molte aree protette è vietato")
  if (bottom === 'rock') reasons.push("Su roccia la presa è incerta e l'ancora può incastrarsi")
  return {
    loadKgf,
    holdKgf,
    anchorHoldKgf,
    chainHoldKgf: holdKgf - anchorHoldKgf,
    holdRatio,
    holdMaxKn,
    dragKn,
    shock: now.shock,
    suspendedM,
    lyingM,
    angleDeg,
    chainOk,
    chainNeededM,
    scope: chainM / h,
    radiusM,
    level,
    chainLevel,
    holdLevel,
    reasons,
  }
}

/** Raffica massima e direzioni del vento nelle prossime `hours` ore (hourly di useOpenMeteo) */
export function windAhead(hourly, hours = 12, now = Date.now()) {
  if (!hourly?.length) return null
  const next = hourly.filter((h) => {
    const t = new Date(h.t).getTime()
    return t >= now - 3600000 && t <= now + hours * 3600000
  })
  if (!next.length) return null
  let max = next[0]
  for (const h of next) if ((h.gust ?? h.wind ?? 0) > (max.gust ?? max.wind ?? 0)) max = h
  const dirs = next.map((h) => h.windDir).filter(Number.isFinite)
  // Escursione della direzione (gradi), per sapere quanto girerà la barca
  let span = 0
  for (const a of dirs) for (const b of dirs) span = Math.max(span, Math.abs(((a - b + 540) % 360) - 180))
  // Onda massima nelle stesse ore (strappi sull'ancora); null se il dato manca
  const waves = next.map((h) => h.wave).filter(Number.isFinite)
  const waveM = waves.length ? Math.max(...waves) : null
  return { gustKn: max.gust ?? max.wind ?? 0, windKn: max.wind ?? 0, at: max.t, dir: max.windDir, dirSpan: span, waveM }
}
