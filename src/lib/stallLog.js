/*
 * Registro dei blocchi, per capire cosa succede sull'iPad: i blocchi durante lo
 * zoom non si riproducono sul computer. Un fotogramma che tarda più di
 * MIN_STALL_MS è un blocco: se ne salva la durata con lo stato della carta.
 */

const KEY = 'timone.stalls'
const MIN_STALL_MS = 700
const MAX_ENTRIES = 20

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

/** Avvia il registro; getLayers() dà i livelli accesi. Ritorna la funzione per fermarlo. */
export function startStallLog(map, getLayers) {
  let last = performance.now()
  let frame = 0
  const tick = (now) => {
    // Con l'app in secondo piano i fotogrammi si fermano: non è un blocco
    if (now - last > MIN_STALL_MS && document.visibilityState === 'visible') {
      try {
        localStorage.setItem(KEY, JSON.stringify([snapshot(map, now - last, getLayers()), ...readStalls()].slice(0, MAX_ENTRIES)))
      } catch {
        // spazio pieno: questo blocco non si registra
      }
    }
    last = now
    frame = requestAnimationFrame(tick)
  }
  const onVisible = () => {
    last = performance.now()
  }
  document.addEventListener('visibilitychange', onVisible)
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
