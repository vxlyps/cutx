// Dal suono del SYNTH al codice Strudel, e ritorno per la riga `// @synth`.
// Si scrivono solo i parametri ATTIVI (quelli a valore neutro stanno nel pannello e non nel codice); l'inviluppo d'ampiezza
// c'è sempre, intero, perché in superdough un ADSR a metà riempie i buchi con valori che non sono quelli del pannello.
// Modulo puro: lo provano i test. Ogni numero che entra nel codice passa da pulisci(): nessun testo libero tranne le note,
// che hanno un elenco di caratteri ammessi.
import { ARP_ACCENTI, ARP_EVOLVE, ARP_MODI, ARP_OGNI, ARP_ORDINI, ARP_PASSI, ARP_RETRIG, DIVISIONI, FORME, NOTE_ANTEPRIMA, PENDENZE, UNISON_MAX, VOCALI, eRumore, iniziale, introValida, limiti, noteValide, parametro, pulisci, pulisciValore, scalaValida, spento, testaValida } from './synth-modello.js';
import { velValida } from './synth-note.js';

export const MARCA = '// @synth';
const RIGA = /^[ \t]*\/\/[ \t]*@synth[ \t]+(\{.*\})[ \t]*$/m;

// Un numero come si scrive in Strudel: senza lo zero davanti (.2, -.5), fino a 3 decimali.
export function num(v) {
  return String(Math.round(Number(v) * 1000) / 1000).replace(/^(-?)0\./, '$1.');
}

