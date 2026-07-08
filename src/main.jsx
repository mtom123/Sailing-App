import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import App from './App.jsx'

// ErrorBoundary globale: mostra errori a schermo invece di schermo bianco
class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Global error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#0a1620', color: '#e8f0f5',
          padding: '20px', overflow: 'auto', fontFamily: 'system-ui, sans-serif',
          paddingTop: 'env(safe-area-inset-top)',
        }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            <h1 style={{ color: '#ff5252', fontSize: '20px', marginBottom: '8px' }}>
              ⚠️ Errore applicazione
            </h1>
            <p style={{ color: '#8fa0ae', fontSize: '13px', marginBottom: '16px' }}>
              TIMONE ha incontrato un errore. Riporta i dettagli sotto.
            </p>
            <div style={{
              background: '#122a3a', border: '1px solid #1f3a4d',
              borderRadius: '8px', padding: '12px', marginBottom: '12px',
            }}>
              <div style={{ color: '#5ee6c8', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Errore</div>
              <pre style={{ color: '#ff5252', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {this.state.error?.message || String(this.state.error)}
              </pre>
            </div>
            {this.state.errorInfo?.componentStack && (
              <div style={{
                background: '#122a3a', border: '1px solid #1f3a4d',
                borderRadius: '8px', padding: '12px', marginBottom: '12px',
              }}>
                <div style={{ color: '#5ee6c8', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>Stack</div>
                <pre style={{ color: '#8fa0ae', fontSize: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: '#5ee6c8', color: '#0a1620', border: 'none',
                  padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                RICARICA
              </button>
              <button
                onClick={() => window.location.href = './diagnostic.html'}
                style={{
                  background: 'transparent', color: '#5ee6c8', border: '1px solid #5ee6c8',
                  padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                APRI DIAGNOSTICA
              </button>
              <button
                onClick={() => window.location.href = './?nocache=' + Date.now()}
                style={{
                  background: 'transparent', color: '#f5a623', border: '1px solid #f5a623',
                  padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                APRI FRESH (bypass cache)
              </button>
            </div>
            <div style={{ marginTop: '16px', color: '#8fa0ae', fontSize: '11px' }}>
              User Agent: {navigator.userAgent}
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </React.StrictMode>
)

// Service worker: skip se ?nosw=1
const params = new URLSearchParams(window.location.search)
const noSW = params.get('nosw') === '1'

if ('serviceWorker' in navigator && !noSW) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}service-worker.js`)
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' })
              }
            })
          }
        })
      })
      .catch((err) => console.warn('Service worker non registrato:', err))
  })

  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NEW_VERSION') {
      console.log('New TIMONE version:', event.data.version)
    }
  })
}

// Capture global errors (outside React)
window.addEventListener('error', (e) => {
  console.error('Global JS error:', e.message, e.filename, e.lineno)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason)
})

// Hide loading screen once React is mounted
window.addEventListener('DOMContentLoaded', () => {
  const loading = document.getElementById('app-loading')
  if (loading) {
    setTimeout(() => {
      loading.style.opacity = '0'
      setTimeout(() => loading.remove(), 300)
    }, 500)
  }
})
