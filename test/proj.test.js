import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, utimes, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nomeCartella, cartella, elenca, migra, crea, pulisciSottotitolo, rinomina, rigaVieneDa, conVieneDa, copiaBrano } from '../src/main/proj.js';

async function stash() {
  return mkdtemp(path.join(tmpdir(), 'cutx-proj-'));
}

test('nomeCartella formatta il numero e rifiuta valori non validi', () => {
  assert.equal(nomeCartella(1), 'PROJ 01');
  assert.equal(nomeCartella(12), 'PROJ 12');
  assert.equal(nomeCartella(123), 'PROJ 123');
  for (const numero of [0, -1, 1.5, '1', NaN]) assert.throws(() => nomeCartella(numero), { message: 'PROJ non valido' });
});

test('migra copia libreria, set e kit, conserva mtime e lascia i file originali', async () => {
  const r = await stash();
  try {
    await mkdir(path.join(r, 'libreria', 'stem'), { recursive: true });
    for (const [rel, contenuto] of [['libreria/a.cutx', 'a'], ['libreria/stem/x.wav', 'x'], ['set.cutx', 'set'], ['kit.cutx', 'kit'], ['colpi.cutx', 'colpi']]) {
      await writeFile(path.join(r, rel), contenuto);
      await utimes(path.join(r, rel), new Date(1000000000000), new Date(1000000000000));
    }
    const prima = {};
    for (const rel of ['libreria/a.cutx', 'libreria/stem/x.wav', 'set.cutx', 'kit.cutx', 'colpi.cutx']) prima[rel] = await stat(path.join(r, rel));
    assert.deepEqual(await migra(r), { fatto: true, numero: 1 });
    const dest = path.join(r, 'PROJ', 'PROJ 01');
    for (const rel of ['libreria/a.cutx', 'libreria/stem/x.wav', 'set.cutx', 'kit.cutx']) {
      assert.equal(await readFile(path.join(dest, rel), 'utf8'), await readFile(path.join(r, rel), 'utf8'));
      assert.equal((await stat(path.join(dest, rel))).mtimeMs, prima[rel].mtimeMs);
      assert.equal((await stat(path.join(r, rel))).mtimeMs, prima[rel].mtimeMs);
    }
    await assert.rejects(() => stat(path.join(dest, 'colpi.cutx')));
    assert.deepEqual((await readdir(path.join(r, 'PROJ'))).filter((n) => n.startsWith('.tmp-')), []);
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('migra non ripete una migrazione già fatta', async () => {
  const r = await stash();
  try {
    await mkdir(path.join(r, 'libreria'));
    await writeFile(path.join(r, 'libreria', 'a.cutx'), 'a');
    await migra(r);
    const prima = await readFile(path.join(r, 'PROJ', 'PROJ 01', 'proj.json'), 'utf8');
    assert.deepEqual(await migra(r), { fatto: false });
    assert.equal(await readFile(path.join(r, 'PROJ', 'PROJ 01', 'proj.json'), 'utf8'), prima);
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('migra uno stash vuoto senza creare PROJ', async () => {
  const r = await stash();
  try {
    assert.deepEqual(await migra(r), { fatto: false, vuoto: true });
    await assert.rejects(() => stat(path.join(r, 'PROJ')));
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('migra elimina le cartelle temporanee interrotte', async () => {
  const r = await stash();
  try {
    await mkdir(path.join(r, 'PROJ', '.tmp-xyz'), { recursive: true });
    await mkdir(path.join(r, 'libreria'));
    await writeFile(path.join(r, 'libreria', 'a.cutx'), 'a');
    assert.deepEqual(await migra(r), { fatto: true, numero: 1 });
    assert.deepEqual((await readdir(path.join(r, 'PROJ'))).filter((n) => n.startsWith('.tmp-')), []);
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('elenca legge i progetti, conta i brani e ignora nomi estranei e json rotto', async () => {
  const r = await stash();
  try {
    const p = path.join(r, 'PROJ');
    await mkdir(path.join(p, 'PROJ 02', 'libreria'), { recursive: true });
    await mkdir(path.join(p, 'PROJ 01', 'libreria'), { recursive: true });
    await mkdir(path.join(p, '.PROJ 03'), { recursive: true });
    await mkdir(path.join(p, 'PROJ altro'), { recursive: true });
    await writeFile(path.join(p, 'PROJ 02', 'proj.json'), JSON.stringify({ numero: 99, sottotitolo: 'notte', creato: 'oggi', vieneDa: 1 }));
    await writeFile(path.join(p, 'PROJ 02', 'libreria', 'a.cutx'), 'a');
    await writeFile(path.join(p, 'PROJ 02', 'libreria', '.nascosto.cutx'), 'x');
    await writeFile(path.join(p, 'PROJ 02', 'set.cutx'), 'set');
    await writeFile(path.join(p, 'PROJ 01', 'proj.json'), '{rotto');
    const mtime = (await stat(path.join(p, 'PROJ 02', 'set.cutx'))).mtimeMs;
    const out = await elenca(r);
    assert.deepEqual(out.map((x) => x.numero), [1, 2]);
    assert.equal(out[0].sottotitolo, '');
    assert.equal(out[0].creato, null);
    assert.equal(out[1].sottotitolo, 'notte');
    assert.equal(out[1].brani, 1);
    assert.equal(out[1].modificato, mtime);
    assert.equal(cartella(r, 2), path.join(p, 'PROJ 02'));
    assert.equal(cartella(r, 3), null);
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('crea il numero seguente e copia il kit dal progetto richiesto', async () => {
  const r = await stash();
  try {
    const primo = await crea(r, { sottotitolo: '  notte\t lunga\nqui  ' });
    assert.equal(primo.numero, 1);
    assert.equal(primo.sottotitolo, 'notte  lunga qui');
    await writeFile(path.join(primo.cartella, 'kit.cutx'), 'clip');
    const secondo = await crea(r, { sottotitolo: 'a'.repeat(65), kitDa: 1 });
    assert.equal(secondo.numero, 2);
    assert.equal(secondo.sottotitolo.length, 60);
    assert.equal(secondo.vieneDa, 1);
    assert.equal(await readFile(path.join(secondo.cartella, 'kit.cutx'), 'utf8'), 'clip');
    assert.equal(pulisciSottotitolo(null), '');
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('rinomina aggiorna il sottotitolo e conserva i campi; segnala PROJ mancante', async () => {
  const r = await stash();
  try {
    const p = await crea(r, { sottotitolo: 'prima' });
    const json = path.join(p.cartella, 'proj.json');
    const dati = JSON.parse(await readFile(json, 'utf8'));
    dati.extra = 'conservato';
    await writeFile(json, JSON.stringify(dati));
    const aggiornato = await rinomina(r, 1, 'dopo');
    assert.equal(aggiornato.sottotitolo, 'dopo');
    assert.equal(JSON.parse(await readFile(json, 'utf8')).extra, 'conservato');
    await assert.rejects(() => rinomina(r, 2, 'x'), { message: 'PROJ non trovato' });
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});

test('conVieneDa inserisce dopo la testa o all’inizio e non duplica la riga', () => {
  const riga = rigaVieneDa(1, 'notte');
  assert.equal(riga, '// viene da PROJ 01 · notte');
  assert.equal(conVieneDa('// @brano x\n// @bpm 90\nplay', 1, 'notte'), `// @brano x\n// @bpm 90\n${riga}\nplay`);
  assert.equal(conVieneDa('play', 1, 'notte'), `${riga}\nplay`);
  assert.equal(conVieneDa(`${riga}\nplay`, 1, 'notte'), `${riga}\nplay`);
});

test('copiaBrano aggiunge la provenienza, evita sovrascrittura e rifiuta nomi e progetti non validi', async () => {
  const r = await stash();
  try {
    const origine = await crea(r);
    const destinazione = await crea(r);
    await writeFile(path.join(origine.cartella, 'libreria', 'originale.cutx'), '// @brano La notte\nplay');
    const prima = await copiaBrano(r, 1, 2, 'originale.cutx');
    assert.deepEqual(prima, { file: 'originale.cutx' });
    assert.match(await readFile(path.join(destinazione.cartella, 'libreria', prima.file), 'utf8'), /\/\/ viene da PROJ 01 · La notte/);
    await writeFile(path.join(destinazione.cartella, 'libreria', 'originale.cutx'), 'gia qui');
    assert.deepEqual(await copiaBrano(r, 1, 2, 'originale.cutx'), { file: 'originale-2.cutx' });
    await assert.rejects(() => copiaBrano(r, 1, 2, '../originale.cutx'), { message: 'nome non valido' });
    await assert.rejects(() => copiaBrano(r, 1, 1, 'originale.cutx'), { message: 'stesso PROJ' });
  } finally {
    await rm(r, { recursive: true, force: true });
  }
});
