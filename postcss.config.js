import { fileURLToPath } from 'node:url'

export default {
  plugins: {
    // Percorso esplicito: Tailwind 3 altrimenti cerca la config nella cartella da cui si lancia Vite
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
}
