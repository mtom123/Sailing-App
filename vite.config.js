import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tailwind 3 via postcss.config.js
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // Safari 15 compat; es2020 per MapLibre (Carta TIMONE), che usa i BigInt
    target: ['es2020', 'safari15'],
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'icons': ['lucide-react'],
          'leaflet': ['leaflet'],
        },
      },
    },
  },
})
