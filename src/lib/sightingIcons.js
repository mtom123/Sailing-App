/*
 * Sagome delle specie viste di lato (testa a sinistra) su quadro 24×24, in
 * bianco; i dettagli scuri distinguono le specie simili. Le tartarughe sono
 * viste dall'alto.
 */

const DARK = '#0a1620'
const solid = (d) => `<path d="${d}" fill="#fff"/>`
const white = (d, w = 1.8) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const dark = (d, w = 1.3) => `<path d="${d}" fill="none" stroke="${DARK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const eye = (x, y, r = 0.8) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${DARK}"/>`
const small = (svg, k) => `<g transform="translate(${12 * (1 - k)} ${12 * (1 - k)}) scale(${k})">${svg}</g>`

const DOLPHIN = solid('M1.5 13.4c1.3-.1 2.6-.8 4-1.6C8.4 10 11.3 9 14.2 9.6l1-3.4 1.4 4.3c1.4.6 2.6 1.1 3.6.6l2.3-1.8-.7 3 1 2.4-3-.9c-2 1.8-5 3.4-9.2 3.1-2.8-.2-5-1.2-6.2-2-1 .1-2.2-.2-2.9-1.5z')
const BALEEN = solid('M1 12.6c3-2.2 7-3 11-2.8l3-.6-.9 1.2c2.2.3 4.4.6 6.3-.8l2.4-1.2-.8 2.8 1 2.4-2.9-.8c-2.6 1.6-6 2.7-10.6 2.6-3.6-.1-6.7-1.1-8.5-2.8z')
const ROUND = solid('M1.6 12c0-2.1 1.5-3.4 3.6-3.4 1.2 0 2 .4 3 .4 1.5-.4 3-.8 4.4-.8l.9-2.2 2 2.9c1.4.4 2.6 1 3.7.5l2.3-1.6-.7 3 1 2.4-3-.9c-2 1.8-4.7 3-8.2 3-3.4 0-6.2-.8-7.6-2.2-.9-.8-1.4-1.4-1.4-1.1z')
const BEAKED = solid('M1.2 12.8l3.6-1c2.5-1.7 6-2.6 9.4-2.2l2.4-1.8.2 2.3c1 .4 2 .6 3-.1l2.2-1.4-.8 2.7 1.1 2.4-3-.8c-2.4 1.8-5.5 3.2-9 3-3-.1-5.4-1.2-6.5-2.3z')
const SHARK = solid('M1.2 13.2c3-2.2 7-3.2 10.4-3l2.4-4.6.9 4.9c2 .5 3.6.8 5-.2l2.8-3.4-.7 4.6 1.2 3.8-2.8-2.3c-2 1.4-4.2 2.4-6.5 2.6l-1.8 2.8-.8-2.6c-4.2.3-7.6-.6-10.1-2.6z')
const TURTLE = (head) => `${solid('M12 6.5c3.6 0 6 2.8 6 6.3S15.6 19.5 12 19.5s-6-3.2-6-6.7 2.4-6.3 6-6.3z')}<circle cx="12" cy="4.6" r="${head}" fill="#fff"/>${white('M6.8 9L3 6.5M17.2 9L21 6.5M7.2 17l-3 2.5M16.8 17l3 2.5', 2.2)}`

