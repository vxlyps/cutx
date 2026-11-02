import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COSTO_AVVISO, COSTO_MAX, LAYER_MAX, PARAMETRI, UNISON_MAX, aPosizione, attivo, costo, daPosizione, eCaro, imposta, iniziale, noteValide, parametro, pulisci, sorprendi,
} from '../src/renderer/synth-modello.js';
import { clip, codice, leggiRiga, rigaSynth, scarti } from '../src/renderer/synth-codice.js';

// un generatore ripetibile
const seme = (n) => () => ((n = (n * 1664525 + 1013904223) % 4294967296) / 4294967296);

test('il suono init: tutti gli attivi, scritti per intero, niente di neutro', () => {
  const c = codice(iniziale());
  assert.equal(
    c,
    [
      'note("c3 eb3 g3 bb3")',
      '  .s("sawtooth")',
      '  .lpf(2400)',
      '  .attack(.01).decay(.2).sustain(.6).release(.3)',
    ].join('\n'),
  );
  assert.doesNotMatch(c, /shape|delay|room|crush|gain|pan|vowel/);
});

test('supersaw con filtro, inviluppo e effetti', () => {
  const s = pulisci({ ...iniziale(), forma: 'supersaw', voci: 5, sub: 1, q: 8, fenv: 3, delay: 0.3, room: 0.2, distort: 1.5, ottava: 1 });
  const c = codice(s);
  assert.match(c, /\.trans\(12\)/);
  assert.match(c, /\.add\(note\("0,-12"\)\)/);
  assert.match(c, /\.s\("supersaw"\)\.unison\(5\)\.detune\(\.18\)\.spread\(\.6\)/);
  assert.match(c, /\.lpf\(2400\)\.lpq\(8\)/);
  assert.match(c, /\.lpenv\(3\)\.lpattack\(\.01\)\.lpdecay\(\.2\)/);
  assert.match(c, /\.lpsustain\(\.2\)\.lprelease\(\.3\)/);
  assert.match(c, /\.distort\(1\.5\)/);
  assert.match(c, /\.delay\(\.3\)\.delaysync\(3\/16\)\.delayfeedback\(\.5\)/);
  assert.match(c, /\.room\(\.2\)\.roomsize\(2\)/);
});

test('le voci sovrapposte: scarti simmetrici, sub a −12', () => {
  assert.deepEqual(scarti(pulisci({ ...iniziale(), voci: 3, detune: 0.2 })), [-0.2, 0, 0.2]);
  assert.deepEqual(scarti(pulisci({ ...iniziale(), voci: 2, detune: 0.1, sub: 1 })), [-0.1, 0.1, -12]);
  assert.deepEqual(scarti(pulisci({ ...iniziale(), sub: 1 })), [0, -12]);
  assert.deepEqual(scarti(iniziale()), [0]);
  assert.match(codice(pulisci({ ...iniziale(), voci: 3, detune: 0.2 })), /\.add\(note\("-\.2,0,\.2"\)\)/);
});

test('hpf e bpf usano i loro nomi: hpq, hpenv, bpq…', () => {
  const h = codice(pulisci({ ...iniziale(), tipo: 'hpf', cutoff: 300, q: 4, fenv: 2 }));
  assert.match(h, /\.hpf\(300\)\.hpq\(4\)/);
  assert.match(h, /\.hpenv\(2\)\.hpattack\(.*\)\.hpdecay/);
  assert.match(h, /\.hpsustain\(.*\)\.hprelease/);
  const b = codice(pulisci({ ...iniziale(), tipo: 'bpf', cutoff: 800, ftype: 'ladder' }));
  assert.match(b, /\.bpf\(800\)\.ftype\("ladder"\)/);
});

test('un filtro aperto e senza risonanza non si scrive', () => {
  assert.doesNotMatch(codice(pulisci({ ...iniziale(), cutoff: 20000 })), /lpf/);
  assert.doesNotMatch(codice(pulisci({ ...iniziale(), tipo: 'hpf', cutoff: 20 })), /hpf/);
  assert.match(codice(pulisci({ ...iniziale(), cutoff: 20000, q: 5 })), /\.lpf\(20000\)\.lpq\(5\)/);
});

