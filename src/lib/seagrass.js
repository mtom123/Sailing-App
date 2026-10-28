/**
 * Praterie di posidonia e altre fanerogame marine — EMODnet Seabed Habitats
 * (WMS, senza chiave). Utile per scegliere dove dare fondo: in molte aree
 * protette è vietato ancorare sulla posidonia.
 *
 * In Liguria, al posto della sintesi europea, il Nuovo Atlante degli Habitat
 * Marini 2020 della Regione (scala 1:10.000), con tutti i tipi di fondale:
 * posidonia da evitare, sabbie dove dare fondo, roccia e coralligeno.
 */

export const SEAGRASS_WMS_URL = 'https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view/wms'
export const SEAGRASS_LAYER = 'seagrass_eov_poly_2025'

// Il server ligure ignora gli stili SLD: i poligoni si scaricano via WFS
// (GeoJSON, CORS aperto) e si colorano nell'app (liguriaHabitat.js)
export const LIGURIA_HABITAT_WFS_URL = 'https://geoservizi.regione.liguria.it/geoserver/M2121/ows'
export const LIGURIA_HABITAT_LAYER = 'M2121:L7247'
// Area dell'Atlante: fuori non si chiede niente
export const LIGURIA_BOUNDS = [
  [43.75, 7.45],
  [44.45, 10.1],
]

const POSIDONIA = ['#2e9e4f', 0.35, '#1f7a3a']

const polygon = ([fill, opacity, stroke]) =>
  '<PolygonSymbolizer>' +
  `<Fill><CssParameter name="fill">${fill}</CssParameter><CssParameter name="fill-opacity">${opacity}</CssParameter></Fill>` +
  `<Stroke><CssParameter name="stroke">${stroke}</CssParameter><CssParameter name="stroke-width">1</CssParameter></Stroke>` +
  '</PolygonSymbolizer>'

/** Stile SLD: poligoni verdi semitrasparenti con bordo. */
export function seagrassSld() {
  return (
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">' +
    `<NamedLayer><Name>${SEAGRASS_LAYER}</Name><UserStyle><FeatureTypeStyle><Rule>${polygon(POSIDONIA)}</Rule>` +
    '</FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  )
}

// Classi dell'Atlante ligure (campo CLASSE) → colore, opacità, bordo
const LIGURIA_CLASSES = [
  // Posidonia: non ancorare
  [['pos', 'pos-roc', 'mos', 'pos e cau', 'cym-pos'], POSIDONIA],
  // Cymodocea, altra fanerogama protetta
  [['cym', 'cym-densa', 'cym e cau', 'cym-mmp'], ['#7cc576', 0.3, '#4f9a49']],
  // Matte morta di posidonia
  [['mmp'], ['#a3a86b', 0.3, '#7d8150']],
  // Sabbie litorali, sabbie grossolane e ghiaie: fondo per ancorare.
  // (Fanghi e fondi detritici sono al largo, oltre le profondità d'ancoraggio)
  [['s', 'sgc'], ['#e8d27a', 0.35, '#c4a94a']],
  // Roccia, coralligeno, popolamenti algali: tenuta scarsa e habitat da proteggere
  // (senza alghe circalitorali e roccia del largo, troppo profonde)
  [['af', 'af-br', 'afa', 'asi', 'c', 'c-f', 'sgc-c', 'gr'], ['#9a8f80', 0.3, '#6f665a']],
]

const LIGURIA_STYLE = new Map()
for (const [classes, style] of LIGURIA_CLASSES) for (const c of classes) LIGURIA_STYLE.set(c, style)

/** Stile Leaflet di una classe dell'Atlante ligure; null = non disegnare (porti, zone non indagate). */
export function liguriaHabitatStyle(classe) {
  const style = LIGURIA_STYLE.get(classe)
  if (!style) return null
  const [fillColor, fillOpacity, color] = style
  return { fillColor, fillOpacity, color, weight: 0.8, opacity: 0.8 }
}
