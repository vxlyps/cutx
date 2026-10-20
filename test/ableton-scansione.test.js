import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { consentito, trovaProgetti } from '../src/ableton/scansione.js';

async function struttura(file) {
  const radice = await mkdtemp(path.join(tmpdir(), 'cutx-als-'));
  for (const f of file) {
    await mkdir(path.dirname(path.join(radice, f)), { recursive: true });
    await writeFile(path.join(radice, f), 'x');
  }
  return radice;
}

test('trova i .als, ignora Backup, Samples, i file nascosti e gli altri formati', async () => {
  const r = await struttura([
    'x1 Project/x1.als',
    'x1 Project/Backup/x1 [2026-01-01].als',
    'x1 Project/Samples/Recorded/a.als',
    'x1 Project/.nascosto.als',
    'x1 Project/note.txt',
    'altro/Mayia.ALS',
    'a/b/c/d/troppo profondo.als',
  ]);
  try {
    const p = await trovaProgetti([r]);
    assert.deepEqual(p.map((x) => x.nome).sort(), ['Mayia', 'x1']);
    assert.equal(p.find((x) => x.nome === 'x1').cartella, path.join(r, 'x1 Project'));
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('una cartella scelta può essere il progetto stesso; le cartelle sparite non rompono niente', async () => {
  const r = await struttura(['Prog/a.als', 'Prog/b.als']);
  try {
    const p = await trovaProgetti([path.join(r, 'Prog'), path.join(r, 'non-esiste'), path.join(r, 'Prog')]);
    assert.deepEqual(p.map((x) => x.nome).sort(), ['a', 'b']); // anche scelta due volte, ogni progetto una volta
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('consentito: solo .als dentro le cartelle scelte', () => {
  assert.equal(consentito('/a/b/x.als', ['/a']), true);
  assert.equal(consentito('/a/b/x.txt', ['/a']), false);
  assert.equal(consentito('/altra/x.als', ['/a']), false);
  assert.equal(consentito('/a/../etc/x.als', ['/a']), false);
  assert.equal(consentito('/ab/x.als', ['/a']), false);
});
