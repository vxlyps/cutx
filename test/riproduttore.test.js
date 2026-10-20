import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Riproduttore } from '../src/renderer/riproduttore.js';

const nuovo = () => {
  const ac = { currentTime: 0 };
  const rip = new Riproduttore(ac, () => {});
  rip.mappa = { ciclo0: 0, t0: 0, cps: 0.5 };
  return { ac, rip };
};

test('un cambio di tempo si programma in anticipo, ma "adesso" resta quello di prima fino al ciclo del cambio', () => {
  const { ac, rip } = nuovo();
  ac.currentTime = 0;
  rip.tick();
  rip.cambiaCpsA(4, 1); // al ciclo 4 (a 120 BPM: t = 8 s) si va a 240 BPM
  assert.deepEqual(rip.cambiProssimi(0), [{ ciclo: 4, cps: 1 }]);
  ac.currentTime = 7.9; // il tick lo programma ~150 ms prima
  rip.tick();
  assert.equal(rip.mappa.cps, 1, 'il riproduttore ha già la mappa nuova, per programmare oltre il confine');
  assert.ok(Math.abs(rip.cicloAl(7.9) - 3.95) < 1e-9, 'ma ora siamo ancora al vecchio tempo');
  assert.equal(rip.cpsAl(7.9), 0.5);
  assert.deepEqual(rip.cambiProssimi(7.9), [{ ciclo: 4, cps: 1 }]);
  // dopo il ciclo del cambio vale il nuovo
  assert.ok(Math.abs(rip.cicloAl(8.1) - 4.1) < 1e-9);
  assert.equal(rip.cpsAl(8.1), 1);
  assert.deepEqual(rip.cambiProssimi(8.1), []);
});

test('il ciclo non salta mai attraversando un cambio', () => {
  const { ac, rip } = nuovo();
  rip.cambiaCpsA(4, 0.25);
  let prima = -Infinity;
  for (let t = 0; t < 30; t += 0.05) {
    ac.currentTime = t;
    rip.tick();
    const c = rip.cicloAl(t);
    assert.ok(c >= prima - 1e-9, `a ${t} s: ${c} dopo ${prima}`);
    prima = c;
  }
  assert.equal(rip.cpsAl(29), 0.25);
});

test('un cambio immediato (setcpm nel codice) parte da dove è arrivata la programmazione', () => {
  const { ac, rip } = nuovo();
  ac.currentTime = 5;
  rip.tick();
  const dopo = rip.fine;
  rip.cambiaCps(1);
  assert.equal(rip.mappa.ciclo0, dopo);
  // "adesso" (5 s) resta al vecchio tempo, i cicli seguenti vanno al nuovo
  assert.ok(Math.abs(rip.cicloAl(5) - 2.5) < 1e-9);
  assert.equal(rip.cpsAl(5), 0.5);
});

test('un cambio a mano annulla quelli che sarebbero entrati dopo (un livello con setcpm ancora in arrivo)', () => {
  const { rip } = nuovo();
  rip.cambiaCpsA(10, 0.4); // un livello che entra al ciclo 10 con il suo tempo
  rip.cambiaCpsA(3, 0.9); // a mano, al ciclo 3
  rip.annullaCambiDopo(3);
  rip.cambiaCpsA(3, 0.9);
  assert.deepEqual(rip.cambiTempo, [{ ciclo: 3, cps: 0.9 }]);
  // un cambio già in programma prima non si tocca
  rip.cambiaCpsA(2, 0.7);
  rip.annullaCambiDopo(3);
  assert.deepEqual(rip.cambiTempo.map((c) => c.ciclo), [2, 3]);
});
