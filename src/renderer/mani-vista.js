// La finestrella delle mani (sperimentale), nella colonna a sinistra, solo mentre il riconoscimento è acceso: l'immagine piccola della
// camera (a specchio) con lo scheletro della mano disegnato sopra, il nome del modo, l'anello dell'aggancio e le barre dei due valori.
// Solo disegno: i numeri arrivano da mani-client.js (la mano) e da mani-controllo.js (il controllo).
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
    this.modo = el('div', 'mani-modo', '');
    // l'anello dell'aggancio: si riempie mentre tieni la mano aperta e ferma, poi compare AGGANCIATA
    const NS = 'http://www.w3.org/2000/svg';
    this.anello = document.createElementNS(NS, 'svg');
    this.anello.setAttribute('viewBox', '0 0 40 40');
    this.anello.setAttribute('class', 'mani-anello');
    this.anelloFondo = document.createElementNS(NS, 'circle');
    this.anelloGiro = document.createElementNS(NS, 'circle');
    for (const c of [this.anelloFondo, this.anelloGiro]) {
      c.setAttribute('cx', '20');
      c.setAttribute('cy', '20');
      c.setAttribute('r', '16');
    }
    this.anelloGiro.setAttribute('pathLength', '100');
    this.anelloGiro.setAttribute('stroke-dasharray', '0 100');
    this.anello.append(this.anelloFondo, this.anelloGiro);
    const quadro = el('div', 'mani-quadro');
    quadro.append(this.canvas, this.anello);
    this.sigla = el('span', 'mani-sigla', T.acceso);
    this.valore = el('span', 'mani-valore', '');
    this.barra = el('i');
    this.barra2 = el('i');
    const barraEl = el('div', 'mani-barra');
    barraEl.append(this.barra);
    const barraEl2 = el('div', 'mani-barra piccola');
    barraEl2.append(this.barra2);
    const riga = el('div', 'mani-riga');
    riga.append(this.sigla, this.valore);
    this.nota = el('div', 'mani-nota', '');
    radice.append(this.modo, quadro, barraEl, barraEl2, riga, this.nota);
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
      this.barra2.style.width = '0%';
      this.nota.textContent = '';
      this.anelloGiro.setAttribute('stroke-dasharray', '0 100');
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

  // Lo stato del controllo (da mani-controllo.js): il modo, l'anello, le barre e il valore. Verde solo mentre la mano comanda davvero il live.
  controllo(r, vedeMano) {
    const fase = r.fase;
    this.modo.textContent = r.nomeModo;
    this.barra.style.width = `${Math.round((r.controlla ? r.valori[0] : 0) * 100)}%`;
    this.barra2.style.width = `${Math.round((r.controlla ? r.valori[1] : 0) * 100)}%`;
    this.radice.classList.toggle('comanda', fase === 'agganciata');
    this.radice.classList.toggle('rilascio', fase === 'persa' || fase === 'rilascio');
    this.radice.classList.toggle('bloccata', fase === 'bloccata');
    const riempie = fase === 'libera' || fase === 'bloccata' || fase === 'persa' || fase === 'rilascio';
    this.anelloGiro.setAttribute('stroke-dasharray', `${riempie && vedeMano ? Math.round(r.progresso * 100) : fase === 'agganciata' ? 100 : 0} 100`);
    this.anello.classList.toggle('pieno', fase === 'agganciata');
    this.sigla.textContent = T.fasi[fase === 'libera' && vedeMano ? 'libera' : fase === 'libera' ? 'nessuna' : fase] ?? '';
    this.valore.textContent = r.controlla || fase === 'agganciata' || fase === 'bloccata' ? r.testo : '';
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
