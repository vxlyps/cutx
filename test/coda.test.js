import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applica, imposta, leggiVoce, righeVisibili, separa, togli, unisci, valoreDi, valoreLetterale } from '../src/renderer/coda.js';
import * as B from '../src/renderer/brano.js';

test('una voce è una chiamata .nome(...)', () => {
  assert.deepEqual(leggiVoce('  .lpf(1200)  '), { chiave: 'lpf', testo: '.lpf(1200)' });
  assert.equal(leggiVoce('s("bd")'), null);
  assert.equal(leggiVoce('.lpf 1200'), null);
});

test('separa la coda dopo // @coda e la riunisce uguale', () => {
  const testo = 's("bd*4")\n// @coda\n.lpf(1200)\n.delay(.4)';
  assert.deepEqual(separa(testo), { codice: 's("bd*4")', coda: ['.lpf(1200)', '.delay(.4)'] });
  assert.equal(unisci('s("bd*4")', ['.lpf(1200)', '.delay(.4)']), testo);
  assert.equal(unisci('s("bd*4")', []), 's("bd*4")');
});

test('se dopo la marca c\'è altro che voci, niente si separa: il codice suona com\'è', () => {
  const testo = 's("bd")\n// @coda\n.lpf(1200)\nstack(a, b)';
  assert.deepEqual(separa(testo), { codice: testo, coda: [] });
  assert.deepEqual(separa('s("bd")'), { codice: 's("bd")', coda: [] });
});

test('imposta cambia sul posto o aggiunge in fondo; togli per chiave', () => {
  let c = imposta([], '.lpf(800)');
  c = imposta(c, '.delay(.4)');
  c = imposta(c, '.lpf(1200)');
  assert.deepEqual(c, ['.lpf(1200)', '.delay(.4)']);
  assert.deepEqual(imposta(c, 'non è una voce'), c);
  assert.deepEqual(togli(c, 'lpf'), ['.delay(.4)']);
});

test('valori: della coda e quello letterale scritto nel codice (l\'ultimo)', () => {
  assert.equal(valoreDi(['.lpf(1200)'], 'lpf'), 1200);
  assert.equal(valoreDi(['.delay(.4)'], 'delay'), 0.4);
  assert.equal(valoreDi(['.lpf("<1 2>")'], 'lpf'), null);
  assert.equal(valoreLetterale('s("bd").lpf(800).lpf(900)', 'lpf'), 900);
  assert.equal(valoreLetterale('s("bd").lpf(sine)', 'lpf'), null);
  assert.equal(valoreLetterale('s("bd")', 'lpf'), null);
});

test('righe visibili: la coda e il volume in fondo se non è al massimo', () => {
  assert.deepEqual(righeVisibili(['.lpf(1200)'], 1), ['.lpf(1200)']);
  assert.deepEqual(righeVisibili(['.lpf(1200)'], 0.6), ['.lpf(1200)', '.gain(0.6)']);
  assert.deepEqual(righeVisibili([], 0.5), ['.gain(0.5)']);
});

test('applica: la coda si concatena e l\'ultimo valore vince; un errore lascia il pattern fuori', () => {
  const finto = (log) => {
    const p = { queryArc: () => [], lpf: (v) => (log.push(`lpf${v}`), p), fast: (v) => (log.push(`fast${v}`), p) };
    return p;
  };
  const log = [];
  const r = applica(finto(log), ['.lpf(1200)', '.fast(2)']);
  assert.ok(r.pattern);
  assert.deepEqual(log, ['lpf1200', 'fast2']);
  assert.ok(applica(finto([]), ['.nonEsiste(1)']).errore);
  assert.equal(applica(finto([]), []).errore, undefined);
});

test('daLivelli scrive la coda in fondo alla sezione, e si rilegge', () => {
  const testo = B.daLivelli([{ nome: 'reese', codice: 's("sine")', coda: ['.lpf(900)'], volume: 0.6 }], { nome: 'x', data: '2026-10-31' });
  const b = B.leggi(testo);
  assert.deepEqual(separa(b.sezioni[0].corpo.join('\n')), { codice: 's("sine")', coda: ['.lpf(900)'] });
  assert.equal(b.sezioni[0].info.volume, 0.6);
});
