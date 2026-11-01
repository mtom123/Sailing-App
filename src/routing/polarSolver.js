/**
 * Polar Solver — Dufour 41 Classic (J&J, metà anni '90)
 *
 * Media dei certificati ORC di cinque Dufour 41 Classic: MATADOR (ESP6817,
 * 2024), NIRVANA III (ITA30911, 2019), REWIND (ITA17187, 2019), BOO
 * (ESP7980, 2022), DIMITRIOS (GRE6729, 2017). Dati ORC via
 * github.com/jieter/orc-data. Tra le cinque barche le velocità differiscono
 * di 0,2-0,6 nodi.
 *
 * - 6-20 nodi, 52°-150°: media diretta dei certificati.
 * - 40°/45° e 165°/180°: dagli angoli e VMG ottimali di bolina e di poppa
 *   dei certificati; 30°: barca che stringe troppo (55% della velocità di
 *   bolina).
 * - 24 nodi: rapporti 24/20 del certificato MATADOR 2024; 30 nodi: come 24
 *   con terzaroli (-7% di bolina, -3% al lasco); 4 nodi: forma della polare
 *   generica OpenCPN.
 * - In poppa i certificati ORC usano lo spinnaker asimmetrico: senza
 *   gennaker oltre 120° la barca va un po' più piano.
 *
 * Tabella: speeds[i][j] = velocità (kn) a tws[i], twa[j].
 * Anche in tools/polars/Dufour41Classic_media_ORC.pol (formato OpenCPN).
 */

const POLAR_DUFOUR_41 = {
  tws: [4, 6, 8, 10, 12, 14, 16, 20, 24, 30],
  twa: [0, 30, 40, 45, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180],
  speeds: [
    [0.00, 1.72, 2.76, 3.27, 3.67, 3.97, 4.22, 4.11, 4.05, 3.81, 3.30, 2.69, 2.39, 2.00], // TWS 4
    [0.00, 2.53, 3.99, 4.65, 5.08, 5.39, 5.64, 5.60, 5.50, 5.34, 4.81, 4.09, 3.59, 3.09], // TWS 6
    [0.00, 2.95, 4.89, 5.53, 5.99, 6.32, 6.59, 6.61, 6.64, 6.46, 5.92, 5.14, 4.55, 3.95], // TWS 8
    [0.00, 3.31, 5.54, 6.21, 6.69, 6.96, 7.15, 7.25, 7.32, 7.21, 6.82, 6.02, 5.39, 4.76], // TWS 10
    [0.00, 3.55, 6.09, 6.67, 7.09, 7.29, 7.46, 7.58, 7.70, 7.63, 7.37, 6.73, 6.21, 5.69], // TWS 12
    [0.00, 3.65, 6.51, 6.89, 7.28, 7.48, 7.67, 7.79, 8.02, 7.97, 7.73, 7.17, 6.63, 6.23], // TWS 14
    [0.00, 3.70, 6.68, 6.99, 7.37, 7.59, 7.85, 7.98, 8.33, 8.32, 8.06, 7.48, 7.04, 6.76], // TWS 16
    [0.00, 3.73, 6.75, 7.06, 7.44, 7.67, 8.07, 8.36, 8.79, 8.98, 8.75, 7.99, 7.73, 7.51], // TWS 20
    [0.00, 3.68, 6.66, 6.96, 7.44, 7.70, 8.16, 8.58, 9.04, 9.41, 9.40, 8.45, 8.24, 8.01], // TWS 24
    [0.00, 3.42, 6.19, 6.47, 6.92, 7.16, 7.91, 8.32, 8.77, 9.13, 9.12, 8.20, 7.99, 7.77], // TWS 30
  ],
  // Angolo di bolina ottimale (VMG) per vento, media dei certificati
  beat: { tws: [6, 8, 10, 12, 14, 16, 20], angle: [44.2, 42.5, 42.1, 41.4, 40.5, 40.1, 40.1] },
}

const POLARS = {
  'dufour-41-classic': POLAR_DUFOUR_41,
  // placeholder per future barche
  'cruiser-41-monohull': POLAR_DUFOUR_41,
}

// Registry per polari custom caricate dinamicamente
const customPolars = new Map()

export function registerCustomPolar(key, polarData) {
  if (!polarData || !polarData.tws || !polarData.twa || !polarData.speeds) {
    throw new Error('Invalid polar data')
  }
  customPolars.set(key, polarData)
}

export function unregisterCustomPolar(key) {
  customPolars.delete(key)
}

