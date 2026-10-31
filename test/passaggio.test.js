import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/renderer/passaggio.js';

test('il tempo tra due brani: niente se non suona nulla o è uguale, rampa entro l\'8%, salto oltre', () => {
  assert.equal(P.decidiTempo(170, 140, false).tipo, 'niente', 'non suona niente: il brano porta il suo tempo');
  assert.equal(P.decidiTempo(170, 170.02, true).tipo, 'niente');
  const su = P.decidiTempo(170, 174, true);
  assert.equal(su.tipo, 'rampa');
  assert.ok(Math.abs(su.rapporto - 0.0235) < 0.001, 'brano 1 → 2: +2%');
  assert.equal(P.decidiTempo(174, 140, true).tipo, 'salto', 'brano 2 → 3: −20%');
  assert.ok(Math.abs(P.decidiTempo(174, 140, true).rapporto + 0.195) < 0.001);
  assert.equal(P.decidiTempo(100, 108, true).tipo, 'rampa', 'proprio l\'8%');
  assert.equal(P.decidiTempo(100, 108.5, true).tipo, 'salto');
  assert.equal(P.decidiTempo(0, 120, true).tipo, 'niente');
});

test('i gradini della rampa arrivano esattamente al tempo nuovo, uno a ciclo', () => {
  const g = P.gradiniRampa(2, 2.2, 10, 4);
  assert.deepEqual(g.map((x) => x.ciclo), [10, 11, 12, 13]);
  assert.ok(Math.abs(g[0].cps - 2.05) < 1e-9 && Math.abs(g[3].cps - 2.2) < 1e-9);
  assert.equal(P.gradiniRampa(1, 2, 0).length, P.CICLI_RAMPA);
});

test('le clip ritmiche: almeno quattro colpi in un ciclo o una batteria', () => {
  assert.equal(P.eRitmica([[0, 1, 60, 1]]), false, 'un pad: una nota lunga');
  assert.equal(P.eRitmica([[0, .1, 60, 1], [.25, .1, 60, 1], [.5, .1, 60, 1], [.75, .1, 60, 1]]), true);
  assert.equal(P.eRitmica([[0, .03, -1, 1]]), true, 'una cassa');
  assert.equal(P.eRitmica(undefined), false);
  const eventi = { 1: [[0, 1, 60, 1]], 2: [[0, .1, -3, 1]] };
  assert.deepEqual(P.clipRitmiche([{ id: 1, nome: 'pad' }, { id: 2, nome: 'hat' }], (id) => eventi[id]), ['hat']);
});

test('la riga sotto le linguette dice cosa farà il tempo', () => {
  assert.equal(P.testoPassaggio({ nome: 'x', bpmAttuale: 120, bpmNuovo: 120, occupato: true }), '');
  assert.match(P.testoPassaggio({ nome: 'brano 2', bpmAttuale: 170, bpmNuovo: 174, occupato: true }), /sale con una rampa \(170 → 174 bpm, \+2\.4%\)/);
  assert.match(P.testoPassaggio({ nome: 'brano 3', bpmAttuale: 174, bpmNuovo: 140, occupato: true, ritmiche: ['sub', 'melodia'] }), /il tempo salta \(174 → 140 bpm, −19\.5%\) · le clip ritmiche rimaste cambierebbero velocità: sub, melodia/);
  assert.equal(P.testoPassaggio({ nome: 'x', bpmAttuale: 170, bpmNuovo: 140, occupato: false }), '');
});
