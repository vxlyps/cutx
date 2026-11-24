// X-TOUCH MANI: nella vista LIVE, col nano visto, l'X-Touch scolpisce il CH in focus (layer A) o tutto (layer B). Eventi finti, niente MIDI vero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../src/renderer/controller.js';
import { righeSweep, ereditaRighe, MANOPOLE_MANI } from '../src/renderer/controller-mani.js';
import { limitaRigaMani } from '../src/renderer/coda.js';

const giro = (n, passi) => [0xb0, 15 + n, passi > 0 ? passi : 0x40 | -passi];
const push = (n, giu) => [0x90, 31 + n, giu ? 127 : 0];
const tasto = (c, n, giu = true) => [0x90, c.tab.tasti[n - 1], giu ? 127 : 0];

// livelliDelCH: { ch → [livelli] }
function prova({ livelliDelCH = {}, maniAttiva = true } = {}) {
  const log = [];
  const chiamate = []; // il nome di ogni azione chiamata dal controller
  let t = 0;
  const timer = [];
  const attiva = { si: maniAttiva };
  const azioni = {
    livelli: () => Object.values(livelliDelCH).flat(),
    posti: () => Object.values(livelliDelCH).flat().concat(Array(6).fill(null)).slice(0, 6),
    selezionato: () => null,
    volume: () => {},
    muto: () => {},
    seleziona: () => {},
    coda: (id, riga) => log.push(['coda', id, riga]),
    togliRiga: (id, chiave) => log.push(['togli', id, chiave]),
    resetRiga: (id, chiave) => log.push(['reset', id, chiave]),
    master: (v) => log.push(['master', v]),
    scritta: (s) => log.push(['scritta', s]),
    riga: (s) => log.push(['riga', s]),
    paracadute: () => log.push(['paracadute']),
    inCuffia: () => false,
    maniAttiva: () => attiva.si,
    maniLivelli: (ch) => livelliDelCH[ch] ?? [],
    maniNome: (ch) => `CH${ch + 1} ${['THUMP', 'PURR', 'GROWL', 'HOWL', 'FUR', 'CLAW', 'HISS', 'STRAY'][ch]}`,
    maniFocus: (ch) => log.push(['focus', ch]),
    maniRiga: (ch, chiave, riga) => log.push(['maniRiga', ch, chiave, riga]),
    maniGlobale: (chiave, riga) => log.push(['globale', chiave, riga]),
    // le azioni che scelgono / navigano: ci sono per vedere se qualcuno le chiama
    goLive: () => {}, linguetta: () => ({ quale: 'a', nome: 'x' }), scena: () => {}, togli: () => {}, tocca: () => {}, passaBrano: () => {}, passaInAttesa: () => {},
    cueSposta: () => 'x', cuePosizione: () => null, cueBrano: () => {}, passoScattato: () => {}, registra: () => {}, cuffia: () => {},
  };
  for (const k of Object.keys(azioni)) { const f = azioni[k]; azioni[k] = (...a) => (chiamate.push(k), f(...a)); }
  const c = new Controller(azioni, { ora: () => t, imposta: (fn, ms) => { const x = { fn, a: t + ms }; timer.push(x); return x; }, ferma: (x) => x && (x.annullato = true) });
  c.modo = 'MC';
  const avanza = (ms) => {
    t += ms;
    for (const x of [...timer]) if (!x.annullato && !x.fatto && x.a <= t) ((x.fatto = true), x.fn());
  };
  return { c, log, avanza, attiva, chiamate };
}
const L = (id, nome, coda = [], codice = '') => ({ id, nome, volume: 1, muto: false, coda, codice });
const righeCoda = (log) => log.filter((x) => x[0] === 'coda').map((x) => x.slice(1));

test('SWEEP: a sinistra passa-basso, a destra passa-alto, al centro nessuna riga', () => {
  assert.deepEqual([righeSweep(0.5).imposta, righeSweep(0.5).togli], [null, null]);
  assert.match(righeSweep(0.1).imposta, /^\.lpf\(\d+\)$/);
  assert.equal(righeSweep(0.1).togli, 'hpf');
  assert.match(righeSweep(0.9).imposta, /^\.hpf\(\d+\)$/);
  assert.equal(righeSweep(0.9).togli, 'lpf');
  assert.equal(righeSweep(0.51).imposta, null, 'la zona morta al centro');
});

