import test from 'node:test';
import assert from 'node:assert/strict';
import { tipiSuggeriti } from '../src/renderer/categorie.js';
import { guadagnoLivello, applicaMessaggioCh, chNeutro } from '../src/renderer/mixer.js';
import { StatoCanali, guardiaTrack, senzaCanale, sweep, alternative, canaliPredefiniti, chDelTipo, chDelLivello, chDellaBeat, gainFader, validaCanali, zona } from '../src/renderer/canali.js';

const clip = (nome, tipo) => ({ nome, info: tipo ? { [tipo]: true } : {} });
const brano1 = { nome: 'uno', bpm: 170, beat: { scene: [{ nome: 'intro' }, { nome: 'drop' }] }, sezioni: [clip('sub', 'bass'), clip('melodia', 'lead'), clip('reese', 'bass'), clip('kick', 'drum'), clip('rumori', 'stray'), clip('stab', 'keys')] };
const brano2 = { nome: 'due', bpm: 140, beat: null, sezioni: [clip('wobble', 'bass'), clip('pad', 'pad')] };
const nomi = (l) => l.map((a) => a.nome);

test('CANALI predefinito: valido, ogni tipo in una CH sola, una FREE', () => {
  const b = canaliPredefiniti();
  assert.deepEqual(validaCanali(b), []);
  assert.equal(b.length, 8);
  assert.equal(chDelTipo(b, 'drum'), 0);
  assert.equal(chDelTipo(b, 'arp'), 1, 'keys e arp insieme in MELODIA');
  assert.equal(chDelTipo(b, ''), 7, 'senza tipo → FREE');
  assert.equal(chDellaBeat(b), 0);
});

test('validazione del CANALI', () => {
  const b = canaliPredefiniti();
  b[2].tipi.push('lead');
  assert.match(validaCanali(b).join(), /lead è in due CH/);
  const c = canaliPredefiniti();
  c[7].free = false;
  assert.match(validaCanali(c).join(), /manca la FREE/);
  c[0].free = c[1].free = true;
  assert.match(validaCanali(c).join(), /una sola/);
  const d = canaliPredefiniti();
  d[3].nome = '  ';
  d[4].tipi = ['kazoo'];
  assert.equal(validaCanali(d).length, 2);
  assert.equal(validaCanali(canaliPredefiniti().slice(0, 7)).length, 1);
});

test('alternative: nell\'ordine del file, mai per tipo; DRUM = scene e poi clip drum; FREE = solo le clip `stray` (ogni clip in un CH solo)', () => {
  const b = canaliPredefiniti();
  assert.deepEqual(nomi(alternative(b, brano1, 0)), ['intro', 'drop', 'kick']);
  assert.deepEqual(nomi(alternative(b, brano1, 2)), ['sub', 'reese'], 'BASSO: l\'ordine del file');
  assert.deepEqual(nomi(alternative(b, brano1, 1)), ['stab']);
  assert.deepEqual(nomi(alternative(b, brano1, 7)), ['rumori'], 'FREE: solo la clip stray');
  assert.deepEqual(nomi(alternative(b, brano1, 2)), ['sub', 'reese'], 'ogni clip sta nel CH del suo tipo e basta');
  assert.deepEqual(alternative(b, brano1, 5), [], 'PERC: niente per questo brano');
  assert.deepEqual(alternative(b, null, 0), []);
  assert.equal(alternative(b, brano1, 2)[0].brano, 'uno');
  assert.equal(alternative(b, brano1, 0)[0].tipo, 'scena');
});

test('zona: zone uguali, bordi con isteresi ±3%', () => {
  assert.equal(zona(0, 4), 0);
  assert.equal(zona(0.99, 4), 3);
  assert.equal(zona(1, 4), 3);
  assert.equal(zona(0.3, 1), 0);
  assert.equal(zona(0.5, 0), null);
  assert.equal(zona(0.26, 4), 1);
  assert.equal(zona(0.26, 4, 0), 0, 'ero in 0: 0,26 è dentro 0,25+3%');
  assert.equal(zona(0.29, 4, 0), 1, 'oltre il 3%: cambia');
  assert.equal(zona(0.24, 4, 1), 1, 'ero in 1: 0,24 è dentro 0,25−3%');
  assert.equal(zona(0.21, 4, 1), 0);
  assert.equal(zona(0.5, 4, 9), 2, 'una zona di prima che non esiste si ignora');
});

test('in NEXT: di partenza è ciò che suona (CH vuoto: niente); la manopola sceglie, la prima zona è OUT; girarla non fa suonare niente', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  assert.equal(s.next(2), null, 'CH vuoto, nessuna scelta: niente in NEXT');
  assert.equal(s.scegli(2, 0.01).id, 'OUT', 'la prima zona a sinistra è OUT');
  assert.equal(s.scegli(2, 0.5).nome, 'sub');
  assert.equal(s.scegli(2, 0.9).nome, 'reese');
  assert.equal(s.canali[2].suona, null);
  s.impostaBrano(brano2);
  assert.equal(s.next(2), null, 'brano nuovo: la scelta di prima era per l\'altro brano');
  assert.equal(s.scegli(2, 0.9).nome, 'wobble', 'una sola alternativa: dopo OUT c\'è quella');
  assert.equal(s.next(5), null, 'PERC: niente in NEXT');
  s.impostaBrano(brano1);
  assert.equal(s.next(2).nome, 'reese', 'le scelte sono per brano: tornando al primo la ritrovo');
});

test('NEXT è per id: una clip aggiunta o un tipo cambiato non lo fanno saltare; la manopola cambia scelta solo quando cambia zona', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 2);
  assert.equal(s.next(2).nome, 'reese');
  s.impostaBrano({ ...brano1, sezioni: [clip('nuova', 'bass'), ...brano1.sezioni] }); // una clip in testa: gli indici slittano
  assert.equal(s.next(2).nome, 'reese', 'stessa clip, non stessa posizione');
  assert.equal(s.armato(2), true);
  s.scegli(2, 0.99); // la manopola non rumoreggia: una zona nuova = una scelta nuova
  assert.equal(s.next(2).nome, 'reese');
  s.scegli(2, 0.3);
  assert.equal(s.next(2).nome, 'nuova');
  assert.deepEqual(s.alternaId('uno#sub'), { ch: 2, k: 2, acceso: true }, 'il tasto NEXT di una card: la sceglie');
  assert.equal(s.next(2).nome, 'sub');
  assert.deepEqual(s.alternaId('uno#sub'), { ch: 2, k: 2, acceso: false }, 'ricliccato: toglie la scelta');
  assert.equal(s.next(2), null, 'senza scelta e con il CH vuoto: niente');
  assert.equal(s.alternaId('uno#inesistente'), null);
});

