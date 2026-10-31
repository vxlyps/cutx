import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../src/renderer/controller.js';
import { calcolaFader } from '../src/renderer/controller-mappa.js';
import { applicaGlobali, leggiGlobale } from '../src/renderer/coda.js';

// Un controller con azioni finte e tempo a mano: nessun MIDI vero.
function prova(livelli = []) {
  const log = [];
  let t = 0;
  const timer = [];
  const azioni = {
    livelli: () => livelli,
    volume: (id, v) => log.push(['volume', id, v]),
    muto: (id) => log.push(['muto', id]),
    seleziona: (id) => log.push(['seleziona', id]),
    coda: (id, riga) => log.push(['coda', id, riga]),
    master: (v) => log.push(['master', v]),
    tempo: (bpm) => log.push(['tempo', bpm]),
    bpm: () => 120,
    goLive: () => log.push(['goLive']),
    togli: () => log.push(['togli']),
    cuffia: () => log.push(['cuffia']),
    inCuffia: () => false,
    paracadute: () => log.push(['paracadute']),
    scritta: (s) => log.push(['scritta', s]),
    avviso: (s) => log.push(['avviso', s]),
    salvaCalibrazione: (c) => log.push(['calibrazione', c]),
  };
  const c = new Controller(azioni, {
    ora: () => t,
    imposta: (fn, ms) => {
      const x = { fn, a: t + ms };
      timer.push(x);
      return x;
    },
    ferma: (x) => x && (x.annullato = true),
  });
  c.modo = 'MC';
  const avanza = (ms) => {
    t += ms;
    for (const x of [...timer]) if (!x.annullato && !x.fatto && x.a <= t) ((x.fatto = true), x.fn());
  };
  return { c, log, avanza, azioni };
}

const L = (id, nome, volume = 0.5, muto = false, coda = [], codice = '') => ({ id, nome, volume, muto, coda, codice });
const giro = (n, passi) => [0xb0, 15 + n, passi > 0 ? passi : 0x40 | -passi];
const push = (n, giu) => [0x90, 31 + n, giu ? 127 : 0];
const tasto = (nota, giu) => [0x90, nota, giu ? 127 : 0];

test('pagina A: la manopola gira il volume del livello, la 8 il generale', () => {
  const { c, log } = prova([L(1, 'drum', 0.5), L(2, 'basso', 0.5)]);
  c.riceve(giro(2, 5));
  assert.deepEqual(log.find((x) => x[0] === 'volume'), ['volume', 2, 0.6]);
  c.riceve(giro(1, -10));
  assert.deepEqual(log.filter((x) => x[0] === 'volume').at(-1), ['volume', 1, 0.3]);
  c.riceve(giro(8, -5));
  assert.deepEqual(log.find((x) => x[0] === 'master'), ['master', 0.9]);
  c.riceve(giro(5, 1));
  assert.ok(log.some((x) => x[0] === 'scritta' && /NESSUN LIVELLO/.test(x[1])));
});

test('un tocco sulla manopola è il muto; tenuta premuta è selezione e il muto non scatta', () => {
  const { c, log, avanza } = prova([L(1, 'drum'), L(2, 'basso')]);
  c.riceve(push(1, true));
  avanza(100);
  c.riceve(push(1, false));
  assert.deepEqual(log.filter((x) => x[0] === 'muto'), [['muto', 1]]);
  log.length = 0;
  c.riceve(push(2, true));
  avanza(400);
  assert.deepEqual(log.filter((x) => x[0] === 'seleziona'), [['seleziona', 2]]);
  c.riceve(push(2, false));
  assert.equal(log.filter((x) => x[0] === 'muto').length, 0, 'tenuta: niente muto');
});

