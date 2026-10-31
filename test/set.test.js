import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/renderer/set.js';

const TESTO = `// @set venerdì al locale

brano_1.cutx · apre
notte-canaglia
// un commento
mayia.cutx
test_jungle_1.cutx · chiude
`;

test('il set si legge: nome, brani in ordine, apre e chiude', () => {
  const s = S.leggiSet(TESTO);
  assert.equal(s.nome, 'venerdì al locale');
  assert.deepEqual(S.brani(s).map((b) => b.file), ['brano_1.cutx', 'notte-canaglia.cutx', 'mayia.cutx', 'test_jungle_1.cutx'], 'senza estensione si aggiunge .cutx');
  assert.deepEqual(S.brani(s).map((b) => [b.apre, b.chiude]), [[true, false], [false, false], [false, false], [false, true]]);
  assert.equal(S.primo(s), 'brano_1.cutx');
});

test('riscrivere il set dà esattamente il testo di partenza (commenti, righe vuote, nomi senza estensione)', () => {
  assert.equal(S.scriviSet(S.leggiSet(TESTO)), TESTO);
  assert.equal(S.scriviSet(S.leggiSet('')), '');
});

test('senza «apre» si parte dal primo brano; set vuoto: nessuno', () => {
  assert.equal(S.primo(S.leggiSet('a.cutx\nb.cutx')), 'a.cutx');
  assert.equal(S.primo(S.leggiSet('// @set niente\n')), null);
});

test('il prossimo e il precedente nell\'ordine del set, senza girare intorno', () => {
  const s = S.leggiSet(TESTO);
  assert.equal(S.dopo(s, 'brano_1.cutx'), 'notte-canaglia.cutx');
  assert.equal(S.dopo(s, 'test_jungle_1.cutx'), null);
  assert.equal(S.dopo(s, 'non-c-e.cutx'), null);
  assert.equal(S.vicino(s, 'mayia.cutx', -1), 'notte-canaglia.cutx');
  assert.equal(S.vicino(s, 'brano_1.cutx', -1), null);
  assert.equal(S.vicino(s, 'sconosciuto.cutx', 1), 'brano_1.cutx', 'da un brano fuori dal set: il primo');
  assert.equal(S.vicino(s, 'sconosciuto.cutx', -1), 'test_jungle_1.cutx', 'e all\'indietro l\'ultimo');
});

test('aggiungere, togliere e spostare brani non tocca commenti e intestazione', () => {
  let s = S.leggiSet(TESTO);
  s = S.aggiungi(s, 'alba');
  assert.equal(S.brani(s).at(-1).file, 'alba.cutx');
  assert.ok(S.scriviSet(s).startsWith('// @set venerdì al locale\n\nbrano_1.cutx · apre'));
  assert.equal(S.aggiungi(s, 'alba.cutx'), s, 'già nel set: niente doppioni');
  s = S.sposta(s, 4, 0);
  assert.deepEqual(S.brani(s).map((b) => b.file).slice(0, 2), ['alba.cutx', 'brano_1.cutx']);
  assert.match(S.scriviSet(s), /\/\/ un commento/);
  s = S.togli(s, 0);
  assert.equal(S.brani(s).length, 4);
  assert.equal(S.brani(s)[0].file, 'brano_1.cutx');
  assert.equal(S.scriviSet(S.leggiSet(S.scriviSet(s))), S.scriviSet(s));
});

test('segnare «apre» e «chiude»: uno solo per tipo, di nuovo lo toglie', () => {
  let s = S.leggiSet(TESTO);
  s = S.segna(s, 2, 'apre');
  assert.deepEqual(S.brani(s).map((b) => b.apre), [false, false, true, false]);
  assert.equal(S.primo(s), 'mayia.cutx');
  s = S.segna(s, 2, 'apre');
  assert.equal(S.primo(s), 'brano_1.cutx', 'senza «apre» si riparte dal primo');
  s = S.segna(s, 0, 'chiude');
  assert.deepEqual(S.brani(s).map((b) => b.chiude), [true, false, false, false]);
  assert.match(S.scriviSet(s), /brano_1\.cutx · chiude/);
});

test('un set nuovo ha il nome e si riempie', () => {
  let s = S.setVuoto('serata prova');
  s = S.aggiungi(S.aggiungi(s, 'a'), 'b');
  assert.equal(S.scriviSet(s), '// @set serata prova\n\na.cutx\nb.cutx\n');
});
