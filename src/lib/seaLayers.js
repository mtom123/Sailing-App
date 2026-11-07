import L from 'leaflet'

/*
 * Temperatura del mare e clorofilla: analisi giornaliere senza buchi di nuvole
 * di Copernicus Marine per il Mediterraneo. Si legge dal servizio l'ultimo
 * giorno disponibile e, per la temperatura, l'intervallo di quel giorno: una
 * scala stretta fa vedere i fronti. Offline resta l'ultima lettura.
 */

const WMTS = 'https://wmts.marine.copernicus.eu/teroWmts'
const CITE = 'Generated using E.U. Copernicus Marine Service Information'
const INFO_KEY = 'timone.seaLayers'
const INFO_MAX_AGE_MS = 6 * 3600000
const MED = L.latLngBounds([30.25, -18.125], [46, 36.25])

export const SEA_LAYERS = {
  seaTemp: {
    product: 'SST_MED_SST_L4_NRT_OBSERVATIONS_010_004',
    layer: 'SST_MED_SST_L4_NRT_OBSERVATIONS_010_004/SST_MED_SST_L4_NRT_OBSERVATIONS_010_004_c_V2_202311/analysed_sst',
    cmap: 'cmap:thermal',
    title: 'Temperatura mare',
    gradient: 'linear-gradient(90deg, #042333, #2d3f9e, #7a4f9c, #c9627f, #f2994a, #f5e663)',
  },
  chlorophyll: {
    product: 'OCEANCOLOUR_MED_BGC_L4_NRT_009_142',
    layer: 'OCEANCOLOUR_MED_BGC_L4_NRT_009_142/cmems_obs-oc_med_bgc-plankton_nrt_l4-gapfree-multi-1km_P1D_202207/CHL',
    cmap: 'cmap:algae,logScale',
    range: [0.02, 2],
    title: 'Clorofilla',
    gradient: 'linear-gradient(90deg, #d7f9d0, #6fc98c, #1f8f5f, #0b5a3f, #123c28)',
  },
}

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(INFO_KEY)) || {}
  } catch {
    return {}
  }
}

function parseCapabilities(xml, { layer, range }) {
  const start = xml.indexOf(`<ows:Identifier>${layer}</ows:Identifier>`)
  if (start < 0) return null
  const part = xml.slice(start)
  const date = part.match(/<Default>(\d{4}-\d\d-\d\d)T/)?.[1]
  const min = Number(part.match(/<MinimumValue>([\d.]+)</)?.[1])
  const max = Number(part.match(/<MaximumValue>([\d.]+)</)?.[1])
  if (!date) return null
  return { date, range: range ?? (min && max ? [Math.floor(min), Math.ceil(max)] : [285, 302]) }
}

/** { date, range } dell'ultimo giorno disponibile, o null se non si è mai letto. */
export async function seaLayerInfo(key) {
  const stored = readStored()
  const known = stored[key]
  if (known && Date.now() - known.readAt < INFO_MAX_AGE_MS) return known
  try {
    const def = SEA_LAYERS[key]
    const res = await fetch(`${WMTS}/${def.product}?request=GetCapabilities&service=WMTS&version=1.0.0`)
    if (!res.ok) throw new Error(`${res.status}`)
    const info = parseCapabilities(await res.text(), def)
    if (!info) throw new Error('strato non trovato')
    const fresh = { ...info, readAt: Date.now() }
    localStorage.setItem(INFO_KEY, JSON.stringify({ ...readStored(), [key]: fresh }))
    return fresh
  } catch {
    return known ?? null
  }
}

export function makeSeaLayer(key, info) {
  const def = SEA_LAYERS[key]
  const q = new URLSearchParams({
    SERVICE: 'WMTS',
    VERSION: '1.0.0',
    REQUEST: 'GetTile',
    LAYER: def.layer,
    STYLE: `${def.cmap},range:${info.range[0]}/${info.range[1]}`,
    TILEMATRIXSET: 'EPSG:3857',
    FORMAT: 'image/png',
    TIME: `${info.date}T00:00:00.000Z`,
  })
  return L.tileLayer(`${WMTS}?${q}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`, {
    bounds: MED,
    minZoom: 5,
    maxNativeZoom: 10,
    maxZoom: 20,
    opacity: 0.65,
    zIndex: 2,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 1,
    attribution: CITE,
  })
}

/** Testo della legenda: "17–27 °C" oppure "0,02–2 mg/m³". */
export function seaRangeText(key, info) {
  if (key === 'seaTemp') return `${Math.round(info.range[0] - 273.15)}–${Math.round(info.range[1] - 273.15)} °C`
  return `${String(info.range[0]).replace('.', ',')}–${info.range[1]} mg/m³`
}
