import test from 'node:test';
import assert from 'node:assert/strict';
import { aggiorna, creaCorpo, geom, scegliBersaglio, suSedicesimo, SEGS } from '../src/cimice/corpo.js';

// Un mondo finto: righe di parole da 40x16, un seme fisso per il caso.
function mondo(scala = 1) {
  let seme = 12345;
  const caso = () => ((seme = (seme * 1664525 + 1013904223) >>> 0) / 4294967296);
  const parole = [];
  for (let r = 0; r < 14; r++) for (let c = 0; c < 20; c++) {
    const x = 30 + c * 48, y = 30 + r * 30;
    parole.push({ x, y, w: 40, h: 16, cx: x + 20, cy: y + 8, vis: true, salta: false, hl: caso() < 0.1 ? 1 : 0, held: 0 });
  }
  const m = {
    parole, W: 1000, H: 450, g: geom(scala), ridotto: false, caso,
    opz: { velocita: 1, lampi: true, corrompe: true },
    rnd: (a, b) => a + caso() * (b - a), pick: (a) => a[Math.floor(caso() * a.length)],
    col: { ACID: 'a', ROT: 'r', INK: 'i', RUST: 'x', BG: 'b' },
    folle: () => false, filo() {}, barra() {}, trema() {}, lampeggia() {}, corrompi() {},
  };
  return m;
}

test('la cimice cammina 20 secondi senza numeri sballati e con le zampe della stessa lunghezza', () => {
  const m = mondo();
  const b = creaCorpo(m, 500, 200, 0, true, 0);
  scegliBersaglio(m, b);
  let now = 0;
  for (let i = 0; i < 1200; i++) {
    now += 16.7;
    aggiorna(m, b, 0.0167, now);
    if (i % 8 === 0) suSedicesimo(m, b, i / 8, now);
    for (const s of b.segs) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
    for (const leg of b.legs) assert.ok(Number.isFinite(leg.foot.x) && Number.isFinite(leg.foot.y));
  }
  assert.equal(b.segs.length, SEGS);
  assert.equal(b.legs.length, 7);
  for (const t of m.parole) assert.ok(t.held >= 0, 'una parola non può essere tenuta da meno di zero zampe');
});

test('le zampe non si allungano oltre la portata', () => {
  const m = mondo(1.3);
  const b = creaCorpo(m, 500, 200, 0, true, 0);
  scegliBersaglio(m, b);
  let max = 0, now = 0;
  for (let i = 0; i < 1200; i++) {
    now += 16.7;
    aggiorna(m, b, 0.0167, now);
    if (i % 8 === 0) suSedicesimo(m, b, i / 8, now);
    for (const leg of b.legs) {
      const s = b.segs[leg.seg];
      max = Math.max(max, Math.hypot(leg.foot.x - s.x, leg.foot.y - s.y));
    }
  }
  assert.ok(max < m.g.reach * 1.5, `zampa troppo lunga: ${max.toFixed(1)} su portata ${m.g.reach}`);
});

test('le antenne puntano solo parole che suonano', () => {
  const m = mondo();
  const b = creaCorpo(m, 500, 200, 0, true, 0);
  scegliBersaglio(m, b);
  let now = 0;
  for (let i = 0; i < 600; i++) {
    now += 16.7;
    aggiorna(m, b, 0.0167, now);
    for (const an of b.ants) if (an.tok) assert.ok(an.tok.hl >= 0.35, 'antenna su una parola che non suona');
  }
});
