import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RegistratoreDrum } from '../src/renderer/drum-rec.js';

// ciclo 0.4 → l'inizio è il ciclo 2 (confine 1, più un ciclo di conteggio); si registra da 2 a 3.
const prova = (opz = {}) => {
  let c = 0.4;
  const r = new RegistratoreDrum({ ciclo: () => c, passi: 16, ...opz });
  return { r, vai: (x) => (c = x) };
};

test('le fasi sono quelle del REC del SYNTH: attesa, conteggio, registrazione, fine', () => {
  const { r } = prova();
  assert.equal(r.fase(0.5), 'attesa');
  assert.equal(r.fase(1.5), 'conta');
  assert.equal(r.fase(2.5), 'registra');
  assert.equal(r.fase(3.1), 'fine');
});

test('un colpo fuori dalla registrazione non si prende', () => {
  const { r } = prova();
  assert.equal(r.colpo(0, 0.8, 1.5), false);
  assert.equal(r.colpo(0, 0.8, 2.5), true);
  assert.equal(r.passiDaAccendere().length, 1);
});

test('il colpo va al passo più vicino', () => {
  const { r } = prova();
  r.colpo(0, 0.8, 2.0); // passo 0
  r.colpo(1, 0.8, 2.26); // 0.26 × 16 = 4.16 → passo 4
  r.colpo(2, 0.8, 2.5); // passo 8
  r.colpo(3, 0.8, 2.53); // 8.48 → passo 8
  assert.deepEqual(r.passiDaAccendere().map((p) => [p.riga, p.passo]), [[0, 0], [1, 4], [2, 8], [3, 8]]);
});

test('un colpo in fondo al giro torna al passo 1', () => {
  const { r } = prova();
  r.colpo(0, 0.8, 2.98); // 15.68 → 16 → 0
  assert.deepEqual(r.passiDaAccendere(), [{ riga: 0, passo: 0, vel: 0.8 }]);
});

test('due colpi sullo stesso passo e sulla stessa riga: uno solo, la velocity maggiore', () => {
  const { r } = prova();
  r.colpo(0, 0.5, 2.5);
  r.colpo(0, 0.9, 2.51);
  assert.deepEqual(r.passiDaAccendere(), [{ riga: 0, passo: 8, vel: 0.9 }]);
});

test('con 2 cicli la registrazione dura 2 cicli e i passi sono 32', () => {
  const { r } = prova({ cicli: 2, passi: 32 });
  assert.equal(r.fase(3.9), 'registra');
  assert.equal(r.fase(4.1), 'fine');
  r.colpo(0, 0.8, 3.0); // metà del giro → passo 16
  assert.equal(r.passiDaAccendere()[0].passo, 16);
});
