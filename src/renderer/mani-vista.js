// La finestrella delle mani (sperimentale), nella colonna a sinistra, solo mentre il riconoscimento è acceso: l'immagine piccola della
// camera (a specchio) con lo scheletro della mano disegnato sopra, una barra col valore del filtro e la scritta MANO ON.
// Solo disegno: i numeri arrivano da mani-client.js (la mano) e da mani-filtro.js (il filtro).
import it from './testi/it.json';

const T = it.mani;
// i collegamenti dello scheletro (le 21 articolazioni di MediaPipe)
const OSSA = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};

export class ManiVista {
  constructor(radice) {
    this.radice = radice;
    this.canvas = el('canvas', 'mani-immagine');
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.sigla = el('span', 'mani-sigla', T.acceso);
    this.valore = el('span', 'mani-valore', '');
    this.barra = el('i');
    const barraEl = el('div', 'mani-barra');
    barraEl.append(this.barra);
    const riga = el('div', 'mani-riga');
    riga.append(this.sigla, this.valore);
    this.nota = el('div', 'mani-nota', '');
    radice.append(this.canvas, barraEl, riga, this.nota);
    this.bitmap = null;
    this.mano = null;
    this.disegnata = false;
    this.mostra(false);
  }

  mostra(si) {
    this.radice.hidden = !si;
    if (!si) {
      this.bitmap?.close?.();
      this.bitmap = null;
      this.mano = null;
      this.barra.style.width = '0%';
      this.nota.textContent = '';
    }
  }

  immagine(jpeg) {
    createImageBitmap(new Blob([jpeg], { type: 'image/jpeg' }))
      .then((b) => {
        this.bitmap?.close?.();
        this.bitmap = b;
        this.richiedi();
      })
      .catch(() => {});
  }

  suMano(m) {
    this.mano = m;
    this.richiedi();
  }

  // Il valore del filtro (da mani-filtro.js): la barra e i Hz. Verde solo mentre la mano comanda davvero il live.
  filtro(r) {
    this.barra.style.width = `${Math.round((r.controlla ? r.altezza : 0) * 100)}%`;
    this.radice.classList.toggle('comanda', r.controlla);
    this.radice.classList.toggle('rilascio', r.rilascio);
    this.valore.textContent = r.controlla ? r.testo : T.nessunaMano;
  }

  stato(s) {
    this.nota.textContent = s.errore ? `${T.errore}: ${s.errore}` : `${s.fps} ${T.fotogrammi} · ${s.ms.toFixed(0)} ms`;
  }

  richiedi() {
    if (this.disegnata) return;
    this.disegnata = true;
    requestAnimationFrame(() => {
      this.disegnata = false;
      this.disegna();
    });
  }

  disegna() {
    const g = this.canvas.getContext('2d');
    const { width: w, height: h } = this.canvas;
    g.fillStyle = '#0a0d06';
    g.fillRect(0, 0, w, h);
    if (this.bitmap) g.drawImage(this.bitmap, 0, 0, w, h);
    const p = this.mano?.visibile ? this.mano.punti : null;
    if (!p) return;
    g.strokeStyle = '#d9dccc';
    g.lineWidth = 1.5;
    g.beginPath();
    for (const [a, b] of OSSA) {
      g.moveTo(p[a][0] * w, p[a][1] * h);
      g.lineTo(p[b][0] * w, p[b][1] * h);
    }
    g.stroke();
    g.fillStyle = '#d9dccc';
    for (const [x, y] of p) g.fillRect(x * w - 1.5, y * h - 1.5, 3, 3);
  }
}