test('GO / annulla / niente in NEXT / stessa clip', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1);
  const e = s.go(2);
  assert.deepEqual(e.map((x) => x.tipo), ['go']);
  assert.equal(e[0].alt.nome, 'sub');
  assert.equal(e[0].cicli, 1);
  assert.equal(s.luceGo(2), 'veloce');
  assert.deepEqual(s.go(2).map((x) => x.tipo), ['annulla'], 'ripremuto mentre aspetta: annulla');
  assert.equal(s.canali[2].attesa, null);
  s.go(2);
  s.scattato(2);
  assert.equal(s.canali[2].suona.nome, 'sub');
  assert.equal(s.luceGo(2), 'accesa', 'suona e in NEXT c\'è la stessa');
  assert.deepEqual(s.go(2), [], 'in NEXT la stessa che suona: niente');
  s.scegli(2, 0.9);
  assert.equal(s.next(2).nome, 'reese');
  assert.equal(s.luceGo(2), 'lenta', 'in NEXT c\'è altro');
  assert.equal(s.luceGo(5), 'spenta');
  const v = s.go(5);
  assert.equal(v[0].tipo, 'avviso');
  assert.match(v[0].testo, /niente in NEXT per CH6 CLAW/);
});

test('OUT: annulla se ripremuto; tenuto 1 s esce subito; su una CH vuota niente', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  assert.deepEqual(s.out(2), []);
  s.scegliAlt(2, 1);
  s.go(2); s.scattato(2);
  assert.deepEqual(s.out(2).map((x) => x.tipo), ['out']);
  assert.equal(s.luceGo(2), 'veloce'); // R lampeggia veloce: sta per uscire
  assert.deepEqual(s.out(2).map((x) => x.tipo), ['annulla']);
  assert.equal(s.luceGo(2), 'accesa');
  assert.deepEqual(s.outSubito(2).map((x) => x.tipo), ['out-subito']);
  assert.equal(s.canali[2].suona, null);
});

test('GO e OUT sullo stesso CH: vince l\'ultimo premuto', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1);
  s.go(2); s.scattato(2);
  s.scegli(2, 0.9);
  assert.deepEqual(s.go(2).map((x) => x.tipo), ['go']);
  assert.deepEqual(s.out(2).map((x) => x.tipo), ['annulla', 'out'], 'l\'uscita prende il posto dell\'entrata');
  assert.equal(s.canali[2].attesa.tipo, 'out');
  assert.deepEqual(s.go(2).map((x) => x.tipo), ['annulla', 'go'], 'e viceversa');
  assert.equal(s.canali[2].attesa.tipo, 'go');
});

test('GO ALL: entra solo quello che è ARMATO (scelto e diverso da ciò che suona); le entrate già in attesa restano', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1);
  s.go(2); s.scattato(2); // GROWL suona «sub»: non è armato
  s.scegliAlt(0, 2); // THUMP: scena «drop»... armato
  s.scegliAlt(1, 1); // PURR: armato
  s.scegliAlt(3, 1);
  s.go(3); // HOWL già in attesa
  const e = s.goAll();
  assert.deepEqual(e.filter((x) => x.tipo === 'go').map((x) => x.ch), [0, 1]);
  assert.equal(s.canali[3].attesa.tipo, 'go', 'HOWL non annullata');
  assert.ok(!e.some((x) => x.ch === 2 || x.ch === 7), 'i CH non armati non partono');
  assert.equal(s.luceGo(5), 'spenta');
  assert.equal(s.luceGo(0), 'veloce'); // ora aspetta
});

test('BPM: entra con la CH DRUM, solo se diverso; gli altri CH non lo toccano', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(0, 1);
  const e = s.go(0);
  assert.equal(e[0].bpm, 170);
  s.scattato(0);
  assert.equal(s.bpm, 170);
  s.impostaBrano(brano2);
  s.scegliAlt(2, 1);
  const b = s.go(2);
  assert.equal(b[0].bpm, undefined, 'BASSO non porta il tempo');
  s.impostaBrano({ ...brano1, nome: 'tre', bpm: 170 });
  s.scegli(0, 0.9);
  assert.equal(s.go(0)[0].bpm, undefined, 'stesso tempo del set: niente cambio');
});

test('«vecchia»: clip di un brano diverso sia da quello della DRUM sia da quello nel CUE', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(0, 1); s.scegliAlt(2, 1);
  s.go(0); s.scattato(0);
  s.go(2); s.scattato(2);
  assert.equal(s.vecchia(2), false, 'stesso brano della DRUM');
  s.impostaBrano(brano2);
  assert.equal(s.vecchia(2), false, 'brano diverso dal CUE, ma uguale a quello della DRUM');
  s.go(0); s.scattato(0); // la DRUM... brano2 non ha beat né drum: nessuna alternativa, la DRUM resta di «uno»
  s.impostaBrano({ ...brano2, nome: 'tre' });
  assert.equal(s.vecchia(2), false, 'uguale alla DRUM che suona ancora');
  s.outSubito(0);
  assert.equal(s.vecchia(2), true, 'né della DRUM (vuota) né del CUE: vecchia');
  assert.equal(s.vecchia(5), false, 'CH vuota');
});

test('tastiera: il pezzo entra nel CH del suo tipo, senza tipo in FREE', () => {
  const s = new StatoCanali();
  const a = s.goDiretto('bass', { nome: 'mio', codice: 'note("c1")' });
  assert.equal(a.at(-1).ch, 2);
  assert.equal(a.at(-1).codice, 'note("c1")');
  const b = s.goDiretto('', { nome: 'libero', codice: 's("bd")' });
  assert.equal(b.at(-1).ch, 7);
  const c = s.goDiretto(undefined, { nome: 'altro', codice: 's("hh")' });
  assert.deepEqual(c.map((x) => x.tipo), ['annulla', 'go'], 'vince l\'ultimo anche qui');
});

