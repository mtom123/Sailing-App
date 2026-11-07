/*
 * Registro dei blocchi, per capire cosa succede sull'iPad: i blocchi durante lo
 * zoom non si riproducono sul computer. Un fotogramma che tarda più di
 * MIN_STALL_MS è un blocco: se ne salva la durata con lo stato della carta.
 *
 * Un blocco senza ritorno non si registrerebbe mai: l'app viene chiusa prima
 * del fotogramma dopo. Per questi resta un battito (BEAT_KEY) con lo stato
 * dell'ultimo secondo, letto all'apertura successiva: `closed`. Con `hidden` il
 * codice girava ancora alla chiusura; senza, era fermo già da prima.
 *
 * Durante un blocco timerTicks dice se il codice era fermo (zero o quasi) o se si
 * era fermato solo il disegno (circa un tick ogni PROBE_MS). blurred segnala che
 * l'iPad ha coperto l'app (Centro di controllo): non è un blocco vero.
 * canvasMs, mapMs e jsonMs dicono dove è andato il tempo: disegno sui canvas,
 * gestori di fine spostamento e zoom della carta, lettura di JSON grandi.
 */

const KEY = 'timone.stalls'
const MIN_STALL_MS = 700
const MAX_ENTRIES = 20
const BEAT_KEY = 'timone.beat'
const BEAT_MS = 1000
const NO_FRAMES_MS = 2000
const PROBE_MS = 250
const MAP_EVENTS = new Set(['moveend', 'zoomend', 'viewreset', 'zoomlevelschange', 'resize'])

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

// Conteggi dall'ultimo fotogramma, azzerati a ogni fotogramma
const newProbe = () => ({ timerTicks: 0, imageCalls: 0, imageMs: 0, canvasMs: 0, mapMs: 0, jsonMs: 0, tileErrors: 0, blurred: !document.hasFocus() })
let probe = newProbe()

// Sostituisce obj[name] con la stessa funzione, sommando il tempo in probe[field]
function timed(obj, name, field) {
  const original = obj[name]
  obj[name] = function timedCall(...args) {
    const start = performance.now()
    try {
      return original.apply(this, args)
    } finally {
      probe[field] += performance.now() - start
    }
  }
  return () => {
    obj[name] = original
  }
}

function startProbe(map) {
  const timer = setInterval(() => {
    probe.timerTicks += 1
  }, PROBE_MS)
  const read = CanvasRenderingContext2D.prototype.getImageData
  CanvasRenderingContext2D.prototype.getImageData = function timedRead(...args) {
    const start = performance.now()
    try {
      return read.apply(this, args)
    } finally {
      probe.imageCalls += 1
      probe.imageMs += performance.now() - start
    }
  }
  const undo = [
    ...['fill', 'stroke', 'drawImage', 'fillText', 'strokeText', 'clip'].map((n) => timed(CanvasRenderingContext2D.prototype, n, 'canvasMs')),
    timed(JSON, 'parse', 'jsonMs'),
  ]
  const fire = map.fire
  map.fire = function timedFire(type, ...args) {
    if (!MAP_EVENTS.has(type)) return fire.call(this, type, ...args)
    const start = performance.now()
    try {
      return fire.call(this, type, ...args)
    } finally {
      probe.mapMs += performance.now() - start
    }
  }
  const onError = (e) => {
    if (e.target?.tagName === 'IMG') probe.tileErrors += 1
  }
  const onBlur = () => {
    probe.blurred = true
  }
  document.addEventListener('error', onError, true)
  window.addEventListener('blur', onBlur)
  return () => {
    clearInterval(timer)
    CanvasRenderingContext2D.prototype.getImageData = read
    undo.forEach((restore) => restore())
    map.fire = fire
    document.removeEventListener('error', onError, true)
    window.removeEventListener('blur', onBlur)
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
  const stopProbe = startProbe(map)
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
  const tick = () => {
    // L'orario del fotogramma può essere di prima del blocco: conta l'orario vero
    const now = performance.now()
    // Con l'app in secondo piano i fotogrammi si fermano: non è un blocco
    if (now - last > MIN_STALL_MS && document.visibilityState === 'visible') {
      addStall({ ...snapshot(map, now - last, getLayers()), online: navigator.onLine, ...probe, imageMs: Math.round(probe.imageMs), canvasMs: Math.round(probe.canvasMs), mapMs: Math.round(probe.mapMs), jsonMs: Math.round(probe.jsonMs) })
    }
    last = now
    probe = newProbe()
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
    stopProbe()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pagehide', onHide)
    map.off('zoomstart', onZoomStart)
  }
}