test('tenuta premuta + giro = il filtro di quel livello, scritto in coda (rallentato)', () => {
  const { c, log, avanza } = prova([L(1, 'drum', 0.5, false, ['.lpf(800)'])]);
  c.riceve(push(1, true));
  avanza(400);
  for (let i = 0; i < 20; i++) c.riceve(giro(1, 1));
  avanza(100);
  const code = log.filter((x) => x[0] === 'coda');
  assert.equal(code.length, 1, 'le righe partono a gruppi: l\'ultima vince');
  assert.match(code[0][2], /^\.lpf\(\d+\)$/);
  assert.ok(Number(code[0][2].match(/\d+/)[0]) > 800, 'parte da 800 (la coda) e sale');
});

test('i tasti: go live, togli, cuffia; il paracadute solo tenuto un secondo', () => {
  const { c, log, avanza } = prova([L(1, 'drum')]);
  const t = (n) => c.tab.tasti[n - 1];
  c.riceve(tasto(t(5), true));
  c.riceve(tasto(t(5), false));
  assert.ok(log.some((x) => x[0] === 'goLive'));
  c.riceve(tasto(t(6), true));
  assert.ok(log.some((x) => x[0] === 'togli'));
  c.riceve(tasto(t(4), true));
  assert.ok(!log.some((x) => x[0] === 'cuffia'), 'al rilascio, non alla pressione');
  c.riceve(tasto(t(4), false));
  assert.ok(log.some((x) => x[0] === 'cuffia'));
  c.riceve(tasto(t(8), true));
  avanza(500);
  c.riceve(tasto(t(8), false));
  avanza(1000);
  assert.equal(log.filter((x) => x[0] === 'paracadute').length, 0, 'rilasciato troppo presto');
  c.riceve(tasto(t(8), true));
  avanza(1100);
  assert.equal(log.filter((x) => x[0] === 'paracadute').length, 1);
});

test('pagina B: i tasti scelgono il bersaglio e le manopole scrivono la coda', () => {
  const { c, log, avanza } = prova([L(1, 'drum'), L(2, 'basso')]);
  c.riceve([0x90, c.tab.layer.B, 127]);
  assert.equal(c.pagina, 'B');
  c.riceve(tasto(c.tab.tasti[1], true)); // bersaglio: livello 2
  assert.equal(c.bersaglio, 2);
  c.riceve(giro(4, 8)); // eco
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'coda').at(-1), ['coda', 2, '.delay(0.13)']);
  c.riceve(giro(1, 5)); // volume del bersaglio
  assert.deepEqual(log.filter((x) => x[0] === 'volume').at(-1), ['volume', 2, 0.6]);
  c.riceve(tasto(c.tab.tasti[7], true)); // globale
  assert.equal(c.bersaglio, 'globale');
  c.riceve(giro(1, 3));
  assert.deepEqual(log.filter((x) => x[0] === 'tempo').at(-1), ['tempo', 123]);
  c.riceve([0x90, c.tab.layer.A, 127]);
  assert.equal(c.pagina, 'A');
});

test('le luci: anelli solo per le manopole assegnate, col valore vero e lo stile di quello che comandano', () => {
  const { c } = prova([L(1, 'drum', 1), L(2, 'basso', 0.5, true)]);
  const l = c.desiderate();
  assert.deepEqual(l.get('a1'), [0xb0, 0x30, 32 + 11]); // il volume è una barra che si riempie (fan), pieno
  assert.deepEqual(l.get('a2'), [0xb0, 0x31, 0]); // muto: spento
  assert.deepEqual(l.get('a3'), [0xb0, 0x32, 0]); // manopola libera: spenta
  assert.deepEqual(l.get('a8'), [0xb0, 0x37, 32 + 11]); // il generale
  c.pagina = 'B';
  c.bersaglio = 1;
  const b = c.desiderate();
  assert.equal(b.get('a1')[2], 32 + 11, 'volume: fan');
  assert.equal(b.get('a2')[2], 11, 'filtro (aperto): punto, tutto a destra');
  assert.deepEqual(b.get('a6'), [0xb0, 0x35, 6], 'velocità ×1: il punto a metà');
  assert.deepEqual(b.get('a8'), [0xb0, 0x37, 6], 'altezza 0 st: il punto a metà');
  c.bersaglio = 5; // un livello che non c'è
  assert.ok([...c.desiderate()].filter(([k]) => k.startsWith('a')).every(([, m]) => m[2] === 0), 'nessun bersaglio: tutti spenti');
});