test('ereditaRighe: la clip prende le righe del CH; stessa chiave = vince la manopola; le altre della clip restano', () => {
  const righe = new Map([['lpf', '.lpf(800)'], ['room', '.room(0.4)']]);
  assert.deepEqual(ereditaRighe(['.lpf(5000)', '.pan(0.3)'], righe), ['.pan(0.3)', '.lpf(800)', '.room(0.4)']);
  assert.deepEqual(ereditaRighe(['.pan(0.3)'], new Map()), ['.pan(0.3)']);
  assert.deepEqual(ereditaRighe(undefined, righe), ['.lpf(800)', '.room(0.4)']);
});

test('FOCUS: i tasti in alto 1–8 scelgono il CH (si parte da CH1); il tasto 8 NON è il paracadute', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 2: [L(7, 'basso')] } });
  assert.equal(c.focusCH, 0);
  c.riceve(tasto(c, 3));
  c.riceve(tasto(c, 3, false));
  assert.equal(c.focusCH, 2);
  assert.ok(log.some((x) => x[0] === 'focus' && x[1] === 2));
  c.riceve(tasto(c, 8));
  avanza(1500); // tenuto: nel LIVE normale sarebbe il paracadute
  c.riceve(tasto(c, 8, false));
  assert.equal(c.focusCH, 7);
  assert.ok(!log.some((x) => x[0] === 'paracadute'), 'con MANI il paracadute sta solo sul nano');
});

test('luci: acceso solo il tasto del CH in FOCUS (non quello del paracadute)', () => {
  const { c } = prova({ livelliDelCH: { 2: [L(7, 'basso')] } });
  c.riceve(tasto(c, 3));
  const luci = c.desiderate();
  const acceso = (n) => luci.get(`t${c.tab.tasti[n - 1]}`);
  const dati = (n) => acceso(n)?.[2];
  assert.equal(dati(3), 127, 'CH3 acceso');
  assert.ok([1, 2, 4, 5, 6, 7, 8].every((n) => !dati(n)), 'gli altri spenti (anche il tasto 8, che è il FOCUS di CH8 e non il paracadute)');
});

test('manopole sul CH in FOCUS: scrivono righe di coda sul livello giusto, non sugli altri CH', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 2: [L(7, 'basso')], 3: [L(8, 'lead')] } });
  c.riceve(tasto(c, 3));
  c.riceve(giro(3, 5)); // eco
  avanza(100);
  assert.deepEqual(righeCoda(log).map((x) => x[0]), [7], 'solo il livello del CH3');
  assert.match(righeCoda(log)[0][1], /^\.delay\(/);
  assert.ok(log.some((x) => x[0] === 'maniRiga' && x[1] === 2 && x[2] === 'delay'), 'il CH ricorda la riga per le clip nuove');
  log.length = 0;
  c.riceve(giro(4, 3)); // riverbero
  c.riceve(giro(6, 2)); // sporco
  avanza(100);
  assert.deepEqual(righeCoda(log).map((x) => /^\.(\w+)/.exec(x[1])[1]).sort(), ['distort', 'room']);
  assert.ok(!righeCoda(log).some((x) => x[0] === 8), 'il CH4 non si tocca');
});

test('SWEEP sulla manopola 1: a sinistra .lpf, a destra .hpf (e toglie l\'altra), al centro niente', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 0: [L(1, 'beat')] } });
  c.riceve(giro(1, -20));
  avanza(100);
  assert.match(righeCoda(log).at(-1)[1], /^\.lpf\(/);
  assert.ok(log.some((x) => x[0] === 'togli' && x[2] === 'hpf'));
  log.length = 0;
  c.riceve(giro(1, 60));
  avanza(100);
  assert.match(righeCoda(log).at(-1)[1], /^\.hpf\(/);
  assert.ok(log.some((x) => x[0] === 'togli' && x[2] === 'lpf'));
});

