// Il suono del SYNTH come dati: ogni manopola è un parametro di Strudel (o di superdough) con il suo intervallo.
// Modulo puro (niente DOM, niente audio): lo provano i test. Il codice si genera da qui (synth-codice.js).
// I parametri sono verificati sul codice di superdough 1.3.0 (vedi docs/SYNTH.md): niente nomi inventati.

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
  { k: 'gain', g: 'amp', tipo: 'num', min: 0, max: 1, def: 0.8, dec: 2 },
  { k: 'penv', g: 'amp', tipo: 'num', min: -24, max: 24, def: 0, dec: 1, se: (s) => !eRumore(s.forma) },
  { k: 'pdecay', g: 'amp', tipo: 'num', min: 0.01, max: 1, log: true, def: 0.1, dec: 2, se: (s) => !eRumore(s.forma) && s.penv !== 0 },
  // EFFETTI
  { k: 'shape', g: 'fx', tipo: 'num', min: 0, max: 0.95, def: 0, dec: 2 },
  { k: 'distort', g: 'fx', tipo: 'num', min: 0, max: 8, def: 0, dec: 1 },
  { k: 'crush', g: 'fx', tipo: 'int', min: 1, max: 16, def: 16 },
  { k: 'coarse', g: 'fx', tipo: 'int', min: 1, max: 32, def: 1 },
  { k: 'phaser', g: 'fx', tipo: 'num', min: 0, max: 8, def: 0, dec: 1 },
  { k: 'phaserdepth', g: 'fx', tipo: 'num', min: 0, max: 1, def: 0.75, dec: 2, se: (s) => s.phaser > 0 },
  { k: 'tremolo', g: 'fx', tipo: 'int', min: 0, max: 16, def: 0 },
  { k: 'tremolodepth', g: 'fx', tipo: 'num', min: 0, max: 1, def: 0.5, dec: 2, se: (s) => s.tremolo > 0 },
  { k: 'delay', g: 'fx', tipo: 'num', min: 0, max: 1, def: 0, dec: 2 },
  { k: 'delaysync', g: 'fx', tipo: 'scelta', scelte: DIVISIONI, def: '3/16', se: (s) => s.delay > 0 },
  { k: 'delayfeedback', g: 'fx', tipo: 'num', min: 0, max: 0.85, def: 0.5, dec: 2, se: (s) => s.delay > 0 },
  { k: 'room', g: 'fx', tipo: 'num', min: 0, max: 1, def: 0, dec: 2 },
  { k: 'roomsize', g: 'fx', tipo: 'num', min: 0.5, max: 8, def: 2, dec: 1, se: (s) => s.room > 0 },
];

export const GRUPPI = [
  { id: 'osc' },
  { id: 'filtro' },
  { id: 'amp' },
  { id: 'fx' },
];

const PER_CHIAVE = new Map(PARAMETRI.map((p) => [p.k, p]));
export const parametro = (k) => PER_CHIAVE.get(k);

// Il suono «init» (con le impostazioni della clip: note, anteprima).
export function iniziale() {
  const s = Object.fromEntries(PARAMETRI.map((p) => [p.k, p.def]));
  s.anteprima = 'arpeggio'; // quale schema di prova si sente (e finisce nella clip)
  s.note = NOTE_ANTEPRIMA.arpeggio; // le note della clip (mini-notazione)
  return s;
}

