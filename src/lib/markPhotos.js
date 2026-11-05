import { putPhoto } from './markStore.js'

/*
 * Foto degli avvistamenti: ridotte prima di salvarle, perché quelle della
 * fotocamera pesano molto e lo spazio dell'iPad serve anche alle carte.
 */

const MAX_SIDE = 1600
const QUALITY = 0.8

async function shrink(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * k)
    canvas.height = Math.round(img.naturalHeight * k)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    canvas.width = canvas.height = 0 // Safari iOS: libera subito la memoria dei canvas
    if (!blob) throw new Error('Foto non leggibile')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Salva una foto e ne ritorna l'id. */
export async function addPhoto(file) {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  await putPhoto({ id, blob: await shrink(file) })
  return id
}
