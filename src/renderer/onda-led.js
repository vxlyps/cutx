// L'onda LED sotto la batteria (card del LIVE e proiettore): colonne di puntini come l'insegna TECNOLOGIA CANAGLIA, accese dal centro
// col suono vero del livello. Ogni colonna è un punto fisso del ciclo (da sinistra a destra) e si riscrive a ogni giro: le casse
// diventano colonne alte al loro posto nella battuta. I picchi arrivano dal motore live (messaggio «onde», ~30 al secondo).
// Parte pura (MemoriaOnda, altezza): la provano i test. disegnaLed tocca solo il canvas che le si dà.

export const RISOLUZIONE = 256; // quante celle tiene la memoria per ciclo (la vista ne raggruppa più in una colonna)

// Da picco (0..1) ad altezza della colonna (0..1): scala in dB, 0 dB = piena, -48 dB = spenta. I colpi piccoli si vedono lo stesso.
export function altezza(picco) {
  if (!(picco > 0)) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(picco) + 48) / 48));
}

export class MemoriaOnda {
  constructor(n = RISOLUZIONE) {
    this.n = n;
    this.valori = new Float32Array(n); // picco 0..1 di ogni cella
    this.giro = new Float64Array(n).fill(-Infinity); // il ciclo (intero) in cui la cella è stata scritta
    this.scritta = new Float64Array(n).fill(-Infinity); // quando (in cicli) è stata scritta l'ultima volta
  }

  // picchi 0..255, dal più vecchio; l'ultimo finisce al ciclo `ciclo`; passo = quanti cicli copre ogni picco.
  aggiungi(ciclo, passo, picchi) {
    if (!Number.isFinite(ciclo) || !(passo > 0) || !picchi?.length) return;
    for (let k = 0; k < picchi.length; k++) {
      const t = ciclo - (picchi.length - 1 - k) * passo; // la fine del pezzo k
      const giro = Math.floor(t);
      const i = Math.min(this.n - 1, Math.floor((t - giro) * this.n));
      const v = Math.max(0, Math.min(1, picchi[k] / 255));
      // un giro nuovo cancella quello vecchio; nello stesso giro vince il più forte
      this.valori[i] = this.giro[i] < giro ? v : Math.max(this.valori[i], v);
      this.giro[i] = giro;
      this.scritta[i] = t;
    }
  }

  // Le altezze (0..1) di `colonne` colonne al ciclo `ciclo`. Una cella che non si riscrive da più di un giro si spegne piano
  // (il livello è fermo o i messaggi non arrivano): mai puntini accesi fermi a metà.
  colonne(colonne, ciclo) {
    const out = new Float32Array(colonne);
    for (let c = 0; c < colonne; c++) {
      const da = Math.floor((c * this.n) / colonne);
      const a = Math.max(da + 1, Math.floor(((c + 1) * this.n) / colonne));
      let v = 0;
      for (let i = da; i < a; i++) {
        const eta = ciclo - this.scritta[i];
        const resta = eta <= 1.05 ? 1 : Math.max(0, 1 - (eta - 1.05) * 4);
        v = Math.max(v, altezza(this.valori[i]) * resta);
      }
      out[c] = v;
    }
    return out;
  }
}

// I puntini spenti (fondo dell'insegna) si disegnano una volta per misura e si ricopiano: il canvas lavora solo per quelli accesi.
const fondi = new Map();
function fondo(w, h, passo, r) {
  const chiave = `${w}x${h}|${passo}`;
  if (!fondi.has(chiave)) {
    if (fondi.size > 12) fondi.delete(fondi.keys().next().value);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#0a0d06';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a2010';
    for (let x = passo / 2; x < w; x += passo) {
      for (let y = passo / 2; y < h; y += passo) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    fondi.set(chiave, cv);
  }
  return fondi.get(chiave);
}

// Disegna le colonne sul canvas. passo = distanza tra i puntini in px CSS (postazione 5, proiettore più grande).
// Il bagliore: ogni puntino acceso ha sotto un cerchio più largo e trasparente (niente shadowBlur, che costa troppo a 30 fotogrammi).
export function disegnaLed(cv, memoria, ciclo, passoCss = 5) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(cv.clientWidth * dpr);
  const h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  const passo = passoCss * dpr;
  const r = passo * 0.3;
  const g = cv.getContext('2d');
  g.drawImage(fondo(w, h, passo, r), 0, 0);
  if (!memoria) return;
  const colonne = Math.floor(w / passo);
  const righe = Math.floor(h / passo);
  if (!colonne || !righe) return;
  const alte = memoria.colonne(colonne, ciclo);
  const centro = righe / 2;
  for (const [raggio, colore] of [[r * 2.4, 'rgba(159, 194, 58, 0.16)'], [r, '#9fc23a']]) {
    g.fillStyle = colore;
    g.beginPath();
    for (let c = 0; c < colonne; c++) {
      const v = alte[c];
      if (v <= 0) continue;
      const x = c * passo + passo / 2;
      for (let y = 0; y < righe; y++) {
        if (Math.abs(y + 0.5 - centro) / centro > v * 1.02) continue;
        const cy = y * passo + passo / 2;
        g.moveTo(x + raggio, cy);
        g.arc(x, cy, raggio, 0, Math.PI * 2);
      }
    }
    g.fill();
  }
}