// Una nota in mini-notazione: nomi, spazi, [ ] < > , ~ * / . ! _ ? e numeri. Niente altro (viene scritta dentro una stringa del codice).
const NOTE_VALIDE = /^[A-Za-z0-9# [\]<>,~*/.!_?:@%-]*$/;
export const noteValide = (testo) => typeof testo === 'string' && testo.length > 0 && testo.length <= 400 && NOTE_VALIDE.test(testo) && !/["'\\]/.test(testo);

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
export function pulisci(grezzo) {
  const s = iniziale();
  const g = grezzo && typeof grezzo === 'object' ? grezzo : {};
  for (const p of PARAMETRI) if (p.k in g) s[p.k] = pulisciValore(p, g[p.k]);
  if (ANTEPRIME.includes(g.anteprima)) s.anteprima = g.anteprima;
  if (noteValide(g.note)) s.note = g.note.trim();
  // il supersaw ha fino a 7 voci, gli altri fino a 5
  if (s.forma !== 'supersaw') s.voci = Math.min(s.voci, LAYER_MAX);
  return sotto(s);
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

// --- «sorprendimi»: un suono a caso ma musicale, dentro limiti sensati ---
// rng() dà un numero fra 0 e 1 (di prova: uno ripetibile).
export function sorprendi(rng = Math.random, base = iniziale()) {
  const uno = (lista) => lista[Math.floor(rng() * lista.length) % lista.length];
  const tra = (a, b) => a + (b - a) * rng();
  const logTra = (a, b) => a * (b / a) ** rng();
  const s = { ...base };
  const nota = (k, v) => (s[k] = pulisciValore(parametro(k), v));
  nota('forma', uno(['sawtooth', 'sawtooth', 'square', 'triangle', 'supersaw', 'supersaw', 'pulse', 'sine']));
  nota('voci', s.forma === 'supersaw' ? 3 + Math.floor(rng() * 4) : 1 + Math.floor(rng() * 3));
  nota('detune', tra(0.05, 0.4));
  nota('spread', tra(0.3, 0.9));
  nota('pw', tra(0.2, 0.8));
  nota('fm', rng() < 0.25 ? tra(0.5, 4) : 0);
  nota('fmh', uno([0.5, 1, 1, 2, 3]));
  nota('ottava', uno([-1, 0, 0, 0, 1]));
  nota('sub', rng() < 0.3 ? 1 : 0);
  nota('pan', tra(0.35, 0.65));
  nota('tipo', uno(['lpf', 'lpf', 'lpf', 'bpf', 'hpf']));
  nota('cutoff', s.tipo === 'hpf' ? logTra(100, 1500) : logTra(250, 6000));
  nota('q', tra(0.5, 12));
  nota('ftype', uno(['12db', '12db', '24db', 'ladder']));
  nota('fenv', rng() < 0.6 ? tra(1, 5) : 0);
  nota('fattacco', logTra(0.005, 0.2));
  nota('fdecay', logTra(0.05, 0.6));
  nota('fsustain', tra(0, 0.5));
  nota('frelease', logTra(0.1, 1));
  nota('vowel', rng() < 0.08 ? uno(['a', 'e', 'i', 'o', 'u']) : '');
  nota('attack', logTra(0.003, 0.25));
  nota('decay', logTra(0.05, 0.6));
  nota('sustain', tra(0.2, 0.9));
  nota('release', logTra(0.1, 1.5));
  nota('gain', 0.7);
  nota('penv', rng() < 0.2 ? tra(2, 12) : 0);
  nota('pdecay', logTra(0.03, 0.3));
  nota('shape', rng() < 0.25 ? tra(0.1, 0.5) : 0);
  nota('distort', rng() < 0.2 ? tra(0.3, 2) : 0);
  nota('crush', rng() < 0.08 ? 6 + Math.floor(rng() * 6) : 16);
  nota('coarse', 1);
  nota('phaser', rng() < 0.2 ? tra(0.5, 3) : 0);
  nota('phaserdepth', tra(0.3, 0.9));
  nota('tremolo', rng() < 0.15 ? uno([2, 4, 8]) : 0);
  nota('tremolodepth', tra(0.2, 0.7));
  nota('delay', rng() < 0.4 ? tra(0.15, 0.45) : 0);
  nota('delaysync', uno(['1/8', '3/16', '1/4']));
  nota('delayfeedback', tra(0.25, 0.6));
  nota('room', rng() < 0.4 ? tra(0.1, 0.4) : 0);
  nota('roomsize', tra(1, 4));
  return pulisci(s);
}
