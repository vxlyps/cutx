import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Nano, leggiNano } from '../src/renderer/nano.js';

test('nano: fader, manopole, S, M, R e PLAY (su qualsiasi canale MIDI)', () => {
  assert.deepEqual(leggiNano([0xb0, 2, 127]), { tipo: 'fader', ch: 2, v: 1 });
  assert.deepEqual(leggiNano([0xbf, 7, 0]), { tipo: 'fader', ch: 7, v: 0 });
  assert.deepEqual(leggiNano([0xb0, 16, 127]), { tipo: 'manopola', ch: 0, pos: 1 });
  assert.deepEqual(leggiNano([0xb0, 39, 127]), { tipo: 'out', ch: 7, giu: true });
  assert.deepEqual(leggiNano([0xb0, 48, 0]), { tipo: 'mute', ch: 0, giu: false });
  assert.deepEqual(leggiNano([0xb0, 66, 127]), { tipo: 'go', ch: 2, giu: true });
  assert.deepEqual(leggiNano([0xb0, 41, 127]), { tipo: 'goAll', giu: true });
  assert.equal(leggiNano([0x90, 60, 100]), null); // una nota non è roba del nano
  assert.equal(leggiNano([0xb0, 99, 1]), null);
});

test('nano: OUT breve = out, OUT tenuto = out subito; R/M/PLAY solo alla pressione', async () => {
  const visti = [];
  const n = new Nano({ fader: () => {}, manopola: () => {}, go: (c) => visti.push(`go${c}`), out: (c) => visti.push(`out${c}`), outSubito: (c) => visti.push(`subito${c}`), mute: (c) => visti.push(`mute${c}`), goAll: () => visti.push('all') });
  n.riceve([0xb0, 64, 127]); n.riceve([0xb0, 64, 0]); // R1: premuto e rilasciato = un solo GO
  n.riceve([0xb0, 49, 127]); n.riceve([0xb0, 49, 0]);
  n.riceve([0xb0, 41, 127]); n.riceve([0xb0, 41, 0]);
  n.riceve([0xb0, 33, 127]); n.riceve([0xb0, 33, 0]); // S2 breve
  assert.deepEqual(visti, ['go0', 'mute1', 'all', 'out1']);
  visti.length = 0;
  n.riceve([0xb0, 34, 127]);
  await new Promise((r) => setTimeout(r, 1100));
  n.riceve([0xb0, 34, 0]); // S3 tenuto: esce subito, e il rilascio non fa altro
  assert.deepEqual(visti, ['subito2']);
});
