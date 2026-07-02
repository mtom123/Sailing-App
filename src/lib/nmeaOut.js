/*
 * Generazione sentenze NMEA0183 per pilota automatico (Raymarine e compatibili
 * in modalità Track/NAV): APB, RMB e XTE. Inviate al multiplexer di bordo via
 * bridge WebSocket→UDP; il pilota segue il waypoint attivo con correzione XTE.
 */

function checksum(body) {
  let sum = 0
  for (let i = 0; i < body.length; i++) sum ^= body.charCodeAt(i)
  return sum.toString(16).toUpperCase().padStart(2, '0')
}

export function sentence(body) {
  return `$${body}*${checksum(body)}\r\n`
}

function fmtLat(lat) {
  const hemi = lat >= 0 ? 'N' : 'S'
  const abs = Math.abs(lat)
  const deg = Math.floor(abs)
  const min = (abs - deg) * 60
  return [`${String(deg).padStart(2, '0')}${min.toFixed(3).padStart(6, '0')}`, hemi]
}

function fmtLon(lon) {
  const hemi = lon >= 0 ? 'E' : 'W'
  const abs = Math.abs(lon)
  const deg = Math.floor(abs)
  const min = (abs - deg) * 60
  return [`${String(deg).padStart(3, '0')}${min.toFixed(3).padStart(6, '0')}`, hemi]
}

const fmtBrg = (b) => (((b % 360) + 360) % 360).toFixed(1)

/**
 * APB — Autopilot sentence B.
 * xteNm firmato: negativo = barca a sinistra della rotta (correggere a destra).
 */
export function buildAPB({ xteNm, bearingOrigDest, bearingToDest, destId, arrived }) {
  const steer = xteNm < 0 ? 'R' : 'L'
  const arrivedFlag = arrived ? 'A' : 'V'
  const body = [
    'ECAPB',
    'A',
    'A',
    Math.abs(xteNm).toFixed(3),
    steer,
    'N',
    arrivedFlag,
    arrivedFlag,
    fmtBrg(bearingOrigDest),
    'T',
    destId,
    fmtBrg(bearingToDest),
    'T',
    fmtBrg(bearingToDest),
    'T',
  ].join(',')
  return sentence(body)
}

/** RMB — Recommended minimum navigation info verso il waypoint attivo. */
export function buildRMB({
  xteNm,
  originId,
  destId,
  destLat,
  destLon,
  rangeNm,
  bearingToDest,
  vmgKn,
  arrived,
}) {
  const steer = xteNm < 0 ? 'R' : 'L'
  const [latStr, latHemi] = fmtLat(destLat)
  const [lonStr, lonHemi] = fmtLon(destLon)
  const body = [
    'ECRMB',
    'A',
    Math.min(Math.abs(xteNm), 9.99).toFixed(2),
    steer,
    originId,
    destId,
    latStr,
    latHemi,
    lonStr,
    lonHemi,
    Math.min(rangeNm, 999.9).toFixed(1),
    fmtBrg(bearingToDest),
    Math.max(vmgKn, 0).toFixed(1),
    arrived ? 'A' : 'V',
    'A',
  ].join(',')
  return sentence(body)
}

/** XTE — Cross-track error dedicato. */
export function buildXTE({ xteNm }) {
  const steer = xteNm < 0 ? 'R' : 'L'
  const body = ['ECXTE', 'A', 'A', Math.abs(xteNm).toFixed(3), steer, 'N', 'A'].join(',')
  return sentence(body)
}