test('i tasti: spenti se non fanno niente, accesi quando la cosa è attiva, lampi e lampeggi solo per l\'attesa', () => {
  const { c, avanza, azioni } = prova([L(1, 'drum')]);
  const nota = (i) => c.tab.tasti[i - 1];
  let l = c.desiderate();
  assert.equal(l.get('t84')[2], 127, 'pagina A: layer A acceso');
  assert.equal(l.get('t85')[2], 0);
  assert.ok(noteSpente(l, [nota(1), nota(2), nota(3), nota(4), nota(5), nota(6), nota(7), nota(8)]), 'senza niente di attivo i tasti sono spenti');
  azioni.inCuffia = () => true;
  assert.equal(c.desiderate().get(`t${nota(4)}`)[2], 127, 'cuffia attiva: acceso');
  azioni.inAttesa = () => true;
  assert.equal(c.desiderate().get(`t${nota(5)}`)[2], 1, 'go live che aspetta il ciclo: lampeggia');
  azioni.inAttesa = () => false;
  c.riceve(tasto(nota(6), true)); // togli: un lampo breve
  assert.equal(c.desiderate().get(`t${nota(6)}`)[2], 127);
  avanza(400);
  assert.equal(c.desiderate().get(`t${nota(6)}`)[2], 0, 'il lampo passa');
  c.riceve(tasto(nota(8), true)); // paracadute tenuto: lampeggia
  assert.equal(c.desiderate().get(`t${nota(8)}`)[2], 1);
  avanza(1100);
  azioni.paracaduteAperto = () => true;
  assert.equal(c.desiderate().get(`t${nota(8)}`)[2], 127, 'aperto: acceso fisso');
});

function noteSpente(luci, note) {
  return note.every((n) => luci.get(`t${n}`)[2] === 0 || n === undefined);
}

test('le manopole dicono cosa comandano (per lo specchio e per i numeri sulle card)', () => {
  const { c } = prova([L(1, 'drum', 0.8), L(2, 'basso', 0.5, true)]);
  const m = c.manopole();
  assert.equal(m.length, 8);
  assert.deepEqual([m[0].nome, m[0].testo, m[0].stile], ['drum', '0.80', 'fan']);
  assert.equal(m[1].testo, 'muto');
  assert.equal(m[2], null);
  assert.equal(m[7].nome, 'generale');
});

test('il valore iniziale dell\'anello viene dal codice scritto a mano, se c\'è', () => {
  const { c } = prova([L(1, 'drum', 0.5, false, [], 's("bd").lpf(800)')]);
  const x = c.xDi(c.livello(1), 'filtro');
  assert.ok(x > 0.3 && x < 0.4, String(x)); // 800 Hz su una scala logaritmica 150–16000
});

test('un messaggio da modalità standard: lo dice e prova a rimettere MC una volta', () => {
  const { c, log } = prova([]);
  c.modo = 'sconosciuto';
  c.riceve([0xba, 1, 20]);
  assert.equal(c.modo, 'standard');
  assert.ok(log.some((x) => x[0] === 'avviso'));
  const avvisi = log.filter((x) => x[0] === 'avviso').length;
  c.riceve([0xba, 2, 20]);
  assert.equal(log.filter((x) => x[0] === 'avviso').length, avvisi, 'una volta sola');
});

