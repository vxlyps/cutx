import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { interpretaJson, leggiJson, mettiDaParte, scriviSicuro } from '../src/main/scrivi-sicuro.js';

const cartella = () => mkdtemp(path.join(tmpdir(), 'cutx-scrivi-'));

test('scrive il file e non lascia provvisori in giro', async () => {
  const d = await cartella();
  try {
    const f = path.join(d, 'stash.json');
    await scriviSicuro(f, '{"a":1}');
    assert.equal(await readFile(f, 'utf8'), '{"a":1}');
    assert.deepEqual(await readdir(d), ['stash.json']);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('più salvataggi insieme sullo stesso file: vince l\'ultimo chiesto, mai un file misto', async () => {
  const d = await cartella();
  try {
    const f = path.join(d, 'preferenze.json');
    await Promise.all(Array.from({ length: 30 }, (_, i) => scriviSicuro(f, JSON.stringify({ n: i, pieno: 'x'.repeat(5000 * (i % 3)) }))));
    assert.equal(JSON.parse(await readFile(f, 'utf8')).n, 29);
    assert.deepEqual(await readdir(d), ['preferenze.json']);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('se la scrittura fallisce il file di prima resta intero e l\'errore si vede', async () => {
  const d = await cartella();
  try {
    const f = path.join(d, 'brano.cutx');
    await writeFile(f, 'quello di prima');
    await assert.rejects(scriviSicuro(path.join(d, 'non-esiste', 'brano.cutx'), 'nuovo'));
    await assert.rejects(scriviSicuro(f, { non: 'testo' }));
    assert.equal(await readFile(f, 'utf8'), 'quello di prima');
    assert.deepEqual(await readdir(d), ['brano.cutx']);
    await scriviSicuro(f, 'dopo un errore si scrive ancora');
    assert.equal(await readFile(f, 'utf8'), 'dopo un errore si scrive ancora');
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('un file JSON: si legge, manca, o è rovinato (tre casi distinti)', async () => {
  const d = await cartella();
  try {
    const f = path.join(d, 'stash.json');
    assert.deepEqual(await leggiJson(f), { manca: true });
    await writeFile(f, '{"uscite":{"live":"MiniFuse"}}');
    assert.deepEqual(await leggiJson(f), { dati: { uscite: { live: 'MiniFuse' } } });
    await writeFile(f, '{"uscite":{"live":"Mini'); // troncato a metà scrittura
    assert.deepEqual(await leggiJson(f), { illeggibile: true });
    await writeFile(f, '');
    assert.deepEqual(await leggiJson(f), { illeggibile: true });
    await writeFile(f, '[1,2]');
    assert.deepEqual(await leggiJson(f), { illeggibile: true });
    assert.deepEqual(interpretaJson(() => { throw Object.assign(new Error('x'), { code: 'EIO' }); }), { illeggibile: true });
    // un file rovinato si mette da parte prima di scriverci sopra
    await writeFile(f, 'rovinato');
    assert.equal(await mettiDaParte(f), true);
    assert.equal(await readFile(`${f}.illeggibile`, 'utf8'), 'rovinato');
    assert.equal(await mettiDaParte(path.join(d, 'non-c-e.json')), false);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
