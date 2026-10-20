import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../src/renderer/brano.js';
import { leggiAls } from '../src/ableton/leggi.js';
import { battute, converti, costruisci, mini, nota, nomeTraccia, pulisci, ruoloPad, sceltePredefinite, secondiDaBattute, synthProposto, varianti } from '../src/ableton/converti.js';
import { als, clipAudio, clipMidi, drumRack, note, tracciaAudio, tracciaMidi } from './als-finto.js';

const modello = (opzioni) => leggiAls(als(opzioni));
const corpoDi = (r, nome) => r.sezioni.find((s) => s.nome === nome)?.codice;

test('nomi delle note e delle tracce', () => {
  assert.equal(nota(60), 'c4');
  assert.equal(nota(63), 'eb4');
  assert.equal(nota(36), 'c2');
  assert.equal(pulisci('7-MPE Airy Pad & Sub'), 'mpe airy pad sub');
  assert.equal(pulisci('3-Audio [x]'), 'audio');
  assert.equal(nomeTraccia({ nome: '4-Audio', numero: 4 }), 'audio 4');
  assert.equal(nomeTraccia({ nome: '8-Wonk Bass', numero: 8 }), 'wonk bass');
});

test('mini: una nota a battuta resta una nota a battuta, `_` prolunga, `~` è pausa, gli accordi sono [a,b]', () => {
  const quattro = [[0, 4, 62], [4, 4, 67], [8, 4, 60], [12, 4, 65]];
  assert.equal(mini(quattro, 16, nota), 'd4 g4 c4 f4');
  assert.equal(mini([[0, 8, 60]], 8, nota), 'c4');
  assert.equal(mini([[0, 1, 60], [2, 1, 62]], 4, nota), 'c4 ~ d4 ~');
  assert.equal(mini([[0, 2, 60]], 4, nota), 'c4 ~');
  assert.equal(mini([[0, 1, 60], [1, 1, 62]], 4, nota), 'c4 d4 ~ ~');
  assert.equal(mini([[0, 2, 60], [3, 1, 62]], 4, nota), 'c4 _ ~ d4'.replace(' _ ~', ' _ ~'));
  assert.equal(mini([[0, 1, 60], [0, 1, 63], [0, 1, 67]], 2, nota), '[c4,eb4,g4] ~');
});

test('battute: quarti → battute, almeno una', () => {
  assert.equal(battute(4), 1);
  assert.equal(battute(16), 4);
  assert.equal(battute(2), 1);
  assert.equal(battute(4.01), 2);
});

test('warp: dai marcatori alle battute → secondi', () => {
  assert.equal(secondiDaBattute([[0, 0], [8, 4]], 4), 2);
  assert.equal(secondiDaBattute([[0, 0], [8, 4], [16, 12]], 12), 8);
  assert.equal(secondiDaBattute([[0, 0]], 4), null);
});

test('ruoli: dal nome del pad, e se manca dalla nota General MIDI', () => {
  assert.equal(ruoloPad('Kick Burned Ring', 41), 'kick');
  assert.equal(ruoloPad('Hihat Closed', 42), 'hat');
  assert.equal(ruoloPad('Clap House', 38), 'clap');
  assert.equal(ruoloPad('Tom Slap', 45), 'perc');
  assert.equal(ruoloPad('', 38), 'snare');
  assert.equal(ruoloPad('???', 99), 'perc');
  assert.equal(synthProposto({ nome: '6-Dark Swell Pad', strumento: null }), 'pad');
  assert.equal(synthProposto({ nome: '8-Wonk Bass', strumento: null }), 'basso');
  assert.equal(synthProposto({ nome: '1-Cosa', strumento: { nome: 'Nice Lead' } }), 'lead');
  assert.equal(synthProposto({ nome: '1-Cosa', strumento: null }), 'synth');
});

const BASSO = (inizio, tasti) => clipMidi({ inizio, loop: [0, 16], note: tasti.map((k, i) => note(i * 4, 4, k)) });

test('traccia MIDI → codice con un synth scelto dal nome; la durata del loop è lo .slow()', () => {
  const m = modello({ bpm: 140, tracce: [tracciaMidi({ nome: '8-Wonk Bass', clip: [BASSO(0, [38, 43, 36, 41])] })] });
  const r = costruisci(m);
  assert.equal(r.sezioni.length, 1);
  assert.equal(r.sezioni[0].nome, 'wonk bass');
  assert.equal(r.sezioni[0].codice, 'note("d2 g2 c2 f2").slow(4)\n  .s("sawtooth").lpf(500).lpq(4).release(.2).gain(.45)');
  // il synth si cambia dalle scelte
  const scelte = sceltePredefinite(m);
  scelte.tracce[0].synth = 'lead';
  assert.match(costruisci(m, scelte).sezioni[0].codice, /\.s\("square"\)/);
});

