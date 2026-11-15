import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OTTAVA_MAX, OTTAVA_MIN, RUOLI, TESTINA, eventoPad, eventoPiano, eventoSequencer, luciPad, luciPiano, luciSequencer,
  nuovoPad, nuovoPiano, nuovoSequencer, ruoloDi,
} from '../src/renderer/controller-ruoli.js';

function congela(valore) {
  if (valore && typeof valore === 'object' && !Object.isFrozen(valore)) {
    Object.values(valore).forEach(congela);
    Object.freeze(valore);
  }
  return valore;
}

const riga = (vel = Array(32).fill(0), tipo = 'griglia') => ({ tipo, suono: 'bd', banco: '', vel });
const griglia = (righe = [riga()], passi = 32, cicli = 1) => ({ g: { righe, passi, cicli } });
const ev = (tipo, n, giu) => ({ tipo, n, giu });
const manopola = (n, passi) => ({ tipo: 'manopola', n, passi });

test('ruoloDi sceglie il ruolo per vista, scheda e layer', () => {
  assert.deepEqual(RUOLI, ['live', 'synth', 'sequencer', 'pad', 'piano']);
  assert.equal(ruoloDi({ vista: 'live', scheda: 'drum', layer: 'A' }), 'live');
  assert.equal(ruoloDi({ vista: 'synth', scheda: 'drum', layer: 'A' }), 'sequencer');
  assert.equal(ruoloDi({ vista: 'synth', scheda: 'drum', layer: 'B' }), 'pad');
  for (const scheda of ['suono', 'note', 'altro']) {
    assert.equal(ruoloDi({ vista: 'synth', scheda, layer: 'A' }), 'synth');
    assert.equal(ruoloDi({ vista: 'synth', scheda, layer: 'B' }), 'piano');
  }
  assert.equal(ruoloDi({ vista: 'altro', scheda: 'suono', layer: 'A' }), 'live');
  assert.equal(ruoloDi({ vista: 'synth', scheda: 'drum', layer: 'C' }), 'live');
});

test('sequencer: tap alterna passi, tiene le velocità e ignora il rilascio dopo la manopola', () => {
  const ctx = griglia([riga()]);
  let s = nuovoSequencer();
  let out = eventoSequencer(s, ev('tasto', 1, true), ctx);
  s = out.stato;
  assert.deepEqual(out.azioni, []);
  out = eventoSequencer(s, ev('tasto', 1, false), ctx);
  assert.deepEqual(out.azioni, [{ tipo: 'passo', riga: 0, passo: 0, vel: 0.8 }]);
  const acceso = griglia([riga([0.4, ...Array(31).fill(0)])]);
  out = eventoSequencer(nuovoSequencer(), ev('tasto', 1, true), acceso);
  out = eventoSequencer(out.stato, ev('tasto', 1, false), acceso);
  assert.deepEqual(out.azioni, [{ tipo: 'passo', riga: 0, passo: 0, vel: 0 }]);

  let held = eventoSequencer(nuovoSequencer(), ev('tasto', 1, true), acceso).stato;
  out = eventoSequencer(held, manopola(1, -100), acceso);
  assert.deepEqual(out.azioni, [{ tipo: 'velocita', riga: 0, passo: 0, vel: 0.05 }]);
  assert.deepEqual(out.stato.mossi, [0]);
  out = eventoSequencer(out.stato, ev('tasto', 1, false), acceso);
  assert.deepEqual(out.azioni, []);
  assert.deepEqual(out.stato.tenuti, []);

  const pieno = griglia([riga([0.99, ...Array(31).fill(0)])]);
  held = eventoSequencer(nuovoSequencer(), ev('tasto', 1, true), pieno).stato;
  out = eventoSequencer(held, manopola(1, 10), pieno);
  assert.equal(out.azioni[0].vel, 1);
  held = eventoSequencer(nuovoSequencer(), ev('tasto', 2, true), ctx).stato;
  out = eventoSequencer(held, manopola(1, 10), ctx);
  assert.deepEqual(out.azioni, [], 'i passi spenti diventano mossi senza azione');
  assert.deepEqual(out.stato.mossi, [1]);
});

test('sequencer: cambia riga, sceglie suono e passa pagina con riporti nei limiti', () => {
  const ctx = griglia([riga(), riga(), riga()], 16, 1);
  let out = eventoSequencer({ riga: 0, pagina: 0, tenuti: [], mossi: [] }, manopola(1, -5), ctx);
  assert.equal(out.stato.riga, 0);
  out = eventoSequencer(out.stato, manopola(1, 2), ctx);
  assert.equal(out.stato.riga, 1);
  out = eventoSequencer(out.stato, manopola(2, -3), ctx);
  assert.deepEqual(out.azioni, [{ tipo: 'suono', riga: 1, verso: -1 }]);
  out = eventoSequencer(out.stato, { tipo: 'push', n: 3, giu: true }, ctx);
  assert.equal(out.stato.pagina, 0, 'una sola pagina non cambia');
  out = eventoSequencer({ riga: 20, pagina: 20, tenuti: [], mossi: [] }, ev('tasto', 1, true), griglia([riga()], 32));
  assert.equal(out.stato.riga, 0);
  assert.equal(out.stato.pagina, 1);
  out = eventoSequencer(out.stato, { tipo: 'push', n: 3, giu: true }, griglia([riga()], 32));
  assert.equal(out.stato.pagina, 0);
  assert.equal(eventoSequencer(out.stato, ev('tasto', 1, true), griglia([riga()], 16)).stato.pagina, 0, 'la pagina si riporta quando la griglia si accorcia');
  const testo = griglia([riga(Array(32).fill(0), 'testo')]);
  out = eventoSequencer(nuovoSequencer(), ev('tasto', 1, true), testo);
  out = eventoSequencer(out.stato, ev('tasto', 1, false), testo);
  assert.deepEqual(out.azioni, []);
  assert.deepEqual(eventoSequencer(nuovoSequencer(), manopola(2, 1), testo).azioni, []);
});

