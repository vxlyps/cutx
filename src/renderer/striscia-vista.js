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

// Le note del ciclo sul canvas: piano a barre arrotondate (lunghezza = durata, spessore da corsia), griglia leggerissima dei battiti,
// batterie come quadratini su tre corsie. Quelle sotto la testina si accendono (e restano accese un attimo dopo la fine): si ridisegna
// solo quando cambiano gli eventi, la larghezza o l'insieme delle note accese (muoviTestina), mai a ogni fotogramma.
const CODA_ACCESA = 0.06; // quanto resta accesa una nota dopo la fine, in frazione di ciclo

function rettangolo(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const acceso = (e, f) => f >= e[0] - 1e-6 && f <= e[0] + Math.max(e[1], 0.02) + CODA_ACCESA;

function ridisegna(s) {
  const cv = s.note;
  const { w, h, eventi, colore, frazione } = s.disegno;
  const dpr = s.disegno.dpr;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, w, h);
  // i battiti (quarti di ciclo) appena visibili, la battuta un filo di più
  for (let i = 1; i < 16; i++) {
    c.fillStyle = i % 4 === 0 ? 'rgba(217, 220, 204, 0.075)' : 'rgba(217, 220, 204, 0.035)';
    c.fillRect(Math.round((i * w) / 16), 0, Math.max(1, Math.round(dpr)), h);
  }
  const est = estensione(eventi);
  const pad = 3 * dpr;
  const semitoni = est ? Math.max(est[1] - est[0], 1) : 1;
  const spessore = Math.min(6 * dpr, Math.max(3.5 * dpr, ((h - 2 * pad) / (Math.min(semitoni, 12) + 1)) * 1.1));
  const [r, g, b] = colore.split(',').map((x) => Number(x));
  const corsie = { [-3]: h * 0.2, [-2]: h * 0.5, [-1]: h * 0.8 };
  const q = Math.round(4.4 * dpr);
  for (const e of eventi) {
    const forza = Math.max(0.25, Math.min(1, e[3]));
    const su = acceso(e, frazione);
    c.save();
    if (su) {
      c.shadowColor = 'rgba(190, 235, 90, 0.9)';
      c.shadowBlur = 9 * dpr;
    }
    if (e[2] >= 0) {
      const y = Math.max(pad, Math.min(h - pad - spessore, pad + (h - 2 * pad - spessore) * ((posizioneVerticale(e, est) - 0.12) / 0.62)));
      c.fillStyle = su ? 'rgb(219, 239, 118)' : `rgba(${r}, ${g}, ${b}, ${0.28 + 0.5 * forza})`;
      rettangolo(c, e[0] * w, y, Math.max(spessore, e[1] * w - dpr), spessore, spessore / 2);
    } else {
      c.fillStyle = su ? 'rgb(225, 245, 150)' : e[2] === -2 ? `rgba(217, 220, 204, ${0.35 + 0.5 * forza})` : `rgba(${r}, ${g}, ${b}, ${0.28 + 0.5 * forza})`;
      rettangolo(c, e[0] * w, corsie[e[2]] - q / 2, q, q, 1.2 * dpr);
    }
    c.fill();
    c.restore();
  }
}

export function disegnaNote(s, eventi, colore = '159, 194, 58') {
  const cv = s.note;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(cv.clientWidth * dpr);
  const h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return;
  const firma = `${w}x${h}|${colore}|${JSON.stringify(eventi)}`;
  if (s.firma === firma) return;
  s.firma = firma;
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  s.disegno = { w, h, dpr, eventi, colore, frazione: s.disegno?.frazione ?? -1 };
  s.accese = null;
  ridisegna(s);
}

// La testina: dove siamo nel ciclo (0..1). Le note che si accendono o si spengono fanno ridisegnare il canvas.
export function muoviTestina(s, frazione) {
  const f = Math.max(0, Math.min(1, frazione));
  s.testina.style.transform = `translateX(${(f * 100).toFixed(2)}%)`;
  const d = s.disegno;
  if (!d) return;
  const accese = d.eventi.map((e, i) => (acceso(e, f) ? i : -1)).filter((i) => i >= 0).join(',');
  if (accese === s.accese) return;
  s.accese = accese;
  d.frazione = f;
  ridisegna(s);
}
