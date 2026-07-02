import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Base relativa: la PWA funziona sia su dominio proprio sia su
  // GitHub Pages (https://<utente>.github.io/Sailing-App/)
  base: './',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2019',
    sourcemap: false,
  },
})
