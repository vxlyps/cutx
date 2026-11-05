// Il comando analizza-prova da capo a fondo, con un video finto (ffmpeg) che ha due lampi ambra: a 3 s e a 7 s.
// Si salta da solo se ffmpeg non c'è.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;
const haFfmpeg = !spawnSync('ffmpeg', ['-version'], { env: { ...process.env, PATH } }).error;

test('analizza-prova: allinea col lampo, trova i momenti, mette voce e fotogrammi', { skip: !haFfmpeg && 'manca ffmpeg' }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cutx-analizza-'));
  const video = path.join(dir, 'prova.mp4');
  const f = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x101010:s=640x360:d=30:r=15', '-vf', "drawbox=x=0:y=0:w=640:h=360:color=0xe0a03a@1:t=24:enable='between(t,3,3.5)+between(t,7,7.5)'", '-pix_fmt', 'yuv420p', video], { env: { ...process.env, PATH } });
  assert.equal(f.status, 0, String(f.stderr));
  // il registro: il video comincia 7 s dopo T0 (il lampo a 3 s del video è il SEGNO a 10 s del registro)
  const T0 = Date.UTC(2026, 10, 5, 20, 0, 0);
  const ev = (s, fonte, tipo, dati = null) => JSON.stringify({ t: T0 + s * 1000, ora: '', fonte, tipo, dati });
  const registro = path.join(dir, '2026-11-05_21-00-00.jsonl');
  writeFileSync(registro, [ev(0, 'main', 'inizio'), ev(10, 'app', 'segno', { n: 1 }), ev(14, 'app', 'segno', { n: 2 }), ev(25, 'log', 'errore', { fonte: 'live', messaggio: 'brutto errore\ndettagli' })].join('\n'));
  writeFileSync(path.join(dir, 'prova.srt'), '1\n00:00:05,000 --> 00:00:06,500\nvorrei un tasto per questo\n\n2\n00:00:18,000 --> 00:00:19,500\nma non funziona\n\n');
  const r = spawnSync('node', [path.resolve('strumenti/analizza-prova.mjs'), registro, video, '--senza-aprire'], { env: { ...process.env, PATH }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stderr, /lampi trovati: 2/);
  const md = readFileSync(path.join(dir, 'analisi-2026-11-05_21-00-00', 'rapporto.md'), 'utf8');
  assert.match(md, /col lampo del primo SEGNO/);
  assert.match(md, /## Difetti \(1\)/);
  assert.match(md, /## Idee \(1\)/); // i due SEGNO e «vorrei un tasto»
  assert.match(md, /errore \(live\): brutto errore/);
  assert.match(md, /> ma non funziona/);
  assert.match(md, /> vorrei un tasto per questo/);
  assert.match(md, /video 00:18/); // l'errore a 25 s del registro è al secondo 18 del video
  assert.ok(existsSync(path.join(dir, 'analisi-2026-11-05_21-00-00', 'frames', '001-a.jpg')));
  assert.ok(existsSync(path.join(dir, 'analisi-2026-11-05_21-00-00', 'rapporto.html')));
});

test('analizza-prova: senza lampi e senza --sposta lo dice e fa il rapporto solo dal registro', { skip: !haFfmpeg && 'manca ffmpeg' }, () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cutx-analizza-'));
  const video = path.join(dir, 'buio.mp4');
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x101010:s=320x180:d=6:r=15', '-pix_fmt', 'yuv420p', video], { env: { ...process.env, PATH } });
  const registro = path.join(dir, 'r.jsonl');
  writeFileSync(registro, `${JSON.stringify({ t: 1000, fonte: 'app', tipo: 'segno', dati: { n: 1 } })}\n`);
  const r = spawnSync('node', [path.resolve('strumenti/analizza-prova.mjs'), registro, video, '--senza-voce', '--senza-aprire'], { env: { ...process.env, PATH }, encoding: 'utf8' });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /nessun lampo ambra nel video/);
  assert.match(readFileSync(path.join(dir, 'analisi-r', 'rapporto.md'), 'utf8'), /senza allineamento/);
  const s = spawnSync('node', [path.resolve('strumenti/analizza-prova.mjs'), registro, video, '--senza-voce', '--senza-aprire', '--sposta', '2'], { env: { ...process.env, PATH }, encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  assert.match(s.stderr, /a mano: il primo SEGNO è al secondo 2/);
});
