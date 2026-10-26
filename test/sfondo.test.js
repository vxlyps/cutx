import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODI, inizioOnda, midiDi, modoDopo, modoValido, posto } from '../src/renderer/sfondo-calcolo.js';

test('i modi girano in tondo e un valore strano vale «niente»', () => {
  assert.deepEqual(MODI, ['niente', 'note', 'oscilloscopio']);
  assert.equal(modoDopo('niente'), 'note');
  assert.equal(modoDopo('note'), 'oscilloscopio');
  assert.equal(modoDopo('oscilloscopio'), 'niente');
  assert.equal(modoDopo(undefined), 'niente');
  assert.equal(modoValido('boh'), 'niente');
  assert.equal(modoValido('note'), 'note');
});

test('i nomi delle note diventano numeri MIDI (c3 = 48)', () => {
  assert.equal(midiDi('c3'), 48);
  assert.equal(midiDi('a4'), 69);
  assert.equal(midiDi('eb3'), 51);
  assert.equal(midiDi('f#2'), 42);
  assert.equal(midiDi('bd'), null);
  assert.equal(midiDi('c'), 48);
});

test('un evento è una nota (più acuta = più su) o un colpo su una corsia', () => {
  assert.equal(posto({ note: 36 }).nota, 0);
  assert.equal(posto({ note: 84 }).nota, 1);
  assert.equal(posto({ note: 200 }).nota, 1);
  assert.ok(posto({ note: 'c4' }).nota > posto({ note: 'c3' }).nota);
  assert.ok(Math.abs(posto({ freq: 440 }).nota - (69 - 36) / 48) < 1e-9);
  assert.equal(posto({ s: 'bd' }).corsia, 0);
  assert.equal(posto({ s: 'sd' }).corsia, 1);
  assert.equal(posto({ s: 'hh' }).corsia, 2);
  assert.equal(posto({ s: 'rullante strana' }).corsia, 3);
  assert.equal(posto({ s: 'bd', note: 40 }).nota !== undefined, true); // con una nota vince l'altezza
  assert.equal(posto(null), null);
  assert.equal(posto('x'), null);
});

test("l'onda parte dal primo passaggio da negativo a positivo", () => {
  assert.equal(inizioOnda(Float32Array.from([0.5, 0.2, -0.1, 0.3, 0.6])), 2);
  assert.equal(inizioOnda(Float32Array.from([0.5, 0.6, 0.7])), 0); // niente passaggi: dall'inizio
  assert.equal(inizioOnda(Float32Array.from([-1, 1]), 256), 0);
  assert.equal(inizioOnda(Float32Array.from([0.1, 0.2, -0.1, 0.3]), 1), 0); // oltre il massimo non cerca
});