test('fader: curva da mixer; «non letto» vale il codice; avvisi muta e fader a zero', () => {
  assert.equal(gainFader(null), 1);
  assert.equal(gainFader(1), 1);
  assert.ok(Math.abs(20 * Math.log10(gainFader(0.5)) + 15) < 0.01, 'a metà −15 dB');
  assert.equal(gainFader(0), 0);
  assert.equal(gainFader(0.02), 0);
  let prima = -1;
  for (let v = 0; v <= 1; v += 0.01) { const g = gainFader(v); assert.ok(g >= prima, 'sempre crescente'); assert.ok(g <= 1); prima = g; }
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1);
  s.go(2); s.scattato(2);
  assert.deepEqual(s.avvisi(2), []);
  s.fader(2, 1); // si aggancia in cima
  s.fader(2, 0);
  s.mute(2);
  assert.deepEqual(s.avvisi(2), ['MUTE', 'fader a zero']);
  assert.equal(s.luceMute(2), 'accesa');
  s.mute(2);
  assert.equal(s.luceMute(2), 'spenta');
  assert.equal(s.vista()[2].fader.letto, true);
  assert.equal(s.vista()[3].fader.letto, false, '«non letto»');
});

test('SWEEP: neutro al centro, acqua a sinistra, aria a destra', () => {
  assert.equal(sweep(null).tipo, 'neutro');
  assert.equal(sweep(0.5).tipo, 'neutro');
  assert.equal(sweep(0.46).tipo, 'neutro', 'zona morta ±4%');
  assert.equal(sweep(0.54).tipo, 'neutro');
  assert.equal(sweep(0).tipo, 'acqua');
  assert.ok(Math.abs(sweep(0).lp - 200) < 0.5, 'tutto a sinistra ~200 Hz');
  assert.ok(sweep(0.45).lp > 15000, 'appena fuori dalla zona morta: quasi aperto');
  assert.ok(sweep(0.2).lp < sweep(0.3).lp, 'più a sinistra = più chiuso');
  assert.equal(sweep(1).tipo, 'aria');
  assert.ok(Math.abs(sweep(1).hp - 5000) < 1, 'tutto a destra ~5 kHz');
  assert.ok(sweep(0.55).hp < 40);
  assert.ok(sweep(0.7).hp < sweep(0.9).hp);
});

test('entra tra: 1, 2, 4, 8 senza tornare indietro', () => {
  const s = new StatoCanali();
  s.piuEntraTra(-1);
  assert.equal(s.entraTra, 1);
  s.piuEntraTra(1); s.piuEntraTra(1);
  assert.equal(s.entraTra, 4);
  s.piuEntraTra(1); s.piuEntraTra(1);
  assert.equal(s.entraTra, 8);
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1);
  assert.equal(s.go(2)[0].cicli, 8);
});

test('vista: tutto quello che serve allo schermo', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  const v = s.vista();
  assert.equal(v.length, 8);
  assert.equal(v[0].nome, 'THUMP');
  assert.equal(v[7].free, true);
  assert.equal(v[0].alternative.length, 3);
  assert.equal(v[0].next, null, 'CH vuoto, nessuna scelta');
  assert.equal(v[5].next, null);
  s.scegliAlt(0, 1);
  assert.equal(s.vista()[0].next.nome, 'intro');
  assert.equal(s.vista()[0].azioneR, 'GO');
});

// --- pagina CANALI: ordine del CUE e lettura di canali.json ---
import { gruppiClip, ordineClip } from '../src/renderer/categorie.js';
import { leggiCanali, ordineCue, canaliPredefiniti as predef } from '../src/renderer/canali.js';

test('il CUE segue l\'ordine dei CH: drum e perc nel loro gruppo, senza tipo in FREE', () => {
  const clip = [{ info: {} }, { info: { perc: true } }, { info: { bass: true } }, { info: { drum: true } }, { info: { arp: true } }, { info: { keys: true } }];
  const g = gruppiClip(clip, ordineCue(predef()));
  assert.deepEqual(g.map((x) => [x.categoria, x.indici]), [['', [0]], ['THUMP', [3]], ['PURR', [4, 5]], ['GROWL', [2]], ['CLAW', [1]]]);
  assert.equal(g[0].daAssegnare, true, 'la clip senza tipo sta nel gruppo «da assegnare», in cima');
  assert.deepEqual(ordineClip(clip, ordineCue(predef())), [0, 3, 4, 5, 2, 1]);
  const conStray = gruppiClip([{ info: { stray: true } }, { info: {} }], ordineCue(predef()));
  assert.deepEqual(conStray.map((x) => [x.categoria, x.indici]), [['', [1]], ['STRAY', [0]]], 'stray va nel CH8, senza tipo no');
});

test('una clip senza tipo non è in nessun CH (nemmeno nel CH8); col tipo stray sì', () => {
  const b = canaliPredefiniti();
  const brano = { nome: 'x', bpm: 120, beat: null, sezioni: [clip('a'), clip('b', 'stray'), clip('c', 'lead')] };
  for (let ch = 0; ch < 8; ch++) assert.ok(!alternative(b, brano, ch).some((a) => a.nome === 'a'), `«a» non è nel CH${ch + 1}`);
  assert.deepEqual(nomi(alternative(b, brano, 7)), ['b']);
  assert.deepEqual(nomi(alternative(b, brano, 3)), ['c']);
  // un canali.json vecchio (STRAY senza tipi) manda `stray` nel CH8 lo stesso
  const vecchio = canaliPredefiniti();
  vecchio[7].tipi = [];
  assert.deepEqual(nomi(alternative(vecchio, brano, 7)), ['b']);
});

test('CH vuoto senza scelta: R dice cosa fare, col numero', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  const e = s.premiR(1);
  assert.equal(e[0].testo, 'CH2 PURR: gira la manopola per scegliere');
});

