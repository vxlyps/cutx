// Quali clip si riaprono nel SYNTH o nel DRUM: con la riga sempre, scritte a mano solo se il pannello le riscrive uguali.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tipoApribile } from '../src/renderer/apri-tipo.js';

const GRIGLIA = 'stack(\n  s("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").gain("1 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")\n)';

test('vuote e strane non si riaprono', () => {
  for (const t of ['', '   ', 'ciao', null, undefined]) assert.equal(tipoApribile(t), null, String(t));
});

test('con la riga: drum e synth', () => {
  assert.equal(tipoApribile('// @drum\nstack(s("bd"))'), 'drum');
  assert.equal(tipoApribile('// @synth {"forma":"triangle"}\nnote("c3")'), 'synth');
});

test('scritta a mano: un suono da synth si riapre', () => {
  assert.equal(tipoApribile('note("c2 e2 g2").s("sawtooth").lpf(400).room(.3)'), 'mano');
  assert.equal(tipoApribile('note("c2 e2")\n  .s("sawtooth")\n  .gain(.5)'), 'mano');
});

test('scritta a mano: il commento in testa il pannello lo tiene', () => {
  assert.equal(tipoApribile('// basso\nnote("c2 e2").s("sawtooth")'), 'mano');
});

test('scritta a mano: una griglia da batteria si riapre come drum', () => {
  assert.equal(tipoApribile(GRIGLIA), 'drum');
});

test('scritta a mano: quello che il pannello cambierebbe NON si riapre', () => {
  assert.equal(tipoApribile('s("bd*4").gain(.5)'), null); // diventerebbe un triangle
  assert.equal(tipoApribile('stack(s("bd ~ sd ~"), s("hh*8"))'), null); // nessuna riga si legge come griglia
  assert.equal(tipoApribile('$: s("bd").euclid(3,8)'), null);
});
