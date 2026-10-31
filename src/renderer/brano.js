// Il brano: un file .cutx di testo semplice, leggibile con qualsiasi editor.
//
//   // @brano notte              ┐
//   // @bpm 140                  │ testa: nome, BPM, data, suoni dello stash usati
//   // @data 2026-10-20          │
//   // @origine /percorso/x.als   │ (solo se importato da Ableton)
//   // @suoni jungle_break, voce ┘
//   // Una descrizione, se c'è: i commenti subito sotto la testa stanno con la testa
//   setcpm(140/4)                ← preambolo: valutato con ogni sezione
//   // @beat                     ← la base ritmica, con le sue scene (opzionale, uno solo; i brani senza @beat vanno come sempre)
//   // @scena intro              ← ogni scena è una versione del codice del beat
//   s("bd*4")
//   // @scena drop
//   s("bd*4, hh*8")
//   // @clip basso · volume 0.8 · muto   ← da qui una clip, fino alla prossima (informazioni della clip, dal live)
//   note("c1*8").s("supersaw")
//
// I nomi vecchi (@spina, @momento, @pezzo, @sezione) si leggono ancora; CUTX scrive sempre quelli nuovi (aggiornaTag).
// Internamente le clip si chiamano ancora «sezioni» (modello.sezioni, blocchi, B.codice…).
//
// Il brano si tiene riga per riga, così com'è: riscriverlo dà esattamente il testo di partenza.
// Le funzioni qui non toccano niente fuori: prendono un brano e ne restituiscono uno nuovo.

import { unisci as unisciCoda } from './coda.js';

export const NOMI_SEZIONE = ['intro', 'drum', 'basso', 'melodia', 'break', 'drop', 'outro'];

const TESTA = /^\/\/ @(brano|bpm|data|origine|suoni)(?:\s+(.*))?$/;
// i nomi nuovi sono @beat, @scena, @clip; i vecchi (@spina, @momento, @pezzo, @sezione) si leggono ancora
const SEZIONE = /^\s*\/\/\s*@(?:clip|sezione|pezzo)\b\s*(.*)$/;
const BEAT = /^\s*\/\/\s*@(?:beat|spina)\b\s*(.*)$/;
const SCENA = /^\s*\/\/\s*@(?:scena|momento)\b\s*(.*)$/;
const APERTURA = /^\s*\/\/\s*@apertura\b\s*(.*)$/; // il codice con cui comincia il brano, scritto dal vivo (testo fantasma nel CUE)
// Un commento (anche "//" da solo): quelli subito sotto la testa sono la descrizione del brano, fanno parte della testa.
const COMMENTO = /^\s*\/\//;
const ORDINE_TESTA = ['brano', 'bpm', 'data', 'origine', 'suoni'];
const SEP = ' · ';

export const eSezione = (riga) => SEZIONE.test(riga);
export const eBeat = (riga) => BEAT.test(riga);
export const eScena = (riga) => SCENA.test(riga);
export const eApertura = (riga) => APERTURA.test(riga);
// l'inizio di qualsiasi blocco del brano dopo il preambolo
const eInizioBlocco = (riga) => eSezione(riga) || eBeat(riga) || eApertura(riga);

