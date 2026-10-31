/*
 * Dati degli strumenti di bordo (Signal K, vedi useSignalK) pronti per
 * l'app: posizione dal GPS della barca, profondità vera dall'ecoscandaglio,
 * vento reale ricavato da quello apparente quando la centralina non lo dà.
 */

/**
 * Posizione da usare: quella del GPS di bordo se c'è ed è scelta nelle
 * impostazioni, altrimenti quella dell'iPad. Stessa forma di useGeolocation.
 */
export function boatGeo(phoneGeo, data, useBoatGps) {
  if (!useBoatGps || !Number.isFinite(data.lat) || !Number.isFinite(data.lon)) return { ...phoneGeo, source: 'ipad' }
  return {
    lat: data.lat,
    lon: data.lon,
    sog: data.sog ?? null,
    cog: data.cog ?? null,
    accuracy: 5,
    ts: data.posTs ?? Date.now(),
    error: null,
    source: 'boat',
  }
}

/**
 * Profondità dell'ecoscandaglio: { depth, ref, shallow }. Si mostra quella
 * sotto la chiglia se la centralina la calcola, sennò sotto il trasduttore
 * (come la tridata) o dalla superficie. Basso fondale: sotto chiglia meno del
 * margine, o dal trasduttore/superficie meno di pescaggio + margine (prudente).
 */
export function liveDepth(data, boat) {
  const margin = boat.safetyMarginM ?? 1
  const draft = boat.draftM ?? 2
  if (Number.isFinite(data.depthKeel)) return { depth: data.depthKeel, ref: 'chiglia', shallow: data.depthKeel < margin }
  const d = data.depthTransducer ?? data.depthSurface
  if (!Number.isFinite(d)) return null
  return { depth: d, ref: Number.isFinite(data.depthTransducer) ? 'trasduttore' : 'superficie', shallow: d < draft + margin }
}

/**
 * Vento reale { tws, twd, twa }: dalla centralina se lo dà, altrimenti dal
 * vento apparente (AWA, AWS) e dalla velocità sull'acqua (o sul fondo).
 * TWD (da dove viene) richiede la prua (o, in mancanza, la rotta sul fondo).
 */
export function trueWind(data) {
  const heading = data.hdg ?? data.hdgMag ?? data.cog
  if (Number.isFinite(data.tws) && Number.isFinite(data.twd)) {
    return { tws: data.tws, twd: data.twd, twa: Number.isFinite(heading) ? ((data.twd - heading + 540) % 360) - 180 : null }
  }
  const speed = data.stw ?? data.sog
  if (!Number.isFinite(data.awa) || !Number.isFinite(data.aws) || !Number.isFinite(speed)) return null
  const a = (data.awa * Math.PI) / 180
  // Vento apparente sulla barca (x avanti, y a dritta), meno l'effetto della corsa
  const x = data.aws * Math.cos(a) - speed
  const y = data.aws * Math.sin(a)
  const twa = (Math.atan2(y, x) * 180) / Math.PI
  return {
    tws: Math.hypot(x, y),
    twa,
    twd: Number.isFinite(heading) ? (heading + twa + 720) % 360 : null,
  }
}
