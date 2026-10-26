import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suoniNuovi } from '../src/renderer/suoni-nuovi.js';

const base = 'cutx://app/stash/suoni/';
test('la prima volta si registra tutto', () => {
  const m = { _base: base, bd: ['bd/a.wav'] };
  assert.deepEqual(suoniNuovi(null, m), m);
});
test('uguale a prima: niente da fare', () => {
  const m = { _base: base, bd: ['bd/a.wav'] };
  assert.equal(suoniNuovi(m, { ...m }), null);
});
test('un suono nuovo o con file nuovi: solo quello', () => {
  const prima = { _base: base, bd: ['bd/a.wav'], hh: ['hh/a.wav'] };
  const dopo = { _base: base, bd: ['bd/a.wav', 'bd/b.wav'], hh: ['hh/a.wav'], sd: ['sd/a.wav'] };
  assert.deepEqual(suoniNuovi(prima, dopo), { _base: base, bd: ['bd/a.wav', 'bd/b.wav'], sd: ['sd/a.wav'] });
});
test('un suono sparito non si toglie mentre suona', () => {
  assert.equal(suoniNuovi({ _base: base, bd: ['bd/a.wav'], hh: ['hh/a.wav'] }, { _base: base, bd: ['bd/a.wav'] }), null);
});
test('senza mappa non si fa niente', () => {
  assert.equal(suoniNuovi({ _base: base }, null), null);
});