// "intro · volume 0.8 · muto" → { nome: 'intro', info: { volume: 0.8, muto: true } }
export function leggiRigaSezione(riga) {
  const resto = (riga.match(SEZIONE) ?? riga.match(SCENA) ?? riga.match(BEAT))?.[1]?.trim() ?? '';
  const [nome, ...pezzi] = resto.split(/\s+·\s+/);
  const info = {};
  for (const p of pezzi) {
    const [chiave, ...valore] = p.trim().split(/\s+/);
    if (!chiave) continue;
    const v = valore.join(' ');
    info[chiave] = v === '' ? true : Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return { nome: nome.trim(), info };
}

export function rigaSezione(nome, info = {}) {
  const pezzi = Object.entries(info)
    .filter(([, v]) => v !== false && v !== undefined && v !== null)
    .map(([k, v]) => (v === true ? k : `${k} ${v}`));
  return `// @clip ${[nome, ...pezzi].join(SEP)}`;
}

// --- leggere e scrivere ---

export function leggi(testo) {
  const righe = testo.split('\n');
  let i = 0;
  const testa = [];
  while (i < righe.length && TESTA.test(righe[i])) testa.push(righe[i++]);
  // I commenti subito sotto la testa (una descrizione del brano) stanno con la testa: non sono codice e non devono
  // finire nel preambolo, cioè davanti a ogni sezione mandata in cuffia o live. Si fermano alla prima riga vuota o di codice.
  if (testa.length) while (i < righe.length && COMMENTO.test(righe[i]) && !eSezione(righe[i])) testa.push(righe[i++]);
  const preambolo = [];
  while (i < righe.length && !eInizioBlocco(righe[i])) preambolo.push(righe[i++]);
  // l'apertura (opzionale, prima del beat): il codice che scrivo dal vivo per cominciare il brano
  let apertura = null;
  if (i < righe.length && eApertura(righe[i])) {
    apertura = { riga: righe[i++], corpo: [] };
    while (i < righe.length && !eSezione(righe[i]) && !eBeat(righe[i])) apertura.corpo.push(righe[i++]);
  }
  // il beat: la base ritmica con le sue scene (opzionale)
  let beat = null;
  if (i < righe.length && eBeat(righe[i])) {
    beat = { riga: righe[i++], intro: [], scene: [] };
    while (i < righe.length && !eSezione(righe[i]) && !eScena(righe[i])) beat.intro.push(righe[i++]);
    while (i < righe.length && eScena(righe[i])) {
      const riga = righe[i++];
      const corpo = [];
      while (i < righe.length && !eSezione(righe[i]) && !eScena(righe[i])) corpo.push(righe[i++]);
      beat.scene.push({ riga, ...leggiRigaSezione(riga), corpo });
    }
  }
  const sezioni = [];
  while (i < righe.length) {
    const riga = righe[i++];
    const corpo = [];
    while (i < righe.length && !eSezione(righe[i])) corpo.push(righe[i++]);
    sezioni.push({ riga, ...leggiRigaSezione(riga), corpo });
  }
  return { testa, preambolo, apertura, beat, sezioni };
}

export function scrivi(brano) {
  const beat = brano.beat ? [brano.beat.riga, ...brano.beat.intro, ...brano.beat.scene.flatMap((m) => [m.riga, ...m.corpo])] : [];
  const apertura = brano.apertura ? [brano.apertura.riga, ...brano.apertura.corpo] : [];
  return [...brano.testa, ...brano.preambolo, ...apertura, ...beat, ...brano.sezioni.flatMap((s) => [s.riga, ...s.corpo])].join('\n');
}

// Un testo con i tag vecchi → gli stessi con i nomi nuovi (@spina → @beat, @momento → @scena, @pezzo e @sezione → @clip); il resto non si tocca.
export function aggiornaTag(testo) {
  return String(testo)
    .split('\n')
    .map((r) => r.replace(/^(\s*\/\/\s*)@(spina)\b/, '$1@beat').replace(/^(\s*\/\/\s*)@momento\b/, '$1@scena').replace(/^(\s*\/\/\s*)@(pezzo|sezione)\b/, '$1@clip'))
    .join('\n');
}

// I valori della testa: { brano, bpm, data, origine, suoni: [] }
export function testa(brano) {
  const t = {};
  for (const r of brano.testa) {
    const m = r.match(TESTA);
    if (!m) continue; // un commento della descrizione
    const [, k, v = ''] = m;
    t[k] = k === 'suoni' ? v.split(',').map((x) => x.trim()).filter(Boolean) : k === 'bpm' ? Number(v) : v.trim();
  }
  return t;
}

// Cambia i valori della testa lasciando dove sono le righe che c'erano già.
export function conTesta(brano, valori) {
  const riga = (k, v) => `// @${k} ${Array.isArray(v) ? v.join(', ') : v}`.trimEnd();
  const testaNuova = [...brano.testa];
  for (const k of ORDINE_TESTA) {
    if (!(k in valori)) continue;
    const i = testaNuova.findIndex((r) => r.match(TESTA)?.[1] === k);
    if (i >= 0) testaNuova[i] = riga(k, valori[k]);
    else {
      // in ordine: dopo l'ultima chiave che la precede
      const prima = ORDINE_TESTA.slice(0, ORDINE_TESTA.indexOf(k));
      let dove = 0;
      testaNuova.forEach((r, j) => prima.includes(r.match(TESTA)?.[1]) && (dove = j + 1));
      testaNuova.splice(dove, 0, riga(k, valori[k]));
    }
  }
  return { ...brano, testa: testaNuova };
}

// --- il tempo ---

// Una riga che cambia il tempo: setcpm(...) o setcps(...) da sola.
const RIGA_TEMPO = /^\s*setcp[ms]\s*\(.*\)\s*;?\s*(\/\/.*)?$/;

// Il testo senza le righe che cambiano il tempo: serve quando un brano a un altro BPM entra in un live che sta già suonando
// (il tempo del set non cambia da solo) e quando si salva il live (il tempo è uno solo, nel preambolo).
export const senzaTempo = (testo) => testo.split('\n').filter((r) => !RIGA_TEMPO.test(r)).join('\n');

// Il BPM di un brano: quello che suona (il setcpm del preambolo, 4 quarti per ciclo), o se manca quello della testa.
export function bpmDelBrano(brano) {
  for (const riga of brano.preambolo) {
    const m = /^\s*setcpm\s*\(\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/.exec(riga);
    if (m && Number(m[2] ?? 1) > 0) return Math.round(((Number(m[1]) / Number(m[2] ?? 1)) * 4) * 1000) / 1000;
  }
  const { bpm } = testa(brano);
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

// Una sezione che suona un file audio da una parte all'altra (s("…").begin().end()): non segue il tempo del set.
export const eSezioneAudio = (testo) => /\.(begin|end)\(/.test(testo);

// --- il codice da suonare ---

// Preambolo + righe della sezione (tutte, o solo quelle scelte). In `inizio` c'è dove
// cominciano le righe della sezione nel codice, per riportare le note evidenziate al loro posto.
export function codice(brano, i, righe = null) {
  const pre = brano.preambolo.join('\n');
  const corpo = (righe ?? brano.sezioni[i].corpo).join('\n');
  const inizio = pre ? pre.length + 1 : 0;
  return { codice: pre ? `${pre}\n${corpo}` : corpo, inizio };
}

// --- l'apertura ---

export const haApertura = (brano) => !!brano.apertura;

// Il codice dell'apertura (testo): le righe del corpo.
export const testoApertura = (brano) => (brano.apertura ? brano.apertura.corpo.join('\n').replace(/^\n+|\n+$/g, '') : '');

// Il codice da mandare dell'apertura (quello che ho scritto io, o solo le righe scelte): preambolo + righe, come per una clip.
export function codiceApertura(brano, righe) {
  const pre = brano.preambolo.join('\n');
  const corpo = righe.join('\n');
  return { codice: pre.trim() ? `${pre}\n${corpo}` : corpo, inizio: pre.trim() ? pre.length + 1 : 0 };
}

export const conCorpoApertura = (brano, corpo) => ({ ...brano, apertura: { ...(brano.apertura ?? { riga: '// @apertura' }), corpo } });
export const conApertura = (brano, corpo = []) => conCorpoApertura(brano.apertura ? brano : { ...brano, apertura: { riga: '// @apertura', corpo: [] } }, corpo);
export const senzaApertura = (brano) => ({ ...brano, apertura: null });

// --- il beat e le sue scene ---

export const haBeat = (brano) => !!brano.beat?.scene.length;

// Il codice di una scena: preambolo + le righe della scena (o solo quelle scelte), come per una sezione.
export function codiceScena(brano, k, righe = null) {
  const pre = brano.preambolo.join('\n');
  const corpo = (righe ?? brano.beat.scene[k].corpo).join('\n');
  return { codice: pre ? `${pre}\n${corpo}` : corpo, inizio: pre ? pre.length + 1 : 0 };
}

const conScene = (brano, scene) => ({ ...brano, beat: { ...(brano.beat ?? { riga: '// @beat', intro: [] }), scene } });

export const conCorpoScena = (brano, k, corpo) => conScene(brano, brano.beat.scene.map((m, j) => (j === k ? { ...m, corpo } : m)));

export const rinominaScena = (brano, k, nome) =>
  conScene(brano, brano.beat.scene.map((m, j) => (j === k ? { ...m, nome, riga: rigaScena(nome, m.info) } : m)));

export const rigaScena = (nome, info = {}) => rigaSezione(nome, info).replace('// @clip', '// @scena');

// Un momento nuovo in fondo alla spina (e la spina, se non c'era).
export const aggiungiScena = (brano, nome, corpo = []) =>
  conScene(brano, [...(brano.beat?.scene ?? []), { riga: rigaScena(nome), nome, info: {}, corpo }]);

export function togliScena(brano, k) {
  const scene = brano.beat.scene.filter((_, j) => j !== k);
  return scene.length ? conScene(brano, scene) : { ...brano, beat: null };
}

// --- operazioni sulle sezioni ---

const conSezioni = (brano, sezioni) => ({ ...brano, sezioni });

export function rinomina(brano, i, nome) {
  return conSezioni(
    brano,
    brano.sezioni.map((s, j) => (j === i ? { ...s, nome, riga: rigaSezione(nome, s.info) } : s)),
  );
}

export function conInfo(brano, i, info) {
  return conSezioni(
    brano,
    brano.sezioni.map((s, j) => (j === i ? { ...s, info, riga: rigaSezione(s.nome, info) } : s)),
  );
}

// Una sezione nuova in fondo al brano (un livello tolto che torna nel CUE).
export function conSezioneInFondo(brano, nome, info, codice) {
  const corpo = codice.replace(/\s+$/, '').split('\n');
  return conSezioni(brano, [...brano.sezioni, { riga: rigaSezione(nome, info), nome, info, corpo }]);
}

// La sezione i si prende il corpo della successiva.
export function unisci(brano, i) {
  if (i < 0 || i >= brano.sezioni.length - 1) return brano;
  const a = brano.sezioni[i];
  const b = brano.sezioni[i + 1];
  const sezioni = [...brano.sezioni];
  sezioni.splice(i, 2, { ...a, corpo: [...a.corpo, ...b.corpo] });
  return conSezioni(brano, sezioni);
}

// Dalla riga k del corpo in poi diventa una sezione nuova, subito dopo.
export function dividi(brano, i, k, nome) {
  const s = brano.sezioni[i];
  if (!s || k <= 0 || k > s.corpo.length) return brano;
  const sezioni = [...brano.sezioni];
  sezioni.splice(i, 1, { ...s, corpo: s.corpo.slice(0, k) }, { riga: rigaSezione(nome), nome, info: {}, corpo: s.corpo.slice(k) });
  return conSezioni(brano, sezioni);
}

export function sposta(brano, da, a) {
  if (da === a || da < 0 || a < 0 || da >= brano.sezioni.length || a >= brano.sezioni.length) return brano;
  const sezioni = [...brano.sezioni];
  const [s] = sezioni.splice(da, 1);
  sezioni.splice(a, 0, s);
  return conSezioni(brano, sezioni);
}

export function conCorpo(brano, i, corpo) {
  return conSezioni(
    brano,
    brano.sezioni.map((s, j) => (j === i ? { ...s, corpo } : s)),
  );
}

// --- lavorare sul testo intero (modalità libero) ---

// I blocchi del testo, con le righe (contate da 0) in cui stanno.
// Il blocco del preambolo ha sezione = -1; la testa è fuori dai blocchi.
export function blocchi(testo) {
  const b = leggi(testo);
  const out = [];
  let riga = b.testa.length;
  out.push({ sezione: -1, nome: null, testa: null, da: riga, a: riga + b.preambolo.length });
  riga += b.preambolo.length;
  if (b.apertura) {
    out.push({ sezione: -4, nome: 'apertura', testa: riga, da: riga + 1, a: riga + 1 + b.apertura.corpo.length });
    riga += 1 + b.apertura.corpo.length;
  }
  if (b.beat) {
    // il beat: l'intestazione (sezione −3) e ogni scena (sezione −2, con `scena` = il suo indice)
    out.push({ sezione: -3, nome: null, testa: riga, da: riga + 1, a: riga + 1 + b.beat.intro.length });
    riga += 1 + b.beat.intro.length;
    b.beat.scene.forEach((m, k) => {
      out.push({ sezione: -2, scena: k, nome: m.nome, info: m.info, testa: riga, da: riga + 1, a: riga + 1 + m.corpo.length });
      riga += 1 + m.corpo.length;
    });
  }
  b.sezioni.forEach((s, i) => {
    out.push({ sezione: i, nome: s.nome, info: s.info, testa: riga, da: riga + 1, a: riga + 1 + s.corpo.length });
    riga += 1 + s.corpo.length;
  });
  return { brano: b, blocchi: out };
}

// Il blocco che contiene la riga n (la riga @sezione appartiene alla sua sezione).
export function bloccoDellaRiga(testo, n) {
  const { blocchi: bl } = blocchi(testo);
  return bl.find((x) => (x.testa ?? x.da) <= n && n < x.a) ?? bl.at(-1);
}

// "+ sezione": le righe da..a (comprese, contate da 0) diventano la sezione `nome`.
// Se stanno in mezzo a un blocco, le righe scelte si spostano subito dopo quel blocco,
// così quelle di prima e di dopo restano dov'erano. Ritorna { testo, riga } dove riga è la
// nuova riga @sezione, oppure { errore } se la selezione attraversa più clip.
export function aggiungiSezione(testo, da, a, nome) {
  const righe = testo.split('\n');
  const { blocchi: bl } = blocchi(testo);
  if (da < bl[0].da) return { errore: 'la testa del brano non può diventare una clip' };
  const blocco = bloccoDellaRiga(testo, da);
  if (blocco.sezione <= -2) return { errore: 'il beat non si divide in clip: le scene si scrivono con // @scena' };
  if (blocco.testa === da) return { errore: 'parti da una riga sotto il nome della clip' };
  if (a >= blocco.a) return { errore: 'la selezione attraversa più clip' };
  const scelte = righe.slice(da, a + 1);
  // Tutto il corpo di una sezione: basta rinominarla.
  if (blocco.sezione >= 0 && da === blocco.da && a === blocco.a - 1) {
    righe[blocco.testa] = rigaSezione(nome, blocco.info);
    return { testo: righe.join('\n'), riga: blocco.testa };
  }
  const resto = [...righe.slice(0, da), ...righe.slice(a + 1)];
  const dove = blocco.a - scelte.length; // la fine del blocco, senza le righe tolte
  resto.splice(dove, 0, rigaSezione(nome), ...scelte);
  return { testo: resto.join('\n'), riga: dove };
}

// --- dal live a un brano ---

// livelli: [{ nome, codice, coda, volume, muto }] (la coda va in fondo alla sezione, dopo `// @coda`) nell'ordine in cui sono entrati.
// Il tempo del file è uno solo, quello del set in quel momento (bpm): in testa e nel preambolo. Le righe setcpm dei livelli,
// che vengono dal brano da cui erano partiti, si tolgono: non devono contraddirlo.
export function daLivelli(livelli, { nome, bpm, data, suoni = [] }) {
  const visti = new Map();
  // il beat live (un livello con `scena`): si salva come @beat con la scena che suona adesso
  const laBeat = livelli.find((l) => l.beat);
  const beat = laBeat
    ? {
        riga: '// @beat',
        intro: [],
        scene: [{ riga: rigaScena(laBeat.scena?.nome ?? 'scena'), nome: laBeat.scena?.nome ?? 'scena', info: {}, corpo: unisciCoda((bpm ? senzaTempo(laBeat.codice) : laBeat.codice).replace(/\n+$/, ''), laBeat.coda).split('\n') }],
      }
    : null;
  const laApertura = livelli.find((l) => l.nome === 'apertura');
  const apertura = laApertura ? { riga: '// @apertura', corpo: unisciCoda((bpm ? senzaTempo(laApertura.codice) : laApertura.codice).replace(/\n+$/, ''), laApertura.coda).split('\n') } : null;
  const sezioni = livelli.filter((l) => !l.beat && l !== laApertura).map((l) => {
    // due livelli con lo stesso nome restano distinti: basso, basso 2…
    visti.set(l.nome, (visti.get(l.nome) ?? 0) + 1);
    const n = visti.get(l.nome) > 1 ? `${l.nome} ${visti.get(l.nome)}` : l.nome;
    const info = {};
    if (l.volume !== undefined && l.volume !== 1) info.volume = l.volume;
    if (l.muto) info.muto = true;
    return { riga: rigaSezione(n, info), nome: n, info, corpo: unisciCoda((bpm ? senzaTempo(l.codice) : l.codice).replace(/\n+$/, ''), l.coda).split('\n') };
  });
  const vuoto = { testa: [], preambolo: bpm ? ['', `setcpm(${bpm}/4)`, ''] : [], apertura, beat, sezioni };
  return scrivi(conTesta(vuoto, { brano: nome, bpm, data, suoni })) + '\n';
}

// Un nome di file sicuro dal nome del brano.
export function nomeFile(nome) {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${base || 'brano'}.cutx`;
}
