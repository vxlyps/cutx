// Il formato .cutx non deve perdere niente: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/renderer/brano.js';

const NOTTE = `// @brano notte
// @bpm 140
// @data 2026-10-20
// @suoni jungle_break, voce
// preambolo: valutato con ogni sezione
setcpm(140/4)

// @sezione intro
s("bd*4, ~ hh").bank("RolandTR909")
// un commento dentro la sezione

// @sezione melodia · volume 0.6
n("0 3 7 <10 12>").scale("C:minor").s("triangle")
// @sezione drop · volume 0.8 · muto
s("jungle_break").fit().chop(16)
  .lpf(perlin.range(800, 6000))
`;

const STRANI = [
  '',
  '\n',
  's("bd")',
  's("bd")\n',
  '// @sezione sola',
  '// @sezione sola\n',
  '// @sezione a\n// @sezione b\n// @sezione c',
  '\n\n// @sezione a\n\n\n',
  '  // @sezione rientrata\nx\r\ny',
  '// @brano solo testa',
  '// @brano x\n// @bpm 90\n// @sezione a\ns("a")\n// @sezione a\ns("b")',
  '// commento\n// @brano non è testa perché non è in cima\n',
  '// @sezione con spazi nel nome · volume 0.25\nnote("c")',
];

test('rileggere e riscrivere dà lo stesso testo, byte per byte', () => {
  for (const t of [NOTTE, ...STRANI]) assert.equal(B.scrivi(B.leggi(t)), t, JSON.stringify(t));
});

test('sezioni, nomi, informazioni, preambolo e testa', () => {
  const b = B.leggi(NOTTE);
  assert.deepEqual(
    b.sezioni.map((s) => s.nome),
    ['intro', 'melodia', 'drop'],
  );
  assert.deepEqual(b.sezioni[1].info, { volume: 0.6 });
  assert.deepEqual(b.sezioni[2].info, { volume: 0.8, muto: true });
  assert.deepEqual(b.preambolo, ['// preambolo: valutato con ogni sezione', 'setcpm(140/4)', '']);
  assert.deepEqual(b.sezioni[0].corpo, ['s("bd*4, ~ hh").bank("RolandTR909")', '// un commento dentro la sezione', '']);
  assert.deepEqual(B.testa(b), { brano: 'notte', bpm: 140, data: '2026-10-20', suoni: ['jungle_break', 'voce'] });
});

test('il codice di una sezione porta con sé il preambolo', () => {
  const b = B.leggi(NOTTE);
  const { codice, inizio } = B.codice(b, 1);
  assert.ok(codice.startsWith('// preambolo'));
  assert.ok(codice.includes('setcpm(140/4)'));
  assert.equal(codice.slice(inizio), 'n("0 3 7 <10 12>").scale("C:minor").s("triangle")');
  const solo = B.codice(b, 2, ['s("jungle_break").fit().chop(16)']);
  assert.equal(solo.codice.slice(solo.inizio), 's("jungle_break").fit().chop(16)');
  const senza = B.codice(B.leggi('// @sezione a\nx'), 0);
  assert.deepEqual(senza, { codice: 'x', inizio: 0 });
});

test('rinomina, unisci, dividi, sposta: niente si perde e il file resta valido', () => {
  let b = B.leggi(NOTTE);
  const righeDiCodice = (x) => x.sezioni.flatMap((s) => s.corpo).join('\n');
  const prima = righeDiCodice(b);

  b = B.rinomina(b, 0, 'cassa');
  assert.equal(b.sezioni[0].nome, 'cassa');
  assert.equal(b.sezioni[0].riga, '// @sezione cassa');
  b = B.rinomina(b, 2, 'drop forte');
  assert.equal(b.sezioni[2].riga, '// @sezione drop forte · volume 0.8 · muto');

  b = B.sposta(b, 2, 0);
  assert.deepEqual(
    b.sezioni.map((s) => s.nome),
    ['drop forte', 'cassa', 'melodia'],
  );
  b = B.unisci(b, 1);
  assert.deepEqual(
    b.sezioni.map((s) => s.nome),
    ['drop forte', 'cassa'],
  );
  b = B.dividi(b, 1, 3, 'melodia');
  assert.deepEqual(
    b.sezioni.map((s) => s.nome),
    ['drop forte', 'cassa', 'melodia'],
  );

  // stesso codice, solo in un altro ordine
  const dopo = righeDiCodice(b);
  assert.deepEqual(dopo.split('\n').sort(), prima.split('\n').sort());

  // e riletto dal file è uguale
  const riletto = B.leggi(B.scrivi(b));
  assert.deepEqual(riletto, b);
});

