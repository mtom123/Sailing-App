/**
 * Griglia delle profondità EMODnet Bathymetry (WCS, testo semplice, senza chiave).
 *
 * Il modello ha celle di 1/16 di primo (1/960 di grado, ~115 m) con i bordi
 * sui multipli di 1/960°: la cella (I, J) ha il centro in
 * ((I + 0.5) / 960, (J + 0.5) / 960). Valori in metri: mare negativo, terra positiva.
 *
 * La griglia si scarica a blocchi fissi di BLOCK × BLOCK celle (~15 × 11 km),
 * tenuti in memoria; il browser li tiene in cache 10 giorni (header del server).
 */

const WCS_URL = 'https://ows.emodnet-bathymetry.eu/wcs'
export const CELLS_PER_DEGREE = 960
export const BLOCK = 128

const blocks = new Map() // "bx,by" -> Promise<block>

/** Indice di blocco che contiene la longitudine / latitudine data. */
export const blockIndex = (deg) => Math.floor((deg * CELLS_PER_DEGREE) / BLOCK)

/**
 * Testo del WCS: intestazione con "Grid range: GridEnvelope2D[x0..x1, y0..y1]"
 * e i parametri dell'affine (elt_0_0 / elt_0_2 / elt_1_1 / elt_1_2, centro
 * della cella), poi "Band 0:" e una riga di valori per ogni riga della griglia
 * da nord a sud.
 */
function parseGrid(text) {
  const num = (name) => Number(text.match(new RegExp(`"${name}",\\s*(-?[\\d.eE-]+)`))[1])
  const range = text.match(/GridEnvelope2D\[(-?\d+)\.\.(-?\d+),\s*(-?\d+)\.\.(-?\d+)\]/)
  const [x0, x1, y0, y1] = range.slice(1).map(Number)
  const width = x1 - x0 + 1
  const height = y1 - y0 + 1
  const firstLon = num('elt_0_2') + x0 * num('elt_0_0')
  const firstLat = num('elt_1_2') + y0 * num('elt_1_1')

  const body = text.slice(text.indexOf('Band 0:') + 'Band 0:'.length)
  const values = new Float32Array(width * height)
  let k = 0
  for (const token of body.split(/\s+/)) {
    if (!token) continue
    const v = Number(token)
    values[k++] = Number.isFinite(v) ? v : 1 // dato mancante: come terra
    if (k === values.length) break
  }
  return {
    // indici globali della prima cella (ovest) e della prima riga (nord)
    i0: Math.round(firstLon * CELLS_PER_DEGREE - 0.5),
    jTop: Math.round(firstLat * CELLS_PER_DEGREE - 0.5),
    width,
    height,
    values,
  }
}

/** Scarica (una volta sola) il blocco (bx, by). */
export function loadBlock(bx, by) {
  const key = `${bx},${by}`
  if (!blocks.has(key)) {
    const c = (i) => i / CELLS_PER_DEGREE
    // Appena dentro i bordi del blocco: con i centri delle celle il server
    // ne toglie una per lato, con i bordi esatti a volte ne aggiunge una
    const lon = `Long(${c(bx * BLOCK + 0.01)},${c(bx * BLOCK + BLOCK - 0.01)})`
    const lat = `Lat(${c(by * BLOCK + 0.01)},${c(by * BLOCK + BLOCK - 0.01)})`
    const url =
      `${WCS_URL}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=emodnet__mean` +
      `&subset=${lon}&subset=${lat}&format=text/plain`
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`EMODnet WCS ${r.status}`)
        return r.text()
      })
      .then(parseGrid)
    p.catch(() => blocks.delete(key)) // si riprova al prossimo spostamento
    blocks.set(key, p)
  }
  return blocks.get(key)
}

/**
 * Unisce i blocchi nella finestra di indici [iMin..iMax] × [jMin..jMax]
 * in un'unica griglia (righe da nord a sud).
 */
export function mergeBlocks(list, iMin, iMax, jMin, jMax) {
  const width = iMax - iMin + 1
  const height = jMax - jMin + 1
  const values = new Float32Array(width * height).fill(1)
  for (const b of list) {
    for (let r = 0; r < b.height; r++) {
      const j = b.jTop - r
      if (j < jMin || j > jMax) continue
      const row = (jMax - j) * width
      for (let c = 0; c < b.width; c++) {
        const i = b.i0 + c
        if (i < iMin || i > iMax) continue
        values[row + (i - iMin)] = b.values[r * b.width + c]
      }
    }
  }
  return { iMin, jMax, width, height, values }
}
