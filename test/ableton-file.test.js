import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { durataWav, fileScelto, percorsoAnteprima, risolviFile } from '../src/main/ableton.js';

function wav(secondi, frequenza = 8000) {
  const dati = Buffer.alloc(secondi * frequenza * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + dati.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(frequenza, 24);
  h.writeUInt32LE(frequenza * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(dati.length, 40);
  return Buffer.concat([h, dati]);
}

test('durata di un WAV dall\'intestazione; altri formati e file strani: null', async () => {
  const r = await mkdtemp(path.join(tmpdir(), 'cutx-wav-'));
  try {
    await writeFile(path.join(r, 'a.wav'), wav(3));
    await writeFile(path.join(r, 'b.wav'), 'non un wav');
    await writeFile(path.join(r, 'c.mp3'), 'x');
    assert.equal(await durataWav(path.join(r, 'a.wav')), 3);
    assert.equal(await durataWav(path.join(r, 'b.wav')), null);
    assert.equal(await durataWav(path.join(r, 'c.mp3')), null);
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('risolviFile: il percorso relativo parte dalla cartella del progetto, poi si prova l\'assoluto; i mancanti sono null', async () => {
  const r = await mkdtemp(path.join(tmpdir(), 'cutx-file-'));
  try {
    await mkdir(path.join(r, 'Prog', 'Samples'), { recursive: true });
    await mkdir(path.join(r, 'Altrove'), { recursive: true });
    await writeFile(path.join(r, 'Prog', 'Samples', 'a.wav'), wav(1));
    await writeFile(path.join(r, 'Altrove', 'b.wav'), wav(1));
    await writeFile(path.join(r, 'Prog', 'note.txt'), 'x');
    const out = await risolviFile(path.join(r, 'Prog'), [
      { relativo: 'Samples/a.wav', assoluto: '' },
      { relativo: '../Nonesiste/z.wav', assoluto: path.join(r, 'Altrove', 'b.wav') },
      { relativo: 'Samples/manca.wav', assoluto: '/non/esiste.wav' },
      { relativo: 'note.txt', assoluto: '' }, // esiste ma non è audio
    ]);
    assert.equal(out[0].percorso, path.join(r, 'Prog', 'Samples', 'a.wav'));
    assert.equal(out[1].percorso, path.join(r, 'Altrove', 'b.wav'));
    assert.equal(out[2].percorso, null);
    assert.equal(out[3].percorso, null);
    assert.equal(percorsoAnteprima(out[0].id), out[0].percorso); // cutx://app/anteprima/<id> lo serve
    assert.equal(percorsoAnteprima('inventato'), null);
    // lo stesso file ha sempre lo stesso id
    assert.equal((await risolviFile(path.join(r, 'Prog'), [{ relativo: 'Samples/a.wav', assoluto: '' }]))[0].id, out[0].id);
    // un file scelto a mano: solo audio
    assert.ok((await fileScelto(path.join(r, 'Altrove', 'b.wav'))).id);
    assert.ok((await fileScelto(path.join(r, 'Prog', 'note.txt'))).errore);
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('copiaSuoni: una cartella per file nello stash, solo file trovati da noi, mancanti e non leggibili segnalati', async () => {
  const { copiaSuoni } = await import('../src/main/ableton.js');
  const r = await mkdtemp(path.join(tmpdir(), 'cutx-copia-'));
  try {
    await mkdir(path.join(r, 'Prog', 'Samples'), { recursive: true });
    await mkdir(path.join(r, 'stash'), { recursive: true });
    await writeFile(path.join(r, 'Prog', 'Samples', 'a b.wav'), wav(1));
    await writeFile(path.join(r, 'Prog', 'Samples', 'c.aif'), 'aiff');
    await writeFile(path.join(r, 'segreto.wav'), wav(1));
    const trovati = await risolviFile(path.join(r, 'Prog'), [{ relativo: 'Samples/a b.wav', assoluto: '' }, { relativo: 'Samples/c.aif', assoluto: '' }]);
    const out = await copiaSuoni(path.join(r, 'stash'), [
      { nome: 'x_01_a_b', percorso: trovati[0].percorso },
      { nome: 'x_02_c', percorso: trovati[1].percorso },
      { nome: 'x_03_manca', percorso: null },
      { nome: 'x_04_estraneo', percorso: path.join(r, 'segreto.wav') }, // mai registrato: non si copia
    ]);
    assert.deepEqual(out.copiati, ['x_01_a_b']);
    assert.deepEqual(out.nonSupportati, ['x_02_c']);
    assert.deepEqual(out.mancanti, ['x_03_manca', 'x_04_estraneo']);
    assert.equal((await readFile(path.join(r, 'stash', 'suoni', 'x_01_a_b', 'a b.wav'))).length, wav(1).length);
    await assert.rejects(() => copiaSuoni(path.join(r, 'stash'), [{ nome: '../fuori', percorso: null }]));
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('ritagliaWav: un WAV vero con solo i secondi chiesti, dati identici a quelli dell\'originale', async () => {
  const { ritagliaWav } = await import('../src/main/ableton.js');
  const r = await mkdtemp(path.join(tmpdir(), 'cutx-ritaglio-'));
  try {
    // 10 secondi a 8 kHz, 16 bit, mono: ogni campione ha un valore che dice dov'è
    const frequenza = 8000;
    const dati = Buffer.alloc(10 * frequenza * 2);
    for (let i = 0; i < 10 * frequenza; i++) dati.writeInt16LE(i % 30000, i * 2);
    const originale = wav(10, frequenza);
    dati.copy(originale, 44);
    await writeFile(path.join(r, 'a.wav'), originale);
    const durata = await ritagliaWav(path.join(r, 'a.wav'), path.join(r, 'b.wav'), 2.5, 4);
    assert.equal(durata, 1.5);
    assert.equal(await durataWav(path.join(r, 'b.wav')), 1.5);
    const b = await readFile(path.join(r, 'b.wav'));
    assert.equal(b.length, 44 + 1.5 * frequenza * 2);
    assert.ok(b.subarray(44).equals(originale.subarray(44 + 2.5 * frequenza * 2, 44 + 4 * frequenza * 2)));
    // oltre la fine: si tiene fino alla fine; da dopo la fine: un file vuoto ma valido
    assert.equal(await ritagliaWav(path.join(r, 'a.wav'), path.join(r, 'c.wav'), 9, 20), 1);
    assert.equal(await ritagliaWav(path.join(r, 'a.wav'), path.join(r, 'd.wav'), 20, 30), 0);
    assert.equal(await durataWav(path.join(r, 'd.wav')), 0);
    await writeFile(path.join(r, 'x.wav'), 'non un wav');
    await assert.rejects(() => ritagliaWav(path.join(r, 'x.wav'), path.join(r, 'y.wav'), 0, 1));
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('copiaSuoni ritaglia i WAV quando glielo si chiede, e dice quanto ha risparmiato', async () => {
  const { copiaSuoni } = await import('../src/main/ableton.js');
  const r = await mkdtemp(path.join(tmpdir(), 'cutx-copia2-'));
  try {
    await mkdir(path.join(r, 'Prog'), { recursive: true });
    await mkdir(path.join(r, 'stash'), { recursive: true });
    await writeFile(path.join(r, 'Prog', 'lungo.wav'), wav(10));
    const [t] = await risolviFile(path.join(r, 'Prog'), [{ relativo: 'lungo.wav', assoluto: '' }]);
    assert.equal(t.wav, true);
    assert.equal(t.dimensione, wav(10).length);
    const out = await copiaSuoni(path.join(r, 'stash'), [{ nome: 'x_01_lungo', percorso: t.percorso, ritaglio: { da: 1, a: 3 } }]);
    assert.deepEqual(out.copiati, ['x_01_lungo']);
    assert.equal(out.ritagliati[0].prima, wav(10).length);
    assert.equal(out.ritagliati[0].dopo, 44 + 2 * 8000 * 2);
    assert.equal(await durataWav(path.join(r, 'stash', 'suoni', 'x_01_lungo', 'lungo.wav')), 2);
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});
