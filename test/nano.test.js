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

test('nano: R breve = premiR, R tenuto = tieniR; S = cuffia, M = mute, PLAY = GO ALL, solo alla pressione', async () => {
  const visti = [];
  const n = new Nano({ fader: () => {}, manopola: () => {}, premiR: (c) => visti.push(`R${c}`), tieniR: (c) => visti.push(`tieni${c}`), cuffia: (c) => visti.push(`S${c}`), mute: (c) => visti.push(`mute${c}`), goAll: () => visti.push('all') });
  n.riceve([0xb0, 64, 127]); n.riceve([0xb0, 64, 0]); // R1 breve
  n.riceve([0xb0, 49, 127]); n.riceve([0xb0, 49, 0]);
  n.riceve([0xb0, 41, 127]); n.riceve([0xb0, 41, 0]);
  n.riceve([0xb0, 33, 127]); n.riceve([0xb0, 33, 0]); // S2
  assert.deepEqual(visti, ['R0', 'mute1', 'all', 'S1']);
  visti.length = 0;
  n.riceve([0xb0, 66, 127]);
  await new Promise((r) => setTimeout(r, 1100));
  n.riceve([0xb0, 66, 0]); // R3 tenuto: esce subito, e il rilascio non fa altro
  assert.deepEqual(visti, ['tieni2']);
});

import { luciNano } from '../src/renderer/nano.js';
const riga = (i, r = 'spenta', s = 'spenta', m = 'spenta') => ({ indice: i, luci: { r, s, m } });

test('luci del nano: M acceso = muto; R fisso = suona; lampeggi lento/veloce dal tempo; PLAY se c\'è da lanciare', () => {
  const vista = [riga(0, 'accesa', 'spenta', 'accesa'), riga(1, 'lenta'), riga(2, 'veloce', 'veloce'), riga(3)];
  const a = luciNano(vista, 0); // inizio di ogni fase: acceso
  assert.equal(a.get(64), 127); // R1 suona
  assert.equal(a.get(48), 127); // M1 muto
  assert.equal(a.get(32), 0);
  assert.equal(a.get(65), 127); // R2 lenta: acceso nella prima metà
  assert.equal(a.get(66), 127);
  assert.equal(a.get(34), 127); // S3 sta per uscire (veloce)
  assert.equal(a.get(67), 0); // vuoto
  assert.equal(a.get(41), 127); // PLAY: R2 ha altro in NEXT
  const b = luciNano(vista, 250); // veloce già spento, lento ancora acceso
  assert.equal(b.get(66), 0);
  assert.equal(b.get(65), 127);
  const c = luciNano(vista, 750); // lento spento
  assert.equal(c.get(65), 0);
  assert.equal(c.get(64), 127); // il fisso non cambia mai
  assert.equal(luciNano([riga(0, 'accesa')], 0).get(41), 0);
});

test('luci del nano: un OUT armato lampeggia lento come un GO armato (e accende PLAY)', async () => {
  const { StatoCanali } = await import('../src/renderer/canali.js');
  const s = new StatoCanali();
  s.impostaBrano({ nome: 'uno', bpm: 170, beat: null, sezioni: [{ nome: 'sub', info: { bass: true } }] });
  s.scegliAlt(2, 1); s.go(2); s.scattato(2);
  assert.equal(luciNano(s.vista(), 0).get(66), 127);
  s.scegliAlt(2, 0); // OUT armato
  assert.equal(s.vista()[2].luci.r, 'lenta');
  assert.equal(luciNano(s.vista(), 0).get(66), 127);
  assert.equal(luciNano(s.vista(), 750).get(66), 0, 'lampeggia');
  assert.equal(luciNano(s.vista(), 0).get(41), 127, 'PLAY ha qualcosa da lanciare');
});

test('luci del nano: si manda solo quello che cambia, sul canale MIDI del nano', () => {
  const mandati = [];
  const n = new Nano({});
  n.uscita = { send: (d) => mandati.push(d) };
  n.riceve([0xbf, 64, 0]); // il nano parla sul canale 16: si risponde lì
  n.mostra([riga(0, 'accesa', 'spenta', 'accesa')]);
  const primi = mandati.length;
  assert.ok(mandati.some((d) => d[0] === 0xbf && d[1] === 48 && d[2] === 127));
  n.mostra([riga(0, 'accesa', 'spenta', 'accesa')]);
  assert.equal(mandati.length, primi); // niente di nuovo, niente messaggi
  n.mostra([riga(0, 'accesa', 'spenta', 'spenta')]);
  assert.deepEqual(mandati.at(-1), [0xbf, 48, 0]);
});
