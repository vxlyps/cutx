import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiAls } from '../src/ableton/leggi.js';
import { als, clipAudio, clipMidi, drumRack, note, tracciaAudio, tracciaMidi } from './als-finto.js';

test('il tempo si legge da MainTrack (Live 12) e da MasterTrack (versioni vecchie)', () => {
  assert.equal(leggiAls(als({ bpm: 140 })).bpm, 140);
  assert.equal(leggiAls(als({ bpm: 96.5, principale: 'MasterTrack' })).bpm, 96.5);
});

test('un file che non è un progetto Ableton dà un errore chiaro', () => {
  assert.throws(() => leggiAls(Buffer.from('non gzip')));
  assert.throws(() => leggiAls(als({ tracce: [] }).subarray(0, 0)));
});

test('traccia MIDI: note dentro la zona di loop, relative all\'inizio del loop, senza quelle spente', () => {
  const clip = clipMidi({
    inizio: 16,
    loop: [4, 8],
    note: [note(4, 1, 60), note(5.5, 0.5, 64), note(7, 1, 67), note(2, 1, 50), note(9, 1, 72), { ...note(6, 1, 55), attiva: false }],
  });
  const m = leggiAls(als({ tracce: [tracciaMidi({ nome: '6-Dark Pad', clip: [clip] })] }));
  const t = m.tracce[0];
  assert.equal(t.tipo, 'midi');
  assert.equal(t.nome, '6-Dark Pad');
  assert.equal(t.numero, 6);
  assert.equal(t.strumento.tipo, 'Simpler');
  assert.equal(t.clip.length, 1);
  const c = t.clip[0];
  assert.equal(c.origine, 'arrangiamento');
  assert.equal(c.inizio, 16);
  assert.equal(c.lunghezza, 4);
  assert.deepEqual(c.note.map((n) => n.slice(0, 3)), [[0, 1, 60], [1.5, 0.5, 64], [3, 1, 67]]);
});

test('le clip della Session hanno la scena, quelle dell\'arrangiamento la posizione', () => {
  const m = leggiAls(als({ tracce: [tracciaMidi({ nome: 'Bass', clip: [clipMidi({ inizio: 8, note: [note(0, 1, 36)] })], sessione: [clipMidi({ note: [note(0, 1, 38)] }), null, clipMidi({ note: [note(0, 1, 40)] })] })] }));
  const clip = m.tracce[0].clip;
  assert.equal(clip.length, 3);
  assert.deepEqual(clip.filter((c) => c.origine === 'sessione').map((c) => c.scena), [0, 2]);
  assert.equal(clip.find((c) => c.origine === 'arrangiamento').inizio, 8);
});

test('Drum Rack: la nota di ricezione dei pad è salvata al contrario (128 − nota)', () => {
  const rack = drumRack([{ nome: 'Kick', ricezione: 92 }, { nome: 'Snare', ricezione: 88 }, { nome: 'Hat', ricezione: 82 }]);
  const m = leggiAls(als({ tracce: [tracciaMidi({ nome: '5-Kit', strumento: rack, clip: [clipMidi({ note: [note(0, 0.25, 36)] })] })] }));
  const t = m.tracce[0];
  assert.equal(t.drum, true);
  assert.equal(t.strumento.tipo, 'Drum Rack');
  assert.deepEqual(t.pad, [{ nome: 'Kick', nota: 36 }, { nome: 'Snare', nota: 40 }, { nome: 'Hat', nota: 46 }]);
});

test('traccia audio: file, durata, loop e marcatori di warp', () => {
  const clip = clipAudio({ inizio: 32, fine: 40, loop: [0, 8], file: 'Samples/Imported/break.wav', assoluto: '/Users/x/break.wav', marcatori: [[0, 0], [8, 4.5]], durata: 5.25, frequenza: 48000 });
  const m = leggiAls(als({ tracce: [tracciaAudio({ nome: '3-Audio', clip: [clip] })] }));
  const c = m.tracce[0].clip[0];
  assert.equal(c.tipo, 'audio');
  assert.equal(c.inizio, 32);
  assert.deepEqual(c.loop, { inizio: 0, fine: 8 });
  assert.equal(c.warp, true);
  assert.deepEqual(c.marcatori, [[0, 0], [8, 4.5]]);
  assert.deepEqual(c.file, { relativo: 'Samples/Imported/break.wav', assoluto: '/Users/x/break.wav', durata: 5.25 });
});

test('le tracce si ordinano per il numero nel nome, MIDI e audio insieme', () => {
  const m = leggiAls(als({ tracce: [tracciaAudio({ nome: '2-Audio' }), tracciaMidi({ nome: '1-Pad' }), tracciaAudio({ nome: '3-Audio' })] }));
  assert.deepEqual(m.tracce.map((t) => t.nome), ['1-Pad', '2-Audio', '3-Audio']);
});

test('lunghezza in battute dall\'ultima clip dell\'arrangiamento', () => {
  const m = leggiAls(als({ tracce: [tracciaMidi({ nome: 'A', clip: [clipMidi({ inizio: 28, loop: [0, 4], note: [note(0, 1, 60)] })] })] }));
  assert.equal(m.battute, 8);
});
