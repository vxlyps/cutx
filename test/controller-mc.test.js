import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anelloDa, decodifica, messaggioAnello, messaggioTasto, parole, passiRelativi, tabella } from '../src/renderer/controller-mc.js';

test('le manopole sono relative: il bit 6 è il segno', () => {
  assert.equal(passiRelativi(0x01), 1);
  assert.equal(passiRelativi(0x03), 3);
  assert.equal(passiRelativi(0x41), -1);
  assert.equal(passiRelativi(0x45), -5);
  assert.deepEqual(decodifica([0xb0, 18, 0x02]), { tipo: 'manopola', n: 3, passi: 2 });
  assert.deepEqual(decodifica([0xb0, 16, 0x41]), { tipo: 'manopola', n: 1, passi: -1 });
  assert.equal(parole({ tipo: 'manopola', n: 3, passi: 2 }), 'manopola 3 → +2');
});

test('push, tasti, layer e fader', () => {
  assert.deepEqual(decodifica([0x90, 32, 127]), { tipo: 'push', n: 1, giu: true });
  assert.deepEqual(decodifica([0x90, 39, 0]), { tipo: 'push', n: 8, giu: false });
  assert.equal(decodifica([0x90, 84, 127]).tipo, 'layer');
  assert.equal(decodifica([0x90, 84, 127]).pagina, 'A');
  assert.equal(decodifica([0x80, 85, 0]).pagina, 'B');
  const t = decodifica([0x90, 40, 127]);
  assert.deepEqual([t.tipo, t.n, t.giu], ['tasto', 3, true]);
  assert.equal(parole(t), 'tasto 3 (alto 3 · TRACK) giù');
  assert.equal(decodifica([0x90, 99, 127]).tipo, 'altro');
  const f = decodifica([0xe8, 0x7f, 0x7f]);
  assert.equal(f.tipo, 'fader');
  assert.equal(f.valore, 1);
  assert.equal(decodifica([0xe0, 0, 0]).valore, 0);
});

test('i messaggi da standard si riconoscono (canale 11)', () => {
  assert.equal(decodifica([0xba, 1, 8]).tipo, 'standard');
  assert.equal(decodifica([0x9a, 8, 127]).tipo, 'standard');
});

test('la calibrazione sta sopra i predefiniti', () => {
  const t = tabella({ tasti: [null, null, null, null, null, null, null, null, null, null, 91, 92], layer: { A: 10 } });
  assert.equal(t.tasti[10], 91);
  assert.equal(t.tasti[0], 89);
  assert.equal(t.layer.A, 10);
  assert.equal(t.layer.B, 85);
  assert.equal(decodifica([0x90, 91, 127], t).n, 11);
});

test('anelli e led: i byte giusti', () => {
  assert.deepEqual(messaggioAnello(1, 6, 'punto'), [0xb0, 0x30, 6]);
  assert.deepEqual(messaggioAnello(8, 11, 'fan'), [0xb0, 0x37, 11 + 32]);
  assert.deepEqual(messaggioAnello(2, 3, 'spread', true), [0xb0, 0x31, 3 + 48 + 64]);
  assert.equal(anelloDa(1, 1, 'punto')[2], 12 - 1 + 0); // 1 + 10 = 11
  assert.deepEqual(anelloDa(1, 0, 'fan'), [0xb0, 0x30, 32]);
  assert.deepEqual(messaggioTasto(89, true), [0x90, 89, 127]);
  assert.deepEqual(messaggioTasto(89, false), [0x90, 89, 0]);
  assert.deepEqual(messaggioTasto(89, 'lampeggia'), [0x90, 89, 1]);
});
