// Lo specchietto del synth: la forma d'onda come la costruiscono le manopole (forma, voci, detune, FM, drive) e la curva del filtro.
// È un disegno calcolato dai numeri del pannello, non l'audio vero: serve a vedere «come si sta scolpendo» il suono. Il calcolo è puro (testabile).

const TAU = Math.PI * 2;

// un periodo di un oscillatore semplice, fase da 0 a 1 → -1…1
function base(forma, fase, pw) {
  const f = fase - Math.floor(fase);
  switch (forma) {
    case 'sine':
      return Math.sin(TAU * f);
    case 'sawtooth':
    case 'supersaw':
      return 2 * f - 1;
    case 'square':
      return f < 0.5 ? 1 : -1;
    case 'pulse':
      return f < pw ? 1 : -1;
    case 'triangle':
      return 4 * Math.abs(f - 0.5) - 1;
    default:
      return 0;
  }
}

// Un numero pseudocasuale fisso (lo stesso a ogni disegno, così il rumore non tremola mentre giri una manopola).
const caso = (i) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// La forma d'onda: `n` campioni su `periodi` periodi. Oscillatore → FM → drive (shape, distort, crush, coarse), come l'ordine del motore.
export function puntiOnda(s, n = 256, periodi = 2, fase0 = 0) {
  const rumore = ['white', 'pink', 'brown', 'crackle'].includes(s.forma);
  const out = new Array(n);
  const voci = s.forma === 'supersaw' ? Math.max(1, s.voci) : 1;
  let marrone = 0;
  for (let i = 0; i < n; i++) {
    const fase = (i / n) * periodi + fase0;
    let v;
    if (rumore) {
      const r = caso(i + Math.floor(fase0 * n / periodi)) * 2 - 1; // il rumore scorre come l'onda
      if (s.forma === 'white') v = r;
      else if (s.forma === 'pink') v = (r + (caso(i + 1000) * 2 - 1) + (caso(i + 2000) * 2 - 1)) / 3;
      else if (s.forma === 'brown') (marrone = Math.max(-1, Math.min(1, marrone + r * 0.15))), (v = marrone);
      else v = caso(i + 500) > 0.93 ? r : 0; // crackle: pochi scoppi
    } else {
      const fm = s.fm > 0 ? s.fm * Math.sin(TAU * fase * (s.fmh || 1)) : 0; // la FM sposta la fase
      v = 0;
      for (let k = 0; k < voci; k++) {
        const scarto = voci > 1 ? (k / (voci - 1) - 0.5) * 2 * s.detune : 0; // semitoni
        const rapporto = 2 ** ((scarto * 8) / 12); // lo scarto è ingrandito (×8): con quello vero le voci in due periodi sembrerebbero una sola
        v += base(s.forma, fase * rapporto + fm / TAU + (voci > 1 ? k * 0.137 : 0), s.pw ?? 0.5);
      }
      v /= voci;
    }
    // drive
    if (s.shape > 0) v = Math.tanh(v * (1 + s.shape * 8)) / Math.tanh(1 + s.shape * 8);
    if (s.distort > 0) v = Math.max(-1, Math.min(1, v * (1 + s.distort)));
    if (s.crush < 16) {
      const liv = 2 ** (s.crush - 1);
      v = Math.round(v * liv) / liv;
    }
    out[i] = v;
  }
  if (s.coarse > 1) for (let i = 0; i < n; i++) out[i] = out[i - (i % s.coarse)];
  return out;
}

// La risposta del filtro in dB alle frequenze date. 12db: 2 poli; 24db e ladder: 4 poli (la curva si somma).
export function curvaFiltro(s, freqs, cutoff = s.cutoff) {
  const poli = s.ftype === '12db' ? 1 : 2;
  const q = Math.max(0.1, s.q ?? 1);
  return freqs.map((f) => {
    const x = f / cutoff;
    let m;
    if (s.tipo === 'hpf') m = (x * x) / Math.sqrt((1 - x * x) ** 2 + (x / q) ** 2);
    else if (s.tipo === 'bpf') m = (x / q) / Math.sqrt((1 - x * x) ** 2 + (x / q) ** 2);
    else m = 1 / Math.sqrt((1 - x * x) ** 2 + (x / q) ** 2);
    return 20 * Math.log10(Math.max(1e-6, m ** poli));
  });
}

