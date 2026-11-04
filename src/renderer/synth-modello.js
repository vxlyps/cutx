// Il suono del SYNTH come dati: ogni manopola è un parametro di Strudel (o di superdough) con il suo intervallo.
// Modulo puro (niente DOM, niente audio): lo provano i test. Il codice si genera da qui (synth-codice.js).
// I parametri sono verificati sul codice di superdough 1.3.0 (vedi docs/SYNTH.md): niente nomi inventati.

import { eCategoria } from './categorie.js';
import { leggiScala } from './synth-note.js';

export const FORME = ['sine', 'sawtooth', 'square', 'triangle', 'supersaw', 'pulse', 'white', 'pink', 'brown', 'crackle'];
const RUMORI = ['white', 'pink', 'brown', 'crackle'];
export const eRumore = (forma) => RUMORI.includes(forma);
export const TIPI_FILTRO = ['lpf', 'hpf', 'bpf'];
export const PENDENZE = ['12db', 'ladder', '24db']; // ftype di superdough
export const VOCALI = ['', 'a', 'e', 'i', 'o', 'u']; // '' = niente
export const DIVISIONI = ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2']; // del ciclo (una battuta in 4/4): delaysync
export const ANTEPRIME = ['arpeggio', 'tenuta', 'clip'];
export const NOTE_ANTEPRIMA = { tenuta: 'c3', arpeggio: 'c3 eb3 g3 bb3' };

// I tetti: il live non deve mai soffrire. Le voci in un colpo solo sono (unison del supersaw o layer) × (1 + sub).
export const LAYER_MAX = 5; // voci sovrapposte di un oscillatore normale
export const UNISON_MAX = 7; // voci del supersaw
export const COSTO_AVVISO = 10; // da qui il pannello avvisa «pesante»
export const COSTO_MAX = 18; // oltre non si va: la manopola che lo supera si ferma

