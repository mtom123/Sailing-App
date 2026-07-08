/**
 * Polar file parser
 *
 * Formati supportati:
 * 1. CSV standard: prima riga = TWS values, prima colonna = TWA values, resto = speeds
 *    Es:
 *    TWA\TWS,4,6,8,10,12,15,18,22,26,30
 *    0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0
 *    30,2.1,3.4,4.5,5.4,6.0,6.3,6.4,6.2,5.8,5.3
 *    ...
 *
 * 2. ORC .pol format (semicolon-separated, similar structure)
 *
 * 3. MaxSea .pol format (TWS TWA BS triples, one per line)
 */

/**
 * Parse CSV polar file content.
 * Ritorna { tws: [], twa: [], speeds: [][] }
 */
export function parsePolarCSV(content) {
  const lines = content.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
  if (lines.length < 2) throw new Error('File too short')

  // Detect delimiter
  const delim = lines[0].includes(';') ? ';' : ','

  // Parse header (TWS values)
  const header = lines[0].split(delim).map((s) => parseFloat(s.trim()))
  // First cell might be a label like "TWA\TWS" — skip if NaN
  const startCol = isNaN(header[0]) ? 1 : 0
  const tws = header.slice(startCol).filter((v) => !isNaN(v))

  // Parse rows
  const twa = []
  const speeds = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delim).map((s) => parseFloat(s.trim()))
    if (cells.length < 2) continue
    const startIdx = isNaN(cells[0]) ? 1 : 0
    const a = cells[startIdx]
    if (isNaN(a)) continue
    twa.push(a)
    const row = cells.slice(startIdx + 1).map((v) => (isNaN(v) ? 0 : v))
    // Pad/truncate to match tws length
    while (row.length < tws.length) row.push(0)
    row.length = tws.length
    speeds.push(row)
  }

  if (twa.length < 2 || tws.length < 2) {
    throw new Error('Invalid polar file: need at least 2x2 data')
  }
  return { tws, twa, speeds }
}

/**
 * Parse MaxSea .pol format (TWS TWA BS per line)
 */
export function parsePolarMaxSea(content) {
  const lines = content.trim().split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'))
  const twsSet = new Set()
  const twaSet = new Set()
  const points = []
  for (const line of lines) {
    const parts = line.trim().split(/\s+/).map(parseFloat)
    if (parts.length >= 3 && parts.every((v) => !isNaN(v))) {
      const [tws, twa, bs] = parts
      twsSet.add(tws)
      twaSet.add(twa)
      points.push({ tws, twa, bs })
    }
  }
  const tws = Array.from(twsSet).sort((a, b) => a - b)
  const twa = Array.from(twaSet).sort((a, b) => a - b)
  const speeds = twa.map((a) => tws.map((w) => {
    const p = points.find((pt) => pt.tws === w && pt.twa === a)
    return p ? p.bs : 0
  }))
  return { tws, twa, speeds }
}

/**
 * Auto-detect format and parse
 */
export function parsePolarFile(content, filename = '') {
  const ext = filename.toLowerCase().split('.').pop()
  try {
    if (ext === 'csv' || content.includes(',')) {
      return parsePolarCSV(content)
    }
    if (ext === 'pol' || content.match(/^\s*\d+\.?\d*\s+\d+\.?\d*\s+\d+\.?\d*\s*$/m)) {
      return parsePolarMaxSea(content)
    }
    // Fallback: try CSV first
    return parsePolarCSV(content)
  } catch (e) {
    // Try MaxSea as fallback
    try {
      return parsePolarMaxSea(content)
    } catch (e2) {
      throw new Error(`Cannot parse polar file: ${e.message}`)
    }
  }
}

/**
 * Salva polar custom in IndexedDB
 */
import { cacheSet, cacheGet, cacheKeys } from './cache.js'

export async function saveCustomPolar(key, name, polarData) {
  return cacheSet('polars', { key, name, polarData, uploadedAt: Date.now() })
}

export async function getCustomPolar(key) {
  return cacheGet('polars', key)
}

export async function listCustomPolars() {
  const keys = await cacheKeys('polars')
  const result = []
  for (const k of keys) {
    const v = await cacheGet('polars', k)
    if (v) result.push(v)
  }
  return result
}
