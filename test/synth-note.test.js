import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCORDI, SCALE, SCATTI, accordoEventi, agganciaScala, conCicli, conEvento, eventiDaMini, inScala, miniDaEventi, nomeNota, notaDaNome, senzaEvento,
} from '../src/renderer/synth-note.js';

const seme = (n) => () => ((n = (n * 1664525 + 1013904223) % 4294967296) / 4294967296);
const ordina = (e) => [...e].sort((a, b) => a.i - b.i || a.n - b.n || a.l - b.l);

test('nomi delle note: c3 è 48, con bemolli e diesis', () => {
  assert.equal(notaDaNome('c3'), 48);
  assert.equal(notaDaNome('eb3'), 51);
  assert.equal(notaDaNome('f#2'), 42);
  assert.equal(notaDaNome('a'), 57);
  assert.equal(notaDaNome('48'), 48);
  assert.equal(notaDaNome('bd'), null);
  assert.equal(nomeNota(48), 'c3');
  assert.equal(nomeNota(51), 'eb3');
  assert.equal(nomeNota(36), 'c2');
  for (let n = 12; n < 100; n++) assert.equal(notaDaNome(nomeNota(n)), n);
});

test('la mini-notazione si legge: riposi, tenute, pesi, accordi, ripetizioni', () => {
  const r = eventiDaMini('c3 eb3 g3 bb3');
  assert.equal(r.cicli, 1);
  assert.deepEqual(r.eventi, [{ i: 0, l: 4, n: 48 }, { i: 4, l: 4, n: 51 }, { i: 8, l: 4, n: 55 }, { i: 12, l: 4, n: 58 }]);
  assert.deepEqual(eventiDaMini('c3@4 ~@4 e3@8').eventi, [{ i: 0, l: 4, n: 48 }, { i: 8, l: 8, n: 52 }]);
  assert.deepEqual(eventiDaMini('c3 _ _ ~').eventi, [{ i: 0, l: 12, n: 48 }]);
  assert.deepEqual(eventiDaMini('[c3,e3,g3]').eventi.map((e) => [e.i, e.l, e.n]), [[0, 16, 48], [0, 16, 52], [0, 16, 55]]);
  assert.deepEqual(eventiDaMini('c3!2 e3!2').eventi.map((e) => [e.i, e.l, e.n]), [[0, 4, 48], [4, 4, 48], [8, 4, 52], [12, 4, 52]]);
  assert.deepEqual(eventiDaMini('c3*2 e3').eventi.map((e) => [e.i, e.l, e.n]), [[0, 4, 48], [4, 4, 48], [8, 8, 52]]);
  assert.deepEqual(eventiDaMini('c3 [e3 g3]').eventi.map((e) => [e.i, e.l, e.n]), [[0, 8, 48], [8, 4, 52], [12, 4, 55]]);
  assert.deepEqual(eventiDaMini('c3, e3@8 ~@8').eventi.map((e) => [e.i, e.l, e.n]), [[0, 16, 48], [0, 8, 52]]);
  assert.equal(eventiDaMini('~').eventi.length, 0);
});

test('le alternanze <a b> sono cicli', () => {
  const r = eventiDaMini('<c3 e3>');
  assert.equal(r.cicli, 2);
  assert.deepEqual(r.eventi, [{ i: 0, l: 16, n: 48 }, { i: 16, l: 16, n: 52 }]);
  const r2 = eventiDaMini('<[c3 e3] [g3 b3]> d3');
  assert.equal(r2.cicli, 2);
  assert.deepEqual(r2.eventi.filter((e) => e.i >= 16).map((e) => e.n), [55, 59, 50]);
  assert.equal(eventiDaMini('<c3 e3 g3>').errore.includes('3 cicli'), true);
  assert.equal(eventiDaMini('<c3 e3 g3 b3>').cicli, 4);
});

test('quello che non si legge dà un errore, e le terzine si vedono ma fuori griglia', () => {
  for (const x of ['c3?', 'c3/2', 'c3(3,8)', 'bd sd', '[c3', 'c3]', '<c3', 'c3 | e3', 'c3:2']) assert.ok(eventiDaMini(x).errore, x);
  const t = eventiDaMini('[c3 e3 g3]');
  assert.equal(t.fuoriGriglia, true);
  assert.equal(t.eventi.length, 3);
  assert.equal(eventiDaMini('c3 e3 g3').fuoriGriglia, true); // tre note in un ciclo: terzine di sedicesimi non intere
  assert.equal(eventiDaMini('c3 e3 g3 b3').fuoriGriglia, false);
});

