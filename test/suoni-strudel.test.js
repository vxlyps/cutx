import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pianoFonte, verifica, FONTI, BASE_LOCALE } from '../src/main/suoni-strudel.js';

test('pianoFonte: array di file → percorsi relativi al CDN e mappa verso cutx://', () => {
  const { file, mappa } = pianoFonte({ _base: 'https://x/', bd: ['bd/a b.wav', 'bd/c.wav'] }, 'uzu-drumkit');
  assert.deepEqual(file, ['uzu-drumkit/bd/a b.wav', 'uzu-drumkit/bd/c.wav']);
  assert.equal(mappa._base, `${BASE_LOCALE}/uzu-drumkit/`);
  assert.deepEqual(mappa.bd, ['bd/a%20b.wav', 'bd/c.wav']);
});

test('pianoFonte: il piano (note → file) tiene la forma a oggetto', () => {
  const { file, mappa } = pianoFonte({ _base: 'x', piano: { A0: 'A0v8.mp3', C1: 'C1v8.mp3' } }, 'piano');
  assert.deepEqual(file, ['piano/A0v8.mp3', 'piano/C1v8.mp3']);
  assert.deepEqual(mappa.piano, { A0: 'A0v8.mp3', C1: 'C1v8.mp3' });
});

test('pianoFonte: la cartella con sottocartelle (tidal-drum-machines/machines) resta codificata a pezzi', () => {
  const { mappa } = pianoFonte({ x: ['a/b.wav'] }, 'tidal-drum-machines/machines');
  assert.equal(mappa._base, `${BASE_LOCALE}/tidal-drum-machines/machines/`);
});

test('le fonti hanno id unici e il dirt è incluso in locale', () => {
  assert.equal(new Set(FONTI.map((f) => f.id)).size, FONTI.length);
  assert.ok(FONTI.find((f) => f.id === 'dirt').locale);
});

test('verifica: assente, vuota, ok, incompleta', async () => {
  assert.equal((await verifica(null)).stato, 'assente');
  const d = await mkdtemp(path.join(os.tmpdir(), 'cutx-suoni-'));
  try {
    assert.equal((await verifica(path.join(d, 'non-c-e'))).stato, 'assente');
    assert.equal((await verifica(d)).stato, 'vuota');
    await mkdir(path.join(d, 'piano'));
    await writeFile(path.join(d, 'piano', 'a.mp3'), 'abc');
    await writeFile(path.join(d, 'elenco.json'), JSON.stringify({ versione: 1, file: { 'piano/a.mp3': 3 } }));
    assert.deepEqual(await verifica(d), { stato: 'ok', mancanti: 0, totale: 1 });
    await writeFile(path.join(d, 'piano', 'a.mp3'), 'ab'); // troncato
    assert.equal((await verifica(d)).stato, 'incompleta');
    await rm(path.join(d, 'piano', 'a.mp3'));
    assert.equal((await verifica(d)).mancanti, 1);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
