// Debug logger globale — mostra messaggi nel loading screen
// così vediamo dove si blocca l'app su iPad

let loadingEl = null
let debugLogEl = null
let steps = []

function getLoadingEl() {
  if (!loadingEl) loadingEl = document.getElementById('app-loading')
  return loadingEl
}

function ensureDebugLog() {
  const loading = getLoadingEl()
  if (!loading) return null
  if (!debugLogEl) {
    debugLogEl = document.createElement('div')
    debugLogEl.style.cssText = `
      margin-top: 24px;
      max-width: 360px;
      width: 100%;
      max-height: 240px;
      overflow-y: auto;
      background: rgba(10, 22, 32, 0.95);
      border: 1px solid #1f3a4d;
      border-radius: 6px;
      padding: 8px 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      color: #5ee6c8;
      text-align: left;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
    `
    loading.appendChild(debugLogEl)
  }
  return debugLogEl
}

export function logStep(step, status = 'ok', details = '') {
  const time = new Date().toLocaleTimeString('it-IT', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0')
  const icon = status === 'ok' ? '✓' : status === 'fail' ? '✗' : status === 'warn' ? '⚠' : '•'
  const color = status === 'ok' ? '#5ee6c8' : status === 'fail' ? '#ff5252' : status === 'warn' ? '#f5a623' : '#8fa0ae'
  const line = `[${time}] ${icon} ${step}${details ? ': ' + details : ''}`
  steps.push({ line, color })
  console.log('TIMONE:', line)

  const log = ensureDebugLog()
  if (log) {
    const lineEl = document.createElement('div')
    lineEl.style.color = color
    lineEl.textContent = line
    log.appendChild(lineEl)
    log.scrollTop = log.scrollHeight
  }
}

export function failStep(step, error) {
  logStep(step, 'fail', error?.message || String(error))
  // Also show in alert-like UI at top
  const loading = getLoadingEl()
  if (loading) {
    const errBanner = document.createElement('div')
    errBanner.style.cssText = `
      margin-top: 12px;
      padding: 10px;
      background: rgba(255, 82, 82, 0.15);
      border: 1px solid #ff5252;
      border-radius: 6px;
      color: #ff5252;
      font-size: 11px;
      font-family: ui-monospace, monospace;
      max-width: 360px;
      word-break: break-word;
    `
    errBanner.innerHTML = `<b>ERRORE in ${step}:</b><br>${error?.message || String(error)}`
    loading.appendChild(errBanner)
  }
}

export function hideLoadingScreen() {
  const loading = getLoadingEl()
  if (loading) {
    loading.style.opacity = '0'
    setTimeout(() => loading.remove(), 300)
  }
}

// Capture errors globally
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    failStep('Global error', new Error(`${e.message} @ ${e.filename}:${e.lineno}:${e.colno}`))
  })
  window.addEventListener('unhandledrejection', (e) => {
    failStep('Unhandled rejection', new Error(String(e.reason)))
  })
}

export function getSteps() {
  return steps
}
