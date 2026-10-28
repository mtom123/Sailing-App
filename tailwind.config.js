/** @type {import('tailwindcss').Config} */

/* ============================================================
   TIMONE v2 — Marine Ops Design System
   Palette: deep navy + phosphor teal (leggero, leggibile al sole)
   Tipografia: Inter UI, JetBrains Mono dati

   Tailwind 3 (non 4): Safari 15 non supporta @layer e color-mix().
   Gli stessi valori sono esposti come variabili CSS (--color-*,
   --font-*, --radius-*, --shadow-*) per globals.css.
   ============================================================ */

const colors = {
  /* Surfaces — profondità del mare */
  abyss: '#0a1620',
  deep: '#0e1d2a',
  surface: '#122a3a',
  raised: '#16323f',
  line: '#1f3a4d',
  'line-bright': '#2c4d63',

  /* Alias per compatibilità con vecchi componenti v1 */
  ink: '#0a1620',
  panel: '#122a3a',

  /* Foreground */
  paper: '#e8f0f5',
  fog: '#8fa0ae',
  'fog-dim': '#5d6e7a',

  /* Azioni */
  phos: '#5ee6c8',
  'phos-dim': '#2a8a76',
  warn: '#f5a623',
  danger: '#ff5252',
  info: '#4a9eff',

  /* Alias per compatibilità con vecchi componenti v1 */
  phosdim: '#2a8a76',

  /* Bathymetry */
  'bathy-deep': '#0d2438',
  'bathy-mid': '#1a4566',
  'bathy-shallow': '#2e7a9e',
  'bathy-reef': '#d97757',
  'bathy-shoal': '#ff8c42',
}

const fontFamily = {
  ui: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
}

const borderRadius = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '18px',
}

/* Shadows — soft, per pannelli galleggianti */
const boxShadow = {
  panel: '0 8px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(46, 122, 158, 0.08)',
  hud: '0 4px 20px rgba(0, 0, 0, 0.4)',
  glow: '0 0 20px rgba(94, 230, 200, 0.3)',
}

const cssVar = (prefix, values) =>
  Object.fromEntries(
    Object.entries(values).map(([k, v]) => [`--${prefix}-${k}`, Array.isArray(v) ? v.map((f) => (f.includes(' ') ? `'${f}'` : f)).join(', ') : v])
  )

export default {
  // relative: percorsi rispetto a questo file, non alla cartella da cui si lancia Vite
  content: { relative: true, files: ['./index.html', './src/**/*.{js,jsx}'] },
  future: {
    // Come Tailwind 4: hover: solo su dispositivi con puntatore (niente hover "appiccicoso" su iPad)
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors,
      fontFamily,
      borderRadius,
      boxShadow,
      // Come Tailwind 4: bordi senza colore esplicito usano currentColor
      borderColor: { DEFAULT: 'currentColor' },
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ':root': {
          ...cssVar('color', colors),
          ...cssVar('font', fontFamily),
          ...cssVar('radius', borderRadius),
          ...cssVar('shadow', boxShadow),
        },
      }),
  ],
}
