import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCORDI, GRIGLIE, indietroPasso, scriviPasso, NOTA_MAX, NOTA_MIN, SCALE, SCATTI, accordoEventi, allunga, scalaDelCiclo, gradoInNota, leggiScala, notaInGrado, appunti, duplica, incolla, muovi, nelRettangolo, senzaScelte, trasponi, uniscisel, agganciaScala, conCicli, conEvento, eventiDaMini, inScala, miniDaEventi, nomeNota, notaDaNome, senzaEvento,
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

test('quello che non si legge dà un errore; le terzine hanno la loro griglia (12), le quintine restano fuori griglia', () => {
  for (const x of ['c3?', 'c3/2', 'c3(3,8)', 'bd sd', '[c3', 'c3]', '<c3', 'c3 | e3', 'c3:2']) assert.ok(eventiDaMini(x).errore, x);
  const t = eventiDaMini('[c3 e3 g3]');
  assert.equal(t.fuoriGriglia, false);
  assert.equal(t.griglia, 12);
  assert.deepEqual(t.eventi, [{ i: 0, l: 4, n: 48 }, { i: 4, l: 4, n: 52 }, { i: 8, l: 4, n: 55 }]);
  assert.equal(eventiDaMini('c3 e3 g3').griglia, 12);
  assert.equal(eventiDaMini('c3 e3 g3 b3').griglia, 16);
  const q = eventiDaMini('c3 e3 g3 b3 d4');
  assert.equal(q.fuoriGriglia, true);
  assert.equal(q.eventi.length, 5);
  assert.equal(q.griglia, 16);
});
test('eventi → mini-notazione: leggibile e fedele', () => {
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }, { i: 4, l: 4, n: 51 }, { i: 8, l: 4, n: 55 }, { i: 12, l: 4, n: 58 }]), 'c3 eb3 g3 bb3');
  assert.equal(miniDaEventi([]), '~');
  assert.equal(miniDaEventi([{ i: 0, l: 16, n: 48 }]), 'c3');
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }, { i: 8, l: 8, n: 52 }]), 'c3 ~ e3@2');
  assert.equal(miniDaEventi([{ i: 0, l: 8, n: 48 }, { i: 0, l: 8, n: 52 }, { i: 0, l: 8, n: 55 }]), '[c3,e3,g3] ~');
  assert.equal(miniDaEventi([{ i: 0, l: 16, n: 48 }, { i: 0, l: 8, n: 52 }]), 'c3, e3 ~');
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }, { i: 16, l: 4, n: 52 }], 2), '<[c3 ~@3] [e3 ~@3]>');
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }], 4), '<[c3 ~@3] ~ ~ ~>');
  assert.equal(miniDaEventi([{ i: 0, l: 4, n: 48 }, { i: 16, l: 4, n: 48 }], 2), 'c3 ~@3'); // cicli uguali: basta uno
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

import { notaDaTasto, ottavaDopo, OTTAVA_INIZIALE } from '../src/renderer/synth-tastiera.js';
import { Registratore } from '../src/renderer/synth-rec.js';

