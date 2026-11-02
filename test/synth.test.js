import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COSTO_AVVISO, COSTO_MAX, LAYER_MAX, PARAMETRI, UNISON_MAX, aPosizione, costo, daPosizione, eCaro, imposta, iniziale, noteValide, parametro, pulisci, sorprendi,
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

test('pulse, FM, pitch env, fx a griglia', () => {
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
