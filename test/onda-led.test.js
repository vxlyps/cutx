import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoriaOnda, altezza } from '../src/renderer/onda-led.js';

test('altezza: 0 dB piena, -48 dB spenta, silenzio spento', () => {
  assert.equal(altezza(1), 1);
  assert.equal(altezza(0), 0);
  assert.equal(altezza(10 ** (-48 / 20)), 0);
  assert.ok(Math.abs(altezza(10 ** (-24 / 20)) - 0.5) < 1e-9);
  assert.equal(altezza(2), 1);
});

test('un picco va nella colonna del suo punto nel ciclo', () => {
  const m = new MemoriaOnda(4);
  m.aggiungi(10.5, 0.01, [255]); // a metà del ciclo
  const c = m.colonne(4, 10.5);
  assert.deepEqual([...c].map((v) => Math.round(v)), [0, 0, 1, 0]);
});

test('più picchi: l\'ultimo finisce a «ciclo», gli altri indietro di un passo ciascuno', () => {
  const m = new MemoriaOnda(4);
  m.aggiungi(3.6, 0.25, [255, 0, 255]); // a 3.1, 3.35, 3.6
  const c = m.colonne(4, 3.6);
  assert.equal(Math.round(c[0]), 1);
  assert.equal(c[1], 0);
  assert.equal(Math.round(c[2]), 1);
});

test('un giro nuovo cancella il vecchio; nello stesso giro vince il più forte', () => {
  const m = new MemoriaOnda(4);
  m.aggiungi(1.1, 0.01, [255]);
  m.aggiungi(1.12, 0.01, [10]);
  assert.equal(m.valori[0], 1);
  m.aggiungi(2.1, 0.01, [0]);
  assert.equal(m.valori[0], 0);
});

test('una cella non riscritta da più di un giro si spegne (mai accesa ferma)', () => {
  const m = new MemoriaOnda(4);
  m.aggiungi(5.1, 0.01, [255]);
  assert.equal(Math.round(m.colonne(4, 6.0)[0]), 1);
  assert.equal(m.colonne(4, 6.5)[0], 0);
});

test('le colonne della vista raggruppano le celle (vince la più alta)', () => {
  const m = new MemoriaOnda(8);
  m.aggiungi(0.3, 0.01, [255]);
  const c = m.colonne(2, 0.3);
  assert.equal(Math.round(c[0]), 1);
  assert.equal(c[1], 0);
});

test('valori strani non rompono niente', () => {
  const m = new MemoriaOnda(4);
  m.aggiungi(NaN, 0.1, [255]);
  m.aggiungi(1, 0, [255]);
  m.aggiungi(1, 0.1, null);
  assert.deepEqual([...m.colonne(4, 1)], [0, 0, 0, 0]);
});
