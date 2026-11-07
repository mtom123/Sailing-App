import { useAppStore } from '../store/useAppStore.js'
import { registerCustomPolar } from '../routing/polarSolver.js'
import { getPhoto, listMarks, listPhotos, putMarks, putPhoto } from './markStore.js'
import { allTracks, getTrack, putTrack } from './trackStore.js'
import { getCustomPolar, listCustomPolars, saveCustomPolar } from './polarParser.js'

/*
 * Copia di sicurezza in un file solo: mark e avvistamenti con le foto, rotte,
 * tracce, polari e impostazioni. Le carte offline restano fuori (si
 * riscaricano). Il file è un'intestazione JSON seguita dalle foto così come
 * sono: in base64 peserebbero un terzo in più e starebbero tutte in memoria.
 *
 * Il caricamento aggiunge e basta: non cancella niente di quello che c'è.
 */

const MAGIC = 'TIMONE-COPIA-1\n'
const LAST_KEY = 'timone.backupAt'
const HEAD_BYTES = 64

export const lastBackupAt = () => Number(localStorage.getItem(LAST_KEY)) || null
export const markBackupDone = () => localStorage.setItem(LAST_KEY, String(Date.now()))

export async function makeBackup() {
  const [marks, tracks, polars, photos] = await Promise.all([listMarks(), allTracks(), listCustomPolars(), listPhotos()])
  const settings = useAppStore.persist.getOptions().partialize(useAppStore.getState())
  const photoInfo = photos.map(({ blob, ...rest }) => ({ ...rest, size: blob.size, mime: blob.type }))
  const header = new TextEncoder().encode(JSON.stringify({ createdAt: Date.now(), marks, tracks, polars, settings, photos: photoInfo }))
  const blob = new Blob([MAGIC, `${header.length}\n`, header, ...photos.map((p) => p.blob)], { type: 'application/octet-stream' })
  const day = new Date().toISOString().slice(0, 10)
  return {
    blob,
    filename: `TIMONE-copia-${day}.timone`,
    counts: { marks: marks.length, photos: photos.length, tracks: tracks.length, routes: settings.savedRoutes?.length ?? 0 },
  }
}

/** Legge e controlla il file: { data, photoAt }. Non scrive niente. */
export async function readBackup(file) {
  const start = new TextDecoder().decode(await file.slice(0, HEAD_BYTES).arrayBuffer())
  if (!start.startsWith(MAGIC)) throw new Error('Questo file non è una copia di TIMONE')
  const lengthEnd = start.indexOf('\n', MAGIC.length)
  const headerLength = Number(start.slice(MAGIC.length, lengthEnd))
  const headerStart = lengthEnd + 1 // solo cifre e testo semplice: un carattere è un byte
  if (lengthEnd < 0 || !Number.isInteger(headerLength)) throw new Error('Copia illeggibile')
  const headerEnd = headerStart + headerLength
  if (headerEnd > file.size) throw new Error('Copia incompleta: il file è tagliato')
  const data = JSON.parse(new TextDecoder().decode(await file.slice(headerStart, headerEnd).arrayBuffer()))
  let offset = headerEnd
  const photoAt = data.photos.map((p) => {
    const from = offset
    offset += p.size
    return from
  })
  if (offset !== file.size) throw new Error('Copia incompleta: mancano delle foto')
  return { data, photoAt, file }
}

/** Aggiunge i dati della copia. withSettings: anche barca e impostazioni. */
export async function restoreBackup({ data, photoAt, file }, { withSettings = false } = {}) {
  const current = new Map((await listMarks()).map((m) => [m.id, m]))
  const marks = data.marks.filter((m) => !current.has(m.id) || (m.updatedAt ?? 0) > (current.get(m.id).updatedAt ?? 0))
  if (marks.length) await putMarks(marks)

  let photos = 0
  for (let i = 0; i < data.photos.length; i++) {
    const { size, mime, ...rest } = data.photos[i]
    if (await getPhoto(rest.id)) continue
    const bytes = await file.slice(photoAt[i], photoAt[i] + size).arrayBuffer()
    await putPhoto({ ...rest, blob: new Blob([bytes], { type: mime }) })
    photos += 1
  }

  let tracks = 0
  for (const track of data.tracks) {
    if (await getTrack(track.id)) continue
    await putTrack(track)
    tracks += 1
  }

  for (const polar of data.polars) {
    if (!(await getCustomPolar(polar.key))) await saveCustomPolar(polar.key, polar.name, polar.polarData)
    registerCustomPolar(polar.key, polar.polarData)
  }

  const { savedRoutes: backupRoutes = [], ...settings } = data.settings ?? {}
  const savedRoutes = useAppStore.getState().savedRoutes ?? []
  const names = new Set(savedRoutes.map((r) => r.name))
  const routes = backupRoutes.filter((r) => !names.has(r.name))
  useAppStore.setState({
    ...(withSettings ? settings : {}),
    marks: await listMarks(),
    savedRoutes: [...savedRoutes, ...routes],
  })
  navigator.storage?.persist?.().catch(() => {})
  return { marks: marks.length, photos, tracks, routes: routes.length }
}
