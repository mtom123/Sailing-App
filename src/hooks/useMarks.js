import { useEffect } from 'react'
import { deleteMark, listMarks, putMark, putMarks } from '../lib/markStore.js'
import { useAppStore } from '../store/useAppStore.js'

/*
 * Mark: l'archivio è su IndexedDB, lo store ne tiene la copia per carta e
 * pannello. Si chiede al browser di non cancellare i dati per fare spazio.
 */

export default function useMarks() {
  useEffect(() => {
    listMarks()
      .then((marks) => useAppStore.setState({ marks }))
      .catch((err) => console.warn('Mark non disponibili', err))
  }, [])
}

export async function saveMark(mark) {
  const saved = { ...mark, id: mark.id ?? `m${Date.now().toString(36)}`, updatedAt: Date.now() }
  await putMark(saved)
  navigator.storage?.persist?.().catch(() => {})
  useAppStore.setState((s) => ({ marks: [...s.marks.filter((m) => m.id !== saved.id), saved] }))
}

/** Aggiunge in un colpo i mark letti da un file. */
export async function importMarks(marks) {
  const stamp = Date.now()
  const saved = marks.map((m, i) => ({ ...m, id: m.id ?? `m${stamp.toString(36)}${i.toString(36)}`, updatedAt: stamp }))
  await putMarks(saved)
  navigator.storage?.persist?.().catch(() => {})
  useAppStore.setState((s) => ({ marks: [...s.marks, ...saved] }))
}

export async function removeMark(id) {
  await deleteMark(id)
  useAppStore.setState((s) => ({ marks: s.marks.filter((m) => m.id !== id) }))
}
