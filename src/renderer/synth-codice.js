// Dal suono del SYNTH al codice Strudel, e ritorno per la riga `// @synth`.
// Si scrivono solo i parametri ATTIVI (quelli a valore neutro stanno nel pannello e non nel codice); l'inviluppo d'ampiezza
// c'è sempre, intero, perché in superdough un ADSR a metà riempie i buchi con valori che non sono quelli del pannello.
// Modulo puro: lo provano i test. Ogni numero che entra nel codice passa da pulisci(): nessun testo libero tranne le note,
// che hanno un elenco di caratteri ammessi.
import { NOTE_ANTEPRIMA, eRumore, iniziale, noteValide, pulisci } from './synth-modello.js';

export const MARCA = '// @synth';
const RIGA = /^[ \t]*\/\/[ \t]*@synth[ \t]+(\{.*\})[ \t]*$/m;

// Un numero come si scrive in Strudel: senza lo zero davanti (.2, -.5), fino a 3 decimali.
export function num(v) {
  return String(Math.round(Number(v) * 1000) / 1000).replace(/^(-?)0\./, '$1.');
}

// Le note che suonano davvero secondo lo schema di prova scelto.
export function noteEffettive(s) {
  if (s.anteprima === 'tenuta') return NOTE_ANTEPRIMA.tenuta;
  if (s.anteprima === 'clip' && noteValide(s.note)) return s.note;
  return NOTE_ANTEPRIMA.arpeggio;
}

// Gli scarti in semitoni delle voci sovrapposte (add(note("…"))): da −detune a +detune, più il sub a −12.
export function scarti(s) {
  const lista = [];
  if (s.forma !== 'supersaw' && s.voci > 1) {
    for (let i = 0; i < s.voci; i++) lista.push(-s.detune + (2 * s.detune * i) / (s.voci - 1));
  } else lista.push(0);
  if (s.sub) lista.push(-12);
  return lista.map((x) => Math.round(x * 1000) / 1000);
}

const NEUTRO_CUTOFF = { lpf: 20000, hpf: 20 };

// Il codice del suono, con le note dello schema scelto. Righe corte: si legge anche sul proiettore.
export function codice(stato) {
  const s = pulisci(stato);
  const rumore = eRumore(s.forma);
  const r = [`note("${noteEffettive(s)}")`];

  if (!rumore) {
    if (s.ottava) r.push(`  .trans(${s.ottava * 12})`);
    const lista = scarti(s);
    if (lista.length > 1) r.push(`  .add(note("${lista.map(num).join(',')}"))`);
  }

  // oscillatore
  let osc = `  .s("${s.forma}")`;
  if (s.forma === 'supersaw') osc += `.unison(${s.voci}).detune(${num(s.detune)}).spread(${num(s.spread)})`;
  if (s.forma === 'pulse') osc += `.pw(${num(s.pw)})`;
  r.push(osc);
  if (!rumore && s.fm > 0) r.push(`  .fm(${num(s.fm)}).fmh(${num(s.fmh)})`);
  if (!rumore && s.penv !== 0) r.push(`  .penv(${num(s.penv)}).pdecay(${num(s.pdecay)})`);
  if (s.pan !== 0.5) r.push(`  .pan(${num(s.pan)})`);

  // filtro
  const t = s.tipo;
  const prefisso = t.slice(0, 2);
  const neutro = NEUTRO_CUTOFF[t];
  if (s.cutoff !== neutro || s.q !== 1 || s.fenv > 0) {
    let f = `  .${t}(${num(s.cutoff)})`;
    if (s.q !== 1) f += `.${prefisso}q(${num(s.q)})`;
    if (s.ftype !== '12db') f += `.ftype("${s.ftype}")`;
    r.push(f);
    if (s.fenv > 0) {
      r.push(`  .${prefisso}env(${num(s.fenv)}).${prefisso}attack(${num(s.fattacco)}).${prefisso}decay(${num(s.fdecay)})`);
      r.push(`  .${prefisso}sustain(${num(s.fsustain)}).${prefisso}release(${num(s.frelease)})`);
    }
  }
  if (s.vowel) r.push(`  .vowel("${s.vowel}")`);

  // ampiezza
  r.push(`  .attack(${num(s.attack)}).decay(${num(s.decay)}).sustain(${num(s.sustain)}).release(${num(s.release)})`);
  if (s.gain !== 0.8) r.push(`  .gain(${num(s.gain)})`);

  // effetti
  const fx = [];
  if (s.shape > 0) fx.push(`.shape(${num(s.shape)})`);
  if (s.distort > 0) fx.push(`.distort(${num(s.distort)})`);
  if (s.crush < 16) fx.push(`.crush(${s.crush})`);
  if (s.coarse > 1) fx.push(`.coarse(${s.coarse})`);
  if (fx.length) r.push(`  ${fx.join('')}`);
  const mod = [];
  if (s.phaser > 0) mod.push(`.phaser(${num(s.phaser)}).phaserdepth(${num(s.phaserdepth)})`);
  if (s.tremolo > 0) mod.push(`.tremolosync(${s.tremolo}).tremolodepth(${num(s.tremolodepth)})`);
  if (mod.length) r.push(`  ${mod.join('')}`);
  if (s.delay > 0) r.push(`  .delay(${num(s.delay)}).delaysync(${s.delaysync}).delayfeedback(${num(s.delayfeedback)})`);
  if (s.room > 0) r.push(`  .room(${num(s.room)}).roomsize(${num(s.roomsize)})`);
  return r.join('\n');
}

// La riga `// @synth {…}`: lo stato del pannello, perché «apri nel synth» riapra la clip esatta.
// Solo quello che è diverso dal suono init: la riga resta corta (il resto torna da pulisci).
export function rigaSynth(stato) {
  const s = pulisci(stato);
  const base = iniziale();
  const diverse = Object.fromEntries(Object.entries(s).filter(([k, v]) => v !== base[k]));
  return `${MARCA} ${JSON.stringify(diverse)}`;
}

// Codice di una clip: la riga @synth in testa, poi il codice.
// Nella riga ci vanno le note che suonano davvero (schema «clip»): riaprendola nel synth le note sono quelle.
export function clip(stato) {
  const s = pulisci(stato);
  return `${rigaSynth({ ...s, anteprima: 'clip', note: noteEffettive(s) })}\n${codice(s)}\n`;
}

// Lo stato scritto nella riga @synth di un testo, o null se non c'è (o non si legge): le clip scritte a mano non si aprono nel synth.
export function leggiRiga(testo) {
  const m = RIGA.exec(String(testo ?? ''));
  if (!m) return null;
  try {
    const grezzo = JSON.parse(m[1]);
    return grezzo && typeof grezzo === 'object' && !Array.isArray(grezzo) ? pulisci(grezzo) : null;
  } catch {
    return null;
  }
}

export const haRigaSynth = (testo) => leggiRiga(testo) !== null;
