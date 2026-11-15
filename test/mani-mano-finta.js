// Una mano finta di 21 punti per i test delle mani (non è un test: lo importano gli altri).
// forma: 'aperta' | 'pugno' | 'mista'; x,y = centro del palmo a specchio (0..1); s = grandezza; dita 0..1 = quanto sono larghe.
const BASI = { 5: [-0.45, -0.95], 9: [0, -1], 13: [0.4, -0.95], 17: [0.75, -0.85] };
const SU = { aperta: 0.9, mista: 0.45, pugno: -0.1 }; // quanto la punta sta oltre la base (pugno: ripiegata verso il polso)

export function mano({ x = 0.5, y = 0.5, forma = 'aperta', s = 0.2, dita = 1 } = {}) {
  const l = new Array(21);
  l[0] = [0, 0];
  for (const [i, b] of Object.entries(BASI)) {
    l[i] = b;
    l[Number(i) + 3] = [b[0], b[1] - SU[forma]];
  }
  l[1] = [-0.3, -0.2]; l[2] = [-0.6, -0.35]; l[3] = [-0.8, -0.4];
  l[4] = [-0.5, -0.4];
  l[8][0] -= dita * 0.7; // le dita a ventaglio: indice e mignolo si allontanano
  l[20][0] += dita * 0.7;
  for (const i of [6, 7, 10, 11, 14, 15, 18, 19]) l[i] = [0, -0.5]; // le giunture di mezzo: non servono
  const palmo = [0, 5, 9, 13, 17].map((i) => l[i]);
  const cx = palmo.reduce((a, p) => a + p[0], 0) / 5;
  const cy = palmo.reduce((a, p) => a + p[1], 0) / 5;
  // x grezza della camera = 1 - x a specchio
  return l.map((p) => [1 - x + (p[0] - cx) * s, y + (p[1] - cy) * s]);
}
