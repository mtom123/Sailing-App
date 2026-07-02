import { haversine, bearing, metersToNm, toRad, toDeg } from './geo.js'

/*
 * Modello rotta: lista ordinata di waypoint {id, lat, lon, name}.
 * Calcoli di tratta, ETA, cross-track error e export GPX.
 */

const R_EARTH = 6371000

export function routeLegs(waypoints) {
  const legs = []
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    legs.push({
      from: a,
      to: b,
      dist: haversine(a.lat, a.lon, b.lat, b.lon),
      brg: bearing(a.lat, a.lon, b.lat, b.lon),
    })
  }
  return legs
}

export function routeTotalNm(waypoints) {
  return metersToNm(
    routeLegs(waypoints).reduce((sum, leg) => sum + leg.dist, 0)
  )
}

/**
 * Orario di arrivo stimato a ogni waypoint alla velocità di pianificazione.
 * Ritorna un array di timestamp (ms), il primo è startTime.
 */
export function etaTimes(waypoints, speedKn, startTime) {
  const speedMs = (Math.max(speedKn, 0.5) * 1852) / 3600
  const times = [startTime]
  let t = startTime
  for (const leg of routeLegs(waypoints)) {
    t += (leg.dist / speedMs) * 1000
    times.push(t)
  }
  return times
}

/**
 * Cross-track error firmato in metri rispetto alla tratta a→b.
 * Negativo = a sinistra della rotta, positivo = a destra.
 */
export function crossTrackError(pos, a, b) {
  const d13 = haversine(a.lat, a.lon, pos.lat, pos.lon) / R_EARTH
  const brg13 = toRad(bearing(a.lat, a.lon, pos.lat, pos.lon))
  const brg12 = toRad(bearing(a.lat, a.lon, b.lat, b.lon))
  return Math.asin(Math.sin(d13) * Math.sin(brg13 - brg12)) * R_EARTH
}

/** Angolo del vento rispetto alla rotta: 0 = in prua, 180 = in poppa. */
export function windAngleToCourse(windFromDeg, courseDeg) {
  return Math.abs(((windFromDeg - courseDeg + 540) % 360) - 180)
}

function gpxHeader(name) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="TIMONE" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${name}</name></metadata>\n`
}

export function routeToGPX(waypoints, name = 'Rotta TIMONE') {
  let out = gpxHeader(name) + '<rte>\n'
  waypoints.forEach((w, i) => {
    out += `<rtept lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}"><name>${w.name || `WP${i + 1}`}</name></rtept>\n`
  })
  return out + '</rte>\n</gpx>\n'
}

export function trackToGPX(points, name = 'Traccia TIMONE') {
  let out = gpxHeader(name) + '<trk><trkseg>\n'
  for (const p of points) {
    out += `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><time>${new Date(p.ts).toISOString()}</time></trkpt>\n`
  }
  return out + '</trkseg></trk>\n</gpx>\n'
}

export function downloadFile(filename, content, mime = 'application/gpx+xml') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