test('clip uguali = una variante; le lettere contano le varianti incluse', () => {
  const m = modello({ tracce: [tracciaMidi({ nome: '1-Pad', clip: [BASSO(0, [60, 62, 64, 65]), BASSO(16, [60, 62, 64, 65]), BASSO(32, [67, 65, 64, 62])] })] });
  const vs = varianti(m.tracce[0]);
  assert.equal(vs.length, 2);
  assert.equal(vs[0].usi, 2);
  const r = costruisci(m);
  assert.deepEqual(r.sezioni.map((s) => s.nome), ['pad a', 'pad b']);
  // se ne tolgo una, l'altra non ha più bisogno della lettera
  const scelte = sceltePredefinite(m);
  scelte.tracce[0].varianti[vs[1].id].includi = false;
  const r2 = costruisci(m, scelte);
  assert.deepEqual(r2.sezioni.filter((s) => s.incluso).map((s) => s.nome), ['pad']);
  assert.equal(r2.sezioni.length, 2); // quella tolta resta disponibile per l'ascolto
});

test('l\'ordine: arrangiamento per posizione, poi le clip della sola Session per scena', () => {
  const m = modello({
    tracce: [
      tracciaMidi({ nome: '1-Basso', clip: [BASSO(32, [36, 36, 36, 36])] }),
      tracciaMidi({ nome: '2-Pad', clip: [BASSO(0, [60, 60, 60, 60])], sessione: [null, BASSO(0, [67, 67, 67, 67])] }),
      tracciaMidi({ nome: '3-Arp', sessione: [BASSO(0, [72, 72, 72, 72])] }),
    ],
  });
  const r = costruisci(m);
  assert.deepEqual(r.sezioni.map((s) => s.nome), ['pad a', 'basso', 'arp', 'pad b']);
  assert.equal(r.sezioni[2].inizio, null);
});

