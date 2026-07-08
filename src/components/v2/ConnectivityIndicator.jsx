import { useEffect, useState } from 'react'
import { Wifi, WifiOff, CloudOff } from 'lucide-react'

/**
 * Indicatore connettività — ONLINE / OFFLINE / PARTIAL
 * Mostra stato rete + stato Open-Meteo API
 */
export default function ConnectivityIndicator({ gribAvailable, weatherAvailable }) {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // PARTIAL: online but API failed (offline tile/data cache)
  const isPartial = online && (!gribAvailable || !weatherAvailable)

  let state
  if (!online) {
    state = { icon: WifiOff, label: 'OFFLINE', color: '#F5A623', hint: 'Dati da cache' }
  } else if (isPartial) {
    state = { icon: CloudOff, label: 'PARTIAL', color: '#F5A623', hint: 'API limitata' }
  } else {
    state = { icon: Wifi, label: 'ONLINE', color: '#5EE6C8', hint: null }
  }

  const Icon = state.icon

  return (
    <div className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1" title={state.hint}>
      <Icon size={11} style={{ color: state.color }} />
      <span className="text-[9px] font-bold tracking-widest" style={{ color: state.color }}>
        {state.label}
      </span>
    </div>
  )
}