test('la calibrazione registra le note dei tasti nell\'ordine e le salva', () => {
  const { c, log } = prova([]);
  c.avviaCalibrazione();
  for (let i = 0; i < 16; i++) c.riceve(tasto(60 + i, true));
  c.riceve(tasto(80, true));
  assert.equal(c.calibrazione.passo, 17);
  c.riceve(tasto(81, true));
  const salvata = log.find((x) => x[0] === 'calibrazione')[1];
  assert.equal(salvata.tasti[0], 60);
  assert.equal(salvata.tasti[15], 75);
  assert.deepEqual(salvata.layer, { A: 80, B: 81 });
  assert.equal(c.calibrazione, null);
});

test('velocità a scatti: un terzo di scatto per passo, ×1 toglie la riga, il resto è .fast(n)', () => {
  const { c, log, avanza, azioni } = prova([L(1, 'drum')]);
  azioni.togliRiga = (id, chiave) => log.push(['togliRiga', id, chiave]);
  c.riceve([0x90, c.tab.layer.B, 127]);
  c.riceve(tasto(c.tab.tasti[0], true)); // bersaglio: livello 1
  c.riceve(giro(6, 3)); // un scatto avanti: ×2
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'coda').at(-1), ['coda', 1, '.fast(2)']);
  c.riceve(giro(6, 3)); // ×4
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'coda').at(-1), ['coda', 1, '.fast(4)']);
  c.riceve(giro(6, 9)); // oltre il fondo: resta ×4
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'coda').at(-1), ['coda', 1, '.fast(4)']);
  c.riceve(giro(6, -6)); // di nuovo ×1: la riga sparisce
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'togliRiga').at(-1), ['togliRiga', 1, 'fast']);
  c.riceve(giro(6, -3)); // ×1/2
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'coda').at(-1), ['coda', 1, '.fast(0.5)']);
  assert.match(log.filter((x) => x[0] === 'scritta').at(-1)[1], /VELOCITÀ ×1\/2/);
});

test('altezza in semitoni: .transpose(n) fra -12 e +12, a 0 la riga sparisce', () => {
  const { c, log, avanza, azioni } = prova([L(1, 'drum')]);
  azioni.togliRiga = (id, chiave) => log.push(['togliRiga', id, chiave]);
  c.riceve([0x90, c.tab.layer.B, 127]);
  c.riceve(tasto(c.tab.tasti[0], true));
  c.riceve(giro(8, 3));
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'coda').at(-1), ['coda', 1, '.transpose(3)']);
  c.riceve(giro(8, 30));
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'coda').at(-1), ['coda', 1, '.transpose(12)']);
  c.riceve(giro(8, -12));
  avanza(100);
  assert.deepEqual(log.filter((x) => x[0] === 'togliRiga').at(-1), ['togliRiga', 1, 'transpose']);
  assert.match(log.filter((x) => x[0] === 'scritta').at(-1)[1], /ALTEZZA 0 st/);
});