test('la testa si aggiorna senza toccare il resto', () => {
  const b = B.conTesta(B.leggi(NOTTE), { bpm: 150, suoni: ['voce'] });
  const t = B.scrivi(b);
  assert.ok(t.startsWith('// @brano notte\n// @bpm 150\n// @data 2026-10-20\n// @suoni voce\n'));
  assert.equal(t.slice(t.indexOf('// preambolo')), NOTTE.slice(NOTTE.indexOf('// preambolo')));
  // testa nuova su un testo senza testa: le righe vanno in cima, nell'ordine giusto
  const nuovo = B.scrivi(B.conTesta(B.leggi('s("bd")'), { suoni: [], data: '2026-01-01', brano: 'x' }));
  assert.equal(nuovo, '// @brano x\n// @data 2026-01-01\n// @suoni\ns("bd")');
});

test('+ sezione dalle righe scelte', () => {
  const t = 'setcpm(1)\ns("a")\ns("b")\n// @sezione x\ns("c")\ns("d")\ns("e")';
  // in mezzo al preambolo: le righe scelte vanno subito dopo, prima di x
  let r = B.aggiungiSezione(t, 1, 1, 'drum');
  assert.equal(r.testo, 'setcpm(1)\ns("b")\n// @sezione drum\ns("a")\n// @sezione x\ns("c")\ns("d")\ns("e")');
  assert.equal(r.riga, 2);
  // in mezzo a una sezione: x tiene c ed e, d diventa basso subito dopo
  r = B.aggiungiSezione(t, 5, 5, 'basso');
  assert.equal(r.testo, 'setcpm(1)\ns("a")\ns("b")\n// @sezione x\ns("c")\ns("e")\n// @sezione basso\ns("d")');
  // in fondo a una sezione: niente si sposta
  r = B.aggiungiSezione(t, 5, 6, 'basso');
  assert.equal(r.testo, 'setcpm(1)\ns("a")\ns("b")\n// @sezione x\ns("c")\n// @sezione basso\ns("d")\ns("e")');
  // tutta la sezione: si rinomina
  r = B.aggiungiSezione(t, 4, 6, 'intro');
  assert.equal(r.testo, 'setcpm(1)\ns("a")\ns("b")\n// @sezione intro\ns("c")\ns("d")\ns("e")');
  // attraverso due blocchi: no
  assert.ok(B.aggiungiSezione(t, 2, 4, 'no').errore);
  // la riga @sezione stessa: no
  assert.ok(B.aggiungiSezione(t, 3, 4, 'no').errore);
  // ogni risultato si rilegge con le sezioni giuste
  const ok = B.aggiungiSezione(t, 5, 5, 'basso');
  assert.deepEqual(
    B.leggi(ok.testo).sezioni.map((s) => [s.nome, s.corpo]),
    [
      ['x', ['s("c")', 's("e")']],
      ['basso', ['s("d")']],
    ],
  );
});

test('blocchi e blocco della riga', () => {
  const t = '// @brano x\npre\n// @sezione a\n1\n2\n// @sezione b\n3';
  const { blocchi } = B.blocchi(t);
  assert.deepEqual(
    blocchi.map((b) => [b.sezione, b.testa, b.da, b.a]),
    [
      [-1, null, 1, 2],
      [0, 2, 3, 5],
      [1, 5, 6, 7],
    ],
  );
  assert.equal(B.bloccoDellaRiga(t, 2).nome, 'a');
  assert.equal(B.bloccoDellaRiga(t, 4).nome, 'a');
  assert.equal(B.bloccoDellaRiga(t, 6).nome, 'b');
  assert.equal(B.bloccoDellaRiga(t, 1).sezione, -1);
});

