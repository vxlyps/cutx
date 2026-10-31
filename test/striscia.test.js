import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StatoMisura, classeBatteria, dbDa, estensione, eventiDaHap, posizioneVerticale, testoMisura } from '../src/renderer/striscia.js';

const hap = (begin, end, value) => ({ whole: { begin: { valueOf: () => begin }, end: { valueOf: () => end } }, value, hasOnset: () => true });
const midi = (n) => ({ c3: 48, e3: 52, g3: 55 })[n];

test('le batterie in tre classi', () => {
  assert.equal(classeBatteria('bd'), -1);
  assert.equal(classeBatteria('sd'), -2);
  assert.equal(classeBatteria('hh'), -3);
  assert.equal(classeBatteria('boh'), -2);
});

test('dagli eventi del pattern agli eventi compatti: note, frequenze, batterie, forza', () => {
  const e = eventiDaHap(
    [hap(4, 4.25, { note: 'c3', gain: 0.5 }), hap(4.5, 4.75, { note: 55 }), hap(4.25, 4.5, { s: 'bd' }), hap(4.75, 5, { freq: 440, s: 'sine' }), hap(5, 5.25, { note: 'c3' })],
    4,
    midi,
  );
  assert.deepEqual(e[0], [0, 0.25, 48, 0.5]);
  assert.deepEqual(e[1], [0.5, 0.25, 55, 1]);
  assert.deepEqual(e[2], [0.25, 0.25, -1, 1]);
  assert.equal(e[3][2], 69, 'una frequenza vale la sua nota');
  assert.equal(e.length, 4, 'quello del ciclo dopo non c\'è');
});

test('l\'altezza si scala sull\'estensione del livello: si vede la forma della melodia', () => {
  const e = [[0, 0.1, 48, 1], [0.25, 0.1, 55, 1], [0.5, 0.1, 52, 1]];
  const est = estensione(e);
  assert.deepEqual(est, [48, 55]);
  const y = e.map((x) => posizioneVerticale(x, est));
  assert.ok(y[1] < y[2] && y[2] < y[0], 'più acuta più in alto');
  assert.ok(Math.min(...y) < 0.2 && Math.max(...y) > 0.65, 'usa tutta l\'altezza');
  assert.equal(posizioneVerticale([0, 0.1, 60, 1], estensione([[0, 0.1, 60, 1]])), 0.4, 'una nota sola: a metà');
  assert.equal(estensione([[0, 0.1, -1, 1]]), null);
  assert.ok(posizioneVerticale([0, 0.1, -1, 1], null) > posizioneVerticale([0, 0.1, -3, 1], null), 'la cassa sotto, il charleston sopra');
});

test('il misuratore: suono, troppo forte, silenzio (solo se ha note e non è in muto)', () => {
  const m = new StatoMisura();
  const base = { cicloMs: 2000, haNote: true, muto: false };
  assert.equal(m.aggiorna({ ...base, pk: 0.2, ora: 0 }).stato, 'suono');
  assert.equal(Math.round(dbDa(0.2)), -14);
  // niente suono: il silenzio arriva solo dopo più di un ciclo
  assert.equal(m.aggiorna({ ...base, pk: 0, ora: 1000 }).stato, 'suono');
  assert.equal(m.aggiorna({ ...base, pk: 0, ora: 1900 }).stato, 'suono');
  assert.equal(m.aggiorna({ ...base, pk: 0, ora: 2100 }).stato, 'silenzio');
  assert.equal(m.aggiorna({ ...base, pk: 0, ora: 9000, haNote: false }).stato, 'suono', 'senza note non è silenzio ma attesa');
  assert.equal(m.aggiorna({ ...base, pk: 0, ora: 9500, muto: true }).stato, 'muto');
  // troppo forte: resta un po'
  const f = new StatoMisura();
  assert.equal(f.aggiorna({ ...base, pk: 0.95, ora: 0 }).stato, 'troppo');
  assert.equal(f.aggiorna({ ...base, pk: 0.1, ora: 1000 }).stato, 'troppo');
  assert.equal(f.aggiorna({ ...base, pk: 0.1, ora: 1800 }).stato, 'suono');
});

test('il testo del misuratore sta su una riga', () => {
  assert.equal(testoMisura({ stato: 'suono', db: -14.2 }), '−14 dB');
  assert.equal(testoMisura({ stato: 'troppo', db: -0.6 }), 'TROPPO −1 dB');
  assert.equal(testoMisura({ stato: 'silenzio', db: -90 }), 'SILENZIO');
  assert.equal(testoMisura({ stato: 'muto', db: -90 }), 'MUTO');
  for (const t of ['TROPPO −1 dB', '−14 dB', 'SILENZIO']) assert.ok(t.length <= 13);
});
