/*
 * Registro delle aperture, per capire sull'iPad dove va il tempo: sul computer
 * l'avvio dura una frazione. I tempi sono in millisecondi dall'inizio della
 * pagina; quello che iOS fa prima (avviare il browser) qui non si vede.
 */

const KEY = 'timone.starts'
const MAX_ENTRIES = 8
const SETTLE_MS = 6000 // a carta caricata, per avere anche risorse e memoria

export function readStarts() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

export function clearStarts() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // niente da togliere
  }
}

const whole = (v) => (v == null ? null : Math.round(v))

// Service worker attivo, in attesa o in installazione (un aggiornamento a metà?)
async function swState() {
  const reg = await navigator.serviceWorker?.getRegistration?.()
  if (!reg) return null
  return [reg.active && `attivo:${reg.active.state}`, reg.waiting && 'in attesa', reg.installing && `installa:${reg.installing.state}`].filter(Boolean).join(', ')
}

// Tempi della pagina misurati dal service worker (sw.js): avvio, archivio, rete
function swTiming() {
  const sw = navigator.serviceWorker?.controller
  if (!sw) return Promise.resolve(null)
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => resolve(null), 1000)
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer)
      resolve(data)
    }
    sw.postMessage({ type: 'nav-timing' }, [channel.port2])
  })
}

async function snapshot() {
  const nav = performance.getEntriesByType('navigation')[0]
  const paint = performance.getEntriesByType('paint').find((p) => p.name === 'first-contentful-paint')
  const own = performance.getEntriesByType('resource').filter((r) => r.name.includes('/assets/'))
  const slowest = own.sort((a, b) => b.responseEnd - a.responseEnd).slice(0, 4)
  const est = await navigator.storage?.estimate?.().catch(() => null)
  const t = window.__timoneStart || {}
  return {
    at: new Date().toLocaleString('it-IT'),
    home: !!navigator.standalone,
    sw: !!navigator.serviceWorker?.controller,
    worker: whole(nav?.workerStart),
    // Pagina: richiesta partita, primo byte, ultimo byte
    request: whole(nav?.requestStart),
    firstByte: whole(nav?.responseStart),
    page: whole(nav?.responseEnd),
    swNav: await swTiming().catch(() => null),
    swState: await swState().catch(() => null),
    firstPaint: whole(paint?.startTime),
    main: whole(t.main),
    ready: whole(t.ready),
    load: whole(nav?.loadEventEnd),
    files: slowest.map((r) => `${r.name.split('/').pop().split('-')[0]} ${whole(r.startTime)}+${whole(r.duration)}`),
    storageMb: est?.usage != null ? Math.round(est.usage / 1048576) : null,
    markers: document.querySelectorAll('.leaflet-marker-icon').length,
  }
}

export function recordStart() {
  setTimeout(async () => {
    try {
      const entry = await snapshot()
      localStorage.setItem(KEY, JSON.stringify([entry, ...readStarts()].slice(0, MAX_ENTRIES)))
    } catch {
      // il registro non deve mai disturbare l'app
    }
  }, SETTLE_MS)
}
