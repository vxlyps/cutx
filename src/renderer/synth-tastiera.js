// La tastiera del Mac come tastiera di pianoforte: A S D F G H J K bianchi, W E T Y U neri (e L ; O P per salire), Z e X cambiano ottava.
// Modulo puro: lo provano i test.
const BIANCHI = { KeyA: 0, KeyS: 2, KeyD: 4, KeyF: 5, KeyG: 7, KeyH: 9, KeyJ: 11, KeyK: 12, KeyL: 14, Semicolon: 16 };
const NERI = { KeyW: 1, KeyE: 3, KeyT: 6, KeyY: 8, KeyU: 10, KeyO: 13, KeyP: 15 };
export const OTTAVA_INIZIALE = 3; // il tasto A è il do 3 (midi 48, come c3 in Strudel)
export const OTTAVA_MIN = -1;
export const OTTAVA_MAX = 7;

// Il tasto (event.code) → numero midi con quell'ottava, o null se non è un tasto del piano.
export function notaDaTasto(code, ottava = OTTAVA_INIZIALE) {
  const gradi = BIANCHI[code] ?? NERI[code];
  if (gradi === undefined) return null;
  const n = (ottava + 1) * 12 + gradi;
  return n >= 0 && n <= 127 ? n : null;
}

// Z scende e X sale di un'ottava; altri tasti non cambiano niente (null).
export function ottavaDopo(code, ottava) {
  if (code === 'KeyZ') return Math.max(OTTAVA_MIN, ottava - 1);
  if (code === 'KeyX') return Math.min(OTTAVA_MAX, ottava + 1);
  return null;
}

// Un tasto premuto che scrive in un campo di testo non è una nota.
export function inCampoDiTesto(el) {
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"], .cm-editor');
}