test('velocità a scatti e altezza: scrivono .fast e .transpose; al valore neutro la riga esce', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 1: [L(5, 'tastiera')] } });
  c.riceve(tasto(c, 2));
  c.riceve(giro(5, 3)); // un scatto su: ×2
  avanza(100);
  assert.deepEqual(righeCoda(log).at(-1), [5, '.fast(2)']);
  c.riceve(giro(7, 3)); // +3 semitoni
  avanza(100);
  assert.deepEqual(righeCoda(log).at(-1), [5, '.transpose(3)']);
  log.length = 0;
  c.riceve(giro(7, -3)); // torna a 0
  avanza(100);
  assert.ok(log.some((x) => x[0] === 'togli' && x[2] === 'transpose'), 'a zero la riga esce');
});

test('spinta: la riga esce dal CH in focus (e il CH la dimentica)', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 2: [L(7, 'basso')] } });
  c.riceve(tasto(c, 3));
  c.riceve(giro(3, 5));
  avanza(100);
  log.length = 0;
  c.riceve(push(3, true));
  c.riceve(push(3, false));
  assert.ok(log.some((x) => x[0] === 'reset' && x[1] === 7 && x[2] === 'delay'));
  assert.ok(log.some((x) => x[0] === 'maniRiga' && x[1] === 2 && x[2] === 'delay' && x[3] === null));
});

test('CH in focus vuoto: le manopole non fanno niente e lo schermo dice «CHn vuoto»', () => {
  const { c, log, avanza } = prova({ livelliDelCH: {} });
  c.riceve(tasto(c, 5));
  c.riceve(giro(3, 5));
  avanza(100);
  assert.deepEqual(righeCoda(log), []);
  assert.ok(log.some((x) => x[0] === 'riga' && x[1] === 'CH5 vuoto'), JSON.stringify(log));
});

test('STRAY (CH8): la riga va su tutti i livelli del CH8', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 7: [L(10, 'scratch'), L(11, 'jam')] } });
  c.riceve(tasto(c, 8));
  c.riceve(giro(4, 4)); // riverbero
  avanza(100);
  assert.deepEqual(righeCoda(log).map((x) => x[0]).sort(), [10, 11]);
});

test('layer B: le stesse manopole su tutto, con righe globali (spinta = la riga esce)', () => {
  const { c, log } = prova({ livelliDelCH: { 2: [L(7, 'basso')] } });
  c.riceve([0x90, c.tab.layer.B, 127]);
  c.riceve(giro(3, 5)); // eco su tutto
  const g = log.filter((x) => x[0] === 'globale');
  assert.equal(g.length, 1);
  assert.match(g[0][2], /^all\(x => x\.delay\(/);
  assert.equal(g[0][1], 'mani:delay');
  assert.deepEqual(righeCoda(log), [], 'nessuna riga sui livelli: sono righe globali');
  log.length = 0;
  c.riceve(push(3, true));
  c.riceve(push(3, false));
  assert.deepEqual(log.filter((x) => x[0] === 'globale'), [['globale', 'mani:delay', null]]);
});

test('manopola 8 = volume generale; il nano non è visto: tornano le pagine A e B della beta 4', () => {
  const { c, log, attiva } = prova({ livelliDelCH: { 0: [L(1, 'beat')] } });
  c.riceve(giro(8, 5));
  assert.ok(log.some((x) => x[0] === 'master'));
  attiva.si = false;
  log.length = 0;
  c.riceve(tasto(c, 3)); // in pagina A di prima è un tasto normale (non un focus)
  assert.equal(c.focusCH, 0, 'senza MANI il tasto non cambia il focus');
  assert.deepEqual(MANOPOLE_MANI.length, 7);
});

test('il cavo del nano che si stacca: MANI resta (il flag è della sessione, non del cavo)', () => {
  const { c, attiva } = prova();
  c.riceve(tasto(c, 2));
  assert.equal(c.focusCH, 1);
  // il flag lo tiene l'app (nanoVisto) e non si abbassa mai: qui vale finché maniAttiva dice sì
  assert.equal(attiva.si, true);
  c.riceve(giro(3, 2));
  assert.equal(c.focusCH, 1, 'il focus non si muove da solo');
});

test('spinta su un CH vuoto: nessuna riga da togliere dai livelli, ma la memoria del CH si pulisce', () => {
  const { c, log } = prova({ livelliDelCH: {} });
  c.riceve(tasto(c, 3));
  c.riceve(push(1, true));
  c.riceve(push(1, false));
  const mem = log.filter((x) => x[0] === 'maniRiga' && x[3] === null).map((x) => x[2]).sort();
  assert.deepEqual(mem, ['hpf', 'lpf'], 'lo SWEEP dimenticato');
  assert.ok(log.some((x) => x[0] === 'riga' && x[1] === 'CH3 vuoto'));
});

// --- A1 · SWEEP rispetta il filtro scritto nel codice della clip ---

const valoriLpf = (log) => righeCoda(log).map((x) => x[1]).filter((r) => r.startsWith('.lpf')).map((r) => Number(r.match(/\((.+)\)/)[1]));
const valoriHpf = (log) => righeCoda(log).map((x) => x[1]).filter((r) => r.startsWith('.hpf')).map((r) => Number(r.match(/\((.+)\)/)[1]));

test('limitaRigaMani: il filtro del codice è tetto (lpf) e pavimento (hpf); senza filtro la riga non cambia', () => {
  assert.equal(limitaRigaMani('.lpf(18670)', 'note("c2").s("sawtooth").lpf(800)'), '.lpf(800)');
  assert.equal(limitaRigaMani('.lpf(300)', 's("a").lpf(800)'), '.lpf(300)', 'più chiuso della clip: passa');
  assert.equal(limitaRigaMani('.hpf(40)', 's("a").hpf(120)'), '.hpf(120)');
  assert.equal(limitaRigaMani('.hpf(500)', 's("a").hpf(120)'), '.hpf(500)');
  assert.equal(limitaRigaMani('.lpf(18670)', 's("a")'), '.lpf(18670)');
  assert.equal(limitaRigaMani('.room(0.4)', 's("a").lpf(800)'), '.room(0.4)');
  assert.equal(limitaRigaMani('.lpf(18670)', 's("a").hpf(120)'), '.lpf(18670)', 'un hpf della clip non limita il lpf');
});

test('SWEEP a sinistra su un reese .lpf(800): non scrive mai un lpf sopra 800', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 2: [L(7, 'reese', [], 'note("c2").s("sawtooth").lpf(800)')] } });
  c.riceve(tasto(c, 3));
  for (let i = 0; i < 12; i++) { c.riceve(giro(1, -1)); avanza(100); }
  const v = valoriLpf(log);
  assert.ok(v.length > 0);
  assert.ok(v.every((x) => x <= 800), `mai sopra 800: ${v}`);
});

