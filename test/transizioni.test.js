import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASSO_HZ, chiEsce, leggiTransizione, perIlLive, scriviTransizione, sceglieTransizione } from '../src/renderer/transizioni.js';

test('si leggono sweep (con o senza cicli) e cut; il resto no', () => {
  assert.deepEqual(leggiTransizione('sweep 8'), { tipo: 'sweep', cicli: 8 });
  assert.deepEqual(leggiTransizione('sweep 4'), { tipo: 'sweep', cicli: 4 });
  assert.deepEqual(leggiTransizione(' SWEEP '), { tipo: 'sweep', cicli: 8 });
  assert.deepEqual(leggiTransizione('cut'), { tipo: 'cut', cicli: 0 });
  for (const male of ['', 'sweep 0', 'sweep 99', 'cut 4', 'echo out', 'sweep x', null, undefined]) assert.equal(leggiTransizione(male), null, String(male));
});

test('si riscrive come si è letta', () => {
  for (const t of ['sweep 8', 'sweep 4', 'cut']) assert.equal(scriviTransizione(leggiTransizione(t)), t);
});

test('vale quella del set; se è scritta male vale la predefinita e si dice quale era', () => {
  assert.deepEqual(sceglieTransizione('cut', 'sweep 8'), { transizione: { tipo: 'cut', cicli: 0 }, scartata: '' });
  assert.deepEqual(sceglieTransizione('', 'sweep 4'), { transizione: { tipo: 'sweep', cicli: 4 }, scartata: '' });
  assert.deepEqual(sceglieTransizione('boh', 'sweep 4'), { transizione: { tipo: 'sweep', cicli: 4 }, scartata: 'boh' });
  assert.deepEqual(sceglieTransizione('', 'scritta male').transizione, { tipo: 'sweep', cicli: 8 });
});

test('al live arriva il taglio dei bassi a 150 Hz e i livelli da tenere (senza vuoti)', () => {
  const p = perIlLive({ tipo: 'sweep', cicli: 8 }, [3, null, undefined]);
  assert.deepEqual(p, { tipo: 'sweep', cicli: 8, hz: BASSO_HZ, tieni: [3] });
  assert.equal(BASSO_HZ, 150);
});

test('escono tutti i livelli che suonano, tranne il nuovo, il paracadute, chi sta già uscendo, chi non è ancora entrato e il tenuto', () => {
  const livelli = [
    { id: 1, nome: 'beat', da: 0, a: Infinity },
    { id: 2, nome: 'basso', da: 0, a: Infinity },
    { id: 3, nome: 'lead', da: 0, a: Infinity }, // selezionato: resta
    { id: 4, nome: 'pad', da: 0, a: 20 }, // sta già uscendo
    { id: 5, nome: 'paracadute', da: 0, a: Infinity },
    { id: 6, nome: 'dopo', da: 16, a: Infinity }, // entra dopo l'1 della transizione
    { id: 7, nome: 'beat', da: 16, a: Infinity }, // il nuovo
  ];
  assert.deepEqual(chiEsce(livelli, { da: 16, nuovo: 7, tieni: [3] }).map((l) => l.id), [1, 2]);
  assert.deepEqual(chiEsce(livelli, { da: 16, nuovo: 7 }).map((l) => l.id), [1, 2, 3]);
});
