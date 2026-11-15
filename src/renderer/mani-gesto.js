// Le mani (sperimentale): dai 21 punti di MediaPipe a «che mano è»: dove sta, quanto è grande, aperta o pugno, quanto sono larghe le dita.
// Modulo puro (lo provano i test). Le coordinate dei punti sono quelle della camera (0..1, y in basso = 1); qui x diventa «a specchio»
// (come la finestrella e come ti vedi allo specchio: la destra del suono è la destra tua). `ar` = larghezza/altezza dell'immagine,
// per misurare le distanze con la stessa unità sui due assi.

// i punti: 0 polso · 4 punta del pollice · 5,9,13,17 base di indice, medio, anulare, mignolo · 8,12,16,20 le loro punte
const PUNTE = [8, 12, 16, 20];
const BASI = [5, 9, 13, 17];
const PALMO = [0, 5, 9, 13, 17];

// Tarate sul video vero di Valerio (15/11/2026): estese = punta/polso rispetto a base/polso: aperta 1.6–2.4, pugno 0.5–1.24, a metà in mezzo;
// dita = punta dell'indice – punta del mignolo in larghezze di palmo (non col pollice, che si muove per conto suo): unite ~1.1, a ventaglio ~2.1.
export const SOGLIE = { apertaMedia: 1.6, apertaMin: 1.35, pugnoMedia: 1.25, ditaMin: 1.05, ditaMax: 2.1 };

const dist = (a, b, ar) => Math.hypot((a[0] - b[0]) * ar, a[1] - b[1]);
const limita = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// punti: [[x, y] × 21] → { centro: [x a specchio, y], dim, forma: 'aperta'|'pugno'|'mista', dita 0..1, estese }
export function analizza(punti, ar = 4 / 3) {
  if (!Array.isArray(punti) || punti.length < 21) return null;
  const dim = dist(punti[0], punti[9], ar);
  if (!(dim > 1e-4)) return null;
  const rapporti = PUNTE.map((p, i) => dist(punti[p], punti[0], ar) / Math.max(1e-4, dist(punti[BASI[i]], punti[0], ar)));
  const media = rapporti.reduce((s, r) => s + r, 0) / rapporti.length;
  const minimo = Math.min(...rapporti);
  const forma = media >= SOGLIE.apertaMedia && minimo >= SOGLIE.apertaMin ? 'aperta' : media <= SOGLIE.pugnoMedia ? 'pugno' : 'mista';
  const cx = PALMO.reduce((s, i) => s + punti[i][0], 0) / PALMO.length;
  const cy = PALMO.reduce((s, i) => s + punti[i][1], 0) / PALMO.length;
  const palmoLargo = Math.max(1e-4, dist(punti[5], punti[17], ar)); // larghezza del palmo: non cambia quando la mano si inclina
  const dita = limita((dist(punti[8], punti[20], ar) / palmoLargo - SOGLIE.ditaMin) / (SOGLIE.ditaMax - SOGLIE.ditaMin));
  return { centro: [1 - cx, cy], dim, forma, dita, estese: media };
}

// La zona (in coordinate a specchio, 0..1): { x, y, w, h }. Di serie tutta l'inquadratura.
export const ZONA_TUTTA = { x: 0, y: 0, w: 1, h: 1 };
export const dentroZona = (centro, zona = ZONA_TUTTA) =>
  centro[0] >= zona.x && centro[0] <= zona.x + zona.w && centro[1] >= zona.y && centro[1] <= zona.y + zona.h;

// Da più mani (liste di punti) alla mia: la più grande tra quelle col centro dentro la zona. null se non ce n'è.
export function scegliMano(mani, zona = ZONA_TUTTA, ar = 4 / 3) {
  let scelta = null;
  for (const punti of mani ?? []) {
    const a = analizza(punti, ar);
    if (!a || !dentroZona(a.centro, zona)) continue;
    if (!scelta || a.dim > scelta.analisi.dim) scelta = { punti, analisi: a };
  }
  return scelta;
}