test('salva il live come brano: un livello per sezione, con volume e muto', () => {
  const t = B.daLivelli(
    [
      { nome: 'intro', codice: 's("bd*4")\n', volume: 1, muto: false },
      { nome: 'basso', codice: 'note("c1*8")\n  .s("supersaw")', volume: 0.7, muto: true },
      { nome: 'basso', codice: 'note("g1*8")', volume: 1 },
    ],
    { nome: 'jam di martedì', bpm: 140, data: '2026-10-20', suoni: [] },
  );
  const b = B.leggi(t);
  assert.deepEqual(B.testa(b), { brano: 'jam di martedì', bpm: 140, data: '2026-10-20', suoni: [] });
  assert.deepEqual(
    b.sezioni.map((s) => [s.nome, s.info, s.corpo]),
    [
      ['intro', {}, ['s("bd*4")']],
      ['basso', { volume: 0.7, muto: true }, ['note("c1*8")', '  .s("supersaw")']],
      ['basso 2', {}, ['note("g1*8")', '']],
    ],
  );
  assert.equal(B.scrivi(b), t);
});

test('nomi di file', () => {
  assert.equal(B.nomeFile('Notte di Città!'), 'notte_di_citta.cutx');
  assert.equal(B.nomeFile('   '), 'brano.cutx');
  assert.equal(B.nomeFile('../../etc/passwd'), 'etcpasswd.cutx');
});

test('salva il live come brano: @bpm e setcpm sono il tempo del set, non quello del brano da cui venivano le sezioni', () => {
  // le sezioni sono partite da un brano a 140 (il loro codice porta ancora il suo preambolo), ma il set ora è a 128
  const t = B.daLivelli(
    [
      { nome: 'intro', codice: 'setcpm(140/4)\ns("bd*4")\n', volume: 1 },
      { nome: 'basso', codice: '// preambolo\nsetcpm(140/4)\nnote("c1*8")\n  .s("supersaw")', volume: 1 },
      { nome: 'drop', codice: 'setcps(.5)  // vecchio\ns("sd")', volume: 1 },
    ],
    { nome: 'jam', bpm: 128, data: '2026-10-20', suoni: [] },
  );
  const b = B.leggi(t);
  assert.equal(B.testa(b).bpm, 128);
  assert.equal(B.bpmDelBrano(b), 128);
  assert.ok(b.preambolo.includes('setcpm(128/4)'));
  assert.ok(!t.includes('140'), 'il tempo del brano di partenza non c\'è più');
  assert.ok(!/setcps/.test(t));
  assert.deepEqual(b.sezioni.map((s) => s.corpo.filter(Boolean)), [['s("bd*4")'], ['// preambolo', 'note("c1*8")', '  .s("supersaw")'], ['s("sd")']]);
  assert.equal(B.scrivi(b), t);
  // un tempo con la virgola (set a 127,5) resta com'è
  assert.ok(B.daLivelli([{ nome: 'a', codice: 's("bd")' }], { nome: 'x', bpm: 127.5, data: 'd' }).includes('setcpm(127.5/4)'));
});

test('il BPM di un brano: dal setcpm del preambolo, o dalla testa', () => {
  const b = (testo) => B.leggi(testo);
  assert.equal(B.bpmDelBrano(b('// @brano x\n// @bpm 100\nsetcpm(140/4)\n// @sezione a\ns("bd")')), 140);
  assert.equal(B.bpmDelBrano(b('// @brano x\n// @bpm 100\n// @sezione a\ns("bd")')), 100);
  assert.equal(B.bpmDelBrano(b('setcpm(35)\n// @sezione a\ns("bd")')), 140); // 35 cicli al minuto = 140 BPM
  assert.equal(B.bpmDelBrano(b('// @sezione a\ns("bd")')), null);
});

test('senzaTempo toglie solo le righe che cambiano il tempo', () => {
  assert.equal(B.senzaTempo('setcpm(140/4)\ns("bd")\n  setcps(.5);\nnote("c")'), 's("bd")\nnote("c")');
  assert.equal(B.senzaTempo('s("bd").fast(2)'), 's("bd").fast(2)');
  assert.equal(B.senzaTempo('x = 1 // setcpm(100)'), 'x = 1 // setcpm(100)');
});

test('una sezione audio si riconosce da begin/end', () => {
  assert.equal(B.eSezioneAudio('s("x1_loop").begin(0.1).end(0.5).slow(4)'), true);
  assert.equal(B.eSezioneAudio('s("bd*4")'), false);
});