test('SWEEP a destra su una clip .hpf(120): non scrive mai un hpf sotto 120', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 3: [L(8, 'lead', [], 's("a").hpf(120)')] } });
  c.riceve(tasto(c, 4));
  for (let i = 0; i < 12; i++) { c.riceve(giro(1, 1)); avanza(100); }
  const v = valoriHpf(log);
  assert.ok(v.length > 0);
  assert.ok(v.every((x) => x >= 120), `mai sotto 120: ${v}`);
});

test('STRAY: ogni livello del CH8 ha il suo filtro come limite', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 7: [L(10, 'scratch', [], 's("a").lpf(500)'), L(11, 'jam', [], 's("b")')] } });
  c.riceve(tasto(c, 8));
  for (let i = 0; i < 12; i++) { c.riceve(giro(1, -1)); avanza(100); }
  const di = (id) => righeCoda(log).filter((x) => x[0] === id && x[1].startsWith('.lpf')).map((x) => Number(x[1].match(/\((.+)\)/)[1]));
  assert.ok(di(10).length && di(10).every((x) => x <= 500));
  assert.ok(di(11).length && Math.max(...di(11)) > 500, 'la clip senza filtro: come prima');
});

test('eredità: la riga del CH su una clip nuova col filtro più basso viene limitata dal filtro di quella clip', () => {
  const righe = new Map([['lpf', '.lpf(3000)'], ['room', '.room(0.4)']]);
  const clip = 's("a").lpf(800)';
  const mia = ereditaRighe([], new Map([...righe].map(([k, r]) => [k, limitaRigaMani(r, clip)])));
  assert.deepEqual(mia, ['.lpf(800)', '.room(0.4)']);
});

// --- A2 · l'X-Touch non sceglie mai cosa entra ---

// Le azioni che scelgono, armano o navigano: con MANI attivo non le chiama nessun evento dell'X-Touch.
const VIETATE = ['goLive', 'linguetta', 'scena', 'togli', 'tocca', 'seleziona', 'cuffia', 'passaBrano', 'passaInAttesa', 'cueSposta', 'cuePosizione', 'cueBrano', 'passoScattato'];

