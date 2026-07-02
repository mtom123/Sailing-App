/*
 * Effemeridi essenziali per chi vive a bordo: alba, tramonto e fase lunare.
 * Algoritmo solare NOAA semplificato (precisione ±2 minuti).
 */

import { toRad, toDeg } from './geo.js'

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  return Math.floor((date.getTime() - start) / 86400000)
}

function sunEventUTC(date, lat, lon, isRise) {
  const zenith = 90.833 // rifrazione + semidiametro solare
  const N = dayOfYear(date)
  const lngHour = lon / 15
  const t = N + ((isRise ? 6 : 18) - lngHour) / 24

  const M = 0.9856 * t - 3.289
  let L =
    M + 1.916 * Math.sin(toRad(M)) + 0.02 * Math.sin(toRad(2 * M)) + 282.634
  L = ((L % 360) + 360) % 360

  let RA = toDeg(Math.atan(0.91764 * Math.tan(toRad(L))))
  RA = ((RA % 360) + 360) % 360
  RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90
  RA /= 15

  const sinDec = 0.39782 * Math.sin(toRad(L))
  const cosDec = Math.cos(Math.asin(sinDec))

  const cosH =
    (Math.cos(toRad(zenith)) - sinDec * Math.sin(toRad(lat))) /
    (cosDec * Math.cos(toRad(lat)))
  if (cosH > 1 || cosH < -1) return null // sole sempre sotto/sopra l'orizzonte

  let H = isRise ? 360 - toDeg(Math.acos(cosH)) : toDeg(Math.acos(cosH))
  H /= 15

  const T = H + RA - 0.06571 * t - 6.622
  let UT = T - lngHour
  UT = ((UT % 24) + 24) % 24

  const result = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
  result.setUTCMinutes(Math.round(UT * 60))
  return result
}

export function sunTimes(date, lat, lon) {
  return {
    sunrise: sunEventUTC(date, lat, lon, true),
    sunset: sunEventUTC(date, lat, lon, false),
  }
}

const SYNODIC = 29.530588853
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) // 6 gen 2000

/** Fase lunare 0..1 (0 = nuova, 0.5 = piena) con nome ed emoji. */
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000
  const phase = ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC
  const names = [
    ['Nuova', '\u{1F311}'],
    ['Crescente', '\u{1F312}'],
    ['Primo quarto', '\u{1F313}'],
    ['Gibbosa cresc.', '\u{1F314}'],
    ['Piena', '\u{1F315}'],
    ['Gibbosa cal.', '\u{1F316}'],
    ['Ultimo quarto', '\u{1F317}'],
    ['Calante', '\u{1F318}'],
  ]
  const idx = Math.round(phase * 8) % 8
  return { phase, name: names[idx][0], emoji: names[idx][1] }
}