test('cambia l\'ordine dei CH, cambia il CUE; un tipo senza CH va in FREE', () => {
  const c = predef();
  [c[1], c[2]] = [c[2], c[1]]; // GROWL prima di PURR
  c[4].tipi = []; // il pad non ha più un CH
  const clip = [{ info: { pad: true } }, { info: { keys: true } }, { info: { bass: true } }];
  assert.deepEqual(gruppiClip(clip, ordineCue(c)).map((x) => [x.categoria, x.indici]), [['GROWL', [2]], ['PURR', [1]], ['STRAY', [0]]]);
});

test('canali.json: manca → predefiniti; sbagliato → predefiniti con l\'errore; buono → suoi', () => {
  assert.deepEqual(leggiCanali(null), { config: predef(), errori: [] });
  assert.ok(leggiCanali('{').errori.length);
  assert.ok(leggiCanali('[]').errori.length);
  const buono = predef().map((c, i) => (i === 0 ? { ...c, nome: 'KICK' } : c));
  assert.equal(leggiCanali(JSON.stringify(buono)).config[0].nome, 'KICK');
  const doppio = predef().map((c) => ({ ...c, tipi: ['bass'] }));
  assert.ok(leggiCanali(JSON.stringify(doppio)).errori[0].includes('due CH'));
});

// --- griglia col mouse e sincronizzazione col motore ---
test('scegliAlt: dal mouse NEXT è quella scelta e la manopola la segue', () => {
  const st = new StatoCanali();
  st.impostaBrano(brano1);
  const ch = chDelTipo(st.config, 'bass');
  assert.equal(st.scegliAlt(ch, 2).nome, 'reese');
  assert.equal(st.next(ch).nome, 'reese'); // chi rilegge non la fa saltare
  assert.equal(st.scegliAlt(ch, 0).id, 'OUT', 'il primo chip è OUT, come la prima zona della manopola');
  assert.equal(st.scegliAlt(ch, 9), null);
  assert.equal(st.scegli(ch, st.canali[ch].pos).id, 'OUT', 'la manopola, ferma dove l\'ha lasciata il mouse, non cambia niente');
});

test('sincronizza: suona, sta per entrare, sta per uscire; vince il motore (dopo un crash si ricostruisce)', () => {
  const st = new StatoCanali();
  st.impostaBrano(brano1);
  const bass = chDelTipo(st.config, 'bass');
  const lead = chDelTipo(st.config, 'lead');
  const livelli = [
    { nome: 'sub', provenienza: 'uno §1', ch: bass, da: 0, a: 12 },
    { nome: 'melodia', provenienza: 'uno §2', ch: lead, da: 16, a: null },
  ];
  st.sincronizza(livelli, 10);
  assert.equal(st.canali[bass].suona.nome, 'sub');
  assert.equal(st.canali[bass].suona.id, 'uno#sub');
  assert.equal(st.canali[bass].attesa.tipo, 'out');
  assert.equal(st.canali[lead].suona, null);
  assert.equal(st.canali[lead].attesa.tipo, 'go');
  assert.equal(st.canali[lead].attesa.da, 16);
  st.sincronizza(livelli, 20);
  assert.equal(st.canali[bass].suona, null);
  assert.equal(st.canali[lead].suona.nome, 'melodia');
  assert.equal(st.canali[lead].attesa, null);
});

test('sincronizza: appena premuto GO il motore non cancella la richiesta (1,5 s di respiro)', () => {
  const st = new StatoCanali();
  st.impostaBrano(brano1);
  let t = 1000;
  st.adesso = () => t;
  const bass = chDelTipo(st.config, 'bass');
  st.scegliAlt(bass, 1);
  st.go(bass);
  st.sincronizza([], 5); // il motore non ne sa ancora niente
  assert.equal(st.canali[bass].attesa.tipo, 'go');
  t += 2000;
  st.sincronizza([], 5);
  assert.equal(st.canali[bass].attesa, null);
});

import { conTipo, suggerisciTipo } from '../src/renderer/categorie.js';
test('conTipo: toglie tutti i tipi vecchi, tiene il resto; suggerisciTipo dal nome (solo un suggerimento)', () => {
  assert.deepEqual(conTipo({ bass: true, volume: 0.8 }, 'pad'), { volume: 0.8, pad: true });
  assert.deepEqual(conTipo({ bass: true, drum: true, volume: 0.8 }, ''), { volume: 0.8 });
  assert.deepEqual(conTipo(undefined, 'fx'), { fx: true });
  assert.equal(suggerisciTipo('sub'), 'bass');
  assert.equal(suggerisciTipo('reese'), 'bass');
  assert.equal(suggerisciTipo('pad'), 'pad');
  assert.equal(suggerisciTipo('melodia'), 'lead');
  assert.equal(suggerisciTipo('xyz'), '');
});

test('R esegue NEXT: GO se è una clip che non suona, OUT se è OUT, ANNULLA se aspetta, LIVE se è già in onda; tenuto = esce subito', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  const bass = 2;
  assert.equal(s.azioneR(bass), '', 'vuoto e senza scelta: niente da fare');
  assert.equal(s.premiR(bass)[0].tipo, 'avviso');
  s.scegliAlt(bass, 1); // «sub»
  assert.equal(s.azioneR(bass), 'GO');
  assert.deepEqual(s.premiR(bass).map((x) => x.tipo), ['go']);
  assert.equal(s.azioneR(bass), 'ANNULLA');
  assert.deepEqual(s.premiR(bass).map((x) => x.tipo), ['annulla']); // ripremuto mentre aspetta
  s.go(bass); s.scattato(bass); // «sub» suona
  assert.equal(s.azioneR(bass), 'LIVE', 'NEXT è quello che suona: R non fa niente');
  assert.deepEqual(s.premiR(bass), []);
  s.scegliAlt(bass, 0); // OUT
  assert.equal(s.azioneR(bass), 'OUT');
  assert.deepEqual(s.premiR(bass).map((x) => x.tipo), ['out']);
  assert.deepEqual(s.premiR(bass).map((x) => [x.tipo, x.quale]), [['annulla', 'out']], 'ANNULLA di un OUT dice che era un OUT');
  s.scegliAlt(bass, 2); // «reese»
  assert.equal(s.azioneR(bass), 'GO');
  assert.deepEqual(s.premiR(bass).map((x) => x.tipo), ['go']);
  s.scattato(bass); // reese suona
  assert.deepEqual(s.tieniR(bass).map((x) => x.tipo), ['out-subito']);
  assert.equal(s.canali[bass].suona, null);
  s.scegliAlt(bass, 0);
  assert.equal(s.azioneR(bass), '', 'OUT su un CH vuoto: niente da fare');
  assert.equal(s.premiR(bass)[0].tipo, 'avviso');
  assert.equal(s.premiR(5)[0].tipo, 'avviso'); // CLAW: niente nel brano
});

