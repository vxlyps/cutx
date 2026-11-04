// Dal suono del SYNTH al codice Strudel, e ritorno per la riga `// @synth`.
// Si scrivono solo i parametri ATTIVI (quelli a valore neutro stanno nel pannello e non nel codice); l'inviluppo d'ampiezza
// c'è sempre, intero, perché in superdough un ADSR a metà riempie i buchi con valori che non sono quelli del pannello.
// Modulo puro: lo provano i test. Ogni numero che entra nel codice passa da pulisci(): nessun testo libero tranne le note,
// che hanno un elenco di caratteri ammessi.
import { DIVISIONI, FORME, NOTE_ANTEPRIMA, PENDENZE, UNISON_MAX, VOCALI, eRumore, iniziale, introValida, limiti, noteValide, parametro, pulisci, pulisciValore, scalaValida, spento, testaValida } from './synth-modello.js';
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

export const inGradi = (s) => !!s.scala && scalaValida(s.scala) && s.anteprima === 'clip' && noteValide(s.note);

// Il codice del suono, con le note dello schema scelto. Righe corte: si legge anche sul proiettore.
export function codice(stato) {
  const s = stato;
  const rumore = eRumore(s.forma);
  const r = s.intro && introValida(s.intro) ? s.intro.split('\n').map((x) => x.trimEnd()) : [];
  if (s.testa && testaValida(s.testa)) r.push(s.testa);
  else if (inGradi(s)) r.push(`n("${s.note}")`, `  .scale("${s.scala}")`);
  else r.push(`note("${noteEffettive(s)}")`);
  if (conVelocity(s)) r.push(`  .velocity("${s.vel}")`);

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