test('tastiera del Mac: A è il do 3, i neri sono W E T Y U, Z e X cambiano ottava', () => {
  assert.equal(OTTAVA_INIZIALE, 3);
  assert.deepEqual(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK'].map((c) => notaDaTasto(c)), [48, 50, 52, 53, 55, 57, 59, 60]);
  assert.deepEqual(['KeyW', 'KeyE', 'KeyT', 'KeyY', 'KeyU'].map((c) => notaDaTasto(c)), [49, 51, 54, 56, 58]);
  assert.equal(notaDaTasto('KeyA', 4), 60);
  assert.equal(notaDaTasto('KeyQ'), null);
  assert.equal(notaDaTasto('Digit1'), null);
  assert.equal(ottavaDopo('KeyZ', 3), 2);
  assert.equal(ottavaDopo('KeyX', 3), 4);
  assert.equal(ottavaDopo('KeyX', 7), 7);
  assert.equal(ottavaDopo('KeyZ', -1), -1);
  assert.equal(ottavaDopo('KeyA', 3), null);
});

test('REC: conteggio di una battuta, poi registra e quantizza al 1/16', () => {
  let t = 3.5;
  const r = new Registratore({ ciclo: () => t, cicli: 1 });
  assert.equal(r.inizio, 5); // il ciclo 4 è il conteggio, si registra il 5
  assert.equal(r.fase(3.5), 'attesa');
  assert.equal(r.conto(3.5), 4);
  assert.equal(r.fase(4.0), 'conta');
  assert.deepEqual([4.0, 4.3, 4.55, 4.8].map((c) => r.conto(c)), [4, 3, 2, 1]);
  assert.equal(r.fase(5.0), 'registra');
  assert.equal(r.fase(6.0), 'fine');
  r.noteOn(48, 100, 4.9); // durante il conteggio non si registra
  assert.equal(r.aperte.size, 0);
  r.noteOn(48, 100, 5.01); // quasi sull'1
  r.noteOff(48, 5.24);
  r.noteOn(52, 90, 5.47); // verso la metà
  r.noteOff(52, 5.6);
  r.noteOn(55, 90, 5.93); // appena prima della fine: ancora tenuta
  r.chiudi();
  assert.deepEqual(r.risultato(), [{ i: 0, l: 4, n: 48 }, { i: 8, l: 2, n: 52 }, { i: 15, l: 1, n: 55 }]);
});

test('REC: più cicli, una nota che parte sul confine torna all\'inizio, una nota non esce dal suo ciclo', () => {
  const r = new Registratore({ ciclo: () => 0.2, cicli: 2 });
  assert.equal(r.inizio, 2);
  r.noteOn(48, 100, 2.0);
  r.noteOff(48, 2.9);
  r.noteOn(52, 100, 3.5); // secondo ciclo, a metà
  r.noteOff(52, 3.99);
  r.noteOn(60, 100, 3.93); // scatto 30,9 → 31: sull'ultimo scatto
  r.noteOff(60, 4.2); // oltre la fine: si chiude a 4
  assert.deepEqual(r.risultato(), [{ i: 0, l: 14, n: 48 }, { i: 24, l: 8, n: 52 }, { i: 31, l: 1, n: 60 }]);
  const r2 = new Registratore({ ciclo: () => 0, cicli: 1 });
  r2.noteOn(60, 100, 2.999); // scatto 15,98 → 16 = la fine: torna sull'1
  r2.noteOff(60, 3.0);
  assert.deepEqual(r2.risultato(), [{ i: 0, l: 1, n: 60 }]);
});

const base = [{ i: 0, l: 4, n: 48 }, { i: 4, l: 2, n: 52 }, { i: 8, l: 4, n: 55 }, { i: 12, l: 4, n: 60 }];
const rif = (...e) => e.map((x) => ({ i: x.i, n: x.n }));

test('selezione: il rettangolo prende le note che lo toccano, anche solo con la coda', () => {
  assert.deepEqual(nelRettangolo(base, { i0: 2, i1: 5, n0: 47, n1: 53 }), rif(base[0], base[1]));
  assert.deepEqual(nelRettangolo(base, { i0: 5, i1: 2, n0: 53, n1: 47 }), rif(base[0], base[1]), 'a rovescio è lo stesso');
  assert.deepEqual(nelRettangolo(base, { i0: 6, i1: 7, n0: 40, n1: 70 }), []);
  assert.deepEqual(uniscisel(rif(base[0]), rif(base[0], base[1])), rif(base[0], base[1]));
});

test('trasponi: di semitoni o ottave, o tutte o niente ai bordi', () => {
  const sel = rif(base[0], base[2]);
  const su = trasponi(base, sel, 1, 1);
  assert.deepEqual(su.eventi.map((e) => e.n), [49, 52, 56, 60]);
  assert.deepEqual(su.sel, rif({ i: 0, n: 49 }, { i: 8, n: 56 }));
  assert.deepEqual(trasponi(base, sel, -12, 1).eventi.map((e) => e.n), [36, 52, 43, 60]);
  const alto = [{ i: 0, l: 4, n: NOTA_MAX }, { i: 4, l: 4, n: 60 }];
  const fermo = trasponi(alto, rif(alto[0], alto[1]), 1, 1);
  assert.deepEqual(fermo.eventi, alto, 'una sola uscirebbe: non si muove niente');
  assert.equal(fermo.dn, 0);
  const basso = [{ i: 0, l: 4, n: NOTA_MIN }];
  assert.deepEqual(trasponi(basso, rif(basso[0]), -1, 1).eventi, basso);
});

test('muovi: tutte insieme, ferme ai bordi, una nota non esce dal suo ciclo', () => {
  const sel = rif(base[1], base[2]);
  const r = muovi(base, sel, 3, 2, 1);
  assert.deepEqual(r.eventi.filter((e) => e.n >= 54 && e.n <= 57).map((e) => [e.i, e.n]), [[7, 54], [11, 57]]);
  assert.equal(r.di, 3);
  // al bordo destro (1 ciclo = 16 scatti): la nota che arriva più in là (i 8 → max 15) frena tutte
  assert.equal(muovi(base, sel, 20, 0, 1).di, 7);
  assert.equal(muovi(base, sel, -20, 0, 1).di, -4);
  // la lunghezza si accorcia al ciclo: la nota di 4 che parte dallo scatto 14 ne ha 2
  const m = muovi([{ i: 0, l: 4, n: 48 }], rif({ i: 0, n: 48 }), 14, 0, 1);
  assert.deepEqual(m.eventi, [{ i: 14, l: 2, n: 48 }]);
  // con 2 cicli il confine è 32
  assert.equal(muovi([{ i: 0, l: 1, n: 48 }], rif({ i: 0, n: 48 }), 99, 0, 2).di, 31);
  // quello che le note scelte coprono sparisce, ma quelle altrove restano
  const c = muovi(base, rif(base[0]), 4, 4, 1);
  assert.deepEqual(c.eventi.map((e) => [e.i, e.n]), [[4, 52], [8, 55], [12, 60]], 'la 48 va a (4, 52) e sostituisce la nota che c\'era');
  assert.deepEqual(muovi(base, [], 3, 3, 1).eventi, base);
});

test('allunga: tutte le scelte insieme, dentro il loro ciclo, mai meno di 1', () => {
  const sel = rif(base[0], base[3]);
  assert.deepEqual(allunga(base, sel, 2).map((e) => e.l), [6, 2, 4, 4], 'la nota a 12 è già al bordo del ciclo');
  assert.deepEqual(allunga(base, sel, -9).map((e) => e.l), [1, 2, 4, 1]);
});

test('appunti e incolla: il blocco si rimette dove vuoi, con l\'inizio contato dalla prima nota', () => {
  const clip = appunti(base, rif(base[1], base[2]));
  assert.deepEqual(clip, { note: [{ d: 0, l: 2, n: 52 }, { d: 4, l: 4, n: 55 }], durata: 8 });
  assert.equal(appunti(base, []), null);
  const r = incolla([], clip, 2, 2);
  assert.deepEqual(r.eventi, [{ i: 2, l: 2, n: 52 }, { i: 6, l: 4, n: 55 }]);
  assert.deepEqual(r.sel, rif({ i: 2, n: 52 }, { i: 6, n: 55 }));
  assert.equal(r.fine, 10);
  assert.equal(r.fuori, 0);
  const tardi = incolla([], clip, 28, 2);
  assert.deepEqual(tardi.eventi, [{ i: 28, l: 2, n: 52 }]);
  assert.equal(tardi.fuori, 1, 'la seconda nota cade a 32: oltre il pattern');
  assert.equal(incolla(base, clip, 40, 2).fuori, 2);
  // sopra una nota uguale la sostituisce
  assert.equal(incolla([{ i: 2, l: 9, n: 52 }], clip, 2, 1).eventi.find((e) => e.n === 52).l, 2);
});

test('duplica: subito dopo il blocco, come ⌘D', () => {
  const r = duplica(base, rif(base[0], base[1]), 2);
  assert.deepEqual(r.eventi.filter((e) => e.i >= 6).map((e) => [e.i, e.l, e.n]), [[6, 4, 48], [8, 4, 55], [10, 2, 52], [12, 4, 60]]);
  assert.deepEqual(r.sel, rif({ i: 6, n: 48 }, { i: 10, n: 52 }));
  assert.equal(duplica(base, [], 2), null);
  // il blocco arriva al fondo: non c'è posto
  const tutto = duplica(base, rif(...base), 1);
  assert.equal(tutto.fuori, 4);
  assert.deepEqual(tutto.eventi, base);
});

test('senzaScelte toglie solo quelle scelte', () => {
  assert.deepEqual(senzaScelte(base, rif(base[1])), [base[0], base[2], base[3]]);
});

test('scale di Strudel: nome, tonica con o senza ottava, gradi e ritorno', () => {
  const am = leggiScala('A2:minor');
  assert.deepEqual({ tipo: am.tipo, radice: am.radice, base: am.base }, { tipo: 'minore', radice: 9, base: 45 });
  assert.equal(leggiScala('A:minor').base, 57, 'senza ottava è la 3');
  assert.equal(leggiScala('a2:minor').base, 45);
  assert.equal(leggiScala('C3:minor:pentatonic').tipo, 'pentatonica minore');
  assert.equal(leggiScala('C3:major:pentatonic').tipo, 'pentatonica maggiore', 'come Strudel: i due punti sono spazi');
  assert.equal(leggiScala('C3:minor pentatonic'), null, 'con lo spazio Strudel legge due passi: non è una scala sola');
  assert.equal(leggiScala('a2 minor'), null);
  assert.equal(leggiScala('Eb2:dorian').base, 39);
  assert.equal(leggiScala('C:ritusen'), null);
  assert.equal(leggiScala('minor'), null);
  assert.equal(leggiScala(5), null);
  // i gradi: 0 la tonica, 7 un'ottava sopra (sette note), −1 sotto
  assert.deepEqual([0, 2, 7, 9, 12, -1].map((g) => gradoInNota(g, am)), [45, 48, 57, 60, 65, 43]);
  const pm = leggiScala('C3:minor:pentatonic'); // 0 3 5 7 10
  assert.deepEqual([0, 1, 4, 5, 6, -1].map((g) => gradoInNota(g, pm)), [48, 51, 58, 60, 63, 46]);
  for (const sc of [am, pm, leggiScala('D3:blues')]) for (let g = -9; g < 20; g++) assert.equal(notaInGrado(gradoInNota(g, sc), sc), g);
  assert.equal(notaInGrado(46, am), null, 'la#2 non è nella scala di la minore');
});

test('n(…).scale(…): i numeri sono gradi, le note stanno nella scala', () => {
  const am = leggiScala('A2:minor');
  const r = eventiDaMini('0 2 7 9 7 4 2 9 12 9 7 4', { scala: am });
  assert.equal(r.griglia, 12);
  assert.equal(r.fuoriGriglia, false);
  assert.deepEqual(r.eventi.map((e) => e.n), [45, 48, 57, 60, 57, 52, 48, 60, 65, 60, 57, 52]);
  assert.deepEqual(r.eventi.map((e) => [e.i, e.l]).slice(0, 3), [[0, 1], [1, 1], [2, 1]]);
  assert.ok(eventiDaMini('c3 e3', { scala: am }).errore, 'con la scala vogliono numeri');
  assert.deepEqual(eventiDaMini('[0,2,4]@2 ~', { scala: am }).eventi.map((e) => e.n), [45, 48, 52]);
  assert.deepEqual(eventiDaMini('-1 0', { scala: am }).eventi.map((e) => e.n), [43, 45]);
  // al ritorno si riscrivono i gradi
  const mini = miniDaEventi(r.eventi, r.cicli, r.griglia, (n) => String(notaInGrado(n, am)));
  assert.equal(mini, '0 2 7 9 7 4 2 9 12 9 7 4');
  assert.equal(miniDaEventi([{ i: 0, l: 3, n: 48 }, { i: 3, l: 9, n: 52 }], 1, 12), 'c3 e3@3');
  assert.equal(miniDaEventi([{ i: 0, l: 12, n: 48 }], 1, 12), 'c3');
});

test('griglie: la prima che le contiene tutte, o quella chiesta se va bene', () => {
  assert.equal(eventiDaMini('c3 ~ e3 ~').griglia, 16);
  assert.equal(eventiDaMini('c3 ~ e3 ~', { griglia: 12 }).griglia, 12, 'cadono anche sulle terzine: vale la chiesta');
  assert.equal(eventiDaMini('c3 e3 g3 b3 d4 f4 a4 c5', { griglia: 12 }).griglia, 16, 'ma se non ci stanno si torna alla prima che va');
  assert.equal(eventiDaMini('~', { griglia: 24 }).griglia, 24);
  assert.equal(eventiDaMini('c3*6').griglia, 12);
  assert.equal(eventiDaMini('c3*32').griglia, 32);
  assert.equal(eventiDaMini('c3*24').griglia, 24);
  assert.equal(eventiDaMini('[c3 e3 g3]*4').griglia, 12);
  assert.deepEqual(GRIGLIE, [16, 12, 32, 24, 48]);
});

test('con la griglia di terzine: muovi, incolla e cicli contano in 12', () => {
  const ev = [{ i: 0, l: 3, n: 48 }, { i: 6, l: 6, n: 52 }];
  assert.deepEqual(conCicli(ev, 1, 2, 12).map((e) => e.i), [0, 6, 12, 18]);
  assert.equal(muovi(ev, [{ i: 6, n: 52 }], 99, 0, 1, 12).di, 5, 'fino all\'ultimo scatto (11)');
  assert.deepEqual(muovi(ev, [{ i: 0, n: 48 }], 11, 0, 1, 12).eventi.find((e) => e.n === 48), { i: 11, l: 1, n: 48 });
  assert.equal(incolla([], { note: [{ d: 0, l: 8, n: 60 }], durata: 8 }, 8, 1, 12).eventi[0].l, 4, 'non esce dal ciclo di 12');
  assert.equal(allunga(ev, [{ i: 6, n: 52 }], 9, 12)[1].l, 6);
});

test('scala diversa a ogni ciclo: <A:minor A:minor F:major E:major>', () => {
  const sc = leggiScala('<A:minor A:minor F:major E:major>');
  assert.equal(sc.lista.length, 4);
  assert.deepEqual({ tipo: sc.tipo, radice: sc.radice }, { tipo: 'minore', radice: 9 }, 'il pianoroll prende la prima');
  assert.equal(scalaDelCiclo(sc, 2).radice, 5);
  assert.equal(scalaDelCiclo(sc, 5).radice, 9, 'dopo il quarto si ricomincia');
  assert.equal(leggiScala('<A:minor C:ritusen>'), null);
  assert.equal(leggiScala('<A:minor <C:major>>'), null);
  const r = eventiDaMini('0 ~ 4 ~ 7 ~ <5 3> ~', { scala: sc });
  assert.equal(r.cicli, 4, 'l\'alternanza delle note (2) e quella delle scale (4) insieme');
  assert.equal(r.griglia, 16);
  const ciclo = (c) => r.eventi.filter((e) => Math.floor(e.i / 16) === c).map((e) => e.n);
  assert.deepEqual(ciclo(0), [57, 64, 69, 65], 'la minore da la3: gradi 0 4 7 5');
  assert.deepEqual(ciclo(1), [57, 64, 69, 62], 'ciclo 2: 0 4 7 3');
  assert.deepEqual(ciclo(2), [53, 60, 65, 62], 'fa maggiore da fa3');
  assert.deepEqual(ciclo(3), [52, 59, 64, 57], 'mi maggiore da mi3');
  // al ritorno ogni ciclo si riscrive con la sua scala
  const mini = miniDaEventi(r.eventi, r.cicli, r.griglia, (n, c) => String(notaInGrado(n, scalaDelCiclo(sc, c))));
  assert.equal(mini, '<[0 ~ 4 ~ 7 ~ 5 ~] [0 ~ 4 ~ 7 ~ 3 ~] [0 ~ 4 ~ 7 ~ 5 ~] [0 ~ 4 ~ 7 ~ 3 ~]>');
});

test('scrittura a passi: una nota (o un accordo) al cursore, lunga un passo, dentro il ciclo', () => {
  const r = scriviPasso([], 0, 4, [48], 1);
  assert.deepEqual(r.eventi, [{ i: 0, l: 4, n: 48 }]);
  assert.deepEqual(r.sel, [{ i: 0, n: 48 }]);
  const accordo = scriviPasso(r.eventi, 4, 4, [48, 52, 55], 1);
  assert.deepEqual(accordo.eventi.map((e) => [e.i, e.n]), [[0, 48], [4, 48], [4, 52], [4, 55]]);
  assert.equal(scriviPasso([], 14, 4, [48], 1).eventi[0].l, 2, 'non esce dal ciclo');
  assert.equal(scriviPasso([], 16, 4, [48], 1).fuori, 1, 'oltre la fine');
  assert.equal(scriviPasso([], 16, 4, [48], 2).eventi.length, 1, 'ma con due cicli ci sta');
  assert.deepEqual(scriviPasso([{ i: 0, l: 9, n: 48 }], 0, 2, [48], 1).eventi, [{ i: 0, l: 2, n: 48 }], 'la stessa nota nello stesso posto si sostituisce');
  assert.equal(scriviPasso([], 0, 4, [2, 200], 1).eventi.length, 0, 'fuori da c0–c7 niente');
  assert.equal(scriviPasso([], 9, 3, [48], 1, 12).eventi[0].l, 3, 'terzine: 12 scatti');
  assert.equal(scriviPasso([], 10, 4, [48], 1, 12).eventi[0].l, 2);
});

test('scrittura a passi: ⌫ torna indietro di un passo e toglie le note di quel passo', () => {
  const ev = [{ i: 0, l: 4, n: 48 }, { i: 4, l: 4, n: 52 }, { i: 4, l: 4, n: 55 }, { i: 8, l: 4, n: 60 }];
  const r = indietroPasso(ev, 8, 4);
  assert.equal(r.cursore, 4);
  assert.deepEqual(r.eventi.map((e) => e.n), [48, 60], 'via le due del passo 4');
  assert.deepEqual(indietroPasso(ev, 2, 4), { eventi: ev.filter((e) => e.i >= 4), cursore: 0 }, 'in cima: resta a 0 e toglie il passo 0');
});
