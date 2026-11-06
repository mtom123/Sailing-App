import { formatCoord } from './geo.js'
import { fmtMarkDate, markType } from './marks.js'

/*
 * Segnalazione di un avvistamento ai ricercatori. I moduli vogliono CAPTCHA e
 * consenso, quindi non si inviano da qui: si prepara il testo, che parte dal
 * foglio di condivisione o si incolla nel modulo.
 */

export const TETHYS_FORM = 'https://www.cetaceifaiattenzione.it/segnala-un-avvistamento/'
export const OBSENMER_FORM = 'https://www.obsenmer.org/observations/preadd'

/** Coordinata come la vuole il modulo Tethys: gradi, primi, decimi ("45 10 6N"). */
export function tethysCoord(value, isLat) {
  const abs = Math.abs(value)
  let deg = Math.floor(abs)
  let tenths = Math.round((abs - deg) * 600)
  if (tenths === 600) {
    deg += 1
    tenths = 0
  }
  const hemi = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'
  return `${String(deg).padStart(isLat ? 2 : 3, '0')} ${String(Math.floor(tenths / 10)).padStart(2, '0')} ${tenths % 10}${hemi}`
}

export function sightingReport(mark, vesselName) {
  const { label, latin } = markType(mark.type)
  return [
    `Avvistamento: ${label}${latin ? ` (${latin})` : ''}`,
    mark.count && `Quanti: ${mark.count}`,
    `Data: ${fmtMarkDate(mark.date)}${mark.time ? ` ore ${mark.time}` : ''}`,
    `Posizione: ${formatCoord(mark.lat, true)} ${formatCoord(mark.lon, false)}`,
    `Per il modulo: ${tethysCoord(mark.lat, true)} ${tethysCoord(mark.lon, false)}`,
    mark.notes && `Note: ${mark.notes}`,
    vesselName && `Barca: ${vesselName}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Apre il foglio di condivisione con testo e foto; dove non c'è copia il testo.
 * Ritorna 'sent', 'sent-no-photos', 'copied' o 'cancelled'.
 */
export async function shareReport(text, files) {
  const withFiles = files.length > 0 && navigator.canShare?.({ text, files })
  if (navigator.share) {
    try {
      await navigator.share(withFiles ? { text, files } : { text })
      return withFiles || !files.length ? 'sent' : 'sent-no-photos'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
