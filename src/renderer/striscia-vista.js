// La striscia viva, la parte che disegna (card del LIVE e proiettore): una riga bassa con le note del ciclo (trattini sottili all'altezza della
// nota, scalata sull'estensione di quel livello; tacche per le batterie), la testina che scorre e, se serve, il misuratore. Il calcolo vero è in
// striscia.js (puro, coi test); qui solo DOM e canvas.
import { estensione, posizioneVerticale } from './striscia.js';

const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};

// { radice, note (canvas), testina, misura, barra, testo }
export function creaStriscia({ misuratore = true } = {}) {
  const radice = el('div', 'striscia-viva');
  const area = el('div', 'sv-note');
  const note = el('canvas');
  const testina = el('div', 'sv-testina');
  area.append(note, testina);
  radice.append(area);
  let misura = null;
  let barra = null;
  let testo = null;
  if (misuratore) {
    misura = el('div', 'sv-misura');
    const b = el('div', 'sv-barra');
    barra = el('i');
    b.append(barra);
    testo = el('span', 'sv-testo', '');
    misura.append(b, testo);
    radice.append(misura);
  }
  return { radice, note, testina, misura, barra, testo, firma: '', larghezza: 0 };
}

// Le note del ciclo sul canvas: si ridisegna solo se cambiano gli eventi o la larghezza (la testina è un elemento a parte).
export function disegnaNote(s, eventi, colore = '159, 194, 58') {
  const cv = s.note;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(cv.clientWidth * dpr);
  const h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  const firma = `${w}x${h}|${JSON.stringify(eventi)}`;
  if (s.firma === firma) return;
  s.firma = firma;
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, w, h);
  // le divisioni del ciclo, appena visibili: sedici passi, i quarti un po' di più
  for (let i = 0; i < 16; i++) {
    c.fillStyle = i % 4 === 0 ? 'rgba(217, 220, 204, 0.16)' : 'rgba(217, 220, 204, 0.06)';
    c.fillRect(Math.round((i * w) / 16), 0, Math.max(1, Math.round(dpr)), h);
  }
  const est = estensione(eventi);
  const spessore = Math.max(1, Math.round(1.5 * dpr)); // trattini sottili
  for (const e of eventi) {
    const y = posizioneVerticale(e, est);
    const forza = Math.max(0.2, Math.min(1, e[3]));
    const x = Math.round(e[0] * w);
    if (e[2] >= 0) {
      c.fillStyle = `rgba(${colore}, ${0.3 + 0.7 * forza})`;
      c.fillRect(x, Math.round(y * (h - spessore)), Math.max(Math.round(2 * dpr), Math.round(e[1] * w) - 1), spessore);
    } else {
      // batteria: una tacca verticale (la cassa in basso, il charleston in alto)
      const alta = Math.round(7 * dpr);
      c.fillStyle = e[2] === -2 ? `rgba(217, 220, 204, ${0.4 + 0.5 * forza})` : `rgba(${colore}, ${0.3 + 0.7 * forza})`;
      c.fillRect(x, Math.round(y * (h - alta)), Math.max(1, Math.round(1.5 * dpr)), alta);
    }
  }
}

// La testina: dove siamo nel ciclo (0..1).
export function muoviTestina(s, frazione) {
  s.testina.style.transform = `translateX(${(Math.max(0, Math.min(1, frazione)) * 100).toFixed(2)}%)`;
}
