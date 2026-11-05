import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, X } from 'lucide-react'
import { addPhoto } from '../lib/markPhotos.js'
import { deletePhotos, getPhoto } from '../lib/markStore.js'
import { useAppStore } from '../store/useAppStore.js'

/*
 * Foto di un avvistamento nella sua scheda. Quelle aggiunte restano in
 * newPhotos finché il mark non viene salvato, così annullando si tolgono.
 * Ridurle richiede tempo: ognuna si aggancia alla scheda quando è pronta,
 * leggendo la scheda di quel momento, e se nel frattempo è stata chiusa la
 * foto si scarta.
 */

function Photo({ id, onOpen }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let alive = true
    let made = null
    getPhoto(id)
      .then((p) => {
        if (!alive || !p) return
        made = URL.createObjectURL(p.blob)
        setUrl(made)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [id])
  if (!url) return <div className="aspect-square rounded-md border border-line bg-surface" />
  return (
    <button type="button" title="Apri la foto" onClick={() => onOpen(id, url)} className="touch block aspect-square overflow-hidden rounded-md border border-line">
      <img src={url} alt="Foto dell'avvistamento" className="h-full w-full object-cover" />
    </button>
  )
}

export default function MarkPhotos({ mark, onBusy }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null) // { id, url }
  const photos = mark.photos ?? []

  const working = (on) => {
    setBusy(on)
    onBusy(on)
  }

  const attach = (id) => {
    const draft = useAppStore.getState().markEdit
    if (!draft || draft.id !== mark.id) {
      deletePhotos([id]).catch(() => {})
      return
    }
    useAppStore.setState({ markEdit: { ...draft, photos: [...(draft.photos ?? []), id], newPhotos: [...(draft.newPhotos ?? []), id] } })
  }

  const add = async (e) => {
    const files = [...e.target.files]
    e.target.value = ''
    if (!files.length) return
    working(true)
    setError(null)
    for (const file of files) {
      try {
        attach(await addPhoto(file))
      } catch {
        setError('Una foto non si è potuta salvare')
      }
    }
    working(false)
  }

  const remove = (id) => {
    if (mark.newPhotos?.includes(id)) deletePhotos([id]).catch(() => {})
    useAppStore.setState({ markEdit: { ...mark, photos: photos.filter((p) => p !== id), newPhotos: (mark.newPhotos ?? []).filter((p) => p !== id) } })
    setOpen(null)
  }

  return (
    <>
      <div className="label pb-1 pt-3">Foto</div>
      <div className="grid grid-cols-4 gap-1">
        {photos.map((id) => (
          <Photo key={id} id={id} onOpen={(pid, url) => setOpen({ id: pid, url })} />
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="touch flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border border-line bg-surface text-[calc(9px*var(--fs))] font-semibold text-paper disabled:opacity-40"
        >
          <Camera size={18} />
          {busy ? 'SALVO…' : 'AGGIUNGI'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple onChange={add} className="hidden" aria-label="Foto dell'avvistamento" />
      {error && <div className="pt-1 text-[calc(10px*var(--fs))] text-danger">{error}</div>}
      {open && (
        <div className="fixed inset-0 z-[3000] flex flex-col bg-black/95">
          <div className="flex flex-none justify-between p-3">
            <button type="button" onClick={() => remove(open.id)} className="touch flex items-center gap-1.5 rounded-md border border-danger px-3 py-2 text-xs font-semibold text-danger">
              <Trash2 size={14} /> TOGLI FOTO
            </button>
            <button type="button" aria-label="Chiudi la foto" onClick={() => setOpen(null)} className="touch flex h-10 w-10 items-center justify-center text-white">
              <X size={22} />
            </button>
          </div>
          <img src={open.url} alt="Foto dell'avvistamento" className="min-h-0 flex-1 object-contain" />
        </div>
      )}
    </>
  )
}