test('sequencer: luci seguono i passi e la testina nei due stili, anche in pagina 2', () => {
  assert.equal(TESTINA, 'lampeggio');
  const ctx = griglia([riga([0.8, ...Array(15).fill(0), 0.5, ...Array(15).fill(0)])]);
  const s = { ...nuovoSequencer(), pagina: 0 };
  const luci = luciSequencer(s, { ...ctx, testina: 0 });
  assert.equal(luci[0], 'lampeggia');
  assert.equal(luci[1], 'spento');
  assert.equal(luciSequencer(s, { ...ctx, testina: 0, stileTestina: 'inverso' })[0], 'spento');
  assert.equal(luciSequencer(s, { ...ctx, testina: 1, stileTestina: 'inverso' })[1], 'acceso');
  const pagina2 = luciSequencer({ ...s, pagina: 1 }, ctx);
  assert.equal(pagina2[0], 'acceso');
  assert.equal(pagina2[1], 'spento');
  assert.deepEqual(luciSequencer(s, { g: { passi: 0, cicli: 0, righe: [] } }), Array(16).fill('spento'));
});

test('sequencer ignora eventi fuori intervallo e non modifica input congelati', () => {
  const s = congela({ riga: 0, pagina: 0, tenuti: [], mossi: [] });
  const ctx = congela(griglia([riga()]));
  for (const e of [ev('tasto', 0, true), ev('tasto', 17, true), manopola(9, 1), { tipo: 'push', n: 3, giu: false }, { tipo: 'altro', n: 1 }]) {
    assert.deepEqual(eventoSequencer(s, e, ctx).azioni, []);
  }
  assert.deepEqual(s, { riga: 0, pagina: 0, tenuti: [], mossi: [] });
});

test('pad suona, rilascia, mostra le luci e ignora tasti senza riga', () => {
  const ctx = congela(griglia([riga(), riga()]));
  const s = congela(nuovoPad());
  let out = eventoPad(s, ev('tasto', 2, true), ctx);
  assert.deepEqual(out.azioni, [{ tipo: 'suona', riga: 1, vel: 0.8 }]);
  assert.deepEqual(luciPad(out.stato).slice(0, 3), ['spento', 'acceso', 'spento']);
  out = eventoPad(out.stato, ev('tasto', 2, false), ctx);
  assert.deepEqual(out.azioni, [{ tipo: 'rilascia', riga: 1 }]);
  assert.deepEqual(eventoPad(nuovoPad(), ev('tasto', 3, true), ctx).azioni, []);
  for (const e of [ev('tasto', 0, true), ev('tasto', 17, true), manopola(1, 1), { tipo: 'push', n: 1, giu: true }]) {
    assert.deepEqual(eventoPad(s, e, ctx).azioni, []);
  }
  assert.deepEqual(s, { tenuti: [] });
});

test('piano assegna tutte le note a ottava 4 e 5, evita duplicati e conserva la nota al rilascio', () => {
  const tasti = [1, 2, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16];
  const semitoni = [1, 3, 6, 8, 10, 0, 2, 4, 5, 7, 9, 11, 12];
  for (const ottava of [4, 5]) {
    let s = { ottava, tenuti: {} };
    for (let i = 0; i < tasti.length; i++) {
      const out = eventoPiano(s, ev('tasto', tasti[i], true));
      assert.deepEqual(out.azioni, [{ tipo: 'nota', midi: 12 * (ottava + 1) + semitoni[i], vel: 0.8, giu: true }]);
      assert.deepEqual(eventoPiano(out.stato, ev('tasto', tasti[i], true)).azioni, []);
      s = out.stato;
    }
    if (ottava === 4) assert.equal(s.tenuti[9], 60, 'il do centrale è midi 60');
  }
  const s0 = congela(nuovoPiano());
  let out = eventoPiano(s0, ev('tasto', 9, true));
  out = eventoPiano(out.stato, manopola(1, 1));
  assert.equal(out.stato.ottava, 5);
  out = eventoPiano(out.stato, ev('tasto', 9, false));
  assert.deepEqual(out.azioni, [{ tipo: 'nota', midi: 60, vel: 0, giu: false }]);
  assert.deepEqual(s0, { ottava: 4, tenuti: {} });
});

test('piano limita ottava, ignora tasti muti e accende le luci dei tasti tenuti', () => {
  assert.equal(OTTAVA_MIN, 1);
  assert.equal(OTTAVA_MAX, 7);
  let s = nuovoPiano();
  for (let i = 0; i < 10; i++) s = eventoPiano(s, manopola(1, 1)).stato;
  assert.equal(s.ottava, OTTAVA_MAX);
  for (let i = 0; i < 10; i++) s = eventoPiano(s, manopola(1, -1)).stato;
  assert.equal(s.ottava, OTTAVA_MIN);
  for (const n of [3, 7, 8]) assert.deepEqual(eventoPiano(s, ev('tasto', n, true)).azioni, []);
  const out = eventoPiano(s, ev('tasto', 9, true));
  assert.equal(luciPiano(out.stato)[8], 'acceso');
  assert.equal(luciPiano(out.stato)[0], 'spento');
  assert.deepEqual(eventoPiano(congela(s), { tipo: 'tasto', n: 17, giu: true }).azioni, []);
});
