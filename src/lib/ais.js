/*
 * Decoder AIS (NMEA0183 !AIVDM / !AIVDO).
 * Supporta i messaggi di posizione Classe A (tipi 1, 2, 3), Classe B (tipo 18)
 * e i dati statici (tipo 5, nome nave) inclusi i messaggi multi-frammento.
 */

// Frammenti multi-parte in attesa di completamento, per chiave canale+seq
const pendingFragments = new Map()

function verifyChecksum(sentence) {
  const star = sentence.lastIndexOf('*')
  if (star === -1) return false
  const body = sentence.slice(1, star)
  const expected = parseInt(sentence.slice(star + 1, star + 3), 16)
  let sum = 0
  for (let i = 0; i < body.length; i++) sum ^= body.charCodeAt(i)
  return sum === expected
}

// Payload ASCII armored a 6 bit → stringa binaria
function payloadToBits(payload) {
  let bits = ''
  for (let i = 0; i < payload.length; i++) {
    let v = payload.charCodeAt(i) - 48
    if (v > 40) v -= 8
    bits += v.toString(2).padStart(6, '0')
  }
  return bits
}

function uInt(bits, start, len) {
  return parseInt(bits.slice(start, start + len), 2)
}

function sInt(bits, start, len) {
  let v = uInt(bits, start, len)
  if (bits[start] === '1') v -= 1 << len
  return v
}

function sixBitText(bits, start, len) {
  let out = ''
  for (let i = start; i + 6 <= start + len; i += 6) {
    const c = uInt(bits, i, 6)
    if (c === 0) break
    out += String.fromCharCode(c < 32 ? c + 64 : c)
  }
  return out.replace(/@/g, '').trim()
}

function decodePosition(bits, type) {
  // Offset dei campi secondo ITU-R M.1371-5
  const isClassB = type === 18
  const sogRaw = uInt(bits, isClassB ? 46 : 50, 10)
  const lonRaw = sInt(bits, isClassB ? 57 : 61, 28)
  const latRaw = sInt(bits, isClassB ? 85 : 89, 27)
  const cogRaw = uInt(bits, isClassB ? 112 : 116, 12)
  const hdgRaw = uInt(bits, isClassB ? 124 : 128, 9)

  const lon = lonRaw / 600000
  const lat = latRaw / 600000
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null

  return {
    type,
    mmsi: uInt(bits, 8, 30),
    lat,
    lon,
    sog: sogRaw === 1023 ? null : sogRaw / 10,
    cog: cogRaw === 3600 ? null : cogRaw / 10,
    hdg: hdgRaw === 511 ? null : hdgRaw,
  }
}

function decodeStatic(bits) {
  return {
    type: 5,
    mmsi: uInt(bits, 8, 30),
    name: sixBitText(bits, 112, 120),
    shipType: uInt(bits, 232, 8),
  }
}

/**
 * Decodifica una sentenza NMEA0183 AIVDM/AIVDO.
 * Ritorna null se la sentenza è invalida, incompleta (multi-parte) o di tipo
 * non gestito; altrimenti un oggetto { type, mmsi, ... }.
 */
export function decodeAIVDM(rawSentence) {
  const sentence = rawSentence.trim()
  if (!/^[!$]..VD[MO],/.test(sentence)) return null
  if (!verifyChecksum(sentence)) return null

  const parts = sentence.split(',')
  if (parts.length < 7) return null
  const total = parseInt(parts[1], 10)
  const num = parseInt(parts[2], 10)
  const seq = parts[3]
  const channel = parts[4]
  const payload = parts[5]

  let fullPayload = payload
  if (total > 1) {
    const key = `${channel}:${seq}`
    const entry = pendingFragments.get(key) || { parts: {}, total, ts: Date.now() }
    entry.parts[num] = payload
    pendingFragments.set(key, entry)
    if (Object.keys(entry.parts).length < total) {
      // Pulizia frammenti orfani più vecchi di 30 s
      for (const [k, v] of pendingFragments) {
        if (Date.now() - v.ts > 30000) pendingFragments.delete(k)
      }
      return null
    }
    fullPayload = ''
    for (let i = 1; i <= total; i++) fullPayload += entry.parts[i] || ''
    pendingFragments.delete(key)
  }

  const bits = payloadToBits(fullPayload)
  if (bits.length < 38) return null
  const type = uInt(bits, 0, 6)

  if (type === 1 || type === 2 || type === 3 || type === 18) {
    if (bits.length < (type === 18 ? 133 : 137)) return null
    return decodePosition(bits, type)
  }
  if (type === 5) {
    if (bits.length < 240) return null
    return decodeStatic(bits)
  }
  return null
}

/** Decodifica un blocco di testo contenente più righe NMEA. */
export function decodeNMEABlock(text) {
  const results = []
  for (const line of String(text).split(/\r?\n/)) {
    const msg = decodeAIVDM(line)
    if (msg) results.push(msg)
  }
  return results
}
