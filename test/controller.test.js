import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../src/renderer/controller.js';

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

test('il fader è il filtro del drop su tutto il live: in alto aperto, scendendo si chiude', () => {
  const { c, log, azioni } = prova([]);
  const fader = [];
  azioni.filtroMaster = (x) => fader.push(x);
  c.riceve([0xe8, 0x7f, 0x7f]); // in alto
  c.riceve([0xe8, 0x00, 0x20]); // a un quarto circa
  assert.equal(fader[0], 1);
  assert.ok(fader[1] > 0.2 && fader[1] < 0.3);
  assert.match(log.filter((x) => x[0] === 'scritta').at(0)[1], /FILTRO APERTO/);
  assert.match(log.filter((x) => x[0] === 'scritta').at(-1)[1], /FILTRO \d+ Hz/);
});