export function listAvailablePolars() {
  return [
    ...BOAT_LIBRARY,
    ...Array.from(customPolars.keys()).map((k) => ({
      key: k,
      name: `Custom: ${k}`,
      type: 'Custom',
      year: '-',
      length: '-',
    })),
  ]
}

/**
 * Trova l'indice del TWS più vicino
 */
function findTwsIdx(twsArr, tws) {
  if (tws <= twsArr[0]) return 0
  if (tws >= twsArr[twsArr.length - 1]) return twsArr.length - 1
  for (let i = 0; i < twsArr.length - 1; i++) {
    if (tws >= twsArr[i] && tws <= twsArr[i + 1]) {
      return i
    }
  }
  return 0
}

/**
 * Interpolazione lineare
 */
function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Risolve la velocità barca data TWS (kn) e TWA (gradi)
 * Interpolazione bilineare sulla polar matrix.
 */
export function solvePolar(polarKey, tws, twa) {
  // Check custom polars first
  const polar = customPolars.get(polarKey) || POLARS[polarKey] || POLAR_DUFOUR_41
  if (tws == null || twa == null || tws < 0) return 0

  // TWA normalizzato 0-180
  const awa = Math.abs(((twa % 360) + 540) % 360 - 180)

  // Trova indici TWS
  const twsIdx = findTwsIdx(polar.tws, tws)
  const twsNext = Math.min(twsIdx + 1, polar.tws.length - 1)
  const twsFrac =
    polar.tws[twsNext] !== polar.tws[twsIdx]
      ? (tws - polar.tws[twsIdx]) / (polar.tws[twsNext] - polar.tws[twsIdx])
      : 0

  // Trova indici TWA
  let twaIdx = 0
  for (let i = 0; i < polar.twa.length - 1; i++) {
    if (awa >= polar.twa[i] && awa <= polar.twa[i + 1]) {
      twaIdx = i
      break
    }
  }
  if (awa >= polar.twa[polar.twa.length - 1]) twaIdx = polar.twa.length - 2
  const twaNext = Math.min(twaIdx + 1, polar.twa.length - 1)
  const twaFrac =
    polar.twa[twaNext] !== polar.twa[twaIdx]
      ? (awa - polar.twa[twaIdx]) / (polar.twa[twaNext] - polar.twa[twaIdx])
      : 0

  // Interpolazione bilineare
  const v00 = polar.speeds[twsIdx][twaIdx]
  const v01 = polar.speeds[twsIdx][twaNext]
  const v10 = polar.speeds[twsNext][twaIdx]
  const v11 = polar.speeds[twsNext][twaNext]
  const v0 = lerp(v00, v01, twaFrac)
  const v1 = lerp(v10, v11, twaFrac)
  return Math.max(0, lerp(v0, v1, twsFrac))
}

/**
 * Calcola il TWA ottimale (VMG) per andare in una direzione
 * date le condizioni di vento. Se la rotta è "non navigabile"
 * (es. bolina oltre 40°), ritorna il TWA limite.
 */
export function optimalTwa(polarKey, tws, courseFromWind) {
  // courseFromWind = angolo tra rotta e direzione da cui soffia il vento (0-180).
  // Più largo dell'angolo di bolina: si va diritti; più stretto: si bordeggia
  // all'angolo di bolina della polare (dai certificati, se ci sono)
  const polar = customPolars.get(polarKey) || POLARS[polarKey] || POLAR_DUFOUR_41
  const beat = polar.beat ? interpBeat(polar.beat, tws) : tws < 6 ? 45 : tws < 12 ? 42 : 40
  return courseFromWind >= beat ? courseFromWind : beat
}

function interpBeat({ tws: xs, angle: ys }, tws) {
  if (tws <= xs[0]) return ys[0]
  for (let i = 0; i < xs.length - 1; i++) {
    if (tws <= xs[i + 1]) return ys[i] + ((ys[i + 1] - ys[i]) * (tws - xs[i])) / (xs[i + 1] - xs[i])
  }
  return ys[ys.length - 1]
}

/**
 * Calcola il VMG (velocity made good) lungo una direzione
 */
export function vmg(polarKey, tws, twa) {
  const bs = solvePolar(polarKey, tws, twa)
  return bs * Math.cos((twa * Math.PI) / 180)
}

/**
 * Lista barche disponibili
 */
export const BOAT_LIBRARY = [
  { key: 'dufour-41-classic', name: 'Dufour 41 Classic', type: 'Media ORC di 5 barche (J&J)', year: '1995-1997', length: '11.95m' },
]

export default {
  solvePolar,
  optimalTwa,
  vmg,
  BOAT_LIBRARY,
  POLARS,
  registerCustomPolar,
  unregisterCustomPolar,
  listAvailablePolars,
}
