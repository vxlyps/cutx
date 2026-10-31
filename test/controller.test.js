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

test('le luci mostrano i valori veri: pagina A volumi (muto = spento), pagina B il bersaglio', () => {
  const { c } = prova([L(1, 'drum', 1), L(2, 'basso', 0.5, true)]);
  const l = c.desiderate();
  assert.deepEqual(l.get('a1'), [0xb0, 0x30, 11]); // volume pieno: posizione 11
  assert.deepEqual(l.get('a2'), [0xb0, 0x31, 0]); // muto: anello spento
  assert.deepEqual(l.get('t84'), [0x90, 84, 127]); // layer A acceso
  assert.deepEqual(l.get('t85'), [0x90, 85, 0]);
  c.pagina = 'B';
  c.bersaglio = 1;
  const b = c.desiderate();
  assert.equal(b.get('a1')[2], 32 + 11, 'pagina B: modo fan, volume pieno');
  assert.deepEqual(b.get('t85'), [0x90, 85, 127]);
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
