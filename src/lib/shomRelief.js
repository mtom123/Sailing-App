/**
 * Rilievo del fondale ad alta risoluzione (1 m) del Shom, Litto3D®:
 * Corsica 2017-2018 e Provence-Alpes-Côte d'Azur 2015. Licence Ouverte 2.0,
 * fonte da citare: Shom. Non utilizzabile per la navigazione.
 *
 * Il servizio WMS restituisce un'immagine già colorata (verde terra, grigio
 * ~0 m, azzurro -10 m, blu -20 m, blu scuro -50 m) con rilievo ombreggiato,
 * nera dove non ci sono rilievi: il nero diventa trasparente in un worker
 * (imageWorker.js) e si tiene solo ciò che cade in acqua secondo la
 * costa OpenStreetMap (waterMask.js).
 */
import L from 'leaflet'
import { waterRings } from './waterMask.js'
import { shomTileBitmap } from './imagePixels.js'

const SHOM_WMS_URL = 'https://services.data.shom.fr/INSPIRE/wms/r'
// Estensioni dichiarate dal servizio: fuori non si chiede niente.
// Un livello per richiesta: insieme il servizio risponde 401.
const COVERAGE = [
  { layer: 'L3D_LIDAR_CORSE_2017_2018_PYR_3857_WMSR', bounds: L.latLngBounds([41.2939, 8.5099], [43.0495, 9.6556]) },
  { layer: 'LITTO3D_PACA_2015_PYR_3857_WMSR', bounds: L.latLngBounds([42.9749, 4.3473], [43.8587, 7.5376]) },
]
const TILE = 512

export const ShomReliefLayer = L.GridLayer.extend({
  options: {
    tileSize: TILE,
    minZoom: 11,
    maxZoom: 19,
    opacity: 0.9,
    updateWhenZooming: false, // ~0,5–3 s per tassello lato server
    updateWhenIdle: true,
    attribution: '© Shom – Litto3D® (licence ouverte)',
  },

  initialize(options) {
    L.setOptions(this, options)
    // Tasselli tolti: la memoria grafica dei canvas va liberata subito (sull'iPad
    // è poca e quando finisce la carta diventa nera)
    this.on('tileunload', ({ tile }) => {
      tile.width = 0
      tile.height = 0
    })
  },

  createTile(coords, done) {
    const tile = document.createElement('canvas')
    tile.width = TILE
    tile.height = TILE
    const bounds = this._tileCoordsToBounds(coords)
    const area = COVERAGE.find((c) => c.bounds.intersects(bounds))
    if (!area) {
      setTimeout(() => done(null, tile), 0)
      return tile
    }

    const sw = L.CRS.EPSG3857.project(bounds.getSouthWest())
    const ne = L.CRS.EPSG3857.project(bounds.getNorthEast())
    const url =
      `${SHOM_WMS_URL}?service=WMS&version=1.3.0&request=GetMap&layers=${area.layer}` +
      `&styles=&format=image/png&transparent=true&crs=EPSG:3857` +
      `&bbox=${sw.x},${sw.y},${ne.x},${ne.y}&width=${TILE}&height=${TILE}`
    const origin = coords.scaleBy(this.getTileSize())

    Promise.all([shomTileBitmap(url), waterRings(bounds, coords.z, { oceanOnly: true })])
      .then(([bitmap, rings]) => {
        // Nessun rilievo (senza rete, o browser senza worker grafici), o
        // livello già tolto dalla carta
        if (!bitmap || !this._map) {
          bitmap?.close()
          done(null, tile)
          return
        }
        // Solo disegno, nessuna lettura di pixel: il nero è già trasparente
        const ctx = tile.getContext('2d')
        ctx.drawImage(bitmap, 0, 0)
        bitmap.close()
        // Solo l'acqua (la costa OSM è al metro, il verde del Shom è la terra).
        // Senza mare nel tassello va cancellato tutto: un riempimento vuoto non cancella niente
        if (rings && rings.length === 0) ctx.clearRect(0, 0, TILE, TILE)
        else if (rings) {
          ctx.globalCompositeOperation = 'destination-in'
          ctx.beginPath()
          for (const ring of rings) {
            ring.forEach((ll, i) => {
              const p = this._map.project(ll, coords.z).subtract(origin)
              if (i === 0) ctx.moveTo(p.x, p.y)
              else ctx.lineTo(p.x, p.y)
            })
            ctx.closePath()
          }
          ctx.fill('nonzero')
        }
        done(null, tile)
      })
      .catch((err) => done(err, tile))
    return tile
  },
})