test('S tenuto: cuffia sul NEXT finché lo tieni, rilasciato smette; la manopola la segue; un altro CH la sostituisce', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  assert.equal(s.premiS(2)[0].tipo, 'avviso', 'niente in NEXT: niente da ascoltare');
  s.scegliAlt(2, 1);
  const e = s.premiS(2);
  assert.deepEqual([e[0].tipo, e[0].alt.nome], ['cuffia', 'sub']);
  assert.equal(s.luceOut(2), 'accesa', 'la luce di S è accesa finché lo tengo');
  assert.deepEqual(s.premiS(2), [], 'un rimbalzo del tasto non rifà niente');
  s.scegliAlt(2, 2);
  assert.deepEqual(s.seguiCuffia(2).map((x) => x.alt.nome), ['reese'], 'girando la manopola la cuffia segue NEXT');
  assert.deepEqual(s.seguiCuffia(2), []); // niente di nuovo, niente di rifatto
  assert.equal(s.cuffiaCh.chiave, 'nano2', 'seguire non cambia chi ha acceso la cuffia');
  assert.deepEqual(s.rilasciaS(2).map((x) => x.tipo), ['cuffia-stop'], 'rilasciato: smette');
  assert.equal(s.cuffiaCh, null);
  assert.equal(s.luceOut(2), 'spenta');
  assert.deepEqual(s.rilasciaS(2), [], 'rilasciare di nuovo non fa niente');
  s.scegliAlt(2, 0);
  assert.equal(s.premiS(2)[0].tipo, 'avviso', 'OUT non si ascolta');
  assert.equal(s.premiS(5)[0].tipo, 'avviso');
});

test('due S tenuti: vince l\'ultimo; lasciare il primo non spegne il secondo; lasciare l\'ultimo spegne', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1);
  s.scegliAlt(3, 1);
  s.premiS(2);
  assert.deepEqual(s.premiS(3).map((x) => x.tipo), ['cuffia'], 'la cuffia passa a CH4');
  assert.equal(s.cuffiaCh.ch, 3);
  assert.equal(s.luceOut(2), 'spenta');
  assert.deepEqual(s.rilasciaS(2), [], 'lasciare il primo: la cuffia di CH4 resta');
  assert.equal(s.cuffiaCh.ch, 3);
  assert.deepEqual(s.rilasciaS(3).map((x) => x.tipo), ['cuffia-stop']);
  // il nano e il tasto a schermo sullo stesso CH sono due S diversi
  s.premiS(2, 'nano');
  s.premiS(2, 'schermo');
  assert.deepEqual(s.rilasciaS(2, 'nano'), [], 'ora la cuffia è del clic a schermo');
  assert.deepEqual(s.rilasciaS(2, 'schermo').map((x) => x.tipo), ['cuffia-stop']);
});

test('S: non ferma una cuffia che non ha acceso (partita dalla card), né dopo un nano staccato', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1);
  s.premiS(2);
  s.cuffiaCh = null; // il tasto cuffia di una card (o ⌘↵) prende il posto: provaInCuffia azzera cuffiaCh
  assert.deepEqual(s.rilasciaS(2), [], 'il rilascio di S non tocca il preascolto della card');
  s.premiS(2);
  assert.deepEqual(s.lasciaTutteS().map((x) => x.tipo), ['cuffia-stop'], 'nano staccato con S giù: si spegne');
  assert.deepEqual(s.lasciaTutteS(), []);
  assert.deepEqual(s.sTenuti, []);
});

test('TRACK con il PROSSIMO modificato: la prima volta avvisa e non apre, ripremuto entro 2 s apre', () => {
  assert.deepEqual(guardiaTrack(false, null, 1000), { apri: true, avvisa: false, avvisatoA: null }, 'pulito: apre');
  const a = guardiaTrack(true, null, 1000);
  assert.deepEqual(a, { apri: false, avvisa: true, avvisatoA: 1000 });
  assert.deepEqual(guardiaTrack(true, a.avvisatoA, 2500), { apri: true, avvisa: false, avvisatoA: null }, 'dopo 1,5 s: apre');
  assert.deepEqual(guardiaTrack(true, a.avvisatoA, 3000), { apri: true, avvisa: false, avvisatoA: null }, 'esattamente 2 s: apre');
  const tardi = guardiaTrack(true, a.avvisatoA, 3500);
  assert.deepEqual(tardi, { apri: false, avvisa: true, avvisatoA: 3500 }, 'dopo più di 2 s: avvisa di nuovo');
  assert.equal(guardiaTrack(false, 1000, 1500).apri, true, 'se nel frattempo l\'ho salvato, apre');
});

// --- il passo 1: R esegue NEXT (i buchi trovati da Opus) ---

test('bug 1: A suona, B nel CUE → NEXT resta quello che suona, R non toglie il reese di A', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 2); // reese
  s.go(2); s.scattato(2);
  assert.equal(s.canali[2].suona.nome, 'reese');
  s.impostaBrano(brano2); // un altro brano nel CUE
  assert.equal(s.next(2).nome, 'reese', 'NEXT è quello che suona, non la clip del brano nuovo');
  assert.equal(s.azioneR(2), 'LIVE');
  assert.deepEqual(s.premiR(2), [], 'R non fa uscire niente per sbaglio');
  assert.equal(s.armato(2), false);
  assert.equal(s.luceGo(2), 'accesa');
  // il CH «vecchio» si fa uscire a tempo: OUT con la manopola, anche col brano nuovo nel CUE
  assert.equal(s.scegli(2, 0.01).id, 'OUT');
  assert.equal(s.azioneR(2), 'OUT');
  assert.deepEqual(s.premiR(2).map((x) => x.tipo), ['out']);
  assert.equal(s.canali[2].attesa.tipo, 'out');
});