export const SPECIES_GLYPHS = {
  's-fin': BALEEN + eye(5, 12.2),
  's-sperm': solid('M1.6 9.2c0-1 1-1.7 2.5-1.7h7.4c3.5 0 6 1.6 8 2.6l2.4-1.4-.6 2.9 1.1 2.3-3-.6c-2.5 1.6-5.5 2.7-9 2.7-3.6 0-6.4-.7-7.6-2.2-.9-1.3-1.2-3.1-1.2-4.6z') + eye(6, 11.6),
  's-cuvier': BEAKED + eye(6, 12),
  's-pilot': ROUND + eye(5.2, 11.2),
  's-risso': ROUND + dark('M6 10.5l1.6 3M9 10l1.2 3.6M12 10.2l.8 3.4', 1) + eye(4.2, 11),
  's-bottlenose': DOLPHIN + eye(6.4, 12.4),
  's-striped': DOLPHIN + dark('M5.5 13.6c3.6 1 8 .6 12.4-2'),
  's-common': DOLPHIN + dark('M7.5 12.4l3.4 2.6 3.4-2.6'),
  's-roughtoothed': DOLPHIN + white('M.6 13.8l3-.6', 1.6) + dark('M5.5 12.6c.6.8 1.4 1.2 2.2 1.3'),
  's-orca': solid('M1.6 12c0-2.1 1.5-3.4 3.6-3.4 1.2 0 2 .4 3 .4 1-.3 2-.5 3-.6l1.2-6.2 2.8 6.9c1.4.4 2.6 1 3.7.5l2.3-1.6-.7 3 1 2.4-3-.9c-2 1.8-4.7 3-8.2 3-3.4 0-6.2-.8-7.6-2.2-.9-.8-1.1-1-1.1-1.3z') + `<ellipse cx="6.2" cy="10.8" rx="1.5" ry=".8" fill="${DARK}"/>` + dark('M14.5 11.5c.8 1 .8 2 0 3', 1.2),
  's-falsekiller': BEAKED + solid('M11.5 10l1.8-4 1 4.3z') + dark('M4.8 13.6c1.6.4 3 .3 4.2-.3'),
  's-minke': small(BALEEN, 0.82) + dark('M8.5 13.2l2.2 1.8', 1.6),
  's-humpback': BALEEN + white('M7.5 14.5l-3.5 6', 2.2),
  's-porpoise': small(ROUND.replace('l.9-2.2 2 2.9', 'l2-3.2 1.4 3.2'), 0.72),
  's-cetacean': solid('M12 21.5c-.4-3.5-.4-6.5.1-8.6C9.8 12.4 6.6 10.2 5.6 5c2.3 1 4.6 1.4 6.5 3.2 2-1.8 4.2-2.2 6.5-3.2-1 5.2-4.2 7.4-6.5 7.9.5 2.1.5 5.1-.1 8.6z'),
  's-loggerhead': TURTLE(2.6) + dark('M12 8v9'),
  's-green': TURTLE(1.7) + dark('M8.5 10.5h7M8 14h8M12 7.8v9.5'),
  's-leatherback': TURTLE(2) + dark('M9.4 7.8v10M12 7.2v11.5M14.6 7.8v10'),
  's-blue': SHARK + white('M8 14.5l-3 3.5', 2) + eye(4.5, 12.8, 0.7),
  's-basking': SHARK + dark('M2.5 13.5c1.6-.6 3-.6 4 0', 2) + dark('M8 11.2v3M9.4 11v3.2M10.8 11v3.2', 0.9),
  's-mako': SHARK + dark('M2.4 13.6l3 .2') + eye(5, 12.4, 0.7),
  's-thresher': solid('M1.2 14c2.5-2 6-2.9 9-2.7l2-3.6.9 3.8c1.6.4 3 .6 4-.2l6-8.3-3.5 10-1.2 1.6c-1.8 1.2-3.6 2-5.5 2.2l-1.5 2.4-.8-2.2c-3.8.3-7-.7-9.4-3z') + eye(4.4, 13.2, 0.7),
  's-sandbar': solid('M1.2 13.4c3-2.2 7-3.2 9.4-3.2l1.8-7 2.4 7.6c2 .5 3.6.8 5-.2l2.8-3.4-.7 4.6 1.2 3.8-2.8-2.3c-2 1.4-4.2 2.4-6.5 2.6l-1.8 2.8-.8-2.6c-4.2.3-7.6-.6-10-2.7z') + eye(4.5, 12.8, 0.7),
  's-sixgill': SHARK + dark('M6.8 11.6v2.6M7.9 11.4v2.8M9 11.2v3M10.1 11.2v3', 0.7),
  's-white': solid('M1 13.6c2.4-3 6.6-4.8 10.4-4.8l2.2-3.6 1 4c2 .6 3.6 1 5 0l2.8-3.2-.7 4.6 1.2 3.8-2.8-2.3c-2 2-4.6 3.6-7.6 3.8l-1.8 2.6-.8-2.5c-4 0-7-1-9-4.4z') + eye(4.6, 12.4, 0.8) + dark('M2.2 14.2c1.2.6 2.8.6 4 0'),
  's-hammerhead': SHARK + white('M4.6 8v10', 2.6),
  's-shark': solid('M4 16.5C7 15 9.5 10 12.5 5c1.5 4 3.5 8.5 7 11.5z') + white('M2 19.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0', 2),
}

/** Delfino bianco del pulsante sulla carta. */
export const DOLPHIN_BUTTON = `<svg viewBox="0 0 24 24" width="20" height="20">${DOLPHIN}</svg>`
