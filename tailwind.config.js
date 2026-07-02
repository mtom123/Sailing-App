/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0D0D0D',
        panel: '#121212',
        raised: '#181818',
        line: '#2A2A2A',
        phos: '#3DFF7A',
        phosdim: '#1E7A43',
        warn: '#FFC933',
        danger: '#FF4545',
        fog: '#9BA0A6',
        paper: '#F2F2F2',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