test('le scelte sono per brano: cambiare brano nel CUE e tornare non le perde; il CH vuoto resta vuoto', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(3, 1);
  s.impostaBrano(brano2);
  assert.equal(s.armato(3), false, 'nel brano nuovo non ho scelto niente');
  assert.equal(s.next(3), null);
  s.impostaBrano(brano1);
  assert.equal(s.next(3).nome, 'melodia');
  assert.equal(s.armato(3), true);
});

test('bug 3: guardare non arma (nessuna scelta senza gesto); il tasto NEXT di una card sì', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1);
  s.go(2); s.scattato(2);
  s.impostaBrano({ ...brano1 }); // il CUE rilegge, scrive, naviga: niente cambia
  assert.equal(s.armato(2), false);
  assert.deepEqual(s.goAll(), [], 'PLAY non lancia quello che ho solo guardato');
  s.alternaId('uno#reese');
  assert.equal(s.armato(2), true);
  assert.deepEqual(s.goAll().map((x) => [x.tipo, x.alt?.nome]), [['go', 'reese']]);
});

test('GO ALL: OUT compresi, anche su una scena del beat; i CH senza scelta non si muovono', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1); s.go(2); s.scattato(2); // GROWL suona
  s.scegliAlt(3, 1); s.go(3); s.scattato(3); // HOWL suona
  s.scegliAlt(2, 0); // GROWL: OUT
  s.scegliAlt(0, 1); // THUMP: la scena «intro» del beat
  s.scegliAlt(1, 1); // PURR: «stab»
  assert.equal(s.luceGo(2), 'lenta', 'l\'OUT armato lampeggia come un GO armato');
  const e = s.goAll();
  assert.deepEqual(e.map((x) => [x.tipo, x.ch]), [['go', 0], ['go', 1], ['out', 2]]);
  assert.equal(e[0].alt.tipo, 'scena');
  assert.equal(s.canali[3].attesa, null, 'HOWL non scelto: non si muove');
});

test('STRAY impila: una clip scelta + R si aggiunge alle altre, OUT + R toglie tutto lo STRAY', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(7, 1); // «rumori»
  assert.deepEqual(s.premiR(7).map((x) => x.tipo), ['go']);
  s.scattato(7);
  s.impostaBrano({ ...brano1, sezioni: [...brano1.sezioni, clip('fruscio', 'stray')] });
  s.scegliAlt(7, 2); // «fruscio»
  const e = s.premiR(7);
  assert.deepEqual(e.map((x) => x.tipo), ['go'], 'si aggiunge, non sostituisce');
  s.scattato(7);
  s.sincronizza(
    [
      { nome: 'rumori', provenienza: 'uno §5', ch: 7, da: 0, a: null },
      { nome: 'fruscio', provenienza: 'uno §7', ch: 7, da: 0, a: null },
    ],
    4,
  );
  assert.equal(s.suonaId(7, 'uno#rumori'), true, 'tutte e due suonano');
  s.scegliAlt(7, 1); // «rumori» suona già (anche se non è l\'ultima): LIVE
  assert.equal(s.azioneR(7), 'LIVE');
  s.scegliAlt(7, 0);
  assert.equal(s.azioneR(7), 'OUT');
  assert.deepEqual(s.premiR(7).map((x) => x.tipo), ['out'], 'un OUT solo: il motore toglie tutto lo STRAY');
});

test('un OUT fatto non resta scelto: il CH torna senza scelta', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1); s.go(2); s.scattato(2);
  s.scegliAlt(2, 0); s.premiR(2);
  s.scattato(2);
  assert.equal(s.next(2), null);
  assert.equal(s.azioneR(2), '');
});

test('passo 1.1: una scelta eseguita si cancella; ⌘↵ di un\'altra clip nello stesso CH non lascia il CH armato sulla vecchia', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  const bass = 2;
  const viva = (nome, id, ch = bass) => ({ nome, provenienza: `uno §${brano1.sezioni.findIndex((x) => x.nome === nome) + 1}`, ch, da: 0, a: null });
  s.scegliAlt(bass, 1); // «sub»
  s.premiR(bass);
  s.scattato(bass);
  s.sincronizza([viva('sub')], 4);
  assert.equal(s.canali[bass].scelte.size, 0, 'sub suona: la scelta è eseguita, si cancella');
  assert.equal(s.canali[bass].zona, null);
  // ⌘↵ manda «reese» nello stesso CH (senza passare da NEXT): il motore la fa suonare al posto di sub
  s.sincronizza([viva('reese')], 8);
  assert.equal(s.canali[bass].suona.nome, 'reese');
  assert.equal(s.armato(bass), false, 'il CH non è armato su «sub»');
  assert.deepEqual(s.goAll(), [], 'PLAY non rimanda indietro il CH');
  // un OUT eseguito si cancella come prima
  s.scegliAlt(bass, 0);
  s.premiR(bass);
  s.adesso = () => Date.now() + 5000; // passato il respiro di 1,5 s: il motore ha già detto com'è andata
  s.sincronizza([], 12);
  s.sincronizza([], 13);
  assert.equal(s.canali[bass].scelte.size, 0);
  // una scelta non ancora eseguita resta
  s.scegliAlt(bass, 2);
  s.sincronizza([], 16);
  assert.equal(s.armato(bass), true);
});

test('passo 1.1: le scelte vivono solo per i brani in una linguetta del CUE; uscito e rientrato non ha niente armato', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(3, 1);
  s.tieniBrani(['uno', 'due']);
  assert.equal(s.armato(3), true, 'uno è ancora nel CUE');
  s.impostaBrano(brano2);
  s.tieniBrani(['uno', 'due']);
  s.impostaBrano(brano1);
  assert.equal(s.armato(3), true, 'cambiare linguetta non perde le scelte');
  s.impostaBrano(brano2);
  s.tieniBrani(['due', 'tre']); // «uno» esce da tutte e due le linguette
  s.impostaBrano(brano1);
  s.tieniBrani(['uno', 'due']); // e rientra, un'ora dopo
  assert.equal(s.armato(3), false);
  assert.equal(s.next(3), null);
});

