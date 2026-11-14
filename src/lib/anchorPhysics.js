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
const CD = 1.2
const YAW = 1.4 // imbardata all'ancora
// Raffiche, onda e strappi: con questo il carico è vicino alle tabelle ABYC
// per l'ancoraggio (barca di 12 m a 30 nodi ≈ 500 kg)
const DYNAMIC = 1.8
// Angolo della catena sull'ancora: sotto questo le ancore tengono ancora bene
export const MAX_ANGLE_DEG = 6
const KN = 0.5144

// Massa della catena (kg/m) dal diametro del filo (mm), catena calibrata a
// maglia corta (ISO 4565 / DIN 766): ~0,0219 · d² (8 mm 1,4 · 10 mm 2,2 · 12 mm 3,2)
export const chainKgPerM = (mm) => 0.0219 * mm * mm

// kgf di tenuta per kg di ancora, in sabbia compatta (indicativi)
export const ANCHOR_TYPES = [
  { key: 'ultra', label: 'Ultra (Ultra Marine)', factor: 60 },
  { key: 'newgen', label: 'Nuova generazione (Rocna, Spade, Mantus, Vulcan)', factor: 60 },
  { key: 'delta', label: 'Delta', factor: 40 },
  { key: 'cqr', label: 'CQR / aratro', factor: 35 },
  { key: 'bruce', label: 'Bruce / artiglio', factor: 30 },
  { key: 'danforth', label: 'Danforth / Fortress', factor: 45 },
]

// Fondo: moltiplicatore della tenuta
export const BOTTOMS = [
  { key: 'sand', label: 'Sabbia', factor: 1 },
  { key: 'mud', label: 'Fango', factor: 0.6 },
  { key: 'weed', label: 'Posidonia / alghe', factor: 0.3 },
  { key: 'rock', label: 'Roccia / coralligeno', factor: 0.2 },
  { key: 'unknown', label: 'Non so', factor: 0.6 },
]

/**
 * Carico orizzontale (N) del vento in nodi sulla superficie esposta (m²).
 * dynamic: con raffiche, onda e strappi (per la tenuta dell'ancora); senza,
 * il carico medio che decide la forma della catena (gli strappi brevi la
 * catena li assorbe sollevandosi un momento)
 */
export function windLoadN(windKn, windageM2, dynamic = true) {
  const v = windKn * KN
  return 0.5 * RHO_AIR * CD * YAW * (dynamic ? DYNAMIC : 1) * windageM2 * v * v
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
export function anchorCheck({ depthM, bowHeightM, chainM, chainMm, anchorKg, anchorType, bottom, gustKn, windageM2, loaM }) {
  const h = Math.max(0.5, depthM + bowHeightM)
  const w = chainKgPerM(chainMm > 0 ? chainMm : 10) * G * STEEL_IN_WATER // N/m
  const H = windLoadN(gustKn, windageM2, false)
  const loadN = windLoadN(gustKn, windageM2, true)
  const suspendedM = Math.sqrt(h * h + (2 * h * H) / w)
  const lyingM = Math.max(0, chainM - suspendedM)
  const angleDeg = anchorAngleDeg(H, w, chainM, h)
  const chainOk = angleDeg <= MAX_ANGLE_DEG
  // Catena che basta per restare entro l'angolo, mai meno di 3:1
  // Catena per averne ancora sul fondo alla raffica (angolo 0), mai meno di 3:1
  const chainNeededM = Math.ceil(Math.max(suspendedM + 2, h * 3))
  const typeF = ANCHOR_TYPES.find((t) => t.key === anchorType)?.factor ?? 25
  const bottomF = BOTTOMS.find((b) => b.key === bottom)?.factor ?? 0.6
  const loadKgf = loadN / G
  const holdKgf = anchorKg * typeF * bottomF
  const holdRatio = holdKgf / Math.max(1, loadKgf)
  // Raggio massimo: catena tutta tesa più la barca
  const radiusM = Math.sqrt(Math.max(0, chainM * chainM - h * h)) + loaM

  const reasons = []
  let level = 'ok'
  const worse = (l) => {
    if (l === 'danger' || (l === 'warn' && level === 'ok')) level = l
  }
  if (!chainOk) {
    worse('danger')
    reasons.push(`Alla raffica la catena tira l'ancora verso l'alto (${angleDeg.toFixed(0)}°): servono almeno ${Math.ceil(chainNeededM)} m`)
  } else if (angleDeg > 0) {
    worse('warn')
    reasons.push(`Alla raffica la catena si stende fino all'ancora (${angleDeg.toFixed(0)}°): meglio ${Math.ceil(chainNeededM)} m`)
  }
  if (holdRatio < 1) {
    worse('danger')
    reasons.push('Tenuta indicativa insufficiente per la raffica prevista')
  } else if (holdRatio < 1.5) {
    worse('warn')
    reasons.push('Tenuta indicativa con poco margine')
  }
  if (bottom === 'weed') reasons.push("Su posidonia l'ancora tiene male, e in molte aree protette è vietato")
  if (bottom === 'rock') reasons.push("Su roccia la presa è incerta e l'ancora può incastrarsi")
  return {
    loadKgf,
    holdKgf,
    holdRatio,
    suspendedM,
    lyingM,
    angleDeg,
    chainOk,
    chainNeededM,
    scope: chainM / h,
    radiusM,
    level,
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
  return { gustKn: max.gust ?? max.wind ?? 0, windKn: max.wind ?? 0, at: max.t, dir: max.windDir, dirSpan: span }
}