test('il fader scrive righe globali all(x => …): filtro di default in pagina A, riser in B; a fondo corsa la riga sparisce', () => {
  const { c, log, avanza, azioni } = prova([]);
  azioni.globale = (chiave, riga) => log.push(['globale', chiave, riga]);
  azioni.breakTutti = (f) => log.push(['break', f]);
  azioni.riser = (r) => log.push(['riser', r]);
  c.riceve([0xe8, 0x00, 0x40]); // a metà
  avanza(100);
  const g = log.filter((x) => x[0] === 'globale').at(-1);
  assert.equal(g[1], 'fader');
  assert.match(g[2], /^all\(x => x\.lpf\(\d+\)\)$/);
  assert.match(log.filter((x) => x[0] === 'scritta').at(-1)[1], /FADER · FILTRO \d+ Hz/);
  c.riceve([0xe8, 0x7f, 0x7f]); // in alto = aperto
  avanza(100);
  assert.equal(log.filter((x) => x[0] === 'globale').at(-1)[2], null, 'tutto aperto: la riga sparisce');
  assert.match(log.filter((x) => x[0] === 'scritta').at(-1)[1], /APERTO/);
  // pagina B: riser (riga globale + rumore); cambiando pagina l'effetto di prima si ferma
  c.riceve([0xe8, 0x00, 0x20]);
  avanza(100);
  c.riceve([0x90, c.tab.layer.B, 127]);
  assert.equal(log.filter((x) => x[0] === 'globale').at(-1)[2], null, 'cambio pagina: la riga di prima si toglie');
  c.riceve([0xe8, 0x7f, 0x40]); // alto
  avanza(100);
  assert.match(log.filter((x) => x[0] === 'globale').at(-1)[2], /^all\(x => x\.hpf\(\d+\)\)$/);
  assert.ok(log.filter((x) => x[0] === 'riser').at(-1)[1].hpf > 1000, 'il rumore sale col passa-alto');
  assert.match(log.filter((x) => x[0] === 'scritta').at(-1)[1], /FADER · RISER \d+ Hz/);
  c.riceve([0xe8, 0x00, 0x00]); // in basso: sparisce tutto
  avanza(100);
  assert.equal(log.filter((x) => x[0] === 'globale').at(-1)[2], null);
  assert.equal(log.filter((x) => x[0] === 'riser').at(-1)[1], null);
});

