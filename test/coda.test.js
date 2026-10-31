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

import { soloCoda } from '../src/renderer/coda.js';

test('soloCoda: righe di coda con o senza // @coda sono una coda, il resto no', () => {
  assert.deepEqual(soloCoda('.lpf(600)'), ['.lpf(600)']);
  assert.deepEqual(soloCoda('// @coda\n.fast(2)\n\n.lpf(600)\n'), ['.fast(2)', '.lpf(600)']);
  assert.equal(soloCoda('s("bd")\n// @coda\n.lpf(600)'), null);
  assert.equal(soloCoda('// solo un commento'), null);
  assert.equal(soloCoda('   '), null);
  assert.equal(soloCoda('.lpf(600)\nqualcosa'), null);
});

import { commuta, eScorrevole, formattaNumero, numeroDi, righeScorrevoli, valoreScivolato } from '../src/renderer/coda.js';

test('numeri che scivolano: lineari fra t0 e t1, fermi prima e dopo', () => {
  const g = { da: 600, a: 900, t0: 10, t1: 11 };
  assert.equal(valoreScivolato(g, 9), 600);
  assert.equal(valoreScivolato(g, 10.5), 750);
  assert.equal(valoreScivolato(g, 12), 900);
  assert.equal(valoreScivolato({ da: 1, a: 2, t0: 5, t1: 5 }, 5), 2); // senza durata: subito
});

test('quali voci scivolano: i numeri degli effetti sì, i ritmici e i non numeri no', () => {
  assert.equal(eScorrevole('.lpf(900)'), true);
  assert.equal(eScorrevole('.delay(.4)'), true);
  assert.equal(eScorrevole('.fast(2)'), false);
  assert.equal(eScorrevole('.lpf("<400 800>")'), false);
  assert.equal(numeroDi('.room(.3)'), 0.3);
});

test('le righe mostrate col numero che scorre', () => {
  const g = { da: 600, a: 900, t0: 10, t1: 11 };
  assert.deepEqual(righeScorrevoli(['.lpf(900)', '.fast(2)'], { lpf: g }, 10.5), ['.lpf(750)', '.fast(2)']);
  assert.deepEqual(righeScorrevoli(['.lpf(900)'], { lpf: g }, 11.5), ['.lpf(900)']);
  assert.equal(formattaNumero(0.35, { da: 0.2, a: 0.5 }), '0.35');
  assert.equal(formattaNumero(749.6, g), '750');
});

test('il cambio ritmico: prima solo il vecchio, da quel ciclo solo il nuovo', () => {
  const hap = (nome) => (a, b) => [{ nome, a, b }];
  const p = commuta({ queryArc: hap('v') }, { queryArc: hap('n') }, 5);
  assert.deepEqual(p.queryArc(4, 5), [{ nome: 'v', a: 4, b: 5 }]);
  assert.deepEqual(p.queryArc(5, 6), [{ nome: 'n', a: 5, b: 6 }]);
  assert.deepEqual(p.queryArc(4.5, 5.5), [{ nome: 'v', a: 4.5, b: 5 }, { nome: 'n', a: 5, b: 5.5 }]);
});
