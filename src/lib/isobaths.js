/**
 * Isobate e acque basse da EMODnet Bathymetry (WMS, senza chiave).
 *
 * Le isobate già pronte di EMODnet (emodnet:contours) partono da 50 m:
 * qui chiediamo al GeoServer di calcolarle dal modello del fondale
 * (emodnet:mean, ~115 m di risoluzione) con i livelli utili in barca,
 * tramite uno stile SLD con la trasformazione ras:Contour.
 * Va richiesto con interpolations=bilinear, altrimenti le linee seguono
 * a scalini le celle del modello.
 * Le profondità sono negative (quota sotto il livello del mare).
 */

export const EMODNET_WMS_URL = 'https://ows.emodnet-bathymetry.eu/wms'
export const EMODNET_DEPTH_LAYER = 'emodnet:mean'

// Livelli delle isobate (m)
export const ISOBATH_LEVELS = [2, 5, 10, 20, 30, 50, 100, 200, 500, 1000]
// Fino a questa profondità linea più marcata (acque da tenere d'occhio)
const SHALLOW_LIMIT = 10

// Riempimento acque basse, come sulle carte nautiche: più basso = più scuro.
// [profondità massima della fascia, colore, opacità]
const SHALLOW_BANDS = [
  [2, '#3f8fd0', 0.6],
  [5, '#6aa9db', 0.5],
  [10, '#97c4e7', 0.4],
  [20, '#c3ddf1', 0.3],
]

const lit = (v) => `<ogc:Literal>${v}</ogc:Literal>`
const css = (name, value) => `<CssParameter name="${name}">${value}</CssParameter>`
const vendor = (name, value) => `<VendorOption name="${name}">${value}</VendorOption>`

function shallowFillStyle() {
  // ColorMap "intervals": ogni voce colora i valori tra la quantity
  // precedente e la propria. Bande dalla più profonda alla più bassa.
  const bands = [...SHALLOW_BANDS].reverse()
  const entry = (quantity, color, opacity) =>
    `<ColorMapEntry quantity="${quantity}" color="${color}" opacity="${opacity}"/>`
  const entries = [
    entry(-bands[0][0], '#000000', 0), // più profondo dell'ultima banda
    ...bands.map(([, color, opacity], i) => entry(i + 1 < bands.length ? -bands[i + 1][0] : 0, color, opacity)),
    entry(100000, '#000000', 0), // terra
  ]
  return `<FeatureTypeStyle><Rule><RasterSymbolizer><ColorMap type="intervals">${entries.join('')}</ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle>`
}

function contourRule(filter, stroke, width) {
  const label =
    '<ogc:Function name="numberFormat">' +
    lit('0') +
    '<ogc:Function name="abs"><ogc:PropertyName>value</ogc:PropertyName></ogc:Function>' +
    '</ogc:Function>'
  return (
    `<Rule><ogc:Filter>${filter}</ogc:Filter>` +
    `<LineSymbolizer><Stroke>${css('stroke', stroke)}${css('stroke-width', width)}</Stroke></LineSymbolizer>` +
    `<TextSymbolizer><Label>${label}</Label>` +
    `<Font>${css('font-family', 'SansSerif')}${css('font-size', 10)}${css('font-weight', 'bold')}</Font>` +
    '<LabelPlacement><LinePlacement/></LabelPlacement>' +
    `<Halo><Radius>1.5</Radius><Fill>${css('fill', '#ffffff')}</Fill></Halo>` +
    `<Fill>${css('fill', stroke)}</Fill>` +
    vendor('followLine', 'true') +
    vendor('repeat', 250) +
    vendor('maxAngleDelta', 30) +
    `</TextSymbolizer></Rule>`
  )
}

function contourStyle() {
  const levels = ISOBATH_LEVELS.map((d) => lit(-d)).join('')
  const value = '<ogc:PropertyName>value</ogc:PropertyName>'
  const shallow = `<ogc:PropertyIsGreaterThanOrEqualTo>${value}${lit(-SHALLOW_LIMIT)}</ogc:PropertyIsGreaterThanOrEqualTo>`
  const deep = `<ogc:PropertyIsLessThan>${value}${lit(-SHALLOW_LIMIT)}</ogc:PropertyIsLessThan>`
  return (
    '<FeatureTypeStyle><Transformation><ogc:Function name="ras:Contour">' +
    `<ogc:Function name="parameter">${lit('data')}</ogc:Function>` +
    `<ogc:Function name="parameter">${lit('levels')}${levels}</ogc:Function>` +
    '</ogc:Function></Transformation>' +
    contourRule(shallow, '#0b3d91', 1.4) +
    contourRule(deep, '#3a6ea5', 0.8) +
    '</FeatureTypeStyle>'
  )
}

/** Stile SLD completo: riempimento acque basse + isobate con etichette in metri. */
export function isobathSld() {
  return (
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">' +
    `<NamedLayer><Name>${EMODNET_DEPTH_LAYER}</Name><UserStyle>` +
    shallowFillStyle() +
    contourStyle() +
    '</UserStyle></NamedLayer></StyledLayerDescriptor>'
  )
}