// Le note che suonano davvero secondo lo schema di prova scelto.
export function noteEffettive(s) {
  if (s.anteprima === 'tenuta') return NOTE_ANTEPRIMA.tenuta;
  if (s.anteprima === 'arpeggio' && s.arp) return NOTE_ANTEPRIMA.accordo; // l'arpeggio ha bisogno di un accordo da suonare
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

// Cosa fa il motore (superdough 1.3.0) quando una chiamata non c'è: se il pannello ha lo stesso valore, non lo scrive. L'inviluppo conta tutto insieme.
const MOTORE = { voci: 5, detune: 0.18, spread: 0.6, pw: 0.5, fmh: 1, phaserdepth: 0.75, tremolodepth: 1, delayfeedback: 0.5, delaysync: '3/16', roomsize: 2, attack: 0.001, decay: 0.05, sustain: 0.6, release: 0.01 };

// Le note della clip sono gradi di una scala (n("0 2 4").scale("A2:minor"))? Solo con la scala giusta e lo schema «clip».
// Le note della clip hanno una velocity scritta (.velocity("…"))? Solo con lo schema «clip» e le note del pianoroll (non con un inizio scritto a mano).
export const conVelocity = (s) => !!s.vel && s.anteprima === 'clip' && noteValide(s.note) && !(s.testa && testaValida(s.testa));

// L'ARPEGGIO si scrive solo dove ci sono accordi veri: le note della clip (o l'accordo di prova), non la nota tenuta dei tasti, non un inizio scritto
// a mano, e non se il codice a mano ha già il suo arpeggio.
const ARP_A_MANO = /^\.arp(?:With)?\(/;
export const conArp = (s) => {
  if (!s.arp || !ARP_MODI.includes(s.arp) || s.anteprima === 'tenuta') return false;
  if (s.anteprima === 'clip' && !noteValide(s.note)) return false;
  if (s.testa && testaValida(s.testa)) return false;
  return !(s.mano ?? []).some((m) => ARP_A_MANO.test(m.trim()));
};

// La chiamata dell'arpeggio, su una riga (se la si ritocca a mano resta com'è, a mano). `run(n)` conta i passi del ciclo; `late` li fa ripartire dall'inizio
// di ogni accordo; `h` sono le note dell'accordo, dalla più bassa alla più alta (il pianoroll le scrive in quell'ordine).
export const ARP_PASSI_CICLO = { '1/4': 4, '1/8': 8, '1/8T': 12, '1/16': 16, '1/16T': 24, '1/32': 32, '1/64': 64 };
export function chiamataArp(modo, passo, ott = 1, poly = 0, ordine = ARP_ORDINI[0]) {
  const n = ARP_PASSI_CICLO[passo] ?? 16;
  const l = ott > 1 ? 't' : 'h'; // con più ottave `t` è l'accordo ripetuto, ogni giro un'ottava più su
  let corpo;
  if (modo === 'caso') corpo = `rand.segment(${n}).fmap(r => ${l}[Math.floor(r * ${l}.length)])`;
  else {
    const L = `${l}.length`;
    const dalFuori = (k) => `(k => k % 2 ? ${L} - (k + 1) / 2 : k / 2)(${k})`; // 0, ultima, 1, penultima…: dai bordi verso il centro
    const nota = {
      su: `${l}[i % ${L}]`,
      giu: `${l}.at(-1 - i % ${L})`,
      sugiu: `${l}[${L} - 1 - Math.abs(${L} - 1 - i % Math.max(2 * ${L} - 2, 1))]`,
      converge: `${l}[${dalFuori(`i % ${L}`)}]`,
      diverge: `${l}[${dalFuori(`${L} - 1 - i % ${L}`)}]`,
      pinky: `${l}[i % 2 ? ${L} - 1 : i / 2 % Math.max(${L} - 1, 1)]`, // la nota più alta torna a ogni secondo passo
      thumb: `${l}[i % 2 ? Math.min(${L} - 1, 1 + (i - 1) / 2 % Math.max(${L} - 1, 1)) : 0]`, // la più bassa torna a ogni secondo passo
      ordine: `${l}[[${ordine.split(' ').join(', ')}][i % ${ordine.split(' ').length}] % ${L}]`,
    }[modo];
    // POLY: il passo è contato da sempre (non dalla battuta) e il giro dura `poly` passi: la battuta e il giro si sfasano
    const passi = poly >= 2 ? `j => (i => ${nota})((j + Math.round(h[0].whole.begin * ${n})) % ${poly})` : `i => ${nota}`;
    corpo = `run(${n}).late(h[0].whole.begin).fmap(${passi})`;
  }
  if (ott <= 1) return `.arpWith(h => ${corpo})`;
  const scatti = [0, 12, 24].slice(0, ott).join(', ');
  return `.arpWith(h => { const t = [${scatti}].flatMap(o => h.map(x => x.withValue(v => ({ ...v, note: noteToMidi(v.note) + o })))); return ${corpo}; })`;
}
// Le righe che l'arpeggio aggiunge dopo `.arpWith`, una per riga (se le si ritocca a mano restano a mano): swing, accenti, umanizza (tempo e forza).
// `swingBy(x, n)` ritarda la seconda metà di ogni fetta; con n = passi del ciclo / 2 sono i passi pari a restare indietro.
const ACCENTO = 0.55;
export function rigaArp(s, quale) {
  const n = ARP_PASSI_CICLO[s.arppasso] ?? 16;
  switch (quale) {
    // PULSE: `1(k,n,rot)` è il ritmo euclideo; `mask` tiene solo le note sui suoi colpi (tutte se k non è minore dei passi)
    case 'mask': return s.arppulse > 0 && s.arppulse < n ? `.mask("1(${s.arppulse},${n}${s.arprot % n ? `,${s.arprot % n}` : ''})")` : null;
    // RETRIG: ogni 4 passi, l'ultimo si ripete in raffica
    case 'ply': return s.arpretrig ? `.ply("[1 1 1 ${s.arpretrig}]*${n / 4}")` : null;
    // EVOLVE: ogni tot battute una variazione (raffica doppia, ottava sopra, silenzio)
    case 'evolve': return s.arpevolve ? `.every(${s.arpogni}, x => ${{ fill: 'x.ply(2)', octave: 'x.add(note(12))', break: 'silence' }[s.arpevolve]})` : null;
    // CHANCE e JUMP: il caso, nota per nota
    case 'chance': return s.arpchance < 1 ? `.degradeBy(${num(Math.round((1 - s.arpchance) * 100) / 100)})` : null;
    case 'jump': return s.arpjump > 0 ? `.sometimesBy(${num(s.arpjump)}, x => x.add(note(12)))` : null;
    case 'swing': return s.arpswing > 0 ? `.swingBy(${num(s.arpswing)}, ${n / 2})` : null;
    case 'acc': return s.arpacc ? `.mul(velocity(run(${n}).fmap(i => i % ${s.arpacc} ? ${num(ACCENTO)} : 1)))` : null;
    case 'late': return s.arpumano > 0 ? `.late(rand.range(0, ${num(s.arpumano * 0.01)}).segment(${n}))` : null;
    case 'vel': return s.arpumano > 0 ? `.mul(velocity(rand.range(${num(Math.round((1 - 0.4 * s.arpumano) * 100) / 100)}, 1)))` : null;
  }
  return null;
}
// L'ordine conta: PULSE e RETRIG prima di swing e umanizza (che spostano le note nel tempo).
export const righeArp = (s) => ['mask', 'ply', 'evolve', 'chance', 'jump', 'swing', 'acc', 'late', 'vel'].map((q) => rigaArp(s, q)).filter(Boolean);
const spazi = (x) => String(x).replace(/\s+/g, ' ').trim();
// Il contrario: la chiamata scritta → { modo, passo, ott } se è proprio una di quelle del pannello, altrimenti null.
export function leggiArp(args) {
  const a = spazi(`.arpWith(${args})`);
  for (const modo of ARP_MODI.slice(1)) {
    for (const ordine of modo === 'ordine' ? ARP_ORDINI : [ARP_ORDINI[0]]) {
      for (const poly of modo === 'caso' ? [0] : [0, ...Array.from({ length: 15 }, (_, k) => k + 2)]) {
        for (const passo of ARP_PASSI) for (const ott of [1, 2, 3]) if (a === spazi(chiamataArp(modo, passo, ott, poly, ordine))) return { modo, passo, ott, poly, ordine };
      }
    }
  }
  return null;
}

export const inGradi = (s) => !!s.scala && scalaValida(s.scala) && s.anteprima === 'clip' && noteValide(s.note);

const nomiManoDi = (s) => new Set((s.mano ?? []).map((m) => /^\.(\w+)/.exec(m.trim())?.[1]).filter(Boolean));

// Il codice del suono, con le note dello schema scelto. Righe corte: si legge anche sul proiettore.
export function codice(stato) {
  const s = stato;
  const rumore = eRumore(s.forma);
  const r = s.intro && introValida(s.intro) ? s.intro.split('\n').map((x) => x.trimEnd()) : [];
  if (s.testa && testaValida(s.testa)) r.push(s.testa);
  else if (inGradi(s)) r.push(`n("${s.note}")`, `  .scale("${s.scala}")`);
  else r.push(`note("${noteEffettive(s)}")`);
  if (conVelocity(s)) r.push(`  .velocity("${s.vel}")`);
  // l'arpeggio sta subito dopo le note: prima di .trans e .add, che sovrappongono voci e farebbero un accordo di ogni nota
  if (conArp(s)) {
    r.push(`  ${chiamataArp(s.arp, s.arppasso, inGradi(s) ? 1 : s.arpott, s.arppoly, s.arpordine)}`);
    for (const x of righeArp(s)) r.push(`  ${x}`);
    if (s.arpgate < 1 && !nomiManoDi(s).has('clip')) r.push(`  .clip(${num(s.arpgate)})`);
  }

  if (!rumore) {
    if (s.ottava) r.push(`  .trans(${s.ottava * 12})`);
    const lista = scarti(s);
    if (lista.length > 1) r.push(`  .add(note("${lista.map(num).join(',')}"))`);
  }

  // Il pannello scrive solo quello che serve: non quello che il codice scritto a mano scrive già (le sue chiamate, in fondo, vincono) e non
  // quello che il motore fa da solo senza che glielo si dica (MOTORE: i valori di superdough). Così il codice incollato non si riempie di numeri nuovi.
  const nomiMano = new Set((s.mano ?? []).map((m) => /^\.(\w+)/.exec(m.trim())?.[1]).filter(Boolean));
  const mio = (k) => !funzioniDi(k).some((f) => nomiMano.has(f));
  const scrivi = (k) => mio(k) && !(k in MOTORE && MOTORE[k] === s[k]);
  const t = s.tipo;
  const prefisso = t.slice(0, 2);

  // oscillatore
  let osc = `  .s("${s.forma}")`;
  if (s.forma === 'supersaw') osc += [scrivi('voci') && `.unison(${s.voci})`, scrivi('detune') && `.detune(${num(s.detune)})`, scrivi('spread') && `.spread(${num(s.spread)})`].filter(Boolean).join('');
  if (s.forma === 'pulse' && scrivi('pw')) osc += `.pw(${num(s.pw)})`;
  r.push(osc);
  const riga = (...pezzi) => {
    const v = pezzi.filter(Boolean).join('');
    if (v) r.push(`  ${v}`);
  };
  if (!rumore) {
    riga(s.fm > 0 && scrivi('fm') && `.fm(${num(s.fm)})`, s.fm > 0 && scrivi('fmh') && `.fmh(${num(s.fmh)})`);
    riga(s.penv !== 0 && mio('penv') && `.penv(${num(s.penv)})`, s.penv !== 0 && mio('pdecay') && `.pdecay(${num(s.pdecay)})`);
  }
  if (s.pan !== 0.5 && mio('pan')) r.push(`  .pan(${num(s.pan)})`);

  // filtro (solo le chiamate del filtro in uso contano per il «a mano»)
  if (s.cutoff !== NEUTRO_CUTOFF[t] || s.q !== 1 || s.fenv > 0) {
    riga(!nomiMano.has(t) && `.${t}(${num(s.cutoff)})`, s.q !== 1 && !nomiMano.has(`${prefisso}q`) && `.${prefisso}q(${num(s.q)})`, s.ftype !== '12db' && !nomiMano.has('ftype') && `.ftype("${s.ftype}")`);
    if (s.fenv > 0) {
      const f = (suffisso, v) => !nomiMano.has(`${prefisso}${suffisso}`) && `.${prefisso}${suffisso}(${num(v)})`;
      riga(f('env', s.fenv), f('attack', s.fattacco), f('decay', s.fdecay));
      riga(f('sustain', s.fsustain), f('release', s.frelease));
    }
  }
  if (s.vowel && mio('vowel')) r.push(`  .vowel("${s.vowel}")`);

  // ampiezza: l'inviluppo intero (un ADSR a metà in superdough riempie i buchi), ma niente se è quello che il motore fa da solo
  if (!(s.attack === MOTORE.attack && s.decay === MOTORE.decay && s.sustain === MOTORE.sustain && s.release === MOTORE.release)) {
    riga(...['attack', 'decay', 'sustain', 'release'].map((k) => mio(k) && `.${k}(${num(s[k])})`));
  }
  if (s.gain !== 0.8 && mio('gain')) r.push(`  .gain(${num(s.gain)})`);

  // effetti
  riga(s.shape > 0 && mio('shape') && `.shape(${num(s.shape)})`, s.distort > 0 && mio('distort') && `.distort(${num(s.distort)})`, s.crush < 16 && mio('crush') && `.crush(${s.crush})`, s.coarse > 1 && mio('coarse') && `.coarse(${s.coarse})`);
  riga(s.phaser > 0 && mio('phaser') && `.phaser(${num(s.phaser)})`, s.phaser > 0 && scrivi('phaserdepth') && `.phaserdepth(${num(s.phaserdepth)})`);
  riga(s.tremolo > 0 && mio('tremolo') && `.tremolosync(${s.tremolo})`, s.tremolo > 0 && scrivi('tremolodepth') && `.tremolodepth(${num(s.tremolodepth)})`);
  riga(s.delay > 0 && mio('delay') && `.delay(${num(s.delay)})`, s.delay > 0 && scrivi('delaysync') && `.delaysync(${s.delaysync})`, s.delay > 0 && scrivi('delayfeedback') && `.delayfeedback(${num(s.delayfeedback)})`);
  riga(s.room > 0 && mio('room') && `.room(${num(s.room)})`, s.room > 0 && scrivi('roomsize') && `.roomsize(${num(s.roomsize)})`);
  for (const m of s.mano ?? []) r.push(`  ${m.trim()}`); // le chiamate scritte a mano, com'erano, in fondo (l'ultimo valore vince)
  return r.join('\n');
}

// La riga `// @synth {…}`: lo stato del pannello, perché «apri nel synth» riapra la clip esatta.
// Solo quello che è diverso dal suono init: la riga resta corta (il resto torna da pulisci).
export function rigaSynth(stato) {
  const s = pulisci(stato, { tetto: false });
  const base = iniziale();
  const diverse = Object.fromEntries(Object.entries(s).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k])));
  return `${MARCA} ${JSON.stringify(diverse)}`;
}

