import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MS_PER_UNITA, RUSH_MS, Scrittore, diffTesto, durataNaturaleMs, inizioScrittura, pesi, piano, unitaA, vedi } from '../src/renderer/scrittura.js';

const A = 's("bd*4").gain(.5)\n  .room(.3)';

test('i pesi sono sempre gli stessi per lo stesso testo e vanno più lenti dopo . , ( e a fine riga', () => {
  assert.deepEqual([...pesi(A)], [...pesi(A)]);
  const w = pesi('ab.cd\nef  gh');
  assert.ok(w[2] > w[0] + 1, 'pausa dopo il punto');
  assert.ok(w[5] > w[0] + 4, 'pausa a fine riga');
  assert.ok(pesi('x\n  y')[2] < 0.2, 'indentazione quasi gratis');
  assert.ok([...pesi(A)].every((p) => p > 0));
});

test('il tratto che cambia', () => {
  assert.deepEqual(diffTesto('s("bd*4").gain(.5)', 's("bd*8").gain(.5)'), { pre: 6, tolti: '4', aggiunti: '8', suf: 11 });
  assert.deepEqual(diffTesto('abc', 'abcdef'), { pre: 3, tolti: '', aggiunti: 'def', suf: 0 });
  assert.deepEqual(diffTesto('abcdef', 'abc'), { pre: 3, tolti: 'def', aggiunti: '', suf: 0 });
  assert.deepEqual(diffTesto('', 'xy'), { pre: 0, tolti: '', aggiunti: 'xy', suf: 0 });
  assert.deepEqual(diffTesto('uguale', 'uguale'), { pre: 6, tolti: '', aggiunti: '', suf: 0 });
});

test('un livello nuovo si scrive da zero, un carattere alla volta, fino in fondo', () => {
  const p = piano('', A);
  let prima = vedi(p, 0);
  assert.equal(prima.prima, '');
  assert.equal(prima.cursore, true);
  let lunghezza = 0;
  for (let x = 0; x < p.totale; x += p.totale / 200) {
    const v = vedi(p, x);
    assert.ok(v.prima.length >= lunghezza, 'non torna mai indietro');
    assert.equal(v.prima + v.nascosto, A, 'il resto è sempre al suo posto, invisibile');
    lunghezza = v.prima.length;
  }
  const fine = vedi(p, p.totale);
  assert.deepEqual(fine, { prima: A, nascosto: '', dopo: '', cursore: false, fatto: true });
});

test('una modifica non riscrive tutto: cursore al punto, cancella il vecchio, scrive il nuovo', () => {
  const base = 's("bd*4").gain(.5)';
  const nuovo = 's("bd*16").gain(.5)';
  const p = piano(base, nuovo);
  assert.equal(p.pre, 6);
  assert.equal(p.tolti, '4');
  assert.equal(p.aggiunti, '16');
  const subito = vedi(p, 0);
  assert.equal(subito.prima + subito.dopo, base, 'all\'inizio si vede il codice di prima, col cursore al punto');
  assert.equal(subito.prima, 's("bd*');
  const dopoSalto = vedi(p, p.salto + p.cancella * 0.5);
  assert.equal(dopoSalto.prima, 's("bd*');
  assert.equal(dopoSalto.dopo, '").gain(.5)');
  const finito = vedi(p, p.salto + p.cancella + p.battitura * 0.5);
  assert.equal(finito.prima + finito.nascosto + finito.dopo, nuovo);
  assert.ok(finito.dopo.endsWith('").gain(.5)'));
  assert.equal(vedi(p, p.totale).prima, nuovo);
});

test('l\'ultimo carattere arriva esattamente alla fine; se c\'è tempo si parte più tardi, se ce n\'è poco si accelera', () => {
  const p = piano('', A);
  const naturale = durataNaturaleMs(p);
  // tanto tempo: parte più tardi, e prima di partire non c'è niente
  const fine = 100000;
  assert.equal(inizioScrittura(p, 0, fine), fine - naturale);
  assert.equal(unitaA(p, 0, fine, fine - naturale - 1), 0);
  assert.ok(Math.abs(unitaA(p, 0, fine, fine) - p.totale) < 1e-9);
  assert.equal(vedi(p, unitaA(p, 0, fine, fine - 1000)).fatto, false);
  // poco tempo: parte subito e arriva comunque
  const breve = naturale / 4;
  assert.equal(inizioScrittura(p, 0, breve), 0);
  assert.ok(Math.abs(unitaA(p, 0, breve, breve / 2) - p.totale / 2) < 1e-6);
  assert.equal(unitaA(p, 0, breve, breve * 2), p.totale);
});

test('se ne arriva un\'altra mentre sta scrivendo, la prima si finisce di corsa e poi parte la nuova', () => {
  const s = new Scrittore();
  const uno = 's("bd*4").gain(.5)\n  .room(.3)\n  .delay(.2)';
  const due = 's("bd*4").gain(.5)\n  .room(.9)\n  .delay(.2)';
  const fine1 = 100000;
  // il primo livello (id 1) è a metà
  const metaEpoca = fine1 - 800;
  const meta = s.stato(1, '', uno, 0, fine1, metaEpoca);
  assert.equal(meta.fatto, false);
  // adesso ne arriva un altro (id 2) sullo stesso nome, a 4 secondi dalla sua entrata
  const adesso = metaEpoca + 100;
  const r0 = s.stato(2, uno, due, adesso, adesso + 6000, adesso, 1);
  assert.equal(r0.rush, true, 'prima si finisce di corsa quella di prima');
  const r1 = s.stato(2, uno, due, adesso, adesso + 6000, adesso + RUSH_MS / 2, 1);
  assert.equal(r1.rush, true);
  assert.ok((r1.prima + r1.nascosto).length >= 0);
  const r2 = s.stato(2, uno, due, adesso, adesso + 6000, adesso + RUSH_MS + 200, 1);
  assert.equal(r2.rush, false, 'poi parte la nuova');
  const rFine = s.stato(2, uno, due, adesso, adesso + 6000, adesso + 6000, 1);
  assert.equal(rFine.prima, due);
  assert.equal(rFine.fatto, true);
});

test('il testo uguale non si anima', () => {
  const p = piano('uguale', 'uguale');
  assert.equal(p.totale, 0);
  assert.equal(vedi(p, 0).fatto, true);
  assert.ok(MS_PER_UNITA > 0);
});