// --- passo 2: il mixer vero ---

test('aggancio: dopo l\'avvio il fader non comanda finché non è entro ±3% del valore vero o ci passa sopra', () => {
  const s = new StatoCanali();
  s.canali[2].suona = { nome: 'x' }; // il CH suona: l'aggancio serve
  assert.deepEqual(s.fader(2, 0.3), [], 'avvio: valore vero 1, il fader sta a 0,3: i suoi messaggi non contano');
  assert.deepEqual(s.fader(2, 0.6), []);
  assert.equal(s.canali[2].vero, 1);
  assert.equal(s.vista()[2].fader.agganciato, false);
  assert.equal(s.vista()[2].fader.vero, 1, 'la tacca dice dove portarlo');
  assert.equal(s.vista()[2].fader.valore, 0.6, 'lo slider mostra la mano');
  const e = s.fader(2, 0.98); // entro il 3%
  assert.deepEqual(e.map((x) => [x.tipo, x.ch, x.pos]), [['ch', 2, 0.98]]);
  assert.equal(s.canali[2].agganciato, true);
  assert.equal(s.fader(2, 0.4)[0].pos, 0.4, 'agganciato: segue');
  assert.equal(s.vista()[2].fader.valore, 0.4);
  // la tolleranza è ±3%
  const t = new StatoCanali();
  t.canali[0].suona = { nome: 'x' };
  assert.deepEqual(t.fader(0, 0.96), [], '4% sotto: fuori');
  assert.equal(t.fader(0, 0.971)[0].tipo, 'ch', '2,9% sotto: dentro');
});

test('aggancio: ci passa sopra tra due messaggi di fila (un salto veloce che scavalca il valore)', () => {
  const s = new StatoCanali();
  s.canali[3].suona = { nome: 'x' };
  s.sliderSchermo(3, 0.5); // il valore vero è 0,5
  assert.deepEqual(s.fader(3, 0.2), [], 'da sotto');
  const e = s.fader(3, 0.8); // sopra: ha scavalcato 0,5 tra due messaggi
  assert.equal(e[0].pos, 0.8);
  assert.equal(s.canali[3].agganciato, true);
  // dalla stessa parte non si aggancia
  const t = new StatoCanali();
  t.canali[3].suona = { nome: 'x' };
  t.sliderSchermo(3, 0.5);
  t.fader(3, 0.1);
  assert.deepEqual(t.fader(3, 0.3), []);
  assert.deepEqual(t.fader(3, 0.1), []);
});

test('aggancio: lo slider a schermo comanda subito e sgancia il fisico; avvio, ripristino, nano ricollegato e PROJ nuovo lo sganciano', () => {
  const s = new StatoCanali();
  s.canali[1].suona = { nome: 'x' };
  s.fader(1, 0.99);
  assert.equal(s.canali[1].agganciato, true);
  const e = s.sliderSchermo(1, 0.4);
  assert.deepEqual(e.map((x) => [x.tipo, x.pos]), [['ch', 0.4]]);
  assert.equal(s.canali[1].agganciato, false);
  assert.equal(s.vista()[1].fader.valore, 0.4, 'subito dopo lo slider a schermo mostra il valore vero');
  assert.deepEqual(s.fader(1, 0.9), [], 'il fisico sta a 0,9, il vero è 0,4: non comanda');
  assert.equal(s.canali[1].vero, 0.4);
  assert.equal(s.vista()[1].fader.valore, 0.9, 'poi lo slider mostra la mano, con la tacca sul valore vero');
  assert.equal(s.vista()[1].fader.vero, 0.4);
  s.fader(1, 0.41);
  assert.equal(s.canali[1].agganciato, true);
  s.sganciaTutti(); // ripristino del live, nano ricollegato, PROJ nuovo
  assert.equal(s.canali[1].agganciato, false);
  assert.deepEqual(s.fader(1, 0.9), []);
  assert.equal(s.canali[1].vero, 0.41, 'il valore vero resta');
  // dopo un crash dell\'interfaccia: il mixer come l\'ha tenuto il motore, fader sganciati
  const t = new StatoCanali();
  t.leggiMixer([{ pos: 0.3, muto: false }, { pos: 1, muto: true }]);
  assert.equal(t.canali[0].vero, 0.3);
  assert.equal(t.canali[1].mute, true);
  assert.equal(t.canali[0].agganciato, false);
  assert.equal(t.datiMixer()[0].pos, 0.3);
  assert.equal(t.datiMixer().length, 8);
});

test('mixer: guadagno = volume clip × volume CH × break; muto se la clip o il CH è muto; un livello fuori dai CH non ha CH', () => {
  const ch = { volume: 0.5, muto: false };
  assert.equal(guadagnoLivello({ volume: 0.8, muto: false }, ch, 1), 0.4);
  assert.equal(guadagnoLivello({ volume: 0.8, muto: false }, ch, 0.5), 0.2);
  assert.equal(guadagnoLivello({ volume: 0.8, muto: true }, ch), 0, 'muta la clip');
  assert.equal(guadagnoLivello({ volume: 0.8, muto: false }, { volume: 1, muto: true }), 0, 'muto il CH');
  assert.equal(guadagnoLivello({ volume: 0.8, muto: false }, null), 0.8, 'senza CH');
  const st = chNeutro();
  applicaMessaggioCh(st, { volume: 0.3, pos: 0.7 });
  assert.deepEqual(st, { volume: 0.3, pos: 0.7, muto: false });
  applicaMessaggioCh(st, { muto: true });
  assert.equal(st.muto, true);
  applicaMessaggioCh(st, { volume: 'x', pos: NaN });
  assert.equal(st.volume, 0.3, 'un volume che non è un numero non rompe niente');
  applicaMessaggioCh(st, { volume: 7 });
  assert.equal(st.volume, 1);
});