// Codice di una clip: la riga @synth in testa, poi il codice.
// Nella riga ci vanno le note che suonano davvero (schema «clip»): riaprendola nel synth le note sono quelle.
export function clip(stato) {
  const s = pulisci(stato, { tetto: false });
  return `${rigaSynth({ ...s, anteprima: 'clip', note: noteEffettive(s), scala: inGradi(s) ? s.scala : '', vel: conVelocity(s) ? s.vel : '' })}\n${codice(s)}\n`;
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

// --- il codice scritto a mano: dal testo al pannello ---
// Il pannello legge il codice come una catena `testa.chiamata(…).chiamata(…)`. Le chiamate che conosce (con un numero o una scelta
// semplice dentro) spostano le manopole; tutte le altre restano scritte com'erano (`mano`), in fondo, e non si perdono mai.
// Quello che il codice non nomina è spento (spento() in synth-modello.js). Un errore di forma o un valore fuori dai limiti
// del pannello non cambia niente: chi chiama tiene il suono di prima e dice l'errore.

// Il testo spezzato in testa e chiamate a livello zero (rispetta stringhe, parentesi e commenti //). { testa, chiamate: [{ nome, args, testo }] } o { errore }.
export function spezza(testo) {
  let t = '';
  let i = 0;
  const src = String(testo);
  const pezzi = [];
  let corrente = '';
  let profondita = 0;
  let aperta = null;
  const intro = []; // i commenti prima del codice: non si perdono
  while (i < src.length) {
    const c = src[i];
    if (aperta) {
      corrente += c;
      if (c === '\\') corrente += src[++i] ?? '';
      else if (c === aperta) aperta = null;
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      const da = i;
      while (i < src.length && src[i] !== '\n') i++; // un commento: in cima si tiene (intro), altrove no (le righe commentate non contano)
      if (!pezzi.length && !corrente.trim()) intro.push(src.slice(da, i).trimEnd());
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      aperta = c;
      corrente += c;
      i++;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') profondita++;
    if (c === ')' || c === ']' || c === '}') profondita--;
    if (profondita < 0) return { errore: 'parentesi chiusa di troppo' };
    if (c === '.' && profondita === 0 && /[A-Za-z_]/.test(src[i + 1] ?? '') && corrente.trim()) {
      pezzi.push(corrente);
      corrente = '';
    }
    corrente += c;
    i++;
  }
  if (aperta) return { errore: 'stringa non chiusa' };
  if (profondita !== 0) return { errore: 'parentesi non chiusa' };
  pezzi.push(corrente);
  t = pezzi[0].trim().replace(/;\s*$/, '');
  if (!t) return { errore: 'manca l\'inizio (note("…"))' };
  const chiamate = [];
  for (const p of pezzi.slice(1)) {
    const testoP = p.trim().replace(/;\s*$/, '');
    const m = /^\.([A-Za-z_]\w*)\s*\(([\s\S]*)\)$/.exec(testoP);
    if (!m) return { errore: `non leggo «${testoP.slice(0, 30)}»` };
    chiamate.push({ nome: m[1], args: m[2].trim(), testo: `.${m[1]}(${m[2].trim()})` });
  }
  return { testa: t, chiamate, intro: intro.join('\n') };
}

const NUM = /^-?(?:\d+\.?\d*|\.\d+)$/;
const numero = (a) => (NUM.test(a) ? Number(a) : null);
const stringa = (a) => /^(["'])([^"'\\]*)\1$/.exec(a)?.[2] ?? null;

// funzione → chiave del pannello, per le chiamate che hanno un numero e basta
const NUMERICHE = {
  detune: 'detune', spread: 'spread', pw: 'pw', fm: 'fm', fmh: 'fmh', penv: 'penv', pdecay: 'pdecay', pan: 'pan',
  attack: 'attack', decay: 'decay', sustain: 'sustain', release: 'release', gain: 'gain',
  shape: 'shape', distort: 'distort', crush: 'crush', coarse: 'coarse', phaser: 'phaser', phaserdepth: 'phaserdepth',
  tremolosync: 'tremolo', tremolodepth: 'tremolodepth', delay: 'delay', delayfeedback: 'delayfeedback', room: 'room', roomsize: 'roomsize',
};
const FILTRI = ['lpf', 'hpf', 'bpf'];
const PREFISSO = { lpf: 'lp', hpf: 'hp', bpf: 'bp' };
const ENV = { env: 'fenv', attack: 'fattacco', decay: 'fdecay', sustain: 'fsustain', release: 'frelease' };

// Le funzioni del pannello che comandano questa manopola (per segnare «a mano» le manopole che il codice scritto a mano scavalca).
export function funzioniDi(k) {
  const l = [];
  for (const [f, chiave] of Object.entries(NUMERICHE)) if (chiave === k) l.push(f);
  if (k === 'cutoff') l.push(...FILTRI);
  if (k === 'q') l.push('lpq', 'hpq', 'bpq');
  if (k === 'ftype') l.push('ftype');
  if (k === 'forma') l.push('s');
  if (k === 'voci') l.push('unison');
  if (k === 'vowel') l.push('vowel');
  if (k === 'delaysync') l.push('delaysync', 'delaytime');
  if (k === 'ottava') l.push('trans');
  if (k === 'sub') l.push('add');
  for (const [suffisso, chiave] of Object.entries(ENV)) if (chiave === k) for (const pf of Object.values(PREFISSO)) l.push(`${pf}${suffisso}`);
  return l;
}

// Il codice → { stato, errori } oppure { errore }. base = lo stato di adesso (note, schema, tipo, che il codice non cambia).
export function leggiCodice(testo, base = iniziale()) {
  const sp = spezza(testo);
  if (sp.errore) return { errore: sp.errore };
  const s = { ...spento(), note: base.note, anteprima: base.anteprima, categoria: base.categoria, testa: '', mano: [], scala: '', vel: '', intro: introValida(sp.intro) ? sp.intro : '' };
  const errori = [];
  const mano = [];
  // la testa: note("…") sono le note della clip; n("…") con .scale("…") sono i gradi di una scala; qualsiasi altra cosa resta com'è
  const nota = /^note\(\s*"([^"]*)"\s*\)$/.exec(sp.testa);
  const gradi = /^n\(\s*"([^"]*)"\s*\)$/.exec(sp.testa);
  const scale = sp.chiamate.filter((c) => c.nome === 'scale');
  const scalaLetta = gradi && scale.length === 1 ? stringa(scale[0].args) : null;
  if (nota && noteValide(nota[1])) {
    s.note = nota[1].trim();
    s.anteprima = 'clip';
  } else if (gradi && noteValide(gradi[1]) && scalaLetta && scalaValida(scalaLetta)) {
    s.note = gradi[1].trim();
    s.scala = scalaLetta.trim();
    s.anteprima = 'clip';
  } else if (testaValida(sp.testa)) s.testa = sp.testa.replace(/\s+/g, ' ');
  else return { errore: 'l\'inizio del codice non si legge' };

  const chiamate = s.scala ? sp.chiamate.filter((c) => c.nome !== 'scale') : sp.chiamate; // la scala è già nello stato
  // la forma per prima: da lei dipende cosa vale unison
  const forma = [...chiamate].reverse().map((c) => (c.nome === 's' ? stringa(c.args) : null)).find((f) => f && FORME.includes(f));
  if (forma) s.forma = forma;
  const visti = new Set();
  const tipo = chiamate.find((c) => FILTRI.includes(c.nome) && numero(c.args) !== null)?.nome;
  if (tipo) s.tipo = tipo;
  const dai = (chiave, v, testoChiamata) => {
    const p = parametro(chiave);
    const { min, max } = limiti(p, s);
    if (v < min || v > max) {
      errori.push(`fuori limiti: ${testoChiamata} (${min}–${max})`);
      return false;
    }
    s[chiave] = pulisciValore(p, v);
    return true;
  };
  // chi scrive due volte la stessa cosa (.lpf(400).lpf(900)): vale l'ultima, la prima era già scavalcata. (add e trans invece si sommano.)
  const ultimo = new Map(chiamate.map((c, i) => [c.nome, i]));
  const sovrascrivibile = (n) =>
    n === 's' || n === 'unison' || n in NUMERICHE || FILTRI.includes(n) || /^(lp|hp|bp)q$/.test(n) || n === 'ftype' || n === 'vowel' || n === 'delaysync' || /^(lp|hp|bp)(env|attack|decay|sustain|release)$/.test(n);
  for (const [indice, c] of chiamate.entries()) {
    const n = c.nome;
    if (sovrascrivibile(n) && ultimo.get(n) !== indice) continue;
    const v = numero(c.args);
    const str = stringa(c.args);
    let preso = false;
    if (n === 's' && str && FORME.includes(str) && str === s.forma && !visti.has('s')) preso = true;
    else if (n === 'unison' && v !== null && s.forma === 'supersaw' && !visti.has(n)) preso = dai('voci', v, c.testo);
    else if (n in NUMERICHE && v !== null && !visti.has(n)) {
      const k = NUMERICHE[n];
      const attiva = { detune: s.forma === 'supersaw', spread: s.forma === 'supersaw', pw: s.forma === 'pulse' }[n];
      if (attiva !== false) preso = dai(k, v, c.testo);
    } else if (FILTRI.includes(n) && v !== null && n === s.tipo && !visti.has('filtro')) {
      preso = dai('cutoff', v, c.testo);
      if (preso) visti.add('filtro');
    } else if (/^(lp|hp|bp)q$/.test(n) && v !== null && n === `${PREFISSO[s.tipo]}q` && !visti.has('q')) {
      preso = dai('q', v, c.testo);
      if (preso) visti.add('q');
    } else if (n === 'ftype' && str && PENDENZE.includes(str) && !visti.has(n)) {
      s.ftype = str;
      preso = true;
    } else if (n === 'vowel' && str && VOCALI.includes(str) && str !== '' && !visti.has(n)) {
      s.vowel = str;
      preso = true;
    } else if (n === 'delaysync' && !visti.has(n)) {
      const f = /^(\d+)\s*\/\s*(\d+)$/.exec(c.args);
      const chiave = f ? `${f[1]}/${f[2]}` : null;
      if (chiave && DIVISIONI.includes(chiave)) {
        s.delaysync = chiave;
        preso = true;
      }
    } else if (n === 'trans' && v !== null && v % 12 === 0 && Math.abs(v) <= 24 && !visti.has(n)) {
      s.ottava = v / 12;
      preso = true;
    } else if (n === 'add' && !visti.has(n) && !eRumore(s.forma)) {
      preso = leggiAdd(c.args, s);
    } else if (n === 'arpWith' && !visti.has(n) && s.anteprima === 'clip' && !s.testa && leggiArp(c.args)) {
      const a = leggiArp(c.args);
      s.arp = a.modo;
      s.arppasso = a.passo;
      s.arpott = a.ott;
      s.arppoly = a.poly;
      s.arpordine = a.ordine;
      preso = true;
    } else if (s.arp && (n === 'swingBy' || n === 'mul' || n === 'late' || n === 'mask' || n === 'ply' || n === 'every' || n === 'degradeBy' || n === 'sometimesBy')) {
      // le righe dell'arpeggio: si prendono solo se sono proprio quelle che il pannello scriverebbe
      const t = spazi(c.testo);
      let m;
      if (n === 'swingBy' && (m = /^\.swingBy\(([\d.]+),/.exec(t)) && !s.arpswing) {
        const x = pulisciValore(parametro('arpswing'), Number(m[1]));
        if (x > 0 && rigaArp({ ...s, arpswing: x }, 'swing') === t) (s.arpswing = x), (preso = true);
      } else if (n === 'late' && (m = /^\.late\(rand\.range\(0, ([\d.]+)\)\.segment\(\d+\)\)$/.exec(t)) && !s.arpumano) {
        const x = pulisciValore(parametro('arpumano'), Number(m[1]) / 0.01);
        if (x > 0 && rigaArp({ ...s, arpumano: x }, 'late') === t) (s.arpumano = x), (preso = true);
      } else if (n === 'mul') {
        const accento = ARP_ACCENTI.slice(1).find((k) => rigaArp({ ...s, arpacc: k }, 'acc') === t);
        if (accento && !s.arpacc) (s.arpacc = accento), (preso = true);
        else if (s.arpumano > 0 && rigaArp(s, 'vel') === t) preso = true;
      } else if (n === 'mask' && (m = /^\.mask\("1\((\d+),(\d+)(?:,(\d+))?\)"\)$/.exec(t)) && !s.arppulse) {
        const k = pulisciValore(parametro('arppulse'), Number(m[1]));
        const rot = pulisciValore(parametro('arprot'), Number(m[3] ?? 0));
        if (k > 0 && rigaArp({ ...s, arppulse: k, arprot: rot }, 'mask') === t) (s.arppulse = k), (s.arprot = rot), (preso = true);
      } else if (n === 'every' && !s.arpevolve) {
        const e = ARP_EVOLVE.slice(1).find((k) => ARP_OGNI.some((o) => rigaArp({ ...s, arpevolve: k, arpogni: o }, 'evolve') === t));
        const o = e && ARP_OGNI.find((x) => rigaArp({ ...s, arpevolve: e, arpogni: x }, 'evolve') === t);
        if (e) (s.arpevolve = e), (s.arpogni = o), (preso = true);
      } else if (n === 'degradeBy' && (m = /^\.degradeBy\(([\d.]+)\)$/.exec(t)) && s.arpchance === 1) {
        const x = pulisciValore(parametro('arpchance'), 1 - Number(m[1]));
        if (x < 1 && rigaArp({ ...s, arpchance: x }, 'chance') === t) (s.arpchance = x), (preso = true);
      } else if (n === 'sometimesBy' && (m = /^\.sometimesBy\(([\d.]+),/.exec(t)) && !s.arpjump) {
        const x = pulisciValore(parametro('arpjump'), Number(m[1]));
        if (x > 0 && rigaArp({ ...s, arpjump: x }, 'jump') === t) (s.arpjump = x), (preso = true);
      } else if (n === 'ply' && !s.arpretrig) {
        const r = ARP_RETRIG.slice(1).find((k) => rigaArp({ ...s, arpretrig: k }, 'ply') === t);
        if (r) (s.arpretrig = r), (preso = true);
      }
    } else if (n === 'clip' && !visti.has(n) && s.arp && v !== null && v >= 0.1 && v < 1) {
      s.arpgate = pulisciValore(parametro('arpgate'), v);
      preso = true;
    } else if (n === 'velocity' && !visti.has(n) && s.anteprima === 'clip' && !s.testa) {
      // .velocity("1 .5 .8") o .velocity(.6): la velocity delle note, se si legge nel pianoroll; altrimenti resta a mano
      const testo = str ?? (v !== null ? num(v) : null);
      if (testo !== null && velValida(testo)) {
        s.vel = testo.trim();
        preso = true;
      }
    } else {
      // le funzioni dell'inviluppo del filtro: lpenv, lpattack… (solo quelle del tipo di filtro in uso)
      const m = /^(lp|hp|bp)(env|attack|decay|sustain|release)$/.exec(n);
      if (m && v !== null && m[1] === PREFISSO[s.tipo] && !visti.has(n)) preso = dai(ENV[m[2]], v, c.testo);
    }
    if (preso) visti.add(n);
    else mano.push(c.testo);
  }
  if (forma === 'supersaw' && !visti.has('unison')) s.voci = Math.min(5, UNISON_MAX); // superdough: 5 voci se non si dice
  // un inviluppo scritto a metà: superdough riempie i buchi a modo suo (decay e sustain minimi, o sustain pieno se c'è solo l'attack), e il pannello fa lo stesso
  const adsr = ['attack', 'decay', 'sustain', 'release'].map((k) => (visti.has(k) ? s[k] : undefined));
  if (adsr.some((x) => x !== undefined)) {
    const [a1, d1, s1, r1] = adsr;
    s.attack = Math.max(a1 ?? 0, 0.001);
    s.decay = Math.max(d1 ?? 0, 0.001);
    s.sustain = Math.min(s1 ?? ((a1 !== undefined && d1 === undefined) || (a1 === undefined && d1 === undefined) ? 1 : 0.001), 1);
    s.release = Math.max(r1 ?? 0, 0.01);
  }
  s.mano = mano.filter((x) => x.length <= 300).slice(0, 40);
  if (errori.length) return { errore: errori[0], errori };
  return { stato: pulisci(s, { tetto: false }), mano: s.mano };
}

// .add(note("-.1,0,.1,-12")): le voci sovrapposte e il sub. Quello che non riconosce resta a mano.
function leggiAdd(args, s) {
  const m = /^note\(\s*"([^"]*)"\s*\)$/.exec(args);
  if (!m) return false;
  const lista = m[1].split(',').map((x) => x.trim());
  if (!lista.length || lista.some((x) => !NUM.test(x))) return false;
  let valori = lista.map(Number);
  let sub = 0;
  if (valori.length > 1 && valori.at(-1) === -12) {
    sub = 1;
    valori = valori.slice(0, -1);
  }
  if (valori.length === 1 && valori[0] === 0) {
    s.sub = sub;
    return sub === 1;
  }
  if (s.forma === 'supersaw' || valori.length < 2 || valori.length > 5) return false;
  const d = valori.at(-1);
  const regolare = d > 0 && d <= 1 && valori.every((x, i) => Math.abs(x - (-d + (2 * d * i) / (valori.length - 1))) < 0.0016);
  if (!regolare) return false;
  s.voci = valori.length;
  s.detune = Math.round(d * 100) / 100;
  s.sub = sub;
  return true;
}
