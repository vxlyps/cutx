import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curva, filtroEntra, filtroEsce, programma, resta } from '../src/renderer/dissolvenza.js';

test('la curva di entrata sale da 0 a 1 e quella di uscita scende, a potenza costante', () => {
  const su = curva('entra');
  const giu = curva('esce');
  assert.equal(su[0], 0);
  assert.ok(Math.abs(su.at(-1) - 1) < 1e-6);
  assert.ok(Math.abs(giu[0] - 1) < 1e-6);
  assert.ok(Math.abs(giu.at(-1)) < 1e-6);
  for (let i = 0; i < su.length; i++) assert.ok(Math.abs(su[i] ** 2 + giu[i] ** 2 - 1) < 1e-5, `punto ${i}`);
  for (let i = 1; i < su.length; i++) assert.ok(su[i] >= su[i - 1] && giu[i] <= giu[i - 1]);
});

test('il tipo sceglie i filtri: solo volume = nessuno', () => {
  assert.equal(filtroEntra('volume'), null);
  assert.equal(filtroEsce('volume'), null);
  assert.equal(filtroEntra('filtro'), 'lp');
  assert.equal(filtroEsce('filtro'), 'hp');
  assert.equal(filtroEsce('filtro', 'lp'), 'lp');
  assert.equal(filtroEsce('filtro', 'boh'), 'hp');
});

test('quanto manca alla fine di una sfumata', () => {
  const s = { da: 10, a: 12 };
  assert.equal(resta(null, 11), null);
  assert.equal(resta(s, 9), 1);
  assert.equal(resta(s, 10), 1);
  assert.equal(resta(s, 11), 0.5);
  assert.equal(resta(s, 12), 0);
  assert.equal(resta(s, 15), 0);
});

// un parametro audio finto: ricorda i valori impostati e le rampe
const param = () => ({ v: [], r: [], cancelScheduledValues() {}, setValueAtTime(x, t) { this.v.push([t, x]); }, setValueCurveAtTime() {}, exponentialRampToValueAtTime(x, t) { this.r.push([t, x]); } });

test('lo scambio dei bassi: il passa-alto in uscita parte da 150 Hz sull\'1, di default da 20', () => {
  for (const [partenza, atteso] of [[150, 150], [undefined, 20]]) {
    const n = { ac: { sampleRate: 48000, currentTime: 0 }, fade: { gain: param() }, lp: { frequency: param() }, hp: { frequency: param() } };
    programma(n, { verso: 'esce', da: 4, fine: 12, filtro: 'hp', partenzaHz: partenza });
    assert.deepEqual(n.hp.frequency.v.find(([t]) => t === 4), [4, atteso]);
    assert.deepEqual(n.hp.frequency.r.at(-1), [12, 6000]);
  }
});
