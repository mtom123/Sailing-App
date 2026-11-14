/**
 * Isobate di dettaglio delle Baleari (Ibiza, Formentera, Menorca) dalla
 * Ecocartografía del litoral del MITECO (2008): ogni metro da 1 m fino a
 * 50 m, poi ogni 5 m. Calcolate in anticipo da tools/baleari-isobaths.mjs e
 * pubblicate con l'app in public/isobaths-baleari/, a blocchi di 0,05° come
 * la Liguria (liguriaIsobaths.js), con la stessa interfaccia per
 * HdIsobathLayer e FineDepthZoneLayer. Mallorca e Cabrera non ci sono.
 */
import L from 'leaflet'

export const BALEARI_BASE = `${import.meta.env.BASE_URL}isobaths-baleari/`
const MAX_CELLS = 12

let indexPromise = null
const cells = new Map() // "i,j" -> Promise<{ lines, cov }>

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(`${BALEARI_BASE}index.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) =>
        Object.entries(j.cells || {}).map(([name, [s, w, n, e]]) => ({ name, bounds: L.latLngBounds([s, w], [n, e]) })),
      )
      .catch(() => {
        indexPromise = null // si riprova alla prossima vista
        return []
      })
  }
  return indexPromise
}

// [lat0, lon0, dlat1, dlon1, ...] in 1e-5 gradi → [lat, lon][]
function decode(arr, from) {
  const out = []
  let lat = 0
  let lon = 0
  for (let i = from; i + 1 < arr.length; i += 2) {
    lat += arr[i]
    lon += arr[i + 1]
    out.push([lat / 1e5, lon / 1e5])
  }
  return out
}

function loadCell(name) {
  if (!cells.has(name)) {
    const p = fetch(`${BALEARI_BASE}${name.replace(',', '_')}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`isobate Baleari ${r.status}`)
        return r.json()
      })
      .then((j) => ({
        lines: j.lines.map((l) => ({ depth: l[0], path: decode(l, 1) })),
        cov: j.cov.map((c) => decode(c, 0)),
      }))
    p.catch(() => cells.delete(name))
    cells.set(name, p)
  }
  return cells.get(name)
}

/** Fonte per HdIsobathLayer / FineDepthZoneLayer: blocchi delle Baleari nella vista */
export const BALEARI_ISOBATH_SOURCE = {
  names(view) {
    // Fuori dalle Baleari non si scarica neanche l'indice
    if (view.getEast() < 1 || view.getWest() > 4.5 || view.getNorth() < 38.5 || view.getSouth() > 40.2) {
      return Promise.resolve([])
    }
    return loadIndex().then((list) => {
      const names = list.filter((c) => c.bounds.intersects(view)).map((c) => c.name)
      return names.length > MAX_CELLS ? [] : names
    })
  },
  load: loadCell,
}
