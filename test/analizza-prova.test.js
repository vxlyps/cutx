import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAROLE, allinea, frazioneAmbra, istantiFotogrammi, leggiRegistro, leggiSrt, minuti, motiviDaParlato, parlatoAttorno, raggruppa, rapportoHtml, rapportoMd, trovaLampi, trovaMotivi } from '../strumenti/analizza-prova-lib.mjs';

const T0 = Date.UTC(2026, 10, 5, 20, 0, 0);
const ev = (s, fonte, tipo, dati = null) => ({ t: T0 + s * 1000, ora: '', fonte, tipo, dati });

test('il registro si legge, si riordina per tempo e salta le righe rotte', () => {
  const testo = [JSON.stringify(ev(5, 'a', 'x')), 'rotta {{', '', JSON.stringify(ev(1, 'a', 'y')), JSON.stringify({ t: 'no' })].join('\n');
  const e = leggiRegistro(testo);
  assert.deepEqual(e.map((x) => x.tipo), ['y', 'x']);
});

test('i sottotitoli .srt diventano voci in secondi', () => {
  const srt = '1\n00:00:03,500 --> 00:00:06,000\nva bene così\n\n2\n00:01:02,250 --> 00:01:04,000\nvorrei un\naltro tasto\n\n';
  assert.deepEqual(leggiSrt(srt), [{ da: 3.5, a: 6, testo: 'va bene così' }, { da: 62.25, a: 64, testo: 'vorrei un altro tasto' }]);
  assert.deepEqual(leggiSrt(''), []);
});

test('i pixel ambra si contano, il resto no', () => {
  const grigio = new Uint8Array(30).fill(40);
  const ambra = new Uint8Array(30);
  for (let i = 0; i < 30; i += 3) ambra.set([224, 160, 58], i);
  assert.equal(frazioneAmbra(grigio), 0);
  assert.equal(frazioneAmbra(ambra), 1);
  const verde = new Uint8Array([159, 194, 58, 159, 194, 58]); // il verde marcio non è ambra
  assert.equal(frazioneAmbra(verde), 0);
});

test('i lampi: l\'inizio di ogni gruppo di fotogrammi con più ambra del solito', () => {
  const f = new Array(60).fill(0.001);
  for (const i of [10, 11, 12, 13, 14, 15, 16, 17]) f[i] = 0.05; // un lampo di mezzo secondo a 15 fps, al secondo 0,67
  for (const i of [40, 41, 42]) f[i] = 0.05; // un altro
  assert.deepEqual(trovaLampi(f, 15).map((x) => Math.round(x * 100) / 100), [0.67, 2.67]);
  assert.deepEqual(trovaLampi([], 15), []);
  assert.deepEqual(trovaLampi(new Array(30).fill(0.001), 15), []); // niente di strano: niente lampi
});

test('l\'allineamento: il primo lampo è il primo SEGNO; le altre cose si dicono', () => {
  const segni = [T0 + 10000, T0 + 70000];
  const a = allinea(segni, [3, 63.1]);
  assert.equal(a.offsetMs, T0 + 10000 - 3000);
  assert.deepEqual(a.avvisi, []);
  assert.equal(allinea(segni, [3, 80]).avvisi.length, 1); // il secondo lampo non cade sul secondo segno
  assert.equal(allinea(segni, [3]).avvisi.length, 1); // un lampo su due segni
  assert.equal(allinea(segni, []).offsetMs, null);
  assert.equal(allinea([], [3]).offsetMs, null);
  assert.equal(allinea(segni, [], 12).offsetMs, T0 + 10000 - 12000); // --sposta: vince lui
});

