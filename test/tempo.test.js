import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrotondaBpm, bpmDi, cicloDi, cpsAl, cpsDi, epocaDi, fraseDi, risolvi, tempoInArrivo } from '../src/renderer/tempo.js';

// 120 BPM = 0,5 cicli al secondo: un ciclo ogni 2 s. Al secondo 0 (epoca 1000 ms) si è al ciclo 10.
const base = { ciclo0: 10, epoca0: 1000, cps: 0.5, ancoraFrase: 8 };

test('bpm e cps: 4 quarti per ciclo', () => {
  assert.equal(bpmDi(0.5), 120);
  assert.equal(cpsDi(140), 140 / 240);
  assert.equal(arrotondaBpm(139.96), 140);
});

test('senza cambi il ciclo corre dritto', () => {
  assert.equal(cicloDi(base, 1000), 10);
  assert.equal(cicloDi(base, 3000), 11);
  assert.equal(epocaDi(base, 12), 5000);
});

test('un cambio entra esattamente all\'inizio del ciclo, e i cicli non saltano', () => {
  // a 120 il ciclo 12 comincia a 5000 ms; da lì si va a 60 BPM (0,25 cicli/s: un ciclo ogni 4 s)
  const m = { ...base, cambi: [{ ciclo: 12, cps: 0.25 }] };
  assert.equal(cicloDi(m, 4999), 10 + (3999 / 1000) * 0.5); // ancora al vecchio tempo
  assert.equal(cicloDi(m, 5000), 12);
  assert.equal(cicloDi(m, 9000), 13); // 4 s dopo, un ciclo solo
  assert.equal(cpsAl(m, 4000), 0.5);
  assert.equal(cpsAl(m, 5000), 0.25);
  assert.equal(epocaDi(m, 12), 5000);
  assert.equal(epocaDi(m, 13), 9000);
  assert.equal(epocaDi(m, 11), 3000); // prima del cambio vale il vecchio tempo
});

test('il ciclo è sempre crescente attraversando un cambio (niente salti né ritorni)', () => {
  const m = { ...base, cambi: [{ ciclo: 12, cps: 0.25 }, { ciclo: 14, cps: 0.75 }] };
  let prima = -Infinity;
  for (let t = 1000; t < 30000; t += 37) {
    const c = cicloDi(m, t);
    assert.ok(c >= prima, `${t}`);
    prima = c;
  }
  assert.equal(cpsAl(m, 29000), 0.75);
});

test('risolvi assorbe i cambi passati e tiene quelli in arrivo', () => {
  const m = { ...base, cambi: [{ ciclo: 12, cps: 0.25 }, { ciclo: 14, cps: 0.75 }] };
  const r = risolvi(m, 6000);
  assert.deepEqual([r.ciclo0, r.epoca0, r.cps], [12, 5000, 0.25]);
  assert.deepEqual(r.cambi, [{ ciclo: 14, cps: 0.75 }]);
  assert.equal(tempoInArrivo(m, 6000), 0.75);
  assert.equal(tempoInArrivo(m, 20000), null);
});

test('la frase conta i cicli: un cambio di tempo non la fa sballare', () => {
  // la frase parte al ciclo 8: al ciclo 10 siamo alla 3ª battuta, e conta fino a 16
  const m = { ...base, cambi: [{ ciclo: 12, cps: 0.25 }] };
  const frase = (t) => fraseDi(m, t, 16);
  assert.equal(frase(1000), 3);
  assert.equal(frase(4999), 4); // ciclo 11
  assert.equal(frase(5000), 5); // ciclo 12: entra il nuovo tempo e la frase va avanti di uno, non di più
  assert.equal(frase(8999), 5); // il ciclo 12 dura ora 4 secondi
  assert.equal(frase(9000), 6);
  // tutta la sequenza, ciclo per ciclo, senza salti né ripetizioni
  const viste = [];
  for (let t = 1000; t < 60000; t += 100) {
    const f = frase(t);
    if (viste.at(-1) !== f) viste.push(f);
  }
  for (let i = 1; i < viste.length; i++) assert.equal(viste[i], (viste[i - 1] % 16) + 1, `dopo ${viste[i - 1]} viene ${viste[i]}`);
});
