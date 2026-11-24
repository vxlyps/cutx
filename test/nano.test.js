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

test('nano: R breve = premiR, R tenuto = tieniR; S giù = cuffia e su = smette, M = mute, PLAY = GO ALL, solo alla pressione', async () => {
  const visti = [];
  const n = new Nano({ fader: () => {}, manopola: () => {}, premiR: (c) => visti.push(`R${c}`), tieniR: (c) => visti.push(`tieni${c}`), cuffia: (c) => visti.push(`S${c}`), cuffiaSu: (c) => visti.push(`su${c}`), mute: (c) => visti.push(`mute${c}`), goAll: () => visti.push('all') });
  n.riceve([0xb0, 64, 127]); n.riceve([0xb0, 64, 0]); // R1 breve
  n.riceve([0xb0, 49, 127]); n.riceve([0xb0, 49, 0]);
  n.riceve([0xb0, 41, 127]); n.riceve([0xb0, 41, 0]);
  n.riceve([0xb0, 33, 127]); n.riceve([0xb0, 33, 0]); // S2
  assert.deepEqual(visti, ['R0', 'mute1', 'all', 'S1', 'su1'], 'S tenuto: giù = cuffia, su = smette');
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

test('nano: i tasti del trasporto (TRACK, SET, MARKER, CYCLE, STOP, REC) si leggono; REW e FF sono capiti ma liberi', () => {
  const t = (cc) => leggiNano([0xb0, cc, 127]).tipo;
  assert.deepEqual([58, 59, 60, 61, 62, 46, 42, 45, 43, 44].map(t), ['trackSu', 'trackGiu', 'set', 'markerSu', 'markerGiu', 'cycle', 'stop', 'rec', 'libero', 'libero']);
  assert.equal(leggiNano([0xb0, 58, 0]).giu, false);
});

test('nano: trasporto = azioni solo alla pressione; STOP breve annulla, STOP tenuto 1,5 s apre il paracadute', async () => {
  const visti = [];
  const n = new Nano({
    track: (v) => visti.push(`track${v}`), set: () => visti.push('set'), marker: (v) => visti.push(`marker${v}`), cycle: () => visti.push('cycle'), rec: () => visti.push('rec'),
    stop: () => visti.push('stop'), tieniStop: () => visti.push('paracadute'),
  });
  for (const cc of [58, 59, 60, 61, 62, 46, 45, 43]) { n.riceve([0xb0, cc, 127]); n.riceve([0xb0, cc, 0]); }
  assert.deepEqual(visti, ['track-1', 'track1', 'set', 'marker-1', 'marker1', 'cycle', 'rec']);
  visti.length = 0;
  n.riceve([0xb0, 42, 127]); n.riceve([0xb0, 42, 0]);
  assert.deepEqual(visti, ['stop'], 'breve: al rilascio');
  visti.length = 0;
  n.riceve([0xb0, 42, 127]);
  await new Promise((r) => setTimeout(r, 1600));
  n.riceve([0xb0, 42, 0]);
  assert.deepEqual(visti, ['paracadute'], 'tenuto: paracadute, e il rilascio non annulla niente');
});

test('nano: STOP tenuto 1,2 s non è ancora paracadute (è uno STOP breve); 1,6 s sì; la carica si vede', async () => {
  const visti = [];
  const n = new Nano({ stop: () => visti.push('stop'), tieniStop: () => visti.push('paracadute'), stopCarica: (on) => visti.push(on ? 'carica' : 'scarica') });
  n.riceve([0xb0, 42, 127]);
  await new Promise((r) => setTimeout(r, 1200));
  n.riceve([0xb0, 42, 0]);
  assert.deepEqual(visti, ['carica', 'scarica', 'stop'], '1,2 s: niente paracadute');
  visti.length = 0;
  n.riceve([0xb0, 42, 127]);
  await new Promise((r) => setTimeout(r, 1600));
  n.riceve([0xb0, 42, 0]);
  assert.deepEqual(visti, ['carica', 'scarica', 'paracadute'], '1,6 s: paracadute, il rilascio non fa altro');
});

test('luci del nano: CYCLE acceso se entra tra > 1, REC mentre registra, STOP col paracadute aperto', () => {
  const vista = [];
  assert.deepEqual([46, 45, 42].map((cc) => luciNano(vista, 0).get(cc)), [0, 0, 0]);
  assert.deepEqual([46, 45, 42].map((cc) => luciNano(vista, 0, { cycle: true, rec: true, stop: true }).get(cc)), [127, 127, 127]);
});

test('nano: cavo staccato con R e STOP tenuti a metà: niente OUT subito, niente paracadute, la carica si spegne', async () => {
  const visti = [];
  const n = new Nano({ tieniR: (ch) => visti.push(`tieniR${ch}`), tieniStop: () => visti.push('paracadute'), stopCarica: (on) => visti.push(on ? 'carica' : 'scarica') });
  n.riceve([0xb0, 64, 127]); // R del CH1 giù
  n.riceve([0xb0, 42, 127]);
  n.annullaPendenti(); // il cavo si stacca
  await new Promise((r) => setTimeout(r, 1700));
  assert.deepEqual(visti, ['carica', 'scarica']);
});