// Un LFO di Strudel (0…1) al tempo `t` in cicli: sine, tri, saw, square, perlin (a caso ma dolce). Puro, si prova coi test.
export function lfo(forma, t) {
  const f = t - Math.floor(t);
  switch (forma) {
    case 'tri':
      return 1 - Math.abs(2 * f - 1);
    case 'saw':
      return f;
    case 'square':
      return f < 0.5 ? 0 : 1;
    case 'perlin': {
      const a = caso(Math.floor(t));
      const b = caso(Math.floor(t) + 1);
      const u = f * f * (3 - 2 * f);
      return a + (b - a) * u;
    }
    default:
      return 0.5 - 0.5 * Math.cos(TAU * f); // sine di Strudel: 0…1
  }
}

// Il cutoff adesso: il valore delle manopole mosso dagli LFO che lo guidano (come la riga `.lpf(sine.range(lo, hi).slow(n))`: l'ultimo vince).
// `cicli` = il tempo in cicli del brano; `cutoff` il valore a riposo.
export function cutoffAdesso(s, cicli) {
  let c = s.cutoff;
  for (const n of [1, 2]) {
    if (s[`mod${n}dest`] !== 'cutoff') continue;
    const d = s[`mod${n}depth`];
    const lo = Math.max(F_MIN, Math.round(s.cutoff * 2 ** (-3 * d)));
    const hi = Math.min(F_MAX, Math.round(s.cutoff * 2 ** (3 * d)));
    c = lo + (hi - lo) * lfo(s[`mod${n}forma`], cicli / Number(s[`mod${n}rate`] || 1));
  }
  return c;
}

const F_MIN = 20;
const F_MAX = 20000;
const DB_MIN = -48;
const DB_MAX = 24;

export class Specchietto {
  constructor(contenitore) {
    this.r = document.createElement('div');
    this.r.className = 'synth-specchietto';
    this.onda = this.canvas('onda', 'forma d’onda');
    this.filtro = this.canvas('filtro', 'filtro');
    contenitore.append(this.r);
    this.chiave = '';
    this.s = null;
    this.giro = 0; // l'animazione: parte quando la vista SYNTH è aperta, si ferma quando si chiude
    this.t0 = 0;
    this.ultimo = 0;
  }

  // L'onda scorre e il filtro segue gli LFO, a ~30 immagini al secondo e solo se si vede. `cicloSec`: quanto dura un ciclo del brano (il tempo vero lo dà il live).
  anima(on, cicloSec = () => 2) {
    this.cicloSec = cicloSec;
    if (!on) {
      cancelAnimationFrame(this.giro);
      this.giro = 0;
      return;
    }
    if (this.giro) return;
    this.t0 = performance.now();
    const passo = (ora) => {
      this.giro = requestAnimationFrame(passo);
      if (ora - this.ultimo < 33 || !this.s || !this.r.offsetWidth || document.hidden) return;
      this.ultimo = ora;
      this.frame(this.s, (ora - this.t0) / 1000);
    };
    this.giro = requestAnimationFrame(passo);
  }

  frame(s, t) {
    const stile = getComputedStyle(this.r);
    const col = { testo: stile.getPropertyValue('--testo').trim() || '#d9dccc', linea: stile.getPropertyValue('--linea').trim() || '#222', spento: stile.getPropertyValue('--spento').trim() || '#666' };
    this.disegnaOnda(s, col, t);
    this.disegnaFiltro(s, col, t);
  }

  canvas(classe, titolo) {
    const w = document.createElement('div');
    w.className = `specchietto-blocco ${classe}`;
    const t = document.createElement('span');
    t.className = 'lbl';
    t.textContent = titolo;
    const c = document.createElement('canvas');
    c.className = 'specchietto-canvas';
    w.append(t, c);
    this.r.append(w);
    return c;
  }

