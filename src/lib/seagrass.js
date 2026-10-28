/**
 * Praterie di posidonia e altre fanerogame marine — EMODnet Seabed Habitats
 * (WMS, senza chiave). Utile per scegliere dove dare fondo: in molte aree
 * protette è vietato ancorare sulla posidonia.
 */

export const SEAGRASS_WMS_URL = 'https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_view/wms'
export const SEAGRASS_LAYER = 'seagrass_eov_poly_2025'

/** Stile SLD: poligoni verdi semitrasparenti con bordo. */
export function seagrassSld() {
  return (
    '<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">' +
    `<NamedLayer><Name>${SEAGRASS_LAYER}</Name><UserStyle><FeatureTypeStyle><Rule><PolygonSymbolizer>` +
    '<Fill><CssParameter name="fill">#2e9e4f</CssParameter><CssParameter name="fill-opacity">0.35</CssParameter></Fill>' +
    '<Stroke><CssParameter name="stroke">#1f7a3a</CssParameter><CssParameter name="stroke-width">1</CssParameter></Stroke>' +
    '</PolygonSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>'
  )
}
