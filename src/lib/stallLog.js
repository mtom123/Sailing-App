/*
 * Registro dei blocchi, per capire cosa succede sull'iPad: i blocchi durante lo
 * zoom non si riproducono sul computer. Un fotogramma che tarda più di
 * MIN_STALL_MS è un blocco: se ne salva la durata con lo stato della carta.
 *
 * Un blocco senza ritorno non si registrerebbe mai: l'app viene chiusa prima
 * del fotogramma dopo. Per questi resta un battito (BEAT_KEY) con lo stato
 * dell'ultimo secondo, letto all'apertura successiva: `closed`. Con `hidden` il
 * codice girava ancora alla chiusura; senza, era fermo già da prima.
 */

const KEY = 'timone.stalls'
const MIN_STALL_MS = 700
const MAX_ENTRIES = 20
const BEAT_KEY = 'timone.beat'
const BEAT_MS = 1000
const NO_FRAMES_MS = 2000

export function readStalls() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

export function clearStalls() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // niente da togliere
  }
}

function snapshot(map, ms, layers) {
  const root = map.getContainer()
  const canvases = [...root.querySelectorAll('canvas')]
  return {
    at: new Date().toLocaleString('it-IT'),
    ms: Math.round(ms),
    zoom: map.getZoom(),
    scale: root.querySelector('.leaflet-control-scale')?.innerText.split('\n')[0] ?? '',
    tiles: root.querySelectorAll('img.leaflet-tile').length,
    canvases: canvases.length,
    canvasMpx: +(canvases.reduce((sum, c) => sum + c.width * c.height, 0) / 1e6).toFixed(1),
    paths: root.querySelectorAll('svg path').length,
    markers: root.querySelectorAll('.leaflet-marker-icon').length,
    layers,
  }
}

function addStall(entry) {
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...readStalls()].slice(0, MAX_ENTRIES)))
  } catch {
    // spazio pieno: questo blocco non si registra
  }
}

// App chiusa a carta bloccata: nessun passaggio in secondo piano, o in
// secondo piano con lo zoom a metà o senza fotogrammi
function collectLastBeat() {
  try {
    const beat = JSON.parse(localStorage.getItem(BEAT_KEY))
    localStorage.removeItem(BEAT_KEY)
    if (beat && (!beat.hidden || beat.zooming || beat.frameAgeMs > NO_FRAMES_MS)) addStall({ ...beat, ms: 0, closed: true })
  } catch {
    // battito illeggibile: niente da aggiungere
  }
}

/** Avvia il registro; getLayers() dà i livelli accesi. Ritorna la funzione per fermarlo. */
export function startStallLog(map, getLayers) {
  collectLastBeat()
  let last = performance.now()
  let frame = 0
  let zoomStart = null
  const beat = (hidden) => {
    try {
      const now = performance.now()
      localStorage.setItem(
        BEAT_KEY,
        JSON.stringify({
          ...snapshot(map, 0, getLayers()),
          hidden,
          online: navigator.onLine,
          zooming: !!map._animatingZoom || !!map.touchZoom?._zooming,
          sinceZoomMs: zoomStart == null ? null : Math.round(now - zoomStart),
          frameAgeMs: Math.round(now - last),
        })
      )
    } catch {
      // il registro non deve mai disturbare la carta
    }
  }
  const onZoomStart = () => {
    zoomStart = performance.now()
    beat(false)
  }
  const onHide = () => beat(true)
  const tick = (now) => {
    // Con l'app in secondo piano i fotogrammi si fermano: non è un blocco
    if (now - last > MIN_STALL_MS && document.visibilityState === 'visible') {
      addStall(snapshot(map, now - last, getLayers()))
    }
    last = now
    frame = requestAnimationFrame(tick)
  }
  const onVisible = () => {
    if (document.visibilityState === 'hidden') onHide()
    else last = performance.now()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pagehide', onHide)
  map.on('zoomstart', onZoomStart)
  const beats = setInterval(() => {
    if (document.visibilityState === 'visible') beat(false)
  }, BEAT_MS)
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    clearInterval(beats)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pagehide', onHide)
    map.off('zoomstart', onZoomStart)
  }
}
