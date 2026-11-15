import { test } from 'node:test';
import assert from 'node:assert/strict';
import { geometria } from '../src/renderer/mani-uscita.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('la mano sul proiettore non si stira: una distanza vera resta la stessa in qualunque riquadro', () => {
  // due punti a 0.1 della larghezza e 0.1 dell'altezza di una camera 4:3: in lunghezza vera la x pesa 4/3
  const a = [0.4, 0.4];
  const b = [0.5, 0.5];
  const vera = dist([a[0] * (4 / 3), a[1]], [b[0] * (4 / 3), b[1]]);
  for (const [w, h] of [[390, 246], [200, 176], [120, 400]]) {
    const g = geometria(4 / 3, null, w, h);
    assert.ok(Math.abs(dist(g.punto(a), g.punto(b)) / g.scala - vera) < 1e-9);
    // e un quadrato in lunghezza vera resta un quadrato sullo schermo
    const orizz = dist(g.punto([0.3, 0.3]), g.punto([0.3 + 0.1 * (3 / 4), 0.3]));
    const vert = dist(g.punto([0.3, 0.3]), g.punto([0.3, 0.4]));
    assert.ok(Math.abs(orizz - vert) < 1e-9);
  }
});

test('l\'area mostrata sta tutta nel disegno e centrata (nessun riquadro da riempire)', () => {
  const g = geometria(4 / 3, null, 390, 246);
  const [x0, y0] = g.punto([0, 0]);
  const [x1, y1] = g.punto([1, 1]);
  assert.ok(x0 >= -1e-9 && y0 >= -1e-9 && x1 <= 390 + 1e-9 && y1 <= 246 + 1e-9);
  assert.ok(Math.abs(x0 - (390 - x1)) < 1e-9 && Math.abs(y0 - (246 - y1)) < 1e-9);
});

test('con una zona, la zona riempie lo spazio (la mano si vede più grande)', () => {
  const intera = geometria(4 / 3, null, 390, 246);
  const zona = geometria(4 / 3, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 390, 246);
  assert.ok(zona.scala > intera.scala * 1.9);
  const [x, y] = zona.punto([0.5, 0.5]);
  assert.ok(Math.abs(x - 195) < 1e-9 && Math.abs(y - 123) < 1e-9, 'il centro della zona è il centro dello spazio');
});