test('MANI: nessun evento dell\'X-Touch (manopole, spinte, tasti, layer, fader) sceglie, arma o naviga', () => {
  const { c, chiamate, avanza } = prova({ livelliDelCH: { 0: [L(1, 'beat')], 2: [L(7, 'basso')] } });
  for (let n = 1; n <= 8; n++) for (const passi of [3, -3, 1, -1]) c.riceve(giro(n, passi));
  for (const pagina of ['A', 'B']) {
    for (let n = 1; n <= 8; n++) { c.riceve(push(n, true)); avanza(1500); c.riceve(push(n, false)); }
    for (let n = 1; n <= 16; n++) { c.riceve(tasto(c, n)); avanza(1500); c.riceve(tasto(c, n, false)); }
    for (let k = 0; k < 128; k++) { c.riceve([0x90, k, 127]); avanza(1500); c.riceve([0x90, k, 0]); }
    for (let k = 0; k < 128; k++) c.riceve([0xb0, k, 64]);
    for (let n = 1; n <= 8; n++) for (const passi of [3, -3]) c.riceve(giro(n, passi));
    if (pagina === 'A') c.riceve([0x90, 14, 127]); // il tasto layer (se è questo il numero, non importa: la prova gira sopra tutte le note)
  }
  const chiamateVietate = chiamate.filter((x) => VIETATE.includes(x));
  assert.deepEqual(chiamateVietate, []);
});

test('MANI: la manopola 1 è solo SWEEP (non naviga il CUE)', () => {
  const { c, chiamate, log, avanza } = prova({ livelliDelCH: { 0: [L(1, 'beat')] } });
  c.riceve(giro(1, -4));
  avanza(100);
  assert.ok(!chiamate.includes('cueSposta'));
  assert.ok(valoriLpf(log).length > 0, 'ha scritto lo sweep');
});

// --- A3 · senza nano è la beta 4 ---

test('senza nano (MANI spenta): manopola 1 naviga, 2–7 volumi, il tasto 8 tenuto è il paracadute, niente FOCUS', () => {
  const { c, chiamate, log, avanza } = prova({ livelliDelCH: { 2: [L(7, 'basso')] }, maniAttiva: false });
  c.riceve(giro(1, 1));
  assert.ok(chiamate.includes('cueSposta'), 'la manopola 1 naviga il CUE');
  c.riceve(giro(2, 2));
  assert.ok(chiamate.includes('volume'), 'la 2 muove il volume del livello');
  c.riceve(tasto(c, 8));
  avanza(1500);
  assert.ok(log.some((x) => x[0] === 'paracadute'), 'il tasto 8 tenuto lancia il paracadute');
  c.riceve(tasto(c, 8, false));
  assert.ok(!chiamate.includes('maniFocus') && !chiamate.includes('maniRiga') && !chiamate.includes('maniGlobale'), 'nessun gesto MANI');
});

test('i passaggi dello SWEEP dal centro non riempiono ⌘Z (togliRiga, non resetRiga); la spinta sì', () => {
  const { c, log, avanza } = prova({ livelliDelCH: { 2: [L(7, 'basso', ['.lpf(500)'])] } });
  c.riceve(tasto(c, 3));
  for (let i = 0; i < 6; i++) { c.riceve(giro(1, -3)); c.riceve(giro(1, 3)); }
  avanza(100);
  assert.equal(log.filter((x) => x[0] === 'reset').length, 0);
  c.riceve(push(1, true)); c.riceve(push(1, false));
  assert.ok(log.some((x) => x[0] === 'reset'), 'la spinta è annullabile');
});

test('dimenticaMani: quando il CH perde le righe, manopole e anelli tornano al neutro', () => {
  const { c } = prova({ livelliDelCH: { 2: [L(7, 'basso')] } });
  c.riceve(tasto(c, 3));
  c.riceve(giro(1, -8));
  assert.ok(c.maniX.get('ch2|sweep') < 0.5);
  c.dimenticaMani(2);
  assert.equal(c.maniX.get('ch2|sweep'), undefined);
  c.riceve(giro(1, -8));
  c.dimenticaMani(null);
  assert.equal(c.maniX.size, 0);
});
