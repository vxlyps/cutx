import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cronologia } from '../src/renderer/cronologia.js';

const voce = (nome, log, extra = {}) => ({ etichetta: nome, annulla: () => void log.push(`-${nome}`), rifai: () => void log.push(`+${nome}`), ...extra });

test('annulla in ordine inverso e rifà in ordine', async () => {
  const c = new Cronologia();
  const log = [];
  c.registra(voce('a', log));
  c.registra(voce('b', log));
  assert.equal((await c.annulla()).etichetta, 'b');
  assert.equal((await c.annulla()).etichetta, 'a');
  assert.equal(await c.annulla(), null);
  assert.equal((await c.rifai()).etichetta, 'a');
  assert.equal((await c.rifai()).etichetta, 'b');
  assert.equal(await c.rifai(), null);
  assert.deepEqual(log, ['-b', '-a', '+a', '+b']);
});

test('un\'azione nuova butta via quelle da rifare', async () => {
  const c = new Cronologia();
  const log = [];
  c.registra(voce('a', log));
  await c.annulla();
  c.registra(voce('b', log));
  assert.equal(await c.rifai(), null);
});

test('si ricordano solo gli ultimi 20 passi', async () => {
  const c = new Cronologia(20);
  for (let i = 0; i < 25; i++) c.registra(voce(String(i), []));
  assert.equal(c.conta, 20);
  assert.equal((await c.annulla()).etichetta, '24');
  c.svuota();
  assert.equal(c.conta, 0);
});

test('una voce che non si può più annullare si salta e si passa alla precedente', async () => {
  const c = new Cronologia();
  const log = [];
  c.registra(voce('vecchia', log));
  c.registra(voce('sparita', log, { annulla: () => false }));
  const r = await c.annulla();
  assert.equal(r.etichetta, 'vecchia');
  assert.deepEqual(r.saltate, ['sparita']);
  // e se nessuna si può, si dice
  c.registra(voce('x', log, { annulla: () => false }));
  const solo = await c.annulla();
  assert.equal(solo.etichetta, null);
  assert.deepEqual(solo.saltate, ['x']);
});

test('una voce senza rifai non si rifà, e un messaggio dell\'annulla arriva a chi suona', async () => {
  const c = new Cronologia();
  c.registra({ etichetta: 'tolto', annulla: () => 'torna nel CUE' });
  const r = await c.annulla();
  assert.equal(r.messaggio, 'torna nel CUE');
  assert.equal(await c.rifai(), null);
});
