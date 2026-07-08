/**
 * Web Worker per weather routing isocrone.
 *
 * Perché un worker? L'algoritmo isocrone fa 24 direzioni × N iterazioni × land mask check.
 * Per rotte mediterranee lunghe (>20nm) può richiedere 5-30 secondi → bloccherebbe la UI.
 * Nel worker: UI resta fluida a 60fps mentre il routing calcola in background.
 */

import { computeRouteOptions } from '../routing/isochroneEngine.js'

self.onmessage = (e) => {
  const { id, opts } = e.data
  if (!opts) return

  try {
    const t0 = Date.now()
    const result = computeRouteOptions(opts)
    const duration = Date.now() - t0

    self.postMessage({
      id,
      type: 'success',
      result,
      duration,
    })
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      error: err.message,
      stack: err.stack,
    })
  }
}
