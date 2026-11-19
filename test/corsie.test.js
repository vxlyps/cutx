import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StatoCorsie, acquaAria, alternative, bancoPredefinito, corsiaDelTipo, corsiaDellaBeat, gainFader, validaBanco, zona } from '../src/renderer/corsie.js';

const clip = (nome, tipo) => ({ nome, info: tipo ? { [tipo]: true } : {} });
const brano1 = { nome: 'uno', bpm: 170, beat: { scene: [{ nome: 'intro' }, { nome: 'drop' }] }, sezioni: [clip('sub', 'bass'), clip('melodia', 'lead'), clip('reese', 'bass'), clip('kick', 'drum'), clip('rumori'), clip('stab', 'keys')] };
const brano2 = { nome: 'due', bpm: 140, beat: null, sezioni: [clip('wobble', 'bass'), clip('pad', 'pad')] };
const nomi = (l) => l.map((a) => a.nome);

test('Banco predefinito: valido, ogni tipo in una corsia sola, una CANAGLIA', () => {
  const b = bancoPredefinito();
  assert.deepEqual(validaBanco(b), []);
  assert.equal(b.length, 8);
  assert.equal(corsiaDelTipo(b, 'drum'), 0);
  assert.equal(corsiaDelTipo(b, 'arp'), 1, 'keys e arp insieme in MELODIA');
  assert.equal(corsiaDelTipo(b, ''), 7, 'senza tipo → CANAGLIA');
  assert.equal(corsiaDellaBeat(b), 0);
});

test('validazione del Banco', () => {
  const b = bancoPredefinito();
  b[2].tipi.push('lead');
  assert.match(validaBanco(b).join(), /lead è in due corsie/);
  const c = bancoPredefinito();
  c[7].canaglia = false;
  assert.match(validaBanco(c).join(), /manca la CANAGLIA/);
  c[0].canaglia = c[1].canaglia = true;
  assert.match(validaBanco(c).join(), /una sola/);
  const d = bancoPredefinito();
  d[3].nome = '  ';
  d[4].tipi = ['kazoo'];
  assert.equal(validaBanco(d).length, 2);
  assert.equal(validaBanco(bancoPredefinito().slice(0, 7)).length, 1);
});

