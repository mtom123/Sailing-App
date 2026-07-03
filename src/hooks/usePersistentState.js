import { useEffect, useState } from 'react'

/*
 * useState con persistenza in localStorage: rotte, impostazioni e preferenze
 * sopravvivono a riavvii dell'app e dell'iPad.
 */
export default function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // storage pieno o negato: si continua in memoria
    }
  }, [key, value])

  return [value, setValue]
}