  // Ridisegna (solo se qualcosa è cambiato). Colori dai token CSS: chiaro come le manopole, mai il verde del live.
  disegna(s) {
    this.s = s;
    if (this.giro) return; // l'animazione ridisegna da sola con l'ultimo stato
    const chiave = JSON.stringify([s.forma, s.voci, s.detune, s.fm, s.fmh, s.pw, s.shape, s.distort, s.crush, s.coarse, s.tipo, s.cutoff, s.q, s.ftype, s.mod1dest, s.mod1depth, s.mod2dest, s.mod2depth]);
    if (chiave === this.chiave || !this.r.offsetWidth) return; // nascosto: si ridisegna quando torna visibile
    this.chiave = chiave;
    this.frame(s, 0);
  }

  pronto(c) {
    const k = window.devicePixelRatio || 1;
    const w = Math.max(40, Math.round(c.clientWidth));
    const h = Math.max(40, Math.round(c.clientHeight));
    if (c.width !== Math.round(w * k) || c.height !== Math.round(h * k)) (c.width = Math.round(w * k)), (c.height = Math.round(h * k));
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g, w, h };
  }

  disegnaOnda(s, col, t = 0) {
    const { g, w, h } = this.pronto(this.onda);
    g.strokeStyle = col.linea;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, h / 2 + 0.5);
    g.lineTo(w, h / 2 + 0.5);
    g.stroke();
    const p = puntiOnda(s, Math.max(64, Math.round(w)), 2, -t * 0.35); // la fase avanza: l'onda scorre piano verso destra
    g.strokeStyle = col.testo;
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.beginPath();
    p.forEach((v, i) => {
      const x = (i / (p.length - 1)) * w;
      const y = h / 2 - v * (h / 2 - 5);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }

  disegnaFiltro(s, col, t = 0) {
    const { g, w, h } = this.pronto(this.filtro);
    const y = (db) => h - 4 - ((Math.max(DB_MIN, Math.min(DB_MAX, db)) - DB_MIN) / (DB_MAX - DB_MIN)) * (h - 8);
    const x = (f) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
    // la griglia: 0 dB e le decadi
    g.strokeStyle = col.linea;
    g.lineWidth = 1;
    for (const f of [100, 1000, 10000]) {
      g.beginPath();
      g.moveTo(Math.round(x(f)) + 0.5, 0);
      g.lineTo(Math.round(x(f)) + 0.5, h);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, Math.round(y(0)) + 0.5);
    g.lineTo(w, Math.round(y(0)) + 0.5);
    g.stroke();
    const freqs = Array.from({ length: Math.max(64, Math.round(w / 2)) }, (_, i) => F_MIN * (F_MAX / F_MIN) ** (i / (Math.max(64, Math.round(w / 2)) - 1)));
    const traccia = (cutoff, stile, spessore) => {
      const db = curvaFiltro(s, freqs, cutoff);
      g.strokeStyle = stile;
      g.lineWidth = spessore;
      g.beginPath();
      freqs.forEach((f, i) => (i ? g.lineTo(x(f), y(db[i])) : g.moveTo(x(f), y(db[i]))));
      g.stroke();
    };
    // l'LFO sul cutoff: le due curve estreme, sfumate (così si vede quanto si muove)
    for (const n of [1, 2]) {
      if (s[`mod${n}dest`] !== 'cutoff') continue;
      const d = s[`mod${n}depth`];
      g.globalAlpha = 0.35;
      traccia(Math.max(F_MIN, s.cutoff * 2 ** (-3 * d)), col.spento, 1);
      traccia(Math.min(F_MAX, s.cutoff * 2 ** (3 * d)), col.spento, 1);
      g.globalAlpha = 1;
    }
    // la curva viva: segue gli LFO nel tempo (un ciclo = `cicloSec` secondi); un punto sul cutoff di adesso
    const adesso = cutoffAdesso(s, t / (this.cicloSec?.() || 2));
    traccia(adesso, col.testo, 1.6);
    const dbAdesso = curvaFiltro(s, [adesso], adesso)[0];
    g.fillStyle = col.testo;
    g.beginPath();
    g.arc(x(adesso), y(dbAdesso), 3, 0, TAU);
    g.fill();
  }
}