// g = gruppo del pannello. tipo: num | int | scelta | bool. log: manopola logaritmica. dec: cifre decimali.
// def = valore del suono «init». Le funzioni `se` dicono quando una manopola conta (altrimenti nel pannello è spenta).
export const PARAMETRI = [
  // OSCILLATORE
  { k: 'forma', g: 'osc', tipo: 'scelta', scelte: FORME, def: 'sawtooth' },
  { k: 'voci', g: 'osc', tipo: 'int', min: 1, max: UNISON_MAX, def: 1, se: (s) => !eRumore(s.forma) },
  { k: 'detune', g: 'osc', tipo: 'num', min: 0, max: 1, def: 0.18, dec: 2, se: (s) => !eRumore(s.forma) && s.voci > 1 },
  { k: 'spread', g: 'osc', tipo: 'num', min: 0, max: 1, def: 0.6, dec: 2, se: (s) => s.forma === 'supersaw' && s.voci > 1 },
  { k: 'pw', g: 'osc', tipo: 'num', min: 0.05, max: 0.95, def: 0.5, dec: 2, se: (s) => s.forma === 'pulse' },
  { k: 'fm', g: 'osc', tipo: 'num', min: 0, max: 8, def: 0, dec: 2, se: (s) => !eRumore(s.forma) },
  { k: 'fmh', g: 'osc', tipo: 'num', min: 0.5, max: 8, def: 1, dec: 2, se: (s) => !eRumore(s.forma) && s.fm > 0 },
  { k: 'ottava', g: 'osc', tipo: 'int', min: -2, max: 2, def: 0, se: (s) => !eRumore(s.forma) },
  { k: 'sub', g: 'osc', tipo: 'bool', def: 0, se: (s) => !eRumore(s.forma) },
  { k: 'pan', g: 'osc', tipo: 'num', min: 0, max: 1, def: 0.5, dec: 2 },
  // FILTRO
  { k: 'tipo', g: 'filtro', tipo: 'scelta', scelte: TIPI_FILTRO, def: 'lpf' },
  { k: 'cutoff', g: 'filtro', tipo: 'num', min: 20, max: 20000, log: true, def: 2400, dec: 0 },
  { k: 'q', g: 'filtro', tipo: 'num', min: 0, max: 25, def: 1, dec: 1 },
  { k: 'ftype', g: 'filtro', tipo: 'scelta', scelte: PENDENZE, def: '12db' },
  { k: 'fenv', g: 'filtro', tipo: 'num', min: 0, max: 8, def: 0, dec: 1 },
  { k: 'fattacco', g: 'filtro', tipo: 'num', min: 0.001, max: 2, log: true, def: 0.01, dec: 3, se: (s) => s.fenv > 0 },
  { k: 'fdecay', g: 'filtro', tipo: 'num', min: 0.001, max: 2, log: true, def: 0.2, dec: 3, se: (s) => s.fenv > 0 },
  { k: 'fsustain', g: 'filtro', tipo: 'num', min: 0, max: 1, def: 0.2, dec: 2, se: (s) => s.fenv > 0 },
  { k: 'frelease', g: 'filtro', tipo: 'num', min: 0.01, max: 4, log: true, def: 0.3, dec: 2, se: (s) => s.fenv > 0 },
  { k: 'vowel', g: 'filtro', tipo: 'scelta', scelte: VOCALI, def: '' },
  // AMPIEZZA
  { k: 'attack', g: 'amp', tipo: 'num', min: 0.001, max: 4, log: true, def: 0.01, dec: 3 },
  { k: 'decay', g: 'amp', tipo: 'num', min: 0.001, max: 4, log: true, def: 0.2, dec: 3 },
  { k: 'sustain', g: 'amp', tipo: 'num', min: 0, max: 1, def: 0.6, dec: 2 },
  { k: 'release', g: 'amp', tipo: 'num', min: 0.01, max: 6, log: true, def: 0.3, dec: 2 },
  { k: 'penv', g: 'amp', tipo: 'num', min: -24, max: 24, def: 0, dec: 1, se: (s) => !eRumore(s.forma) },
  { k: 'pdecay', g: 'amp', tipo: 'num', min: 0.01, max: 1, log: true, def: 0.1, dec: 2, se: (s) => !eRumore(s.forma) && s.penv !== 0 },
  { k: 'gain', g: 'amp', tipo: 'num', min: 0, max: 1, def: 0.8, dec: 2 },
  // DRIVE e SPACE (i due gruppi degli effetti)
  { k: 'shape', g: 'drive', tipo: 'num', min: 0, max: 0.95, def: 0, dec: 2 },
  { k: 'distort', g: 'drive', tipo: 'num', min: 0, max: 8, def: 0, dec: 1 },
  { k: 'crush', g: 'drive', tipo: 'int', min: 1, max: 16, def: 16 },
  { k: 'coarse', g: 'drive', tipo: 'int', min: 1, max: 32, def: 1 },
  { k: 'delay', g: 'space', tipo: 'num', min: 0, max: 1, def: 0, dec: 2 },
  { k: 'delaysync', g: 'space', tipo: 'scelta', scelte: DIVISIONI, def: '3/16', se: (s) => s.delay > 0 },
  { k: 'delayfeedback', g: 'space', tipo: 'num', min: 0, max: 0.85, def: 0.5, dec: 2, se: (s) => s.delay > 0 },
  { k: 'room', g: 'space', tipo: 'num', min: 0, max: 1, def: 0, dec: 2 },
  { k: 'roomsize', g: 'space', tipo: 'num', min: 0.5, max: 8, def: 2, dec: 1, se: (s) => s.room > 0 },
  { k: 'phaser', g: 'space', tipo: 'num', min: 0, max: 8, def: 0, dec: 1 },
  { k: 'phaserdepth', g: 'space', tipo: 'num', min: 0, max: 1, def: 0.75, dec: 2, se: (s) => s.phaser > 0 },
  { k: 'tremolo', g: 'space', tipo: 'int', min: 0, max: 16, def: 0 },
  { k: 'tremolodepth', g: 'space', tipo: 'num', min: 0, max: 1, def: 0.5, dec: 2, se: (s) => s.tremolo > 0 },
];

export const GRUPPI = [
  { id: 'osc' },
  { id: 'filtro' },
  { id: 'amp' },
  { id: 'drive' },
  { id: 'space' },
];

const PER_CHIAVE = new Map(PARAMETRI.map((p) => [p.k, p]));
export const parametro = (k) => PER_CHIAVE.get(k);

