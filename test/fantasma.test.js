import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allinea, parolaSuccessiva, resto, rigaSuccessiva } from '../src/renderer/fantasma.js';

const F = 'note("a3 ~ c4")\n  .s("sawtooth")\n  .gain(.3)';

test('quello che scrivo uguale al fantasma lo consuma, il resto rimane', () => {
  assert.equal(resto('', F), F);
  assert.equal(resto('note("a3', F), ' ~ c4")\n  .s("sawtooth")\n  .gain(.3)');
  assert.equal(resto(F, F), '');
});

test('l\'indentazione è mia: spazi e a capo diversi non rompono l\'allineamento', () => {
  assert.equal(resto('note("a3 ~ c4")\n.s("saw', F), 'tooth")\n  .gain(.3)');
  assert.equal(resto('note("a3 ~ c4")      .s(', F), '"sawtooth")\n  .gain(.3)');
});

test('un carattere diverso: il fantasma si riallinea poco più avanti; uno in più non lo sposta', () => {
  // scrivo c5 invece di c4: la «c» coincide, il «5» è in più, e il fantasma prosegue dopo la nota
  assert.ok(resto('note("a3 ~ c5', F).startsWith('4")') || resto('note("a3 ~ c5', F).startsWith('")'));
  // salto una parte: scrivo direttamente .gain: il fantasma salta a dopo «.gain»
  assert.equal(resto('note("a3 ~ c4").gain', F), '(.3)');
  // scrivo una cosa che nel fantasma non c'è affatto: il fantasma resta dov'era
  assert.equal(resto('note("a3 ~ c4")@', F), '.s("sawtooth")\n  .gain(.3)');
});

test('cancellare riporta il fantasma indietro (l\'allineamento si rifà da capo)', () => {
  assert.equal(resto('note("a3 ~ c4")\n  .s', F), '("sawtooth")\n  .gain(.3)');
  assert.equal(resto('note("a3 ~ c4")', F), '\n  .s("sawtooth")\n  .gain(.3)');
  assert.equal(allinea('', F), 0);
});

test('Tab: la parola successiva, con gli spazi che la precedono; Tab tenuto: la riga', () => {
  assert.equal(parolaSuccessiva('note("a3 ~ c4")'), 'note');
  assert.equal(parolaSuccessiva('("a3 ~ c4")'), '("');
  assert.equal(parolaSuccessiva(' ~ c4")'), ' ~');
  assert.equal(parolaSuccessiva('\n  .s("saw'), '\n  .');
  assert.equal(parolaSuccessiva(''), '');
  assert.equal(rigaSuccessiva(' ~ c4")\n  .s("sawtooth")'), ' ~ c4")');
  assert.equal(rigaSuccessiva('\n  .s("sawtooth")\n  .gain(.3)'), '\n  .s("sawtooth")', 'se riparte da un a capo: la riga dopo');
});

test('completando a Tab si arriva in fondo e il fantasma sparisce', () => {
  let scritto = '';
  for (let i = 0; i < 200 && resto(scritto, F); i++) scritto += parolaSuccessiva(resto(scritto, F));
  assert.equal(resto(scritto, F), '');
  assert.equal(scritto.replace(/\s+/g, ''), F.replace(/\s+/g, ''));
});
