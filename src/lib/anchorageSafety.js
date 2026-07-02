import { angleInSector, cardinal } from './geo.js'

/*
 * Valuta la sicurezza di un ancoraggio rispetto al vento attuale.
 * Ogni ancoraggio dichiara i settori (gradi, direzione DA CUI soffia il vento)
 * da cui la conformazione della baia offre ridosso. Il confronto con la
 * direzione e l'intensità del vento di Open-Meteo produce un semaforo.
 */

export const SAFETY = {
  SAFE: 'safe',
  CAUTION: 'caution',
  DANGER: 'danger',
  UNKNOWN: 'unknown',
}

export function isSheltered(anchorage, windDir) {
  return anchorage.shelter.some(([from, to]) => angleInSector(windDir, from, to))
}

export function evaluateAnchorage(anchorage, wind) {
  if (!wind || wind.speed == null || wind.dir == null) {
    return {
      level: SAFETY.UNKNOWN,
      reason: 'Dati vento non disponibili',
    }
  }

  const { speed, dir } = wind
  const gust = wind.gust != null ? wind.gust : speed
  const sheltered = isSheltered(anchorage, dir)
  const from = cardinal(dir)

  if (speed < 6 && gust < 15) {
    return {
      level: SAFETY.SAFE,
      reason: `Vento debole ${speed.toFixed(0)} kn da ${from}`,
    }
  }

  if (sheltered) {
    if (gust >= 35) {
      return {
        level: SAFETY.CAUTION,
        reason: `Ridossato da ${from} ma raffiche ${gust.toFixed(0)} kn`,
      }
    }
    return {
      level: SAFETY.SAFE,
      reason: `Ridossato dal vento da ${from} (${speed.toFixed(0)} kn)`,
    }
  }

  if (speed < 12 && gust < 18) {
    return {
      level: SAFETY.CAUTION,
      reason: `Esposto a ${from} ma vento moderato (${speed.toFixed(0)} kn)`,
    }
  }

  return {
    level: SAFETY.DANGER,
    reason: `ESPOSTO al vento da ${from} (${speed.toFixed(0)} kn, raffiche ${gust.toFixed(0)})`,
  }
}

export const SAFETY_COLORS = {
  [SAFETY.SAFE]: '#3DFF7A',
  [SAFETY.CAUTION]: '#FFC933',
  [SAFETY.DANGER]: '#FF4545',
  [SAFETY.UNKNOWN]: '#9BA0A6',
}