test('i motivi: errori, guardiano, risposte lente, ritardi, tentativi ripetuti, silenzi, CPU', () => {
  const eventi = [
    ev(1, 'app', 'segno', { n: 1 }),
    ev(2, 'log', 'errore', { fonte: 'live', messaggio: 'SyntaxError: Unexpected token\n   at x' }),
    ev(3, 'live', 'guardiano', { nome: 'basso', errore: 'si rompe al ciclo 2' }),
    ev(4, 'live', 'invio', { tipo: 'entra', id: 7, nome: 'melodia', codice: 's("a")' }),
    ev(4.9, 'live', 'risposta', { id: 7, da: 12, ingressoMs: 6500 }),
    ev(10, 'live', 'invio', { tipo: 'valuta', id: 8, nome: 'x', codice: 'a' }),
    ev(11, 'live', 'risposta', { id: 8, errore: null }),
    ev(30, 'live', 'invio', { tipo: 'entra', id: 9, nome: 'pad', codice: 'a' }),
    ev(33, 'live', 'invio', { tipo: 'entra', id: 10, nome: 'pad', codice: 'a' }),
    ev(36, 'live', 'invio', { tipo: 'entra', id: 11, nome: 'pad', codice: 'a' }),
    ev(40, 'live', 'stato', { tardi: 0, giroMax: 40 }),
    ev(41, 'live', 'stato', { tardi: 2, giroMax: 300 }),
    ...[50, 51, 52, 53, 54, 55].map((s, i) => ev(s, 'live', 'master', { medioDb: i === 0 ? -20 : -80 })),
    ev(56, 'live', 'master', { medioDb: -20 }),
    ...[60, 61, 62].map((s) => ev(s, 'main', 'cpu', { live: 95 })),
  ];
  const m = trovaMotivi(eventi);
  const testi = m.map((x) => `${x.tipo}: ${x.testo}`).join('\n');
  assert.match(testi, /segno: SEGNO 1/);
  assert.match(testi, /difetto: errore \(live\): SyntaxError: Unexpected token$/m); // solo la prima riga
  assert.match(testi, /difetto: il guardiano ha respinto «basso»: si rompe al ciclo 2/);
  assert.match(testi, /inciampo: ha messo 6\.5 s a entrare/);
  assert.match(testi, /difetto: live ha risposto dopo 1000 ms/); // la valutazione risposta dopo 1 s
  assert.match(testi, /inciampo: provato 3 volte di fila: entra «pad»/);
  assert.match(testi, /difetto: il live è andato in ritardo \(2 giri\)/);
  assert.match(testi, /inciampo: un giro del live è durato 300 ms/);
  assert.match(testi, /inciampo: silenzio per 5 s/);
  assert.match(testi, /inciampo: CPU alta da 3 s/);
});

test('un silenzio all\'inizio e uno che arriva fino alla fine non si segnalano', () => {
  const eventi = [...[0, 1, 2, 3, 4].map((s) => ev(s, 'live', 'master', { medioDb: -90 })), ev(5, 'live', 'master', { medioDb: -20 }), ...[6, 7, 8, 9, 10].map((s) => ev(s, 'live', 'master', { medioDb: -90 }))];
  assert.equal(trovaMotivi(eventi).filter((x) => /silenzio/.test(x.testo)).length, 0);
});

test('la voce: idee, difetti, inciampi dalle parole', () => {
  const voci = [
    { da: 5, a: 7, testo: 'sarebbe bello avere un tasto per questo' },
    { da: 20, a: 22, testo: 'ecco, non funziona più niente' },
    { da: 30, a: 31, testo: 'boh, riprovo' },
    { da: 40, a: 42, testo: 'tutto bene, che bello' },
  ];
  const m = motiviDaParlato(voci, 1000);
  assert.deepEqual(m.map((x) => [x.tipo, x.t]), [['idea', 6000], ['difetto', 21000], ['inciampo', 31000]]);
  assert.ok(PAROLE.idea.test('perché non lo facciamo') && !PAROLE.idea.test('buonasera'));
});

