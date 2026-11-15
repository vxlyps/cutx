import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizza, scegliMano } from '../src/renderer/mani-gesto.js';
import { mano } from './mani-mano-finta.js';

test('analizza: aperta, pugno e a metà si riconoscono, a ogni grandezza', () => {
  for (const s of [0.1, 0.2, 0.4]) {
    assert.equal(analizza(mano({ forma: 'aperta', s }), 1).forma, 'aperta');
    assert.equal(analizza(mano({ forma: 'pugno', s }), 1).forma, 'pugno');
    assert.equal(analizza(mano({ forma: 'mista', s }), 1).forma, 'mista');
  }
});

test('analizza: il centro è a specchio (la destra tua è la x grande) e la dimensione segue la mano', () => {
  const a = analizza(mano({ x: 0.7, y: 0.3, s: 0.2 }), 1);
  assert.ok(Math.abs(a.centro[0] - 0.7) < 1e-9 && Math.abs(a.centro[1] - 0.3) < 1e-9);
  assert.ok(analizza(mano({ s: 0.4 }), 1).dim > analizza(mano({ s: 0.2 }), 1).dim * 1.9);
});

test('analizza: le dita più larghe danno un valore più alto, tra 0 e 1', () => {
  const stretta = analizza(mano({ dita: 0.1 }), 1).dita;
  const larga = analizza(mano({ dita: 1 }), 1).dita;
  assert.ok(larga > stretta && stretta >= 0 && larga <= 1);
});

test('analizza: dati strani non rompono niente', () => {
  assert.equal(analizza(null), null);
  assert.equal(analizza([[0, 0]]), null);
  assert.equal(analizza(new Array(21).fill([0.5, 0.5])), null);
});

test('scegliMano: la più grande, e solo se il centro è dentro la zona', () => {
  const piccola = mano({ x: 0.3, y: 0.5, s: 0.15 });
  const grande = mano({ x: 0.8, y: 0.5, s: 0.35 });
  assert.equal(scegliMano([piccola, grande], undefined, 1).punti, grande);
  const zona = { x: 0, y: 0, w: 0.5, h: 1 }; // solo la metà sinistra (a specchio)
  assert.equal(scegliMano([piccola, grande], zona, 1).punti, piccola);
  assert.equal(scegliMano([grande], zona, 1), null);
  assert.equal(scegliMano([], zona, 1), null);
});
