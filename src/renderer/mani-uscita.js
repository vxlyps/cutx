// La mano sul proiettore (sperimentale): solo lo scheletro — i 21 punti e le linee tra le giunture — mai l'immagine della camera.
// Verde marcio col bagliore, sottile; in un angolo fisso in alto (la fascia libera sopra il codice). Il pubblico vede come la camera:
// niente specchio (la postazione, invece, è a specchio).
//   prima dell'aggancio: grigia e tenue (con l'anello che si riempie) · agganciata: verde piena con un piccolo anello
//   mano persa: verde un po' più spenta, il valore fermo · bloccata (pugno): ferma e spenta.
// Sotto la mano solo i numeri e due barrette (niente nomi di modi). Ci arrivano solo i punti (leggeri), ~20 volte al secondo. Compare quando la mano entra, sparisce dissolvendo quando esce.
const OSSA = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const MARCIO = '159, 194, 58';
const GRIGIO = '170, 174, 160';

// Come si vede la mano in ogni fase: colore, trasparenza, bagliore, anello.
export const STILE = {
  libera: { colore: GRIGIO, alfa: 0.42, bagliore: 0, anello: 'riempie' },
  agganciata: { colore: MARCIO, alfa: 1, bagliore: 1, anello: 'pieno' },
  persa: { colore: MARCIO, alfa: 0.7, bagliore: 0.5, anello: null },
  rilascio: { colore: MARCIO, alfa: 0.7, bagliore: 0.5, anello: null },
  bloccata: { colore: MARCIO, alfa: 0.5, bagliore: 0, anello: null },
};

export class ManoUscita {
  // radice: l'elemento (con dentro un canvas e la riga dei valori); u: () => pixel di un'unità della tavola (larghezza/1440)
  constructor({ radice, canvas, valore, u }) {
    this.radice = radice;
    this.canvas = canvas;
    this.valore = valore;
    this.u = u;
    this.dati = null;
    this.fermi = null; // i punti congelati col pugno
    this.pronto = false;
    this.richiesto = false;
  }

  // dati: { punti: [[x, y] × 21] | null, fase, progresso, nome, testo } — null (o punti null) = la mano è uscita.
  aggiorna(dati) {
    const dentro = !!dati?.punti;
    if (dentro) {
      if (dati.fase === 'bloccata') this.fermi ??= dati.punti;
      else this.fermi = null;
      this.dati = dati;
      this.valore.textContent = ['agganciata', 'persa', 'rilascio', 'bloccata'].includes(dati.fase) ? dati.testo ?? '' : '';
    } else this.fermi = null;
    this.radice.classList.toggle('dentro', dentro); // il resto lo fa il CSS: compare e si dissolve
    this.radice.classList.toggle('bloccata', dentro && dati.fase === 'bloccata');
    this.radice.classList.toggle('libera', dentro && dati.fase === 'libera');
    if (dentro) this.richiedi();
  }

  richiedi() {
    if (this.richiesto) return;
    this.richiesto = true;
    requestAnimationFrame(() => {
      this.richiesto = false;
      this.disegna();
    });
  }

  disegna() {
    const d = this.dati;
    if (!d?.punti) return;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    const s = STILE[d.fase] ?? STILE.libera;
    const unita = this.u() * dpr;
    let p = this.fermi ?? d.punti;
    {
      // la mano riempie il riquadro (stessa forma, centrata): si legge anche da lontano
      const xs = p.map((q) => q[0]);
      const ys = p.map((q) => q[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const k = Math.min((0.8 * w) / Math.max(1e-3, (x1 - x0) * w), (0.86 * h) / Math.max(1e-3, (y1 - y0) * h));
      p = p.map(([x, y]) => [0.5 + (x - (x0 + x1) / 2) * k, 0.5 + (y - (y0 + y1) / 2) * k]);
    }
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // la cornice dell'inquadratura, appena accennata: dice dove sta la mano (su e giù è proprio il gesto)
    g.strokeStyle = `rgba(${GRIGIO}, 0.22)`;
    g.lineWidth = 1 * unita;
    g.strokeRect(0.5 * unita, 0.5 * unita, w - unita, h - unita);
    g.strokeStyle = `rgba(${s.colore}, ${s.alfa})`;
    g.fillStyle = `rgba(${s.colore}, ${s.alfa})`;
    g.shadowColor = `rgba(${MARCIO}, ${0.85 * s.bagliore})`;
    g.shadowBlur = 7 * unita * s.bagliore;
    g.lineWidth = 1.5 * unita;
    g.beginPath();
    for (const [a, b] of OSSA) {
      g.moveTo(p[a][0] * w, p[a][1] * h);
      g.lineTo(p[b][0] * w, p[b][1] * h);
    }
    g.stroke();
    for (const [x, y] of p) {
      g.beginPath();
      g.arc(x * w, y * h, 1.7 * unita, 0, Math.PI * 2);
      g.fill();
    }
    // l'anello sul palmo: si riempie prima dell'aggancio, poi resta pieno e piccolo
    if (s.anello) {
      const cx = [0, 5, 9, 13, 17].reduce((a, i) => a + p[i][0], 0) / 5;
      const cy = [0, 5, 9, 13, 17].reduce((a, i) => a + p[i][1], 0) / 5;
      const frazione = s.anello === 'pieno' ? 1 : Math.max(0, Math.min(1, d.progresso ?? 0));
      if (frazione > 0.02) {
        g.shadowBlur = 5 * unita * s.bagliore;
        g.lineWidth = 1.6 * unita;
        g.beginPath();
        g.arc(cx * w, cy * h, 7 * unita, -Math.PI / 2, -Math.PI / 2 + frazione * Math.PI * 2);
        g.stroke();
      }
    }
    g.shadowBlur = 0;
    // i valori: una barretta a destra (il primo, su = più) e una sotto (il secondo); sono quello che la mano sta muovendo
    if (Array.isArray(d.valori) && s.anello !== 'riempie') {
      const [v0, v1] = d.valori;
      const m = 4 * unita;
      g.fillStyle = `rgba(${GRIGIO}, 0.25)`;
      g.fillRect(w - 5 * unita, m, 1.5 * unita, h - 2 * m);
      g.fillRect(m, h - 5 * unita, w - 2 * m, 1.5 * unita);
      g.fillStyle = `rgba(${s.colore}, ${s.alfa})`;
      g.shadowColor = `rgba(${MARCIO}, ${0.85 * s.bagliore})`;
      g.shadowBlur = 5 * unita * s.bagliore;
      g.beginPath();
      g.arc(w - 4.25 * unita, m + (1 - v0) * (h - 2 * m), 2.6 * unita, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(m + v1 * (w - 2 * m), h - 4.25 * unita, 2.6 * unita, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }
  }
}