test('i momenti: motivi vicini insieme; difetto vince, poi idea, poi inciampo', () => {
  const motivi = [
    { t: 1000, tipo: 'segno', fonte: 'app', testo: 'SEGNO 1' },
    { t: 3000, tipo: 'difetto', fonte: 'log', testo: 'errore (live): boh' },
    { t: 4000, tipo: 'idea', fonte: 'voce', testo: 'vorrei un altro tasto' },
    { t: 60000, tipo: 'segno', fonte: 'app', testo: 'SEGNO 2' },
    { t: 62000, tipo: 'idea', fonte: 'voce', testo: 'vorrei il lampo più piccolo' },
    { t: 120000, tipo: 'segno', fonte: 'app', testo: 'SEGNO 3' },
  ];
  const m = raggruppa(motivi);
  assert.deepEqual(m.map((x) => x.categoria), ['difetti', 'idee', 'inciampi']);
  assert.equal(m[0].titolo, 'errore (live): boh');
  assert.equal(m[1].titolo, 'hai detto: «vorrei il lampo più piccolo»'); // un'idea: il titolo è la frase, non il SEGNO
  assert.equal(m[0].t0, 1000);
  assert.equal(m[0].t1, 4000);
});

test('il parlato attorno a un momento e i fotogrammi da prendere', () => {
  const voci = [{ da: 1, a: 2, testo: 'lontano' }, { da: 100, a: 102, testo: 'vicino' }, { da: 109, a: 111, testo: 'poco dopo' }, { da: 300, a: 301, testo: 'lontanissimo' }];
  const off = T0 - 100000; // il secondo 100 del video è T0
  const att = parlatoAttorno(voci, off, T0, T0 + 1000);
  assert.deepEqual(att.map((v) => v.testo), ['vicino', 'poco dopo']);
  assert.deepEqual(istantiFotogrammi({ t0: T0, t1: T0 + 500 }, off), [100, 102]);
  assert.deepEqual(istantiFotogrammi({ t0: T0, t1: T0 + 8000 }, off), [100, 108]);
  assert.deepEqual(istantiFotogrammi({ t0: T0 - 500000, t1: T0 - 500000 }, off), [0, 2]); // prima dell'inizio del video: si parte da 0
  assert.deepEqual(istantiFotogrammi({ t0: T0, t1: T0 }, off, 101), [100, 100.9]); // oltre la fine: si ferma prima
});

test('il rapporto ha le tre parti, i motivi, quello che hai detto e i fotogrammi', () => {
  const momenti = [
    { t0: T0, t1: T0, categoria: 'difetti', titolo: 'errore (live): boh', motivi: [{ t: T0, tipo: 'difetto', fonte: 'log', testo: 'errore (live): boh' }], parlato: [{ testo: 'non funziona' }], fotogrammi: ['frames/001-a.jpg'], videoS: 62 },
    { t0: T0 + 1000, t1: T0 + 1000, categoria: 'idee', titolo: 'hai detto: «vorrei <b>»', motivi: [{ t: T0, tipo: 'idea', fonte: 'voce', testo: 'vorrei <b>' }], parlato: [], fotogrammi: [], videoS: null },
  ];
  const info = { nome: 'prova', registro: 'r.jsonl', video: 'v.mov', allineamento: 'col lampo', voce: 'con la trascrizione', avvisi: ['attento'] };
  const md = rapportoMd({ momenti, info });
  assert.match(md, /## Difetti \(1\)/);
  assert.match(md, /## Inciampi \(0\)\n\n_.*_\n\nNiente\./);
  assert.match(md, /## Idee \(1\)/);
  assert.match(md, /> non funziona/);
  assert.match(md, /!\[frames\/001-a\.jpg\]\(frames\/001-a\.jpg\)/);
  assert.match(md, /⚠ attento/);
  assert.match(md, /video 01:02/);
  const html = rapportoHtml({ momenti, info });
  assert.match(html, /<img src="frames\/001-a\.jpg"/);
  assert.ok(!html.includes('<b>')); // il testo è sempre scappato
  assert.equal(minuti(62), '01:02');
});
