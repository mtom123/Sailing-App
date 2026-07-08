import { Component } from 'react'

/**
 * ErrorBoundary per MapLibre: se WebGL non supportato o la mappa
 * fallisce il render (es. iOS Safari in alcune condizioni),
 * mostra fallback con messaggio + alternative info.
 */
export default class MapErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('MapErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-abyss p-6 text-center">
          <div className="max-w-md">
            <div className="text-4xl mb-3">🗺️</div>
            <div className="text-lg font-bold text-paper mb-2">
              Mappa non disponibile
            </div>
            <div className="text-xs text-fog mb-4">
              Il tuo browser non supporta WebGL o ha disattivato l'accelerazione hardware.
              TIMONE funziona comunque con strumenti, weather routing e timeline.
            </div>
            <div className="text-[10px] text-fog-dim">
              Errore: {this.state.error?.message || 'unknown'}
            </div>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 rounded-md border border-phos bg-phos/10 px-4 py-2 text-xs font-semibold text-phos touch"
            >
              RIPROVA
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
