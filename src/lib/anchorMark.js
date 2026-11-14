import { saveMark } from '../hooks/useMarks.js'
import { newMark } from './marks.js'
import { haversine } from './geo.js'
import { useAppStore } from '../store/useAppStore.js'
import { lastAnchorPlan } from '../components/AnchorPlan.jsx'

// Fondo del pannello Ancora → fondale dei marker
const SEABED_OF = { sand: 'Sabbia', mud: 'Fango', softmud: 'Fango', weed: 'Posidonia', rock: 'Roccia' }

/**
 * Con ANCORA CADUTA si salva da solo un marker Ancoraggio, con profondità,
 * fondo e catena del pannello. Se c'è già un ancoraggio a meno di 50 m (si
 * ridà fondo nello stesso posto) non se ne crea un altro.
 */
export async function saveAnchorMark(lat, lon) {
  const st = useAppStore.getState()
  if (st.marks.some((m) => m.type === 'anchor' && haversine(m.lat, m.lon, lat, lon) < 50)) return
  const info = lastAnchorPlan.current
  // I dati del pannello valgono se calcolati qui (la barca, non il centro della carta)
  const here = info?.at && haversine(info.at.lat, info.at.lon, lat, lon) < 200
  const count = st.marks.filter((m) => m.type === 'anchor').length
  try {
    await saveMark({
      ...newMark('anchor', { lat, lon }),
      name: `Ancoraggio ${count + 1}`,
      depth: here && info.depth != null ? info.depth.toFixed(1).replace('.', ',') : '',
      depthSource: here && info.depth != null && info.depthSource ? info.depthSource : '',
      seabed: here ? SEABED_OF[info.bottom] ?? '' : '',
      notes: here && info.chainM ? `Catena ${info.chainM} m` : '',
    })
  } catch (err) {
    console.warn('Marker ancoraggio non salvato', err)
  }
}
