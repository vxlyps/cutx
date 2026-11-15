// La mano sul proiettore (sperimentale): solo lo scheletro — i 21 punti e le linee tra le giunture — mai l'immagine della camera.
// Verde marcio col bagliore, sottile; a destra, nell'angolo dove c'è l'insegna (che si spegne finché la mano si vede), senza riquadro. Il pubblico vede come la camera:
// niente specchio (la postazione, invece, è a specchio).
//   prima dell'aggancio: grigia e tenue (con l'anello che si riempie) · agganciata: verde piena con un piccolo anello
//   mano persa: verde un po' più spenta, il valore fermo · bloccata (pugno): ferma e spenta.
// Sotto la mano solo i numeri (niente nomi di modi). Ci arrivano solo i punti (leggeri), ~20 volte al secondo. Compare quando la mano entra, sparisce dissolvendo quando esce.
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

// Da un punto della camera (x, y in 0..1) a un punto del disegno (px): scala UGUALE sui due assi (x conta ar volte l'altezza), l'area
// mostrata (la zona, o tutta l'inquadratura) centrata e contenuta nel disegno. La forma della mano non si stira mai.
export function geometria(ar, zona, w, h) {
  const z = zona ?? { x: 0, y: 0, w: 1, h: 1 };
  const a = ar > 0 ? ar : 4 / 3;
  const scala = Math.min(w / (z.w * a), h / z.h);
  const ox = (w - z.w * a * scala) / 2;
  const oy = (h - z.h * scala) / 2;
  return { scala, punto: ([x, y]) => [ox + (x - z.x) * a * scala, oy + (y - z.y) * scala] };
}

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
    this.radice.parentElement?.classList.toggle('mano-dentro', dentro); // l'insegna e il gatto si spengono finché la mano si vede
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
    const p = this.fermi ?? d.punti;
    // La mano com'è: i punti sono in coordinate della camera (x e y sono 0..1 di larghezza e altezza, che non sono la stessa lunghezza):
    // si portano alla stessa unità (x × ar) e si disegnano con UNA scala sola, così la forma non si stira mai. L'area che si vede è la zona
    // (o tutta l'inquadratura), centrata nello spazio libero e senza nessun riquadro: se la mano si muove su e giù si vede muoversi.
    const { punto: pt } = geometria(d.ar, d.zona, w, h);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = `rgba(${s.colore}, ${s.alfa})`;
    g.fillStyle = `rgba(${s.colore}, ${s.alfa})`;
    g.shadowColor = `rgba(${MARCIO}, ${0.85 * s.bagliore})`;
    g.shadowBlur = 8 * unita * s.bagliore;
    g.lineWidth = 2 * unita;
    g.beginPath();
    for (const [a, b] of OSSA) {
      const [x0, y0] = pt(p[a]);
      const [x1, y1] = pt(p[b]);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }
    g.stroke();
    for (const q of p) {
      const [x, y] = pt(q);
      g.beginPath();
      g.arc(x, y, 2.6 * unita, 0, Math.PI * 2);
      g.fill();
    }
    // l'anello sul palmo: si riempie prima dell'aggancio, poi resta pieno e piccolo
    if (s.anello) {
      const [cx, cy] = pt([[0, 5, 9, 13, 17].reduce((a, i) => a + p[i][0], 0) / 5, [0, 5, 9, 13, 17].reduce((a, i) => a + p[i][1], 0) / 5]);
      const frazione = s.anello === 'pieno' ? 1 : Math.max(0, Math.min(1, d.progresso ?? 0));
      if (frazione > 0.02) {
        g.shadowBlur = 6 * unita * s.bagliore;
        g.lineWidth = 2 * unita;
        g.beginPath();
        g.arc(cx, cy, 11 * unita, -Math.PI / 2, -Math.PI / 2 + frazione * Math.PI * 2);
        g.stroke();
      }
    }
    g.shadowBlur = 0;
  }
}
