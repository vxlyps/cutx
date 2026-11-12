import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guasto, sicuro } from '../src/renderer/guasto.js';

test('lo stesso guasto si scrive al massimo una volta al secondo, uno diverso subito', () => {
  const scritti = [];
  const scrivi = (t) => scritti.push(t);
  assert.equal(guasto('giro', new Error('boom'), { ora: 1000, scrivi }), true);
  assert.equal(guasto('giro', new Error('boom'), { ora: 1500, scrivi }), false);
  assert.equal(guasto('giro', new Error('altro'), { ora: 1500, scrivi }), true);
  assert.equal(guasto('giro', new Error('boom'), { ora: 2100, scrivi }), true);
  assert.equal(scritti.length, 3);
  assert.match(scritti[0], /^giro: Error: boom/);
});

test('sicuro: una funzione che lancia non ferma chi la chiama', () => {
  const errore = console.error;
  console.error = () => {};
  try {
    assert.equal(sicuro('prova sicuro', () => 7), 7);
    assert.equal(sicuro('prova sicuro', () => { throw new Error('x'); }), undefined);
    assert.equal(sicuro('prova sicuro', () => { throw 'stringa'; }), undefined);
  } finally {
    console.error = errore;
  }
});
