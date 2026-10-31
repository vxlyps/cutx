import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doveApre } from '../src/main/dove-uscita.js';

const principale = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } };
const proiettore = { id: 2, bounds: { x: 1440, y: 0, width: 1920, height: 1080 } };

test('un solo schermo: finestra normale, mai a tutto schermo da sola', () => {
  const r = doveApre({ schermi: [principale], primarioId: 1 });
  assert.equal(r.schermo.id, 1);
  assert.equal(r.intero, false);
});

test('un secondo schermo: ci va a tutto schermo', () => {
  const r = doveApre({ schermi: [principale, proiettore], primarioId: 1 });
  assert.equal(r.schermo.id, 2);
  assert.equal(r.intero, true);
});

test('si ricorda lo schermo e se era a tutto schermo', () => {
  const finestra = { x: 1500, y: 100, width: 1280, height: 720 };
  const r = doveApre({ schermi: [principale, proiettore], primarioId: 1, ricordo: { schermo: 2, schermoIntero: false, bordi: finestra } });
  assert.equal(r.schermo.id, 2);
  assert.equal(r.intero, false);
  assert.deepEqual(r.bordi, finestra);
});

test('lo schermo ricordato non c\'è più: si torna alla regola (secondo schermo, o finestra normale)', () => {
  const ricordo = { schermo: 9, schermoIntero: true, bordi: { x: 5000, y: 0, width: 800, height: 600 } };
  assert.equal(doveApre({ schermi: [principale, proiettore], primarioId: 1, ricordo }).schermo.id, 2);
  const solo = doveApre({ schermi: [principale], primarioId: 1, ricordo, bordiValidi: () => null });
  assert.equal(solo.schermo.id, 1);
  assert.equal(solo.intero, false);
  assert.equal(solo.bordi, null);
});
