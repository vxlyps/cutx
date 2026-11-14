import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beatPresente, codiceVuoto, inArrivo, inUscita, mancaIlBeat, statoBeat, suona, ultimoEntrato } from '../src/renderer/stato-live.js';

// Un livello come arriva dal live: da null = da sempre, a null = resta.
const L = (id, nome, da = null, a = null, extra = {}) => ({ id, nome, da, a, ...extra });
const scene = { base: 'brano', indice: 0, scene: [{ nome: 'intro' }, { nome: 'drop' }] };
const beat = (id, da = null, a = null, indice = 0) => L(id, 'beat', da, a, { beat: { ...scene, indice } });

test('un livello: suona, sta arrivando, sta uscendo', () => {
  assert.equal(suona(L(1, 'basso'), 10), true);
  assert.equal(suona(L(1, 'basso', 12), 10), false, 'entra al ciclo 12: al 10 non suona ancora');
  assert.equal(inArrivo(L(1, 'basso', 12), 10), true);
  assert.equal(inArrivo(L(1, 'basso', 12), 12), false, 'al suo ciclo è entrato');
  assert.equal(suona(L(1, 'basso', 4, 11), 10), true, 'esce all\'11: al 10 suona ancora');
  assert.equal(inUscita(L(1, 'basso', 4, 11), 10), true);
  assert.equal(inUscita(L(1, 'basso', 4, 11), 11), false, 'uscito');
  assert.equal(inUscita(L(1, 'basso', 12, 12), 10), false, 'tolto prima di entrare: non ha mai suonato, non sta uscendo');
});

test('il beat live: quello che suona e quello che aspetta il suo ciclo', () => {
  assert.deepEqual(statoBeat([], 3), { suona: null, pendente: null });
  const a = beat(1);
  const b = beat(2, 8, null, 1);
  a.a = 8; // esce quando entra la scena nuova
  const s = statoBeat([L(9, 'basso'), a, b], 5);
  assert.equal(s.suona.id, 1);
  assert.equal(s.pendente.id, 2);
  const dopo = statoBeat([L(9, 'basso'), a, b], 8);
  assert.equal(dopo.suona.id, 2, 'al ciclo 8 suona la nuova');
  assert.equal(dopo.pendente, null);
});

test('un livello chiamato «beat» ma senza scene non è il beat con le scene (◀ ▶ non lo usano), però è una base che suona', () => {
  const senzaScene = L(1, 'beat');
  assert.equal(statoBeat([senzaScene], 2).suona, null);
  assert.equal(beatPresente([senzaScene], 2), true);
  assert.equal(beatPresente([L(1, 'spina')], 2), true, 'il nome dei file vecchi vale ancora');
});

test('GO LIVE su una clip mentre il beat non suona: va detto', () => {
  const clip = { nome: 'basso' };
  assert.equal(mancaIlBeat({ pezzo: clip, sceneDelBrano: 2, livelli: [], ciclo: 0 }), true, 'live vuoto, il brano ha un beat');
  assert.equal(mancaIlBeat({ pezzo: clip, sceneDelBrano: 2, livelli: [L(3, 'pad')], ciclo: 0 }), true, 'suonano altre clip ma non il beat');
  assert.equal(mancaIlBeat({ pezzo: clip, sceneDelBrano: 2, livelli: [beat(1)], ciclo: 0 }), false, 'il beat suona');
  assert.equal(mancaIlBeat({ pezzo: clip, sceneDelBrano: 2, livelli: [beat(1, 4)], ciclo: 0 }), false, 'il beat sta arrivando');
  assert.equal(mancaIlBeat({ pezzo: clip, sceneDelBrano: 2, livelli: [beat(1, null, 3)], ciclo: 0 }), true, 'il beat sta uscendo: tra poco non c\'è più');
  assert.equal(mancaIlBeat({ pezzo: clip, sceneDelBrano: 0, livelli: [], ciclo: 0 }), false, 'il brano non ha un beat: niente da dire');
  assert.equal(mancaIlBeat({ pezzo: { nome: 'beat', beat: scene }, sceneDelBrano: 2, livelli: [], ciclo: 0 }), false, 'sto mandando proprio il beat');
  assert.equal(mancaIlBeat({ pezzo: { nome: 'apertura' }, sceneDelBrano: 2, livelli: [], ciclo: 0 }), false, 'l\'apertura viene prima del beat');
});

test('un pezzo vuoto (solo spazi e commenti) si riconosce', () => {
  assert.equal(codiceVuoto(''), true);
  assert.equal(codiceVuoto('\n  \n'), true);
  assert.equal(codiceVuoto('// @scena drop\n  // da scrivere\n'), true);
  assert.equal(codiceVuoto(undefined), true);
  assert.equal(codiceVuoto('// cassa\ns("bd*4")'), false);
  assert.equal(codiceVuoto('.lpf(600)'), false);
});

test('il togli senza bersaglio prende l\'ultimo entrato fra quelli che restano', () => {
  assert.equal(ultimoEntrato([]), null);
  assert.equal(ultimoEntrato([L(1, 'beat'), L(2, 'basso'), L(3, 'pad', 0, 9)]).id, 2, 'il pad sta già uscendo: non conta');
});
