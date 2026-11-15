// Demo della cimice su parole finte: serve solo a vederla muoversi. In CUTX i dati vengono dal set vero.
import { creaCimice } from './cimice.js';

const CODICE = `// BEAT · 909 sporco
$: s("bd*4, ~ sd ~ sd, hh*8")
  .bank("RolandTR909").gain(0.9)
  .lpf(sine.range(400, 4000).slow(8))

// BASSO
$: note("c2 [~ eb2] g1 bb1")
  .s("sawtooth").lpf(600).room(0.2)
  .transpose(1).fast(2)

// ACCORDI
$: n("<0 3 5 7>").scale("f:minor")
  .s("square").detune(0.12).delay(0.36)
  .phaser(0.1).attack(0.024).release(0.29)

// CLIP
$: note("2 1 0 4").s("square").fast(4)
  .cutoff(1225).resonance(7.9).shape(0.38)
`;
const pre = document.getElementById('codice');
pre.textContent = CODICE;

// Le parole: ogni pezzo di testo senza spazi, misurato col Range (come farà l'editor vero)
function leggiParole() {
  const sc = document.getElementById('scena').getBoundingClientRect();
  const nodo = pre.firstChild;
  const testo = nodo.nodeValue;
  const font = getComputedStyle(pre).font;
  const out = [];
  const re = /\S+/g;
  let mm;
  const r = document.createRange();
  while ((mm = re.exec(testo))) {
    r.setStart(nodo, mm.index); r.setEnd(nodo, mm.index + mm[0].length);
    const b = r.getBoundingClientRect();
    out.push({ x: b.left - sc.left, y: b.top - sc.top, w: b.width, h: b.height, testo: mm[0], font, salta: !/[a-z0-9]/i.test(mm[0]) });
  }
  return out;
}

const c = creaCimice({ contenitore: document.getElementById('scena'), leggiParole, opzioni: { disegnaNote: true } });
c.avvia();
addEventListener('resize', () => c.ricalcola());
document.fonts?.ready.then(() => c.ricalcola());

// Clock finto: 120 BPM, sedicesimi
let k = 0;
const STEP = 60000 / 120 / 4;
let prossimo = performance.now() + 300;
function tic() {
  const now = performance.now();
  while (now >= prossimo) {
    if (k % 16 === 0) c.battuta({});
    // le note finte che "suonano": qualche parola a caso, di più sui battiti
    const ps = c.parole.filter((p) => !p.salta && p.vis);
    const n = k % 4 === 0 ? 4 : 1;
    for (let i = 0; i < n && ps.length; i++) c.accendi(ps[Math.floor(Math.random() * ps.length)], 1);
    c.passo(k);
    k++; prossimo += STEP;
  }
  document.getElementById('stato').textContent = c.presente ? (c.folle ? 'impazzita' : 'in giro') : 'nascosta';
  requestAnimationFrame(tic);
}
tic();

const $ = (id) => document.getElementById(id);
$('entra').onclick = () => c.evoca();
$('via').onclick = () => c.congeda();
$('drop').onclick = () => c.battuta({ drop: true });
$('var').onclick = () => c.battuta({ variazione: true });
$('lampi').onchange = (e) => c.imposta({ lampi: e.target.checked });
$('corr').onchange = (e) => c.imposta({ corrompe: e.target.checked });
$('scala').oninput = (e) => c.imposta({ scala: Number(e.target.value) });
