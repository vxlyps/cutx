import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMETRI, iniziale, imposta, parametro } from '../src/renderer/synth-modello.js';
import { COMANDI_BASSO, GRUPPI_TASTI, PAGINE_SYNTH, anelloDi, dopoTasto, manopoleSynth, nuovoValore, paginePerGruppo } from '../src/renderer/controller-synth.js';

test('ogni parametro del synth ha il suo posto, una volta sola, e nessuna pagina ha più di sette manopole', () => {
  const posti = Object.values(PAGINE_SYNTH).flatMap((pagine) => pagine.flat());
  assert.deepEqual([...posti].sort(), PARAMETRI.map((p) => p.k).sort());
  for (const pagine of Object.values(PAGINE_SYNTH)) for (const pagina of pagine) assert.ok(pagina.length <= 7);
  // ogni parametro sta nel gruppo che il pannello gli dà
  for (const [gruppo, pagine] of Object.entries(PAGINE_SYNTH)) for (const k of pagine.flat()) assert.equal(parametro(k).g, gruppo, k);
  assert.deepEqual(GRUPPI_TASTI, ['osc', 'filtro', 'amp', 'drive', 'space']);
  assert.equal(COMANDI_BASSO.length, 8);
});

test('i tasti in alto: un altro gruppo parte dalla prima pagina, lo stesso gira le sue pagine', () => {
  assert.deepEqual(dopoTasto('osc', 0, 2), { gruppo: 'filtro', pagina: 0 });
  assert.deepEqual(dopoTasto('filtro', 0, 2), { gruppo: 'filtro', pagina: 1 });
  assert.deepEqual(dopoTasto('filtro', 1, 2), { gruppo: 'filtro', pagina: 0 });
  assert.deepEqual(dopoTasto('amp', 0, 3), { gruppo: 'amp', pagina: 0 }, 'un gruppo a una pagina sola resta lì');
  assert.deepEqual(dopoTasto('osc', 1, 6), { gruppo: 'osc', pagina: 1 }, 'i tasti 6 e 7 non cambiano niente');
  assert.equal(paginePerGruppo('space'), 2);
  assert.equal(paginePerGruppo('drive'), 1);
});

test('una manopola sposta il valore, nei limiti, e un giro fine è un decimo', () => {
  const s = iniziale();
  const q = parametro('q');
  const su = nuovoValore(q, s, 8);
  assert.ok(su > s.q && su <= 25);
  assert.equal(nuovoValore(q, s, 0), s.q);
  assert.ok(nuovoValore(q, s, -8) === 0);
  const fine = nuovoValore(q, s, 8, true);
  assert.ok(fine > s.q && fine - s.q < (su - s.q) / 5, `${fine} contro ${su}`);
  assert.equal(nuovoValore(q, { ...s, q: 25 }, 50), 25);
  // il filtro è logaritmico: 8 scatti sono 1/8 della corsa in scala logaritmica, non in Hz
  const c = nuovoValore(parametro('cutoff'), s, 8);
  assert.ok(c > s.cutoff && c < 20000);
  assert.equal(nuovoValore(parametro('cutoff'), { ...s, cutoff: 20 }, -50), 20);
});

test('numeri interi: almeno uno per scatto; scelte: un posto per scatto; interruttori: su o giù', () => {
  const s = iniziale();
  assert.equal(nuovoValore(parametro('crush'), s, -1), 15);
  assert.equal(nuovoValore(parametro('crush'), { ...s, crush: 1 }, -1), 1);
  assert.equal(nuovoValore(parametro('coarse'), s, 1), 2);
  assert.ok(nuovoValore(parametro('coarse'), s, 16) > 2, 'un giro veloce salta');
  assert.equal(nuovoValore(parametro('coarse'), s, 16, true), 2, 'fine: sempre uno');
  const forma = parametro('forma');
  assert.equal(s.forma, 'sawtooth');
  assert.equal(nuovoValore(forma, s, 1), forma.scelte[forma.scelte.indexOf('sawtooth') + 1]);
  assert.equal(nuovoValore(forma, s, -5), forma.scelte[forma.scelte.indexOf('sawtooth') - 1], 'una scelta per giro, anche se gira forte');
  assert.equal(nuovoValore(forma, { ...s, forma: forma.scelte.at(-1) }, 3), forma.scelte.at(-1), 'non ricomincia');
  const sub = parametro('sub');
  assert.equal(nuovoValore(sub, s, 1), 1);
  assert.equal(nuovoValore(sub, { ...s, sub: 1 }, -1), 0);
  // le voci: 7 al massimo col supersaw, 5 con le altre
  assert.equal(nuovoValore(parametro('voci'), { ...s, forma: 'supersaw', voci: 7 }, 5), 7);
  assert.equal(nuovoValore(parametro('voci'), { ...s, forma: 'sawtooth', voci: 5 }, 5), 5);
});

test('l\'anello: ventaglio per i valori, centro per quelli col segno, punto per le scelte', () => {
  const s = iniziale();
  assert.equal(anelloDi(parametro('cutoff'), s).stile, 'fan');
  assert.equal(anelloDi(parametro('penv'), s).stile, 'pan');
  assert.equal(anelloDi(parametro('penv'), s).valore, 0.5);
  assert.equal(anelloDi(parametro('ottava'), { ...s, ottava: -2 }).valore, 0);
  assert.equal(anelloDi(parametro('forma'), s).stile, 'punto');
  assert.equal(anelloDi(parametro('forma'), { ...s, forma: parametro('forma').scelte[0] }).valore, 0);
  assert.equal(anelloDi(parametro('forma'), { ...s, forma: parametro('forma').scelte.at(-1) }).valore, 1);
  assert.equal(anelloDi(parametro('sub'), { ...s, sub: 1 }).valore, 1);
});

test('le sette manopole della pagina: i posti fissi, e quello che non conta ha l\'anello spento', () => {
  const s = iniziale();
  const m = manopoleSynth(s, 'osc', 0, PARAMETRI, { nome: (k) => k });
  assert.deepEqual(m.map((x) => x?.k), ['forma', 'ottava', 'voci', 'detune', 'spread', 'fm', 'fmh']);
  assert.equal(m[4].conta, false, 'lo spread conta solo col supersaw');
  assert.equal(m[4].valore, null);
  assert.equal(m[0].conta, true);
  const sup = manopoleSynth({ ...s, forma: 'supersaw', voci: 5 }, 'osc', 0, PARAMETRI);
  assert.equal(sup[4].conta, true);
  const d = manopoleSynth(s, 'drive', 0, PARAMETRI);
  assert.deepEqual(d.map((x) => x?.k ?? null), ['shape', 'distort', 'crush', 'coarse', null, null, null]);
  assert.equal(manopoleSynth(s, 'filtro', 1, PARAMETRI)[0].conta, false, 'l\'inviluppo del filtro conta solo con env > 0');
  assert.equal(manopoleSynth(imposta(s, 'fenv', 3), 'filtro', 1, PARAMETRI)[0].conta, true);
});
