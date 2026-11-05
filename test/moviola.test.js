import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Moviola, nomeFile, ora, pulisci, riga } from '../src/main/moviola.js';

test('il nome del file è la data e l\'ora di inizio', () => {
  assert.equal(nomeFile(new Date(2026, 10, 5, 21, 4, 9)), '2026-11-05_21-04-09.jsonl');
});

test('l\'ora è locale e arriva al millisecondo', () => {
  assert.equal(ora(new Date(2026, 10, 5, 21, 4, 9, 318).getTime()), '21:04:09.318');
  assert.equal(ora(new Date(2026, 10, 5, 0, 0, 0, 7).getTime()), '00:00:00.007');
});

test('una riga è un JSON con t, ora, fonte, tipo e dati; il codice resta intero', () => {
  const t = new Date(2026, 10, 5, 21, 4, 9, 318).getTime();
  const codice = 's("bd*4")\n  .gain(.8)';
  const r = riga({ t, fonte: 'live', tipo: 'invio', dati: { tipo: 'entra', codice } });
  assert.ok(r.endsWith('\n') && !r.slice(0, -1).includes('\n'));
  const j = JSON.parse(r);
  assert.deepEqual([j.t, j.ora, j.fonte, j.tipo], [t, '21:04:09.318', 'live', 'invio']);
  assert.equal(j.dati.codice, codice);
});

test('un evento sbagliato non fa una riga; senza dati vale null; un testo enorme si taglia', () => {
  assert.equal(riga(null), null);
  assert.equal(riga({ fonte: 'x' }), null);
  assert.equal(riga({ tipo: 'x' }), null);
  assert.equal(JSON.parse(riga({ t: 1, fonte: 'a', tipo: 'b' })).dati, null);
  const enorme = JSON.parse(riga({ t: 1, fonte: 'a', tipo: 'b', dati: { codice: 'x'.repeat(300000) } }));
  assert.ok(enorme.dati.tagliato > 256 * 1024);
  const circolare = {};
  circolare.io = circolare;
  assert.equal(riga({ t: 1, fonte: 'a', tipo: 'b', dati: circolare }), null);
});

test('un pacchetto tiene solo gli eventi fatti bene e al massimo 500', () => {
  assert.deepEqual(pulisci('boh'), []);
  assert.equal(pulisci([{ fonte: 'a', tipo: 'b' }, null, { fonte: 'a' }, 3]).length, 1);
  assert.equal(pulisci(Array.from({ length: 900 }, () => ({ fonte: 'a', tipo: 'b' }))).length, 500);
});

test('la scatola nera scrive inizio, eventi, cpu al secondo e fine; spenta non scrive niente', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cutx-moviola-'));
  const m = new Moviola({ cartella: path.join(dir, 'prove'), cpu: () => ({ live: 12.5 }) });
  m.evento('x', 'prima', {}); // spenta
  assert.equal(m.accesa, false);
  const file = m.avvia({ app: 'prova' });
  assert.equal(m.accesa, true);
  assert.equal(m.avvia(), file); // già accesa: stesso file
  m.evento('controller', 'midi', { bytes: [144, 20, 127] }, 1000.5);
  m.eventi([{ t: 2000, fonte: 'live', tipo: 'invio', dati: { codice: 'a' } }, { rotto: true }]);
  await new Promise((r) => setTimeout(r, 1200)); // un giro della cpu
  m.ferma();
  assert.equal(m.accesa, false);
  await new Promise((r) => setTimeout(r, 100));
  const righe = (await readFile(file, 'utf8')).trim().split('\n').map((x) => JSON.parse(x));
  const tipi = righe.map((r) => `${r.fonte}:${r.tipo}`);
  assert.equal(tipi[0], 'main:inizio');
  assert.ok(tipi.includes('controller:midi') && tipi.includes('live:invio') && tipi.includes('main:cpu'));
  assert.equal(tipi.at(-1), 'main:fine');
  assert.ok(!tipi.includes('x:prima'));
  assert.equal(righe.filter((r) => r.tipo === 'invio').length, 1);
  assert.deepEqual(righe.find((r) => r.tipo === 'cpu').dati, { live: 12.5 });
  assert.equal((await readdir(path.join(dir, 'prove'))).length, 1);
});

test('se la cartella non si può creare, la scatola nera resta spenta e l\'app va avanti', () => {
  const m = new Moviola({ cartella: '/proc/non-si-puo/prove' });
  assert.equal(m.avvia(), null);
  assert.equal(m.accesa, false);
  m.evento('a', 'b'); // non lancia
});
