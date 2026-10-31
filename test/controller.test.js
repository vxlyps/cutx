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
  let selezionato = null;
  const azioni = {
    livelli: () => livelli,
    selezionato: () => selezionato,
    volume: (id, v) => log.push(['volume', id, v]),
    muto: (id) => log.push(['muto', id]),
    seleziona: (id) => {
      selezionato = id;
      log.push(['seleziona', id]);
    },
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
  c.riceve([0x90, c.tab.layer.B, 127]); // B di nuovo: globale
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

test('muoversi nel CUE: «cuffia» tenuto + manopola scorre le sezioni, si sfoglia in silenzio (niente parte da solo); al rilascio niente toggle; un tocco ascolta, un altro smette', () => {
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
  avanza(2000);
  assert.equal(log.filter((x) => x[0] === 'cuffiaScelta').length, 0, 'neanche fermo a lungo parte qualcosa in cuffia');
  assert.equal(c.toccata.testo, 'CUE · basso', 'lo specchio dice dove sono');
  assert.equal(log.filter((x) => x[0] === 'volume').length, 0, 'le manopole non toccano i volumi mentre scorro');
  c.riceve(tasto(cuffia, false));
  assert.equal(log.filter((x) => x[0] === 'cuffia').length, 0, 'rilasciando la sezione resta scelta, la cuffia non si spegne né si toglie');
  // dopo, la manopola torna ai volumi
  c.riceve(giro(1, 2));
  assert.ok(log.some((x) => x[0] === 'volume'));
  // un tocco su «cuffia» ascolta la sezione scelta (l'azione alterna: parte / smette)
  c.riceve(tasto(cuffia, true));
  c.riceve(tasto(cuffia, false));
  assert.equal(log.filter((x) => x[0] === 'cuffia').length, 1);
  c.riceve(tasto(cuffia, true));
  c.riceve(tasto(cuffia, false));
  assert.equal(log.filter((x) => x[0] === 'cuffia').length, 2, 'un altro tocco smette');
});

test('«cuffia» tenuto + ◀ ▶ scena: brano precedente e successivo della libreria', async () => {
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
  // senza «cuffia» tenuto, ◀ ▶ sono le scene del beat (a fine frase); senza beat la scritta dice «niente»
  c.azioni.scena = async (d) => {
    log.push(['scena', d]);
    return d > 0 ? { scena: 'drop' } : null;
  };
  c.riceve(tasto(c.tab.tasti[1], true));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(log.filter((x) => x[0] === 'scena'), [['scena', 1]]);
  assert.ok(log.some((x) => x[0] === 'scritta' && x[1] === 'SCENA ▶ DROP'));
  c.riceve(tasto(c.tab.tasti[0], true));
  await Promise.resolve();
  await Promise.resolve();
  assert.ok(log.some((x) => x[0] === 'scritta' && x[1] === 'SCENA ◀ NIENTE'));
});

test('◀ ▶ sono accesi solo se c\'è una scena in quella direzione', () => {
  const { c } = prova([L(1, 'beat')]);
  c.azioni.scenaNome = (d) => (d > 0 ? 'drop' : null);
  const luci = c.desiderate();
  assert.equal(luci.get(`t${c.tab.tasti[1]}`)[2], 127, '▶ acceso');
  assert.equal(luci.get(`t${c.tab.tasti[0]}`)[2], 0, '◀ spento');
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

test('pagina B: premere una manopola rimette quel parametro (toglie la riga dalla coda) e l\'anello torna al valore del mio codice', () => {
  const { c, log, avanza, azioni } = prova([L(1, 'drum', 0.4, false, ['.lpf(3000)'], 's("bd").lpf(800)')]);
  azioni.resetRiga = (id, chiave) => log.push(['resetRiga', id, chiave]);
  c.riceve([0x90, c.tab.layer.B, 127]);
  c.riceve(tasto(c.tab.tasti[0], true)); // bersaglio: livello 1
  c.riceve(giro(2, 4)); // filtro
  avanza(100);
  assert.ok(c.manopole()[1].valore > 0.5, 'filtro girato in alto');
  c.riceve(push(2, true));
  avanza(100);
  c.riceve(push(2, false)); // un tocco: reset
  assert.deepEqual(log.filter((x) => x[0] === 'resetRiga').at(-1), ['resetRiga', 1, 'lpf']);
  const x = c.manopole()[1].valore;
  assert.ok(x > 0.3 && x < 0.4, `torna a 800 Hz del codice: ${x}`);
  assert.match(log.filter((x2) => x2[0] === 'scritta').at(-1)[1], /DRUM · FILTRO RESET/);
  // volume: torna a 1
  c.riceve(push(1, true));
  c.riceve(push(1, false));
  assert.deepEqual(log.filter((x2) => x2[0] === 'volume').at(-1), ['volume', 1, 1]);
  // velocità e altezza: tolgono fast e transpose
  c.riceve(push(6, true));
  c.riceve(push(6, false));
  c.riceve(push(8, true));
  c.riceve(push(8, false));
  const reset = log.filter((x2) => x2[0] === 'resetRiga').map((x2) => x2[2]);
  assert.ok(reset.includes('fast') && reset.includes('transpose'));
  // la pagina A: lo stesso tocco resta il muto
  c.riceve([0x90, c.tab.layer.A, 127]);
  c.riceve(push(1, true));
  c.riceve(push(1, false));
  assert.ok(log.some((x2) => x2[0] === 'muto'));
});

// --- i colpi ---
import { COLPI_PREDEFINITI } from '../src/renderer/colpi.js';

function conColpi(livelli = [L(1, 'drum'), L(2, 'basso'), L(3, 'pad')]) {
  const t = prova(livelli);
  t.azioni.codaQ = (id, riga, g) => t.log.push(['codaQ', id, riga, g]);
  t.azioni.togliQ = (id, chiave, g) => t.log.push(['togliQ', id, chiave, g]);
  t.azioni.globale = (chiave, riga, g, taglio = null) => {
    t.log.push(['globale', chiave, riga, g]);
    if (taglio) t.log.push(['taglio', taglio]);
  };
  t.azioni.livelloTemp = (chiave, def, g) => t.log.push(['livelloTemp', chiave, def, g]);
  t.azioni.colpiGriglia = () => 0.25;
  t.c.colpi.carica(COLPI_PREDEFINITI);
  const tasti = Object.fromEntries(['roll', 'spezza', 'mezzo', 'doppio', 'indietro', 'stop', 'sale', 'eco'].map((n, i) => [n, t.c.tab.tasti[8 + i]]));
  return { ...t, tasti };
}

test('i colpi: gli otto del file, nell\'ordine dei tasti 9–16', () => {
  const { c } = conColpi();
  assert.deepEqual(c.colpi.colpi.map((x) => x.nome), ['roll', 'spezza', 'mezzo', 'doppio', 'indietro', 'stop', 'sale', 'eco']);
  assert.equal(c.tab.tasti[8], 87, 'DROP');
  assert.equal(c.tab.tasti[15], 95, 'REC');
});

test('un colpo «beat» da solo va sul beat (il livello 1), entra sulla griglia e al rilascio torna com\'era', () => {
  const { c, log, avanza, tasti } = conColpi();
  c.riceve(tasto(tasti.doppio, true));
  assert.deepEqual(log.filter((x) => x[0] === 'codaQ'), [['codaQ', 1, '.fast(2)', 0.25]]);
  assert.match(c.toccata.testo, /COLPO · DOPPIO · drum/);
  assert.equal(c.desiderate().get(`t${tasti.doppio}`)[2], 127, 'il tasto è acceso finché lo tengo');
  avanza(3000);
  c.riceve(tasto(tasti.doppio, false));
  assert.deepEqual(log.filter((x) => x[0] === 'togliQ'), [['togliQ', 1, 'fast', 0.25]]);
  assert.equal(c.desiderate().get(`t${tasti.doppio}`)[2], 0);
});

test('un colpo che sostituisce una riga già in coda la rimette com\'era al rilascio', () => {
  const { c, log, avanza, tasti } = conColpi([L(1, 'drum', 1, false, ['.fast(0.5)'])]);
  c.riceve(tasto(tasti.doppio, true));
  avanza(3000);
  c.riceve(tasto(tasti.doppio, false));
  assert.deepEqual(log.filter((x) => x[0] === 'codaQ').at(-1), ['codaQ', 1, '.fast(0.5)', 0.25]);
  assert.equal(log.filter((x) => x[0] === 'togliQ').length, 0);
});

test('con la manopola di una clip tenuta premuta il colpo va su quella clip (più manopole: tutti) e il muto non scatta', () => {
  const { c, log, avanza, tasti } = conColpi();
  c.riceve(push(3, true));
  c.riceve(tasto(tasti.indietro, true));
  assert.deepEqual(log.filter((x) => x[0] === 'codaQ'), [['codaQ', 3, '.rev()', 0.25]]);
  c.riceve(tasto(tasti.indietro, false));
  avanza(3000);
  c.riceve(push(3, false));
  assert.equal(log.filter((x) => x[0] === 'muto').length, 0, 'un colpo con la manopola premuta non è un muto');
  log.length = 0;
  c.riceve(push(2, true));
  c.riceve(push(3, true));
  c.riceve(tasto(tasti.mezzo, true));
  assert.deepEqual(log.filter((x) => x[0] === 'codaQ').map((x) => x[1]).sort(), [2, 3]);
});

test('stop ed eco sono righe globali su tutto, anche con una manopola premuta', () => {
  const { c, log, avanza, tasti } = conColpi();
  c.riceve(push(3, true));
  c.riceve(tasto(tasti.stop, true));
  assert.deepEqual(log.filter((x) => x[0] === 'globale'), [['globale', 'colpo:stop', 'all(x => x.gain(0))', 0]], 'lo stop taglia subito, senza griglia');
  assert.deepEqual(log.filter((x) => x[0] === 'taglio'), [['taglio', 'giu']]);
  c.riceve(tasto(tasti.eco, true)); // si combinano
  assert.equal(log.filter((x) => x[0] === 'globale').at(-1)[2], 'all(x => x.delay(.7).delayfeedback(.6))');
  avanza(3000);
  c.riceve(tasto(tasti.stop, false));
  c.riceve(tasto(tasti.eco, false));
  assert.deepEqual(log.filter((x) => x[0] === 'globale').slice(-2).map((x) => [x[1], x[2]]), [['colpo:stop', null], ['colpo:eco', null]]);
});

test('roll: il .ply cresce ogni due battiti (2 → 4 → 8) finché tengo, e si ferma all\'ultimo', () => {
  const { c, log, avanza, tasti } = conColpi();
  c.riceve(tasto(tasti.roll, true));
  assert.equal(log.filter((x) => x[0] === 'codaQ').at(-1)[2], '.ply(2)');
  avanza(1000); // 120 bpm: due battiti = 1 s
  assert.equal(log.filter((x) => x[0] === 'codaQ').at(-1)[2], '.ply(4)');
  avanza(1000);
  assert.equal(log.filter((x) => x[0] === 'codaQ').at(-1)[2], '.ply(8)');
  avanza(5000);
  assert.equal(log.filter((x) => x[0] === 'codaQ').length, 3, 'all\'ultimo non scrive più');
  assert.match(c.toccata.testo, /COLPO · ROLL 8/);
  c.riceve(tasto(tasti.roll, false));
  assert.deepEqual(log.filter((x) => x[0] === 'togliQ'), [['togliQ', 1, 'ply', 0.25]]);
});

test('sale: un livello temporaneo di rumore con il passa-alto che sale, visibile come codice', () => {
  const { c, log, avanza, tasti } = conColpi();
  c.riceve(tasto(tasti.sale, true));
  const entra = log.find((x) => x[0] === 'livelloTemp');
  assert.equal(entra[1], 'colpo:sale');
  assert.equal(entra[2].codice, 's("white*16").decay(.12).sustain(0)');
  assert.deepEqual(entra[2].coda, ['.hpf(400)', '.gain(.08)']);
  avanza(1000);
  avanza(1000);
  assert.deepEqual(log.filter((x) => x[0] === 'livelloTemp').at(-1)[2].coda, ['.hpf(2000)', '.gain(.16)']);
  c.riceve(tasto(tasti.sale, false));
  assert.equal(log.filter((x) => x[0] === 'livelloTemp').at(-1)[2], null);
});

test('un tocco più breve della griglia: il ritorno aspetta (l\'entrata c\'è stata)', () => {
  const { c, log, avanza, tasti } = conColpi();
  c.riceve(tasto(tasti.doppio, true));
  avanza(100);
  c.riceve(tasto(tasti.doppio, false));
  assert.equal(log.filter((x) => x[0] === 'togliQ').length, 0, 'ancora no');
  avanza(900); // 120 bpm: la griglia ¼ = 500 ms
  assert.equal(log.filter((x) => x[0] === 'togliQ').length, 1);
});

test('in pagina B i colpi vanno sul livello scelto; un tasto senza colpo lo dice', () => {
  const { c, log, tasti } = conColpi();
  c.riceve([0x90, c.tab.layer.B, 127]);
  c.riceve(tasto(c.tab.tasti[2], true)); // bersaglio: livello 3
  c.riceve(tasto(tasti.mezzo, true));
  assert.deepEqual(log.filter((x) => x[0] === 'codaQ'), [['codaQ', 3, '.slow(2)', 0.25]]);
  assert.ok(log.some((x) => x[0] === 'seleziona' && x[1] === 3), 'il livello scolpito è anche quello selezionato (bordo verde)');
  c.colpi.colpi.length = 2;
  c.riceve(tasto(tasti.eco, true));
  assert.ok(log.some((x) => x[0] === 'scritta' && /COLPO 8: NON ASSEGNATO/i.test(x[1])));
});

test('pagina B: B di nuovo alterna livello scelto e globale; il tasto 8 è sempre il paracadute (tenuto 1 s)', () => {
  const { c, log, avanza } = prova([L(1, 'drum'), L(2, 'basso')]);
  c.riceve([0x90, c.tab.layer.B, 127]);
  c.riceve(tasto(c.tab.tasti[1], true)); // livello 2
  assert.equal(c.bersaglio, 2);
  c.riceve([0x90, c.tab.layer.B, 127]); // B di nuovo: globale
  assert.equal(c.bersaglio, 'globale');
  assert.equal(c.nomeBersaglio(), 'GLOBALE');
  const luci = c.desiderate();
  for (let i = 0; i < 7; i++) assert.equal(luci.get(`t${c.tab.tasti[i]}`)[2], 0, 'col globale nessun tasto-livello è acceso');
  c.riceve([0x90, c.tab.layer.B, 127]); // B ancora: torna al livello 2
  assert.equal(c.bersaglio, 2);
  assert.equal(c.desiderate().get(`t${c.tab.tasti[1]}`)[2], 127);
  // il paracadute in pagina B: tenuto un secondo; rilasciato prima non parte
  c.riceve(tasto(c.tab.tasti[7], true));
  assert.equal(c.bersaglio, 2, 'il tasto 8 non sceglie più il globale');
  assert.equal(c.desiderate().get(`t${c.tab.tasti[7]}`)[2], 1, 'lampeggia mentre lo tengo');
  avanza(500);
  c.riceve(tasto(c.tab.tasti[7], false));
  avanza(1000);
  assert.equal(log.filter((x) => x[0] === 'paracadute').length, 0);
  c.riceve(tasto(c.tab.tasti[7], true));
  avanza(1100);
  assert.equal(log.filter((x) => x[0] === 'paracadute').length, 1);
});

test('stop: di default torna sull\'1 della battuta (griglia 1 ciclo); con l\'opzione «battito» sulla griglia; gli altri colpi sulla griglia', () => {
  const t = conColpi();
  t.c.riceve(tasto(t.tasti.stop, true));
  t.avanza(3000);
  t.c.riceve(tasto(t.tasti.stop, false));
  assert.deepEqual(t.log.filter((x) => x[0] === 'globale').at(-1), ['globale', 'colpo:stop', null, 1], 'rilascio sulla battuta');
  assert.equal(t.log.filter((x) => x[0] === 'globale').at(0)[3], 0, 'l\'entrata dello stop è subito');
  assert.deepEqual(t.log.filter((x) => x[0] === 'taglio').map((x) => x[1]), ['giu', 'su'], 'taglia premendo, riparte lasciando');
  t.c.riceve(tasto(t.tasti.eco, true));
  t.avanza(3000);
  t.c.riceve(tasto(t.tasti.eco, false));
  assert.equal(t.log.filter((x) => x[0] === 'globale').at(-1)[3], 0.25, 'eco: rilascio sulla griglia');
  const u = conColpi();
  u.azioni.stopTorna = () => 'battito';
  u.c.riceve(tasto(u.tasti.stop, true));
  u.avanza(3000);
  u.c.riceve(tasto(u.tasti.stop, false));
  assert.equal(u.log.filter((x) => x[0] === 'globale').at(-1)[3], 0.25, 'sul battito');
  // un tocco brevissimo: taglia e subito chiede il ritorno sull'1 successivo (niente attese in più)
  const v = conColpi();
  v.c.riceve(tasto(v.tasti.stop, true));
  v.avanza(30);
  v.c.riceve(tasto(v.tasti.stop, false));
  assert.deepEqual(v.log.filter((x) => x[0] === 'taglio').map((x) => x[1]), ['giu', 'su']);
  assert.deepEqual(v.log.filter((x) => x[0] === 'globale').at(-1).slice(2), [null, 1]);
});

test('i colpi vanno sul livello selezionato (bordo verde); senza selezione, sul beat; stop, sale ed eco restano su tutto', () => {
  const { c, log, tasti, azioni, avanza } = conColpi();
  c.riceve(tasto(tasti.mezzo, true));
  c.riceve(tasto(tasti.mezzo, false));
  assert.equal(log.filter((x) => x[0] === 'codaQ').at(-1)[1], 1, 'niente selezionato: il beat (il primo)');
  azioni.seleziona(3); // un clic su una card, o ⌃3
  c.riceve(tasto(tasti.doppio, true));
  assert.equal(log.filter((x) => x[0] === 'codaQ').at(-1)[1], 3, 'selezionato: va sul pad');
  assert.match(c.toccata.testo, /pad/);
  c.riceve(tasto(tasti.doppio, false));
  c.riceve(tasto(tasti.eco, true));
  assert.equal(log.filter((x) => x[0] === 'globale').at(-1)[1], 'colpo:eco', 'eco resta su tutto');
  // la manopola tenuta ha la precedenza sulla selezione
  c.riceve(push(2, true));
  avanza(500);
  c.riceve(tasto(tasti.indietro, true));
  assert.equal(log.filter((x) => x[0] === 'codaQ').at(-1)[1], 2);
});

test('il beat sta sempre sulla manopola 1 (e sul tasto-livello 1 in pagina B); senza beat la manopola 1 resta libera', () => {
  const beat = L(9, 'beat');
  const clip = [L(1, 'basso'), L(2, 'pad')];
  const { c } = prova([]);
  c.azioni.posti = () => [beat, clip[0], clip[1], null, null, null, null];
  assert.equal(c.livello(1).nome, 'beat');
  assert.equal(c.livello(3).nome, 'pad');
  assert.equal(c.manopole()[0].nome, 'beat');
  c.azioni.posti = () => [null, clip[0], clip[1], null, null, null, null];
  assert.equal(c.livello(1), null);
  assert.equal(c.manopole()[0], null, 'anello spento');
  assert.equal(c.manopole()[1].nome, 'basso');
  const luci = c.desiderate();
  assert.equal(luci.get('a1')[2], 0);
});