test('la cuffia è pre-fader: un CH a zero o muto si sente in cuffia, e l\'effetto cuffia non porta mai volume né muto', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.fader(2, 0.99);
  s.fader(2, 0); // GROWL a zero
  s.mute(2);
  s.scegliAlt(2, 1);
  const e = s.premiS(2);
  assert.deepEqual(e.map((x) => x.tipo), ['cuffia'], 'si ascolta lo stesso');
  assert.equal(e[0].alt.nome, 'sub');
  assert.ok(!('volume' in e[0]) && !('pos' in e[0]) && !('muto' in e[0]));
  // e le uniche cose che portano volume al motore sono gli effetti «ch» (l\'app li manda solo al live)
  assert.ok(s.fader(2, 0.1).every((x) => x.tipo === 'ch'));
  assert.ok(s.mute(2).every((x) => x.tipo === 'ch'));
});

test('avvisi: il CH dice anche quando la clip che suona è muta per conto suo (la spinta della manopola dell\'X-Touch)', () => {
  const s = new StatoCanali();
  s.impostaBrano(brano1);
  s.scegliAlt(2, 1); s.go(2); s.scattato(2);
  s.sincronizza([{ nome: 'sub', provenienza: 'uno §1', ch: 2, da: 0, a: null, muto: true }], 4);
  assert.deepEqual(s.avvisi(2), ['clip muta']);
  assert.deepEqual(s.vista()[2].avvisi, ['clip muta']);
  s.sincronizza([{ nome: 'sub', provenienza: 'uno §1', ch: 2, da: 0, a: null, muto: false }], 5);
  assert.deepEqual(s.avvisi(2), []);
  s.sincronizza([], 6); // non suona: niente avvisi
  assert.deepEqual(s.avvisi(2), []);
});

test('aggancio solo quando serve: CH vuoto e senza attese = il fader comanda subito; se suona o aspetta resta l\'aggancio', () => {
  const s = new StatoCanali();
  s.sliderSchermo(4, 0.5); // sganciato, valore vero 0,5
  const e = s.fader(4, 0.1); // CH vuoto: nessun salto da evitare
  assert.deepEqual(e.map((x) => [x.tipo, x.ch, x.pos]), [['ch', 4, 0.1]]);
  assert.equal(s.canali[4].agganciato, true);
  s.sganciaTutti();
  s.canali[4].attesa = { tipo: 'go', alt: { nome: 'x' }, da: 8 }; // entrata in attesa: l'aggancio resta
  assert.deepEqual(s.fader(4, 0.9), []);
  s.canali[4].attesa = null;
  s.canali[4].suona = { nome: 'x' };
  assert.deepEqual(s.fader(4, 0.95), [], 'suona: resta');
  s.canali[4].suona = null; // la clip esce: il CH è di nuovo vuoto, il fader riprende subito
  assert.equal(s.fader(4, 0.3)[0].pos, 0.3);
});

test('chDelLivello: senza ch → STRAY; fuori solo controller e paracadute', () => {
  const cfg = canaliPredefiniti();
  const stray = cfg.findIndex((c) => c.free);
  assert.equal(chDelLivello(cfg, { nome: 'a', provenienza: 'jam' }), stray);
  assert.equal(chDelLivello(cfg, { nome: 'a', ch: 2 }), 2);
  assert.equal(chDelLivello(cfg, { nome: 'a', provenienza: 'controller' }), null);
  assert.equal(chDelLivello(cfg, { nome: 'paracadute' }), null);
});

test('STOP breve: annullaTutte annulla le attese di tutti i CH (GO e OUT), niente se non aspetta nessuno', () => {
  const s = new StatoCanali();
  assert.deepEqual(s.annullaTutte(), []);
  s.canali[0].attesa = { tipo: 'go', alt: { nome: 'a' }, da: 4 };
  s.canali[3].attesa = { tipo: 'out', da: 4 };
  const e = s.annullaTutte();
  assert.deepEqual(e.map((x) => [x.tipo, x.ch, x.quale]), [['annulla', 0, 'go'], ['annulla', 3, 'out']]);
  assert.equal(s.canali[0].attesa, null);
  assert.equal(s.canali[3].attesa, null);
  assert.deepEqual(s.annullaTutte(), []);
});

test('senzaCanale: solo una clip di un brano senza tipo; scratch, jam, kit, apertura e scene no', () => {
  assert.equal(senzaCanale({ clipDelBrano: 2, tipo: '' }), true);
  assert.equal(senzaCanale({ clipDelBrano: 0, tipo: 'bass' }), false, 'con un tipo entra');
  assert.equal(senzaCanale({ clipDelBrano: 0, tipo: 'stray' }), false);
  assert.equal(senzaCanale({ nome: 'scratch', provenienza: 'scratch', tipo: '' }), false, 'scratch → CH8');
  assert.equal(senzaCanale({ nome: 'jam', tipo: '' }), false);
  assert.equal(senzaCanale({ nome: 'apertura', tipo: '' }), false);
  assert.equal(senzaCanale({ nome: 'kick', provenienza: 'kit', tipo: '' }), false, 'kit → CH8');
  assert.equal(senzaCanale({ clipDelBrano: 1, tipo: '', beat: { indice: 0 } }), false, 'scena del beat → THUMP');
  assert.equal(senzaCanale(null), false);
});

test('USA I SUGGERITI: solo le clip senza tipo che hanno un suggerimento; chi ha già un tipo non si tocca', () => {
  const sez = [clip('bass reese'), clip('lead acuto', 'pad'), clip('qwerty'), clip('arp veloce'), clip('kick drum', 'drum')];
  const da = tipiSuggeriti(sez);
  assert.deepEqual(da, [{ i: 0, tipo: 'bass' }, { i: 3, tipo: 'arp' }], 'né la clip col tipo, né quella senza suggerimento');
  assert.deepEqual(tipiSuggeriti([clip('x', 'bass')]), []);
  // applicati tutti insieme: ogni clip prende il suo tipo e il resto dell'info resta
  const dopo = sez.map((s, i) => { const t = da.find((x) => x.i === i); return t ? { ...s, info: conTipo(s.info, t.tipo) } : s; });
  assert.deepEqual(tipiSuggeriti(dopo), [], 'dopo non resta niente da suggerire');
  assert.equal(dopo[1].info.pad, true, 'chi aveva un tipo lo tiene');
});