// Il suono «init» (con le impostazioni della clip: note, anteprima, tipo).
export function iniziale() {
  const s = Object.fromEntries(PARAMETRI.map((p) => [p.k, p.def]));
  s.anteprima = 'arpeggio'; // quale schema di prova si sente (e finisce nella clip)
  s.note = NOTE_ANTEPRIMA.arpeggio; // le note della clip (mini-notazione)
  s.testa = ''; // l'inizio del codice se non è note("…") (scritto a mano nel pannello del codice): vuoto = note("…") delle note della clip
  s.mano = []; // le chiamate .nome(…) scritte a mano che il pannello non conosce: restano com'erano, in fondo, e non si perdono mai
  s.categoria = ''; // bass, lead, arp, pad, keys, fx o niente: i limiti di MUTATE e il gruppo della clip nel CUE
  s.scala = ''; // «A2:minor»: se c'è, le note della clip sono gradi di quella scala e il codice è n("…").scale("…")
  s.intro = ''; // i commenti scritti in cima al codice: restano dove sono
  return s;
}

// Una nota in mini-notazione: nomi, spazi, [ ] < > , ~ * / . ! _ ? e numeri. Niente altro (viene scritta dentro una stringa del codice).
const NOTE_VALIDE = /^[A-Za-z0-9# [\]<>,~*/.!_?:@%-]*$/;
export const noteValide = (testo) => typeof testo === 'string' && testo.length > 0 && testo.length <= 1500 && NOTE_VALIDE.test(testo) && !/["'\\]/.test(testo);

const arrotonda = (v, dec) => {
  const f = 10 ** dec;
  return Math.round(v * f) / f;
};

// Un valore portato nel suo intervallo e nel suo tipo; se non vale, quello di partenza.
export function pulisciValore(p, v) {
  switch (p.tipo) {
    case 'scelta':
      return p.scelte.includes(v) ? v : p.def;
    case 'bool':
      return v ? 1 : 0;
    case 'int': {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(p.max, Math.max(p.min, n)) : p.def;
    }
    default: {
      const n = Number(v);
      return Number.isFinite(n) ? arrotonda(Math.min(p.max, Math.max(p.min, n)), p.dec ?? 2) : p.def;
    }
  }
}

// Cosa suona il motore se il codice non nomina un parametro: tutto neutro, e i valori di superdough dove ne ha uno suo
// (forma triangle, inviluppo .001/.05/.6/.01, tremolo a fondo). Serve per leggere il codice scritto a mano: quello che non c'è, è spento.
export function spento() {
  const s = iniziale();
  Object.assign(s, {
    forma: 'triangle', voci: 1, fm: 0, ottava: 0, sub: 0, pan: 0.5, tipo: 'lpf', cutoff: 20000, q: 1, ftype: '12db', fenv: 0, vowel: '',
    attack: 0.001, decay: 0.05, sustain: 0.6, release: 0.01, gain: 0.8, penv: 0, shape: 0, distort: 0, crush: 16, coarse: 1,
    phaser: 0, tremolo: 0, tremolodepth: 1, delay: 0, room: 0,
  });
  return s;
}

// Costo stimato sulla CPU, in «oscillatori equivalenti». Una stima semplice ma onesta: oscillatori che suonano insieme,
// più il peso degli effetti che costano davvero (riverbero, formanti, filtro a 24 dB o ladder).
export function costo(s) {
  const rumore = eRumore(s.forma);
  const layer = s.forma === 'supersaw' ? 1 : s.voci;
  const unison = s.forma === 'supersaw' ? s.voci : 1;
  const osc = rumore ? 1 : unison * (layer + (s.sub ? 1 : 0));
  let c = osc;
  if (!rumore && s.fm > 0) c += osc * 0.5;
  if (s.room > 0) c += 3;
  if (s.delay > 0) c += 1;
  if (s.phaser > 0) c += 1;
  if (s.tremolo > 0) c += 0.5;
  if (s.distort > 0 || s.shape > 0) c += 0.5;
  if (s.vowel) c += 2;
  if (s.ftype === 'ladder') c += 2;
  else if (s.ftype === '24db') c += 1;
  return c;
}
export const eCaro = (s) => costo(s) >= COSTO_AVVISO;

// Per i suoni che escono da un file o dal caso: se il costo supera il tetto si tolgono voci (prima il sub, poi le voci).
function sotto(s) {
  let giri = 20;
  while (costo(s) > COSTO_MAX && giri--) {
    if (s.sub) s.sub = 0;
    else if (s.voci > 1) s.voci--;
    else if (s.room > 0) s.room = 0;
    else if (s.vowel) s.vowel = '';
    else break;
  }
  return s;
}

// Lo stato com'è scritto in un file o arrivato da fuori: solo le chiavi note, ognuna nel suo intervallo. Mai eval, mai codice.
const MANO = /^\.[A-Za-z_]\w*\(.*\)$/;
export const manoValida = (x) => typeof x === 'string' && x.length <= 300 && !x.includes('\n') && MANO.test(x.trim());
export const scalaValida = (x) => typeof x === 'string' && leggiScala(x) !== null;
// I commenti in cima al codice (// …): al massimo 6 righe, senza i segni che CUTX usa nel file (@synth, @clip…).
export const introValida = (x) => typeof x === 'string' && x.length <= 400 && x.split('\n').length <= 6 && x.split('\n').every((r) => /^\s*\/\//.test(r) && !/@(synth|clip|scena|beat|apertura|sezione|pezzo|spina|momento)\b/.test(r));
export const testaValida = (x) => typeof x === 'string' && x.length <= 300 && !x.includes('\n') && !x.includes('//') && x.trim().length > 0;

// tetto: false lascia i pesi com'erano (il codice scritto a mano non si alleggerisce di nascosto: il pannello avvisa).
export function pulisci(grezzo, { tetto = true } = {}) {
  const s = iniziale();
  const g = grezzo && typeof grezzo === 'object' ? grezzo : {};
  for (const p of PARAMETRI) if (p.k in g) s[p.k] = pulisciValore(p, g[p.k]);
  if (ANTEPRIME.includes(g.anteprima)) s.anteprima = g.anteprima;
  if (noteValide(g.note)) s.note = g.note.trim();
  if (eCategoria(g.categoria)) s.categoria = g.categoria;
  if (testaValida(g.testa)) s.testa = g.testa.trim();
  if (scalaValida(g.scala)) s.scala = g.scala.trim();
  if (introValida(g.intro) && g.intro.trim()) s.intro = g.intro.trim();
  if (Array.isArray(g.mano)) s.mano = g.mano.filter(manoValida).map((x) => x.trim()).slice(0, 40);
  // il supersaw ha fino a 7 voci, gli altri fino a 5
  if (s.forma !== 'supersaw') s.voci = Math.min(s.voci, LAYER_MAX);
  return tetto ? sotto(s) : s;
}

// Cambia una manopola. Ritorna lo stato nuovo, o lo stesso oggetto se il tetto lo vieta (il pannello lo dice).
export function imposta(s, k, v) {
  const p = parametro(k);
  if (!p) return s;
  const nuovo = { ...s, [k]: pulisciValore(p, v) };
  if (k === 'forma' && nuovo.forma !== 'supersaw') nuovo.voci = Math.min(nuovo.voci, LAYER_MAX);
  if (nuovo[k] === s[k]) return s;
  if (costo(nuovo) > COSTO_MAX && costo(nuovo) > costo(s)) return s;
  return nuovo;
}

export const attivo = (p, s) => !p.se || p.se(s);

// L'intervallo del parametro in questo stato (il numero di voci dipende dalla forma).
export function limiti(p, s) {
  if (p.k === 'voci') return { min: 1, max: s.forma === 'supersaw' ? UNISON_MAX : LAYER_MAX };
  return { min: p.min, max: p.max };
}

// --- manopole: posizione 0..1 ↔ valore (lineare o logaritmica) ---
export function aPosizione(p, s, v) {
  const { min, max } = limiti(p, s);
  if (max === min) return 0;
  const t = p.log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  return Math.min(1, Math.max(0, t));
}
export function daPosizione(p, s, t) {
  const { min, max } = limiti(p, s);
  const x = Math.min(1, Math.max(0, t));
  const v = p.log ? min * (max / min) ** x : min + (max - min) * x;
  if (p.log && p.k === 'cutoff') return Math.round(v);
  return pulisciValore({ ...p, min, max }, v);
}

// --- MUTATE: un suono a caso ma musicale, dentro i limiti del tipo (bass, lead, arp, pad, keys, fx) ---
// Ogni parametro ha un intervallo { r: [min, max] }, una lista di scelte { c: [...] }, e se può restare neutro { p: probabilità } in più.
// rng() dà un numero fra 0 e 1 (di prova: uno ripetibile).
const R = (a, b) => ({ r: [a, b] });
const C = (...scelte) => ({ c: scelte });
const P = (p, spec) => ({ p, ...spec });

// Il tipo «nessuno»: i limiti larghi di sempre.
const BASE = {
  forma: C('sawtooth', 'sawtooth', 'square', 'triangle', 'supersaw', 'supersaw', 'pulse', 'sine'),
  voci: R(1, 3), vociSaw: R(3, 6), detune: R(0.05, 0.4), spread: R(0.3, 0.9), pw: R(0.2, 0.8),
  fm: P(0.25, R(0.5, 4)), fmh: C(0.5, 1, 1, 2, 3), ottava: C(-1, 0, 0, 0, 1), sub: P(0.3, C(1)), pan: R(0.35, 0.65),
  tipo: C('lpf', 'lpf', 'lpf', 'bpf', 'hpf'), cutoff: R(250, 6000), cutoffHp: R(100, 1500), q: R(0.5, 12), ftype: C('12db', '12db', '24db', 'ladder'),
  fenv: P(0.6, R(1, 5)), fattacco: R(0.005, 0.2), fdecay: R(0.05, 0.6), fsustain: R(0, 0.5), frelease: R(0.1, 1), vowel: P(0.08, C('a', 'e', 'i', 'o', 'u')),
  attack: R(0.003, 0.25), decay: R(0.05, 0.6), sustain: R(0.2, 0.9), release: R(0.1, 1.5),
  penv: P(0.2, R(2, 12)), pdecay: R(0.03, 0.3),
  shape: P(0.25, R(0.1, 0.5)), distort: P(0.2, R(0.3, 2)), crush: P(0.08, R(6, 11)), coarse: P(0, R(2, 4)),
  phaser: P(0.2, R(0.5, 3)), phaserdepth: R(0.3, 0.9), tremolo: P(0.15, C(2, 4, 8)), tremolodepth: R(0.2, 0.7),
  delay: P(0.4, R(0.15, 0.45)), delaysync: C('1/8', '3/16', '1/4'), delayfeedback: R(0.25, 0.6), room: P(0.4, R(0.1, 0.4)), roomsize: R(1, 4),
};

// I limiti di ogni tipo: quello che cambia rispetto a BASE.
export const PROFILI = {
  bass: {
    forma: C('sawtooth', 'square', 'supersaw', 'triangle'), voci: R(1, 2), vociSaw: R(2, 4), ottava: C(-1), sub: P(0.5, C(1)),
    tipo: C('lpf'), cutoff: R(150, 1200), q: R(0.5, 8), fenv: P(0.5, R(1, 4)),
    attack: R(0.001, 0.02), decay: R(0.1, 0.4), sustain: R(0.4, 0.9), release: R(0.05, 0.3),
    distort: P(0.35, R(0.3, 3)), delay: P(0.05, R(0.1, 0.2)), room: P(0.1, R(0.05, 0.15)), phaser: P(0, R(0.5, 1)), tremolo: P(0, C(2)),
  },
  lead: {
    forma: C('sawtooth', 'square', 'supersaw', 'pulse'), ottava: C(0, 1), tipo: C('lpf'), cutoff: R(1200, 8000), q: R(1, 10),
    attack: R(0.001, 0.05), decay: R(0.1, 0.5), sustain: R(0.5, 1), release: R(0.1, 0.6),
    delay: P(0.6, R(0.15, 0.4)), room: P(0.4, R(0.1, 0.35)), vowel: P(0.05, C('a', 'e', 'i', 'o', 'u')),
  },
  arp: {
    forma: C('sawtooth', 'square', 'pulse', 'triangle'), ottava: C(0, 1), tipo: C('lpf', 'lpf', 'bpf'), cutoff: R(800, 6000), q: R(1, 10),
    fenv: P(0.9, R(1.5, 5)), fdecay: R(0.05, 0.3), attack: R(0.001, 0.01), decay: R(0.05, 0.25), sustain: R(0, 0.3), release: R(0.05, 0.3),
    delay: P(0.65, R(0.2, 0.45)), delaysync: C('1/8', '3/16'), room: P(0.3, R(0.1, 0.3)),
  },
  pad: {
    forma: C('supersaw', 'sawtooth', 'triangle', 'sine'), voci: R(2, 4), vociSaw: R(3, 7), detune: R(0.15, 0.6), ottava: C(0, 0, 1), sub: P(0.2, C(1)),
    tipo: C('lpf'), cutoff: R(600, 5000), q: R(0.5, 4), fenv: P(0.4, R(0.5, 2)), attack: R(0.4, 2), decay: R(0.5, 2), sustain: R(0.6, 1), release: R(1, 4),
    room: P(0.9, R(0.3, 0.8)), roomsize: R(3, 8), phaser: P(0.4, R(0.3, 2)), delay: P(0.3, R(0.15, 0.35)),
  },
  keys: {
    forma: C('triangle', 'sine', 'square'), fm: P(0.7, R(0.5, 3)), fmh: C(1, 2, 3, 4), ottava: C(0), tipo: C('lpf'), cutoff: R(1500, 6000),
    fenv: P(0.3, R(0.5, 2)), attack: R(0.001, 0.01), decay: R(0.3, 1.2), sustain: R(0.1, 0.5), release: R(0.2, 1),
    room: P(0.5, R(0.1, 0.4)), phaser: P(0.3, R(0.3, 2)), tremolo: P(0.25, C(2, 4)),
  },
  fx: {
    forma: C(...FORME), voci: R(1, 4), ottava: C(-1, 0, 1, 2), cutoff: R(200, 12000), q: R(1, 18),
    penv: P(0.6, R(-24, 24)), pdecay: R(0.02, 0.8), attack: R(0.001, 0.5), decay: R(0.05, 1), sustain: R(0, 0.8), release: R(0.1, 3),
    crush: P(0.3, R(3, 10)), distort: P(0.4, R(0.5, 4)), delay: P(0.6, R(0.2, 0.6)), delayfeedback: R(0.3, 0.75), room: P(0.6, R(0.2, 0.7)), shape: P(0.3, R(0.2, 0.7)),
  },
};

// Un valore dalla sua specifica: intervallo (logaritmico se la manopola lo è), scelta, o neutro con la sua probabilità.
function campiona(spec, p, rng) {
  if (spec.p !== undefined && rng() >= spec.p) return p.def;
  if (spec.c) return spec.c[Math.floor(rng() * spec.c.length) % spec.c.length];
  const [a, b] = spec.r;
  return p.log ? a * (b / a) ** rng() : a + (b - a) * rng();
}

// Un suono nuovo del tipo dato (o dei limiti larghi): il resto (note, schema, tipo, gain, pezzi scritti a mano) resta quello di `base`.
export function sorprendi(rng = Math.random, base = iniziale(), categoria = base.categoria ?? '') {
  const prof = { ...BASE, ...(PROFILI[categoria] ?? {}) };
  const s = { ...base };
  const metti = (k, spec) => (s[k] = pulisciValore(parametro(k), campiona(spec, parametro(k), rng)));
  metti('forma', prof.forma);
  metti('voci', s.forma === 'supersaw' ? prof.vociSaw : prof.voci);
  metti('tipo', prof.tipo);
  for (const p of PARAMETRI) {
    if (['forma', 'voci', 'tipo', 'gain', 'delaysync'].includes(p.k)) continue;
    const spec = p.k === 'cutoff' && s.tipo === 'hpf' ? prof.cutoffHp : prof[p.k];
    if (spec) metti(p.k, spec);
  }
  metti('delaysync', prof.delaysync);
  return pulisci(s);
}

// MUTATE: il suono attuale spostato verso un suono nuovo dello stesso tipo, di una frazione `quanto` (0 = niente, 1 = suono nuovo).
// Ogni manopola fa la sua frazione di strada; scelte e interruttori cambiano con probabilità `quanto`.
export function mutate(s, quanto, rng = Math.random, categoria = s.categoria ?? '') {
  const q = Math.min(1, Math.max(0, Number(quanto) || 0));
  if (q >= 0.999) return sorprendi(rng, s, categoria);
  const nuovo = sorprendi(rng, s, categoria);
  const out = { ...s };
  for (const p of PARAMETRI) {
    if (p.k === 'gain') continue;
    if (p.tipo === 'scelta' || p.tipo === 'bool') {
      if (rng() < q) out[p.k] = nuovo[p.k];
    } else {
      const t = aPosizione(p, s, s[p.k]) + (aPosizione(p, nuovo, nuovo[p.k]) - aPosizione(p, s, s[p.k])) * q;
      out[p.k] = daPosizione(p, nuovo, t);
    }
  }
  return pulisci(out);
}
