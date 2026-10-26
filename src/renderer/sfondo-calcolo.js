// I conti dello sfondo del proiettore, senza disegno né librerie: li provano i test.
export const MODI = ['niente', 'note', 'oscilloscopio'];
export const modoDopo = (modo) => MODI[(MODI.indexOf(modo) + 1) % MODI.length] ?? MODI[0];
export const modoValido = (modo) => (MODI.includes(modo) ? modo : 'niente');

const NOTE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
// «c3», «eb4», «f#2» → numero MIDI (c3 = 48, come in Strudel); null se non è una nota
export function midiDi(nome) {
  const m = /^([a-g])([#bs]*)(-?\d+)?$/i.exec(String(nome).trim());
  if (!m) return null;
  const alterazioni = [...m[2]].reduce((n, x) => n + (x === 'b' ? -1 : 1), 0);
  return NOTE[m[1].toLowerCase()] + alterazioni + ((m[3] === undefined ? 3 : Number(m[3])) + 1) * 12;
}

const CORSIE = { bd: 0, kick: 0, sd: 1, sn: 1, cp: 1, rim: 1, hh: 2, oh: 2, ch: 2, cr: 2, rd: 2 };
export const CORSIE_N = 4;

// Un evento del pattern → dove disegnarlo: una nota (altezza 0–1, 0 il grave) o un colpo di batteria (corsia 0–3).
export function posto(valore) {
  if (!valore || typeof valore !== 'object') return null;
  let midi = null;
  if (typeof valore.note === 'number') midi = valore.note;
  else if (typeof valore.note === 'string') midi = midiDi(valore.note);
  else if (typeof valore.freq === 'number' && valore.freq > 0) midi = 12 * Math.log2(valore.freq / 440) + 69;
  if (Number.isFinite(midi)) return { nota: Math.min(1, Math.max(0, (midi - 36) / 48)) };
  return { corsia: CORSIE[String(valore.s ?? '').toLowerCase()] ?? CORSIE_N - 1 };
}

// Dove comincia l'onda da disegnare: il primo passaggio da negativo a positivo, così la linea sta ferma.
export function inizioOnda(dati, massimo = 256) {
  for (let i = 0; i < Math.min(massimo, dati.length - 1); i++) if (dati[i] <= 0 && dati[i + 1] > 0) return i;
  return 0;
}

