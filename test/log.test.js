import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as log from '../src/main/log.js';

test('il registro scrive una riga per evento, con data, livello e chi parla', async () => {
  const d = await mkdtemp(path.join(tmpdir(), 'cutx-log-'));
  try {
    log.inizia(path.join(d, 'sotto', 'cartella'));
    log.scrivi('errore', 'live', 'processo terminato (crashed)');
    log.scrivi('avviso', 'uscite', 'riga uno\nriga due\n');
    const testo = await readFile(log.fileDelLog(), 'utf8');
    const righe = testo.trimEnd().split('\n');
    assert.match(righe[0], /^\d{4}-\d\d-\d\dT[\d:.]+Z \[errore\] \[live\] processo terminato \(crashed\)$/);
    assert.match(righe[1], /\[avviso\] \[uscite\] riga uno$/);
    assert.equal(righe[2], '    riga due', 'un messaggio su più righe resta leggibile');
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('oltre 2 MB passa a cutx.1.log e si ricomincia, senza perdere niente', async () => {
  const d = await mkdtemp(path.join(tmpdir(), 'cutx-log-'));
  try {
    log.inizia(d);
    await writeFile(log.fileDelLog(), 'x'.repeat(2 * 1024 * 1024 + 10));
    log.scrivi('info', 'main', 'nuova riga');
    assert.deepEqual((await readdir(d)).sort(), ['cutx.1.log', 'cutx.log']);
    assert.match(await readFile(log.fileDelLog(), 'utf8'), /nuova riga/);
    assert.equal((await readFile(path.join(d, 'cutx.1.log'), 'utf8')).length, 2 * 1024 * 1024 + 10);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

test('senza cartella (o con una cartella impossibile) il registro non fa cadere niente', () => {
  log.inizia('/proc/non-si-puo/scrivere');
  assert.doesNotThrow(() => log.scrivi('errore', 'main', 'niente'));
});
