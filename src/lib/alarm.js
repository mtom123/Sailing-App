/*
 * Allarme acustico via WebAudio per l'Anchor Watch.
 * L'AudioContext viene creato dentro un gesto utente (tap sul pulsante
 * "Ancora Caduta"): requisito di iOS Safari per poter emettere suono.
 */

let ctx = null
let intervalId = null

export function armAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) ctx = new AC()
  }
  if (ctx && ctx.state === 'suspended') ctx.resume()
}

function beep(freq, durationMs) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + durationMs / 1000 + 0.02)
}

export function startAlarm() {
  armAudio()
  if (intervalId) return
  const pattern = () => {
    beep(880, 260)
    setTimeout(() => beep(660, 260), 320)
  }
  pattern()
  intervalId = setInterval(pattern, 900)
}

export function stopAlarm() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export function isAlarmRunning() {
  return intervalId != null
}
