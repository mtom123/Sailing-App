/**
 * Polar Solver per Dufour 41 Classic (monoscafo cruiser 12m)
 *
 * Tabella polar: speed (kn) per [TWS knots] x [TWA degrees]
 * Fonte: stima basata su dati ORC + benchmark Dufour 4x series
 * Per uso reale: caricare file .pol specifico della propria barca.
 *
 * TWS righe: 4, 6, 8, 10, 12, 15, 18, 22, 26, 30 (kn)
 * TWA colonne: 0 (in prua), 30, 45, 60, 90, 120, 150, 180 (gradi)
 */

// Polar matrix: speed in knots
// Righe = TWS, Colonne = TWA [0, 30, 45, 60, 90, 120, 150, 180]
const POLAR_DUFOUR_41 = {
  tws: [4, 6, 8, 10, 12, 15, 18, 22, 26, 30],
  twa: [0, 30, 45, 60, 90, 120, 150, 180],
  // speeds[i][j] = boat speed at tws[i], twa[j]
  speeds: [
    // TWS=4
    [0.2, 2.1, 3.0, 3.4, 3.8, 3.9, 3.7, 3.2],
    // TWS=6
    [0.3, 3.4, 4.6, 5.0, 5.4, 5.6, 5.2, 4.5],
    // TWS=8
    [0.4, 4.5, 5.8, 6.3, 6.7, 7.0, 6.5, 5.7],
    // TWS=10
    [0.5, 5.4, 6.7, 7.2, 7.6, 7.9, 7.4, 6.5],
    // TWS=12
    [0.5, 6.0, 7.3, 7.7, 8.0, 8.3, 7.8, 6.9],
    // TWS=15
    [0.4, 6.3, 7.5, 7.9, 8.2, 8.5, 8.0, 7.1],
    // TWS=18
    [0.3, 6.4, 7.6, 7.9, 8.2, 8.4, 7.9, 7.0],
    // TWS=22 (spruzzo, riduzione)
    [0.3, 6.2, 7.4, 7.7, 8.0, 8.2, 7.6, 6.8],
    // TWS=26 (riduzione per sicurezza)
    [0.2, 5.8, 7.0, 7.3, 7.5, 7.7, 7.1, 6.3],
    // TWS=30 (limitazione, riduzione vela)
    [0.2, 5.3, 6.4, 6.7, 6.9, 7.0, 6.4, 5.7],
  ],
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
  // courseFromWind = angolo tra direzione di navigazione e direzione da cui soffia il vento (0-180)
  // Se courseFromWind > 45°, navigo direttamente alla rotta
  // Se < 45°, devo stringere (tack) e il VMG ottimale è ~ 42°
  if (courseFromWind >= 45) return courseFromWind
  // bolina: optimal TWA dipende da TWS (più vento = più stringere)
  if (tws < 6) return 45
  if (tws < 12) return 42
  return 40
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
  { key: 'dufour-41-classic', name: 'Dufour 41 Classic', type: 'Monoscafo cruiser', year: '2003-2010', length: '12.50m' },
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