test('eventi → mini-notazione: leggibile e fedele', () => {
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }, { i: 4, l: 4, n: 51 }, { i: 8, l: 4, n: 55 }, { i: 12, l: 4, n: 58 }]), 'c3@4 eb3@4 g3@4 bb3@4');
  assert.equal(miniDaEventi([]), '~');
  assert.equal(miniDaEventi([{ i: 0, l: 16, n: 48 }]), 'c3');
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }, { i: 8, l: 8, n: 52 }]), 'c3@4 ~@4 e3@8');
  assert.equal(miniDaEventi([{ i: 0, l: 8, n: 48 }, { i: 0, l: 8, n: 52 }, { i: 0, l: 8, n: 55 }]), '[c3,e3,g3]@8 ~@8');
  assert.equal(miniDaEventi([{ i: 0, l: 16, n: 48 }, { i: 0, l: 8, n: 52 }]), 'c3, e3@8 ~@8');
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }, { i: 16, l: 4, n: 52 }], 2), '<[c3@4 ~@12] [e3@4 ~@12]>');
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }], 4), '<[c3@4 ~@12] ~ ~ ~>');
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }, { i: 16, l: 4, n: 48 }], 2), 'c3@4 ~@12'); // cicli uguali: basta uno
});

test('andata e ritorno: eventi a caso (griglia 1/16, 1–8 cicli, accordi, sovrapposizioni)', () => {
  for (let n = 1; n <= 300; n++) {
    const rng = seme(n);
    const cicli = [1, 2, 4, 8][Math.floor(rng() * 4)];
    const eventi = [];
    for (let k = 0; k < 1 + Math.floor(rng() * 14); k++) {
      const i = Math.floor(rng() * cicli * SCATTI);
      const ciclo = Math.floor(i / SCATTI);
      const l = 1 + Math.floor(rng() * Math.min(8, (ciclo + 1) * SCATTI - i));
      const nota = 36 + Math.floor(rng() * 36);
      if (!eventi.some((e) => e.i === i && e.n === nota)) eventi.push({ i, l, n: nota });
    }
    const mini = miniDaEventi(eventi, cicli);
    const r = eventiDaMini(mini);
    assert.equal(r.errore, undefined, `seme ${n}: ${mini} → ${r.errore}`);
    assert.equal(r.fuoriGriglia, false, mini);
    assert.deepEqual(ordina(r.eventi), ordina(eventi), `seme ${n}: ${mini}`);
    assert.ok(r.cicli <= cicli);
  }
});

test('scale: aggancio alla nota più vicina', () => {
  assert.equal(agganciaScala(49, 0, 'maggiore'), 48); // do# → do (a parità la più bassa)
  assert.equal(agganciaScala(51, 0, 'maggiore'), 50); // re# → re
  assert.equal(agganciaScala(51, 0, 'minore'), 51);
  assert.equal(agganciaScala(50, 2, 'pentatonica minore'), 50); // re è la radice
  assert.equal(agganciaScala(49, 0, 'cromatica'), 49);
  assert.equal(inScala(52, 0, 'maggiore'), true);
  assert.equal(inScala(51, 0, 'maggiore'), false);
  for (const nome of Object.keys(SCALE)) for (let n = 36; n < 80; n++) assert.ok(inScala(agganciaScala(n, 5, nome), 5, nome), `${nome} ${n}`);
});

test('accordi, cicli, eventi', () => {
  assert.deepEqual(accordoEventi(48, 'magg', 0, 4).map((e) => e.n), [48, 52, 55]);
  assert.deepEqual(accordoEventi(48, 'nota', 0, 4).map((e) => e.n), [48]);
  assert.ok(Object.keys(ACCORDI).length >= 9);
  const base = [{ i: 0, l: 4, n: 48 }, { i: 20, l: 4, n: 52 }];
  assert.deepEqual(conCicli(base, 2, 4).map((e) => [e.i, e.n]), [[0, 48], [20, 52], [32, 48], [52, 52]]);
  assert.deepEqual(conCicli([{ i: 0, l: 4, n: 48 }], 1, 2).map((e) => e.i), [0, 16]);
  assert.deepEqual(conCicli(base, 2, 1), [{ i: 0, l: 4, n: 48 }]);
  assert.deepEqual(conEvento([{ i: 0, l: 4, n: 48 }], { i: 0, l: 8, n: 48 }), [{ i: 0, l: 8, n: 48 }]);
  assert.deepEqual(senzaEvento([{ i: 0, l: 4, n: 48 }, { i: 4, l: 4, n: 48 }], { i: 0, l: 4, n: 48 }), [{ i: 4, l: 4, n: 48 }]);
});