test('alternative: nell\'ordine del file, mai per tipo; DRUM = scene e poi clip drum; CANAGLIA = tutte le clip', () => {
  const b = bancoPredefinito();
  assert.deepEqual(nomi(alternative(b, brano1, 0)), ['intro', 'drop', 'kick']);
  assert.deepEqual(nomi(alternative(b, brano1, 2)), ['sub', 'reese'], 'BASSO: l\'ordine del file');
  assert.deepEqual(nomi(alternative(b, brano1, 1)), ['stab']);
  assert.deepEqual(nomi(alternative(b, brano1, 7)), ['sub', 'melodia', 'reese', 'kick', 'rumori', 'stab'], 'CANAGLIA: tutte, in ordine di file, scene no');
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

test('in canna: manopolina mai mossa = la prima; girarla non fa suonare niente; il brano nuovo ricalcola dalla stessa posizione', () => {
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  assert.equal(s.inCanna(2).nome, 'sub');
  assert.equal(s.scegli(2, 0.9).nome, 'reese');
  assert.equal(s.corsie[2].suona, null);
  s.impostaBrano(brano2);
  assert.equal(s.inCanna(2).nome, 'wobble', 'una sola alternativa: quella');
  assert.equal(s.inCanna(5), null, 'PERC: niente in canna');
  s.impostaBrano(brano1);
  assert.equal(s.inCanna(2).nome, 'reese', 'stessa posizione 0,9 sul brano nuovo');
});

test('entra / annulla / niente in canna / stessa clip', () => {
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  const e = s.entra(2);
  assert.deepEqual(e.map((x) => x.tipo), ['entra']);
  assert.equal(e[0].alt.nome, 'sub');
  assert.equal(e[0].cicli, 1);
  assert.equal(s.luceR(2), 'veloce');
  assert.deepEqual(s.entra(2).map((x) => x.tipo), ['annulla'], 'ripremuto mentre aspetta: annulla');
  assert.equal(s.corsie[2].attesa, null);
  s.entra(2);
  s.scattato(2);
  assert.equal(s.corsie[2].suona.nome, 'sub');
  assert.equal(s.luceR(2), 'accesa', 'suona e in canna c\'è la stessa');
  assert.deepEqual(s.entra(2), [], 'in canna la stessa che suona: niente');
  s.scegli(2, 0.9);
  assert.equal(s.luceR(2), 'lenta', 'in canna c\'è altro');
  assert.equal(s.luceR(5), 'spenta');
  const v = s.entra(5);
  assert.equal(v[0].tipo, 'avviso');
  assert.match(v[0].testo, /niente in canna per PERC/);
});

test('esce: annulla se ripremuto; tenuto 1 s esce subito; su una corsia vuota niente', () => {
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  assert.deepEqual(s.esce(2), []);
  s.entra(2); s.scattato(2);
  assert.deepEqual(s.esce(2).map((x) => x.tipo), ['esce']);
  assert.equal(s.luceS(2), 'veloce');
  assert.deepEqual(s.esce(2).map((x) => x.tipo), ['annulla']);
  assert.equal(s.luceS(2), 'spenta');
  assert.deepEqual(s.esceSubito(2).map((x) => x.tipo), ['esce-subito']);
  assert.equal(s.corsie[2].suona, null);
});

test('ENTRA ed ESCE sulla stessa corsia: vince l\'ultimo premuto', () => {
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  s.entra(2); s.scattato(2);
  s.scegli(2, 0.9);
  assert.deepEqual(s.entra(2).map((x) => x.tipo), ['entra']);
  assert.deepEqual(s.esce(2).map((x) => x.tipo), ['annulla', 'esce'], 'l\'uscita prende il posto dell\'entrata');
  assert.equal(s.corsie[2].attesa.tipo, 'esce');
  assert.deepEqual(s.entra(2).map((x) => x.tipo), ['annulla', 'entra'], 'e viceversa');
  assert.equal(s.corsie[2].attesa.tipo, 'entra');
});

test('ARREMBAGGIO: entra tutto quello che è in canna ed è diverso; le entrate già in attesa restano', () => {
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  s.entra(2); s.scattato(2); // BASSO suona «sub» e in canna c'è «sub»
  s.entra(3); // LEAD già in attesa
  const e = s.arrembaggio();
  const corsie = e.filter((x) => x.tipo === 'entra').map((x) => x.corsia);
  assert.deepEqual(corsie, [0, 1, 7]);
  assert.equal(s.corsie[3].attesa.tipo, 'entra', 'LEAD non annullata');
  assert.ok(!e.some((x) => x.corsia === 2), 'BASSO suona già quella in canna');
  assert.equal(s.luceR(5), 'spenta');
});

test('BPM: entra con la corsia DRUM, solo se diverso; le altre corsie non lo toccano', () => {
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  const e = s.entra(0);
  assert.equal(e[0].bpm, 170);
  s.scattato(0);
  assert.equal(s.bpm, 170);
  s.impostaBrano(brano2);
  const b = s.entra(2);
  assert.equal(b[0].bpm, undefined, 'BASSO non porta il tempo');
  s.impostaBrano({ ...brano1, nome: 'tre', bpm: 170 });
  s.scegli(0, 0.9);
  assert.equal(s.entra(0)[0].bpm, undefined, 'stesso tempo del set: niente cambio');
});

test('«vecchia»: clip di un brano diverso sia da quello della DRUM sia da quello nel CUE', () => {
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  s.entra(0); s.scattato(0);
  s.entra(2); s.scattato(2);
  assert.equal(s.vecchia(2), false, 'stesso brano della DRUM');
  s.impostaBrano(brano2);
  assert.equal(s.vecchia(2), false, 'brano diverso dal CUE, ma uguale a quello della DRUM');
  s.entra(0); s.scattato(0); // la DRUM... brano2 non ha beat né drum: nessuna alternativa, la DRUM resta di «uno»
  s.impostaBrano({ ...brano2, nome: 'tre' });
  assert.equal(s.vecchia(2), false, 'uguale alla DRUM che suona ancora');
  s.esceSubito(0);
  assert.equal(s.vecchia(2), true, 'né della DRUM (vuota) né del CUE: vecchia');
  assert.equal(s.vecchia(5), false, 'corsia vuota');
});

test('PENNA: il pezzo entra nella corsia del suo tipo, senza tipo in CANAGLIA', () => {
  const s = new StatoCorsie();
  const a = s.entraDiretto('bass', { nome: 'mio', codice: 'note("c1")' });
  assert.equal(a.at(-1).corsia, 2);
  assert.equal(a.at(-1).codice, 'note("c1")');
  const b = s.entraDiretto('', { nome: 'libero', codice: 's("bd")' });
  assert.equal(b.at(-1).corsia, 7);
  const c = s.entraDiretto(undefined, { nome: 'altro', codice: 's("hh")' });
  assert.deepEqual(c.map((x) => x.tipo), ['annulla', 'entra'], 'vince l\'ultimo anche qui');
});

test('fader: curva da mixer; «non letto» vale il codice; avvisi muta e fader a zero', () => {
  assert.equal(gainFader(null), 1);
  assert.equal(gainFader(1), 1);
  assert.ok(Math.abs(20 * Math.log10(gainFader(0.5)) + 15) < 0.01, 'a metà −15 dB');
  assert.equal(gainFader(0), 0);
  assert.equal(gainFader(0.02), 0);
  let prima = -1;
  for (let v = 0; v <= 1; v += 0.01) { const g = gainFader(v); assert.ok(g >= prima, 'sempre crescente'); assert.ok(g <= 1); prima = g; }
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  s.entra(2); s.scattato(2);
  assert.deepEqual(s.avvisi(2), []);
  s.fader(2, 0);
  s.muto(2);
  assert.deepEqual(s.avvisi(2), ['muta', 'fader a zero']);
  assert.equal(s.luceM(2), 'accesa');
  s.muto(2);
  assert.equal(s.luceM(2), 'spenta');
  assert.equal(s.vista()[2].fader.letto, true);
  assert.equal(s.vista()[3].fader.letto, false, '«non letto»');
});

test('ACQUA·ARIA: neutro al centro, acqua a sinistra, aria a destra', () => {
  assert.equal(acquaAria(null).tipo, 'neutro');
  assert.equal(acquaAria(0.5).tipo, 'neutro');
  assert.equal(acquaAria(0.46).tipo, 'neutro', 'zona morta ±4%');
  assert.equal(acquaAria(0.54).tipo, 'neutro');
  assert.equal(acquaAria(0).tipo, 'acqua');
  assert.ok(Math.abs(acquaAria(0).lp - 200) < 0.5, 'tutto a sinistra ~200 Hz');
  assert.ok(acquaAria(0.45).lp > 15000, 'appena fuori dalla zona morta: quasi aperto');
  assert.ok(acquaAria(0.2).lp < acquaAria(0.3).lp, 'più a sinistra = più chiuso');
  assert.equal(acquaAria(1).tipo, 'aria');
  assert.ok(Math.abs(acquaAria(1).hp - 5000) < 1, 'tutto a destra ~5 kHz');
  assert.ok(acquaAria(0.55).hp < 40);
  assert.ok(acquaAria(0.7).hp < acquaAria(0.9).hp);
});

test('entra tra: 1, 2, 4, 8 senza tornare indietro', () => {
  const s = new StatoCorsie();
  s.piuEntraTra(-1);
  assert.equal(s.entraTra, 1);
  s.piuEntraTra(1); s.piuEntraTra(1);
  assert.equal(s.entraTra, 4);
  s.piuEntraTra(1); s.piuEntraTra(1);
  assert.equal(s.entraTra, 8);
  s.impostaBrano(brano1);
  assert.equal(s.entra(2)[0].cicli, 8);
});

test('vista: tutto quello che serve allo schermo', () => {
  const s = new StatoCorsie();
  s.impostaBrano(brano1);
  const v = s.vista();
  assert.equal(v.length, 8);
  assert.equal(v[0].nome, 'DRUM');
  assert.equal(v[7].canaglia, true);
  assert.equal(v[0].alternative.length, 3);
  assert.equal(v[0].inCanna.nome, 'intro');
  assert.equal(v[5].inCanna, null);
});