test('il rumore non ha note da trasporre, voci, FM, pitch', () => {
  const c = codice(pulisci({ ...iniziale(), forma: 'white', voci: 4, sub: 1, fm: 3, ottava: 2, penv: 5 }));
  assert.match(c, /\.s\("white"\)/);
  assert.doesNotMatch(c, /trans|add\(|fm|penv/);
});

test('pulse, FM, pitch env, effetti a griglia', () => {
  const c = codice(pulisci({ ...iniziale(), forma: 'pulse', pw: 0.3, fm: 2, fmh: 2, penv: 7, pdecay: 0.05, crush: 6, coarse: 4, phaser: 2, tremolo: 4, shape: 0.4, pan: 0.2 }));
  assert.match(c, /\.s\("pulse"\)\.pw\(\.3\)/);
  assert.match(c, /\.fm\(2\)\.fmh\(2\)/);
  assert.match(c, /\.penv\(7\)\.pdecay\(\.05\)/);
  assert.match(c, /\.shape\(\.4\)\.crush\(6\)\.coarse\(4\)/);
  assert.match(c, /\.phaser\(2\)\.phaserdepth\(\.75\)\.tremolosync\(4\)\.tremolodepth\(\.5\)/);
  assert.match(c, /\.pan\(\.2\)/);
});

test('lo schema di prova decide le note; «clip» usa le note della clip', () => {
  assert.match(codice({ ...iniziale(), anteprima: 'tenuta' }), /^note\("c3"\)/);
  assert.match(codice({ ...iniziale(), anteprima: 'clip', note: 'a2 [c3 e3]' }), /^note\("a2 \[c3 e3\]"\)/);
  assert.match(codice({ ...iniziale(), anteprima: 'clip', note: 'a2" ); evil(' }), /^note\("c3 eb3 g3 bb3"\)/);
});

test('le note non possono rompere il codice', () => {
  for (const cattive of ['c3");process.exit()//', "c3'", 'c3\\', '', 'c3\nx', 'x'.repeat(500)]) assert.equal(noteValide(cattive), false, cattive);
  for (const buone of ['c3 e3 g3', 'c3*2 ~ [e3,g3]', '<c3 d3>!2', '-1 0 7']) assert.equal(noteValide(buone), true, buone);
});

test('riga @synth: andata e ritorno esatta', () => {
  const s = pulisci({ ...iniziale(), forma: 'supersaw', voci: 4, cutoff: 1234, q: 7.5, fenv: 2.5, delay: 0.25, anteprima: 'clip', note: 'c3 e3' });
  const testo = clip(s);
  assert.ok(testo.startsWith('// @synth {'));
  assert.deepEqual(leggiRiga(testo), s);
  assert.equal(testo.split('\n').filter((r) => r.includes('@synth')).length, 1);
});

test('la riga @synth è sicura: roba sbagliata non si apre, i valori si riportano nei limiti', () => {
  assert.equal(leggiRiga('note("c3")'), null);
  assert.equal(leggiRiga('// @synth {rotto'), null);
  assert.equal(leggiRiga('// @synth []'), null);
  const s = leggiRiga('// @synth {"cutoff":99999999,"voci":99,"forma":"__proto__","sub":"si","x":1,"delaysync":"1/3"}');
  assert.equal(s.cutoff, 20000);
  assert.equal(s.forma, 'sawtooth');
  assert.equal(s.voci, LAYER_MAX); // sawtooth: tetto dei layer
  assert.equal(s.sub, 1);
  assert.equal(s.delaysync, '3/16');
  assert.equal('x' in s, false);
});

test('i tetti: unison, layer e costo', () => {
  assert.equal(pulisci({ forma: 'supersaw', voci: 50 }).voci, UNISON_MAX);
  assert.equal(pulisci({ forma: 'square', voci: 50 }).voci, LAYER_MAX);
  const pesante = pulisci({ forma: 'supersaw', voci: 7, sub: 1, room: 1, delay: 1, phaser: 2, vowel: 'a', ftype: 'ladder', fm: 2 });
  assert.ok(costo(pesante) <= COSTO_MAX, `costo ${costo(pesante)}`);
  assert.equal(eCaro(iniziale()), false);
  assert.equal(eCaro(pulisci({ forma: 'supersaw', voci: 7, sub: 1 })), true);
});

test('imposta: la manopola che supera il tetto si ferma (stesso oggetto)', () => {
  const alTetto = { ...iniziale(), forma: 'supersaw', voci: 7, sub: 1, room: 0.5, delay: 0.3 }; // 14 + 3 + 1 = 18
  assert.equal(costo(alTetto), COSTO_MAX);
  assert.equal(imposta(alTetto, 'phaser', 2), alTetto);
  assert.equal(imposta(alTetto, 'vowel', 'a'), alTetto);
  assert.notEqual(imposta(alTetto, 'room', 0), alTetto); // togliere pesi si può sempre
  assert.equal(imposta(iniziale(), 'cutoff', 1000).cutoff, 1000);
  assert.equal(imposta(iniziale(), 'cutoff', 'abc').cutoff, 2400); // non è un numero: resta com'era
  const s = iniziale();
  assert.equal(imposta(s, 'cutoff', 2400), s); // niente cambia: stesso oggetto
  assert.equal(imposta(s, 'inesistente', 3), s);
  assert.equal(imposta({ ...s, forma: 'supersaw', voci: 7 }, 'forma', 'square').voci, LAYER_MAX); // fuori dal supersaw, il tetto scende
});

test('le manopole: posizione ↔ valore, lineari e logaritmiche', () => {
  const s = iniziale();
  const cut = parametro('cutoff');
  assert.equal(daPosizione(cut, s, 0), 20);
  assert.equal(daPosizione(cut, s, 1), 20000);
  const mezzo = daPosizione(cut, s, 0.5);
  assert.ok(mezzo > 600 && mezzo < 700, String(mezzo)); // √(20·20000) ≈ 632
  assert.ok(Math.abs(aPosizione(cut, s, mezzo) - 0.5) < 0.01);
  const q = parametro('q');
  assert.equal(daPosizione(q, s, 0.5), 12.5);
  assert.equal(daPosizione(parametro('crush'), s, 0), 1);
  assert.equal(daPosizione(parametro('voci'), { ...s, forma: 'supersaw' }, 1), UNISON_MAX);
  assert.equal(daPosizione(parametro('voci'), s, 1), LAYER_MAX);
});

test('sorprendimi: sempre dentro i limiti, musicale, leggero e ripetibile', () => {
  for (let n = 1; n <= 300; n++) {
    const s = sorprendi(seme(n));
    assert.deepEqual(s, pulisci(s), `seme ${n}`);
    assert.ok(costo(s) <= COSTO_MAX, `seme ${n} costo ${costo(s)}`);
    assert.ok(s.q <= 12.5 && s.distort <= 2 && s.gain <= 0.8 && s.delayfeedback <= 0.6, `seme ${n}`);
    assert.ok(!['white', 'pink', 'brown', 'crackle'].includes(s.forma));
    assert.match(codice(s), /^note\(".*"\)\n/);
  }
  assert.deepEqual(sorprendi(seme(7)), sorprendi(seme(7)));
  assert.notDeepEqual(sorprendi(seme(7)), sorprendi(seme(8)));
});

test('ogni parametro ha il suo intervallo coerente e un valore di partenza dentro', () => {
  const s = iniziale();
  for (const p of PARAMETRI) {
    if (p.tipo === 'scelta') assert.ok(p.scelte.includes(p.def), p.k);
    else if (p.tipo !== 'bool') assert.ok(p.def >= p.min && p.def <= p.max, p.k);
    assert.equal(s[p.k], p.def);
  }
  assert.ok(COSTO_AVVISO < COSTO_MAX);
});

test('la clip porta le note che suonano davvero, e la riga resta corta', () => {
  const s = pulisci({ ...iniziale(), anteprima: 'tenuta', cutoff: 900 });
  const testo = clip(s);
  const letto = leggiRiga(testo);
  assert.equal(letto.anteprima, 'clip');
  assert.equal(letto.note, 'c3');
  assert.equal(letto.cutoff, 900);
  assert.ok(rigaSynth(s).length < 200, String(rigaSynth(s).length));
  assert.match(testo, /^\/\/ @synth \{.*\}\nnote\("c3"\)/);
});

import { CATEGORIE, categoriaDi, gruppiClip, ordineClip } from '../src/renderer/categorie.js';
import { PROFILI, mutate } from '../src/renderer/synth-modello.js';

test('ogni tipo resta nei suoi limiti, per 200 semi', () => {
  const lim = {
    bass: (s) => s.cutoff <= 1200 && s.tipo === 'lpf' && s.ottava === -1 && s.release <= 0.3 && s.attack <= 0.02 && ['sawtooth', 'square', 'supersaw', 'triangle'].includes(s.forma),
    lead: (s) => s.cutoff >= 1200 && s.sustain >= 0.5 && s.attack <= 0.05 && ['sawtooth', 'square', 'supersaw', 'pulse'].includes(s.forma),
    arp: (s) => s.decay <= 0.25 && s.sustain <= 0.3 && s.attack <= 0.01,
    pad: (s) => s.attack >= 0.4 && s.release >= 1 && s.sustain >= 0.6,
    keys: (s) => s.decay >= 0.3 && ['triangle', 'sine', 'square'].includes(s.forma) && s.ottava === 0,
    fx: () => true,
  };
  for (const c of CATEGORIE) {
    assert.ok(PROFILI[c], c);
    for (let n = 1; n <= 200; n++) {
      const s = sorprendi(seme(n), { ...iniziale(), categoria: c });
      assert.deepEqual(s, pulisci(s), `${c} seme ${n}`);
      assert.ok(costo(s) <= COSTO_MAX, `${c} seme ${n} costo ${costo(s)}`);
      assert.equal(s.categoria, c);
      assert.ok(lim[c](s), `${c} seme ${n}: ${JSON.stringify(s)}`);
    }
  }
});

test('mutate: poco = vicino, tanto = nuovo, il tipo e le note restano', () => {
  const base = pulisci({ ...iniziale(), categoria: 'lead', note: 'c3 e3', anteprima: 'clip', cutoff: 3000 });
  const distanza = (a, b) => PARAMETRI.filter((p) => p.tipo === 'num').reduce((t, p) => t + Math.abs(aPosizione(p, a, a[p.k]) - aPosizione(p, b, b[p.k])), 0);
  let poco = 0;
  let tanto = 0;
  for (let n = 1; n <= 100; n++) {
    const a = mutate(base, 0.1, seme(n));
    const b = mutate(base, 0.9, seme(n));
    poco += distanza(base, a);
    tanto += distanza(base, b);
    assert.deepEqual(a, pulisci(a));
    assert.equal(a.categoria, 'lead');
    assert.equal(a.note, 'c3 e3');
    assert.equal(b.anteprima, 'clip');
    assert.equal(a.gain, base.gain);
    assert.ok(costo(a) <= COSTO_MAX && costo(b) <= COSTO_MAX);
  }
  assert.ok(poco < tanto * 0.4, `${poco} vs ${tanto}`);
  assert.deepEqual(mutate(base, 0, seme(5)), base);
  assert.deepEqual(mutate(base, 1, seme(5)), sorprendi(seme(5), base, 'lead'));
});

test('i tipi nel file: la riga della clip e i gruppi del CUE', () => {
  assert.equal(categoriaDi({ bass: true, volume: 0.8 }), 'bass');
  assert.equal(categoriaDi({ volume: 1 }), '');
  assert.equal(categoriaDi({ bass: 3 }), '');
  const clip = [{ info: {} }, { info: { pad: true } }, { info: { bass: true } }, { info: {} }, { info: { bass: true } }];
  assert.deepEqual(gruppiClip(clip), [
    { categoria: 'bass', indici: [2, 4] },
    { categoria: 'pad', indici: [1] },
    { categoria: '', indici: [0, 3] },
  ]);
  assert.deepEqual(ordineClip(clip), [2, 4, 1, 0, 3]);
  assert.deepEqual(gruppiClip([{ info: {} }, { info: {} }]), [{ categoria: null, indici: [0, 1] }]); // senza tipi: niente gruppi né titoli
});

import { leggiCodice, spezza } from '../src/renderer/synth-codice.js';

test('spezza: testa e chiamate, stringhe e parentesi rispettate, commenti tolti', () => {
  const r = spezza('note("c3 e3")\n  .s("sawtooth").lpf(sine.range(300, 2400).slow(8)) // modulato\n  .gain(.5);');
  assert.equal(r.testa, 'note("c3 e3")');
  assert.deepEqual(r.chiamate.map((c) => c.nome), ['s', 'lpf', 'gain']);
  assert.equal(r.chiamate[1].args, 'sine.range(300, 2400).slow(8)');
  assert.equal(spezza('note("c3"').errore, 'parentesi non chiusa');
  assert.equal(spezza('note("c3)').errore, 'stringa non chiusa');
  assert.equal(spezza('note("c3"))').errore, 'parentesi chiusa di troppo');
  assert.ok(spezza('').errore);
  assert.equal(spezza('note("a.b(c)")').chiamate.length, 0); // un punto dentro una stringa non spezza
});

test('il codice scritto a mano sposta le manopole', () => {
  const base = iniziale();
  const r = leggiCodice('note("c3 e3")\n  .s("square")\n  .lpf(400).lpq(6)\n  .attack(.02).decay(.3).sustain(.5).release(.8)\n  .delay(.3).delaysync(1/8).room(.2).roomsize(3)', base);
  assert.equal(r.errore, undefined);
  const s = r.stato;
  assert.equal(s.forma, 'square');
  assert.equal(s.cutoff, 400);
  assert.equal(s.q, 6);
  assert.equal(s.release, 0.8);
  assert.equal(s.delay, 0.3);
  assert.equal(s.delaysync, '1/8');
  assert.equal(s.roomsize, 3);
  assert.equal(s.note, 'c3 e3');
  assert.deepEqual(r.mano, []);
  // quello che il codice non nomina è spento
  assert.equal(s.shape, 0);
  assert.equal(s.crush, 16);
  assert.equal(s.fenv, 0);
});

test('quello che il pannello non conosce resta com\'è, in fondo, e non si perde', () => {
  const r = leggiCodice('note("c3")\n  .s("sawtooth").lpf(sine.range(300, 2400).slow(8)).vib(4).vibmod(.5).gain(.6)\n  .chunk(4, x => x.add(7))', iniziale());
  assert.equal(r.errore, undefined);
  assert.deepEqual(r.mano, ['.lpf(sine.range(300, 2400).slow(8))', '.vib(4)', '.vibmod(.5)', '.chunk(4, x => x.add(7))']);
  assert.equal(r.stato.gain, 0.6);
  const c = codice(r.stato);
  for (const m of r.mano) assert.ok(c.includes(m), m);
  assert.ok(c.indexOf('.vib(4)') > c.indexOf('.gain(.6)'), 'le chiamate a mano vanno in fondo: l\'ultimo valore vince');
  // andata e ritorno: riletto, resta uguale
  assert.equal(codice(leggiCodice(c, r.stato).stato), c);
});

test('un\'inizio diverso da note("…") resta com\'è', () => {
  const r = leggiCodice('n("0 3 7").scale("c:minor")\n  .s("triangle").lpf(900)', iniziale());
  assert.equal(r.stato.testa, 'n("0 3 7")');
  assert.deepEqual(r.mano, ['.scale("c:minor")']);
  assert.equal(r.stato.cutoff, 900);
  assert.match(codice(r.stato), /^n\("0 3 7"\)\n/);
});

test('valori fuori dai limiti: errore, niente cambia', () => {
  for (const [codiceTesto, atteso] of [
    ['note("c3").s("supersaw").unison(50)', /unison/],
    ['note("c3").lpf(30000)', /lpf/],
    ['note("c3").gain(5)', /gain/],
    ['note("c3").lpf(400', /parentesi/],
  ]) {
    const r = leggiCodice(codiceTesto, iniziale());
    assert.match(r.errore ?? '', atteso, codiceTesto);
    assert.equal(r.stato, undefined);
  }
});

test('voci sovrapposte, sub, ottava e doppioni', () => {
  const s = leggiCodice('note("c3")\n  .trans(12)\n  .add(note("-.2,0,.2,-12"))\n  .s("sawtooth").lpf(400).lpf(900)', iniziale()).stato;
  assert.equal(s.ottava, 1);
  assert.equal(s.voci, 3);
  assert.equal(s.detune, 0.2);
  assert.equal(s.sub, 1);
  assert.equal(s.cutoff, 900); // vale l'ultimo
  const dispari = leggiCodice('note("c3").add(note("0,7,12"))', iniziale());
  assert.deepEqual(dispari.mano, ['.add(note("0,7,12"))']);
  assert.equal(leggiCodice('note("c3").trans(7)', iniziale()).mano[0], '.trans(7)');
});

test('andata e ritorno: ogni suono (300 casuali, tutti i tipi) torna lo stesso dal suo codice', () => {
  for (let n = 1; n <= 300; n++) {
    const categoria = ['', ...CATEGORIE][n % 7];
    const s = sorprendi(seme(n), { ...iniziale(), categoria });
    const c = codice(s);
    const r = leggiCodice(c, s);
    assert.equal(r.errore, undefined, `seme ${n}: ${r.errore}\n${c}`);
    assert.deepEqual(r.mano, [], `seme ${n}`);
    assert.equal(codice(r.stato), c, `seme ${n}`);
    for (const p of PARAMETRI) if (attivo(p, s)) assert.equal(r.stato[p.k], s[p.k], `seme ${n} ${p.k}`);
  }
});

test('lo stato con la mano sta nella riga @synth e si riapre uguale', () => {
  const r = leggiCodice('n("0 3").scale("c:minor").s("triangle").vib(4)', iniziale());
  const testo = clip(r.stato);
  const letto = leggiRiga(testo);
  assert.equal(letto.testa, 'n("0 3")');
  assert.deepEqual(letto.mano, ['.scale("c:minor")', '.vib(4)']);
  assert.equal(codice(letto), codice(r.stato));
});