test('batteria: una riga per ruolo, battuta per battuta, nota dei pad corretta', () => {
  const rack = drumRack([{ nome: 'Kick', ricezione: 92 }, { nome: 'Hihat Closed', ricezione: 82 }]);
  const clip = clipMidi({ loop: [0, 8], note: [note(0, 0.25, 36), note(4, 0.25, 36), note(6, 0.25, 46), note(2, 0.25, 99)] });
  const m = modello({ tracce: [tracciaMidi({ nome: '5-Kit', strumento: rack, clip: [clip] })] });
  const c = costruisci(m).sezioni[0].codice;
  assert.match(c, /^stack\(/);
  const x = (...celle) => celle.join(' ');
  const vuota = x(...Array(16).fill('~'));
  const unaX = (i) => x(...Array.from({ length: 16 }, (_, k) => (k === i ? 'x' : '~')));
  // kick: un colpo all'inizio di ogni battuta (16 sedicesimi per battuta, una battuta alla volta)
  assert.ok(c.includes(`s("sine").note("c2").penv(36).pdecay(.05).decay(.35).sustain(0).gain(1.2)\n    .struct("<[${unaX(0)}] [${unaX(0)}]>")`), c);
  // charleston: nella seconda battuta, al quarto quarto... (quarto 2 della battuta = sedicesimo 8)
  assert.ok(c.includes(`s("white").hpf(8000).decay(.04).sustain(0).gain(.3)\n    .struct("<[~] [${unaX(8)}]>")`), c);
  // la nota 99 non ha un pad: percussione, a metà della prima battuta
  assert.ok(c.includes(`s("triangle").note("c5").decay(.06).sustain(0).gain(.4)\n    .struct("<[${unaX(8)}] [~]>")`), c);
  assert.ok(vuota.length > 0);
});

test('audio: begin/end dai marcatori di warp, slow dalle battute del loop, nome del suono dal file', () => {
  const clip = clipAudio({ loop: [0, 8], marcatori: [[0, 0], [8, 4]], durata: 5, file: 'Samples/Recorded/3-Audio 0004 [2026].wav' });
  const m = modello({ bpm: 120, tracce: [tracciaAudio({ nome: '3-Audio', clip: [clip] })] });
  const r = converti(m, undefined, { titolo: 'x1', data: '2026-10-20' });
  assert.equal(r.suoni.length, 1);
  assert.equal(r.suoni[0].nome, 'x1_01_3_audio_0004');
  assert.equal(r.suoni[0].relativo, 'Samples/Recorded/3-Audio 0004 [2026].wav');
  assert.equal(r.sezioni[0].nome, 'audio 3');
  assert.equal(r.sezioni[0].codice, 's("x1_01_3_audio_0004").begin(0.0000).end(0.8000).slow(2)\n  .gain(.8)');
});

test('audio non warpato: il loop è già in secondi', () => {
  const clip = clipAudio({ warp: false, loop: [1, 3], marcatori: [], durata: 4 });
  const m = modello({ tracce: [tracciaAudio({ nome: '1-Audio', clip: [clip] })] });
  assert.match(costruisci(m).sezioni[0].codice, /begin\(0\.2500\)\.end\(0\.7500\)/);
});

test('un loop a un tempo lontano dal progetto avvisa che cambierà altezza', () => {
  const clip = clipAudio({ loop: [0, 8], marcatori: [[0, 0], [8, 2.757]], durata: 3 }); // ~174 BPM
  const m = modello({ bpm: 87, tracce: [tracciaAudio({ nome: '1-Audio', clip: [clip] })] });
  assert.match(converti(m, undefined, { titolo: 'x' }).avvisi.join(' '), /BPM.*time-stretch/);
});

test('tracce audio con tante varianti: di default le due più usate', () => {
  const clip = (inizio, loop) => clipAudio({ inizio, loop, file: 'Samples/a.wav' });
  const clips = [clip(0, [0, 4]), clip(8, [0, 4]), clip(16, [0, 4]), clip(24, [0, 2]), clip(32, [0, 2]), clip(40, [0, 3]), clip(48, [0, 1])];
  const m = modello({ tracce: [tracciaAudio({ nome: '1-Audio', clip: clips })] });
  const s = sceltePredefinite(m);
  assert.equal(Object.values(s.tracce[0].varianti).filter((v) => v.includi).length, 2);
  assert.equal(costruisci(m, s).sezioni.length, 4); // tutte restano disponibili per l'ascolto
  assert.equal(converti(m, s, { titolo: 'x' }).sezioni.length, 2);
});

test('stem esportato da Ableton per una traccia MIDI: begin/end dalla posizione nell\'arrangiamento', () => {
  const m = modello({ bpm: 120, tracce: [tracciaMidi({ nome: '1-Pad', clip: [BASSO(16, [60, 62, 64, 65])] })] });
  const stem = (battuta) => ({ file: { relativo: '', assoluto: '/tmp/stem pad.wav', durata: 60 }, battuta });
  const s = sceltePredefinite(m);
  s.tracce[0].modalita = 'audio';
  s.tracce[0].stem = stem(1);
  // la clip parte al quarto 16 (4 battute, 8 s) e dura 16 quarti (8 s) su 60 s di stem
  let r = converti(m, s, { titolo: 'brano' });
  assert.equal(r.sezioni[0].codice, 's("brano_01_stem_pad").begin(0.1333).end(0.2667).slow(4)\n  .gain(.8)');
  assert.equal(r.suoni[0].assoluto, '/tmp/stem pad.wav');
  // se lo stem parte dalla battuta 3 (quarto 8), tutto slitta di 4 s
  s.tracce[0].stem = stem(3);
  r = converti(m, s, { titolo: 'brano' });
  assert.match(r.sezioni[0].codice, /begin\(0\.0667\)\.end\(0\.2000\)/);
  // senza la durata dello stem, o per una clip solo di Session, resta il codice e lo dice
  s.tracce[0].stem = { file: { relativo: '', assoluto: '/tmp/s.wav', durata: 0 }, battuta: 1 };
  r = converti(m, s, { titolo: 'brano' });
  assert.match(r.sezioni[0].codice, /^note\(/);
  assert.match(r.avvisi.join(' '), /durata/);
});

test('il brano finito: testa, tempo, una sezione per variante, e si rilegge identico', () => {
  const m = modello({
    bpm: 86,
    tracce: [
      tracciaMidi({ nome: '1-Pad', clip: [BASSO(0, [60, 62, 64, 65])] }),
      tracciaAudio({ nome: '2-Audio', clip: [clipAudio({ inizio: 16, loop: [0, 8], file: 'Samples/loop.wav' })] }),
    ],
  });
  const r = converti(m, undefined, { titolo: 'mayia', data: '2026-10-20', origine: '/Users/x/Mayia.als' });
  const b = B.leggi(r.testo);
  assert.equal(B.scrivi(b), r.testo);
  const testa = B.testa(b);
  assert.equal(testa.brano, 'mayia');
  assert.equal(testa.bpm, 86);
  assert.equal(testa.origine, '/Users/x/Mayia.als');
  assert.deepEqual(testa.suoni, ['mayia_01_loop']);
  assert.match(b.preambolo.join('\n'), /setcpm\(86\/4\)/);
  assert.deepEqual(b.sezioni.map((s) => s.nome), ['pad', 'audio 2']);
});

test('due sezioni con lo stesso nome restano distinte', () => {
  const m = modello({ tracce: [tracciaMidi({ nome: '1-Pad', clip: [BASSO(0, [60, 60, 60, 60])] }), tracciaMidi({ nome: '2-Pad', clip: [BASSO(16, [62, 62, 62, 62])] })] });
  assert.deepEqual(converti(m, undefined, { titolo: 'x' }).sezioni.map((s) => s.nome), ['pad', 'pad 2']);
});

test('note fuori dalla griglia dei sedicesimi: avviso', () => {
  const m = modello({ tracce: [tracciaMidi({ nome: '1-Arp', clip: [clipMidi({ loop: [0, 4], note: [note(0, 1 / 3, 60), note(1 / 3, 1 / 3, 62)] })] })] });
  assert.match(converti(m, undefined, { titolo: 'x' }).avvisi.join(' '), /griglia/);
});