test('l\'effetto del fader si sceglie per pagina nelle impostazioni', () => {
  const { c, log, avanza, azioni } = prova([]);
  azioni.faderEffetto = (pagina) => (pagina === 'A' ? 'lavaggio' : 'cattedrale');
  azioni.globale = (chiave, riga) => log.push(['globale', chiave, riga]);
  c.riceve([0xe8, 0x7f, 0x40]);
  avanza(100);
  assert.match(log.filter((x) => x[0] === 'globale').at(-1)[2], /^all\(x => x\.hpf\(/);
  assert.match(log.filter((x) => x[0] === 'scritta').at(-1)[1], /FADER · LAVAGGIO \d+ Hz/);
  assert.equal(c.effettoFader('B'), 'cattedrale');
  assert.equal(prova([]).c.effettoFader('B'), 'riser', 'predefiniti: A filtro, B riser');
  assert.equal(prova([]).c.effettoFader('A'), 'filtro');
});

test('muoversi nel CUE: «cuffia» tenuto + manopola scorre le sezioni, fermo mezzo secondo va in cuffia; al rilascio niente toggle', () => {
  const { c, log, avanza, azioni } = prova([L(1, 'drum')]);
  const sezioni = ['intro', 'drum', 'basso', 'melodia'];
  let k = 0;
  azioni.cueSposta = (d) => {
    k = Math.max(0, Math.min(sezioni.length - 1, k + d));
    log.push(['cueSposta', d]);
    return sezioni[k];
  };
  azioni.cuffiaScelta = () => log.push(['cuffiaScelta', sezioni[k]]);
  const cuffia = c.tab.tasti[3];
  c.riceve(tasto(cuffia, true));
  c.riceve(giro(5, 1));
  c.riceve(giro(2, 1));
  avanza(200);
  assert.equal(log.filter((x) => x[0] === 'cuffiaScelta').length, 0, 'mentre scorro non parte');
  avanza(600);
  assert.deepEqual(log.filter((x) => x[0] === 'cuffiaScelta'), [['cuffiaScelta', 'basso']], 'fermo: quella parte in cuffia');
  assert.equal(c.toccata.testo, 'CUE · basso', 'lo specchio dice dove sono');
  assert.equal(log.filter((x) => x[0] === 'volume').length, 0, 'le manopole non toccano i volumi mentre scorro');
  c.riceve(tasto(cuffia, false));
  assert.equal(log.filter((x) => x[0] === 'cuffia').length, 0, 'rilasciando la sezione resta scelta, la cuffia non si spegne né si toglie');
  // dopo, la manopola torna ai volumi
  c.riceve(giro(1, 2));
  assert.ok(log.some((x) => x[0] === 'volume'));
});

test('«cuffia» tenuto + ◀ ▶ momento: brano precedente e successivo della libreria', async () => {
  const { c, log, azioni } = prova([]);
  const brani = ['alba', 'notte', 'zenit'];
  let i = 1;
  azioni.cueBrano = async (verso) => {
    const j = i + verso;
    if (j < 0 || j >= brani.length) return null;
    i = j;
    return brani[i];
  };
  c.riceve(tasto(c.tab.tasti[3], true));
  c.riceve(tasto(c.tab.tasti[1], true)); // ▶
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(c.toccata.testo, 'CUE · zenit');
  c.riceve(tasto(c.tab.tasti[1], true)); // ancora ▶: è l'ultimo
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(log.some((x) => x[0] === 'scritta' && /BRANO · ZENIT/.test(x[1])));
  c.riceve(tasto(c.tab.tasti[0], true)); // ◀
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(c.toccata.testo, 'CUE · notte');
  c.riceve(tasto(c.tab.tasti[3], false));
  assert.equal(log.filter((x) => x[0] === 'cuffia').length, 0);
  // senza «cuffia» tenuto, ◀ ▶ restano «arriva presto» (i momenti vengono col passo 5)
  c.riceve(tasto(c.tab.tasti[1], true));
  assert.ok(log.some((x) => x[0] === 'scritta' && /ARRIVA PRESTO/i.test(x[1])));
});

test('gli effetti del fader: righe all(x => …), a zero (o aperto, per il filtro) niente', () => {
  assert.equal(calcolaFader('filtro', 1).riga, null);
  assert.match(calcolaFader('filtro', 0.5).riga, /^all\(x => x\.lpf\(\d+\)\)$/);
  assert.equal(calcolaFader('filtro', 0).testo, '150 Hz');
  for (const e of ['lavaggio', 'riser', 'eco', 'cattedrale', 'rottame', 'break']) {
    assert.equal(calcolaFader(e, 0).attivo, false, `${e}: a zero niente`);
    assert.equal(calcolaFader(e, 0.7).attivo, true, `${e}: attivo`);
  }
  assert.match(calcolaFader('lavaggio', 0.5).riga, /x\.hpf\(\d+\)/);
  assert.match(calcolaFader('eco', 0.6).riga, /x\.delay\(0\.6\)\.delaytime/);
  assert.match(calcolaFader('cattedrale', 0.6).riga, /x\.room\(0\.6\)\.roomsize/);
  assert.match(calcolaFader('rottame', 1).riga, /x\.crush\(4\)\.coarse\(8\)/);
  assert.ok(calcolaFader('break', 1).fattore < 0.2 && calcolaFader('break', 0.5).fattore > 0.5);
  assert.ok(calcolaFader('riser', 1).riser.hpf > calcolaFader('riser', 0.2).riser.hpf, 'più sale, più il rumore si assottiglia');
});

test('le righe globali: si leggono e si applicano a un pattern, una dopo l\'altra', () => {
  assert.equal(leggiGlobale('all(x => x.lpf(1920))'), 'x.lpf(1920)');
  assert.equal(leggiGlobale('all(x => x.delay(.5).delayfeedback(.5))'), 'x.delay(.5).delayfeedback(.5)');
  assert.equal(leggiGlobale('// break'), null);
  const log = [];
  const p = { queryArc: () => [], lpf: (v) => (log.push(`lpf${v}`), p), hpf: (v) => (log.push(`hpf${v}`), p) };
  assert.ok(applicaGlobali(p, ['all(x => x.lpf(900))', 'all(x => x.hpf(100))', '// niente']).pattern);
  assert.deepEqual(log, ['lpf900', 'hpf100']);
  assert.ok(applicaGlobali(p, ['all(x => x.nonEsiste(1))']).errore);
  assert.equal(applicaGlobali(p, []).pattern, p);
});
