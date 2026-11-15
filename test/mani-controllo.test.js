import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ControlloMano } from '../src/renderer/mani-controllo.js';
import { hzDaAltezza, MODI, modoDopo } from '../src/renderer/mani-modi.js';
import { mano } from './mani-mano-finta.js';

const PASSO = 40;
// Fa girare il controllo da `da` ad `a` ms. fn(t) → la mano di quell'istante (o null). Ritorna { s: ultimo stato, tutti }.
function corri(c, da, a, fn) {
  const tutti = [];
  for (let t = da; t <= a; t += PASSO) tutti.push(c.aggiorna({ mano: (m => (m ? { punti: m, ar: 1 } : null))(fn(t)), ora: t }));
  return { s: tutti.at(-1), tutti };
}
const ferma = (o) => () => mano(o);
const nuovo = (o = {}) => new ControlloMano({ cicloMs: () => 2000, ...o });
const agganciato = (c, o = { x: 0.5, y: 0.5 }) => {
  const { s } = corri(c, 0, 800, ferma(o));
  assert.equal(s.fase, 'agganciata');
  return 800;
};

test('una mano che passa di corsa non aggancia mai', () => {
  const c = nuovo();
  const { tutti } = corri(c, 0, 3000, (t) => mano({ x: 0.1 + ((t % 600) / 600) * 0.8, y: 0.5 }));
  assert.ok(tutti.every((s) => s.fase === 'libera'));
  assert.ok(tutti.every((s) => !s.controlla));
});

test('una mano aperta e ferma aggancia dopo mezzo secondo; l\'anello si riempie piano', () => {
  const c = nuovo();
  const { tutti } = corri(c, 0, 1000, ferma({}));
  const i = tutti.findIndex((s) => s.fase === 'agganciata');
  assert.ok(i >= 0);
  assert.ok(i * PASSO >= 480 && i * PASSO <= 640, `agganciata a ${i * PASSO} ms`);
  const prima = tutti.slice(0, i).map((s) => s.progresso);
  assert.ok(prima.every((p, k) => k === 0 || p >= prima[k - 1]) && prima.at(-1) > 0.8);
});

test('la durata dell\'aggancio si tara', () => {
  const c = nuovo({ aggancioMs: 1000 });
  assert.equal(corri(c, 0, 800, ferma({})).s.fase, 'libera');
  assert.equal(corri(c, 840, 1400, ferma({})).s.fase, 'agganciata');
});

test('mano a metà o pugno: non aggancia', () => {
  for (const forma of ['pugno', 'mista']) assert.equal(corri(nuovo(), 0, 2000, ferma({ forma })).s.fase, 'libera');
});

test('una mano che si muove un po\' ma resta ferma nell\'insieme aggancia; una che trema forte no', () => {
  const lieve = nuovo();
  assert.equal(corri(lieve, 0, 900, (t) => mano({ x: 0.5 + 0.004 * Math.sin(t / 50), y: 0.5 })).s.fase, 'agganciata');
  const forte = nuovo();
  assert.equal(corri(forte, 0, 2000, (t) => mano({ x: 0.5 + 0.15 * Math.sin(t / 60), y: 0.5 })).s.fase, 'libera');
});

test('niente salto: all\'aggancio il valore resta dov\'è, anche con la mano in basso', () => {
  const c = nuovo();
  const t = agganciato(c, { x: 0.5, y: 0.85 }); // mano bassa, ma il filtro è ancora tutto aperto
  const r = corri(c, t + PASSO, t + 600, ferma({ x: 0.5, y: 0.85 }));
  assert.ok(r.tutti.every((s) => s.valori[0] > 0.999));
  assert.ok(r.tutti.every((s) => !s.cambia && s.riga === null), 'nessuna riga finché la mano non si muove');
});

test('la mano sposta il valore da dov\'è: giù chiude piano, sul pavimento arriva a zero, risalire riapre', () => {
  const c = nuovo();
  const t = agganciato(c, { x: 0.5, y: 0.4 });
  const giu = corri(c, t + PASSO, t + 2500, (q) => mano({ x: 0.5, y: Math.min(0.95, 0.4 + (q - t) / 3000) }));
  const v = giu.tutti.map((s) => s.valori[0]);
  assert.ok(v.every((x, i) => i === 0 || x <= v[i - 1] + 1e-9), 'scende e basta');
  assert.ok(v.at(-1) < 0.15);
  assert.equal(giu.tutti.filter((s) => s.cambia).at(0).riga.startsWith('all(x => x.lpf('), true);
  const su = corri(c, t + 2540, t + 6000, ferma({ x: 0.5, y: 0.4 }));
  assert.ok(su.s.valori[0] > 0.95, 'tornata al punto di aggancio, il filtro è di nuovo dov\'era');
});

test('la riga cambia piano (zona morta e al massimo ~15 al secondo)', () => {
  const c = nuovo();
  const t = agganciato(c);
  const r = corri(c, t + PASSO, t + 3000, (q) => mano({ x: 0.5, y: 0.5 + 0.4 * Math.sin((q - t) / 150) }));
  const tempi = r.tutti.map((s, i) => (s.cambia ? t + PASSO * (i + 1) : null)).filter((x) => x !== null);
  assert.ok(tempi.length > 5);
  for (let i = 1; i < tempi.length; i++) assert.ok(tempi[i] - tempi[i - 1] >= 66);
  const tremolio = nuovo();
  const t2 = agganciato(tremolio);
  const f = corri(tremolio, t2 + PASSO, t2 + 3000, (q) => mano({ x: 0.5, y: 0.5 + 0.002 * Math.sin(q / 30) }));
  assert.equal(f.tutti.filter((s) => s.cambia).length, 0);
});

test('un fotogramma senza mano (sotto 150 ms) non cambia niente', () => {
  const c = nuovo();
  const t = agganciato(c);
  const r = corri(c, t + PASSO, t + 120, () => null);
  assert.equal(r.s.fase, 'agganciata');
});

test('mano persa: il valore resta fermo 2 s, poi torna a neutro in 2 cicli, in modo continuo, e la riga sparisce', () => {
  const c = nuovo();
  const t = agganciato(c, { x: 0.5, y: 0.4 });
  corri(c, t + PASSO, t + 2000, (q) => mano({ x: 0.5, y: 0.4 + (q - t) / 4000 })); // filtro chiuso a metà
  const tenuto = c.valori[0];
  assert.ok(tenuto < 0.8 && c.riga !== null);
  const t1 = t + 2040;
  const tenuta = corri(c, t1, t1 + 1800, () => null);
  assert.equal(tenuta.s.fase, 'persa');
  assert.ok(tenuta.tutti.every((s) => Math.abs(s.valori[0] - tenuto) < 1e-9), 'fermo');
  assert.equal(tenuta.tutti.filter((s) => s.cambia).length, 0);
  const t2 = t1 + 1840;
  const rilascio = corri(c, t2, t2 + 4600, () => null);
  const v = rilascio.tutti.map((s) => s.valori[0]);
  assert.ok(v.every((x, i) => i === 0 || x >= v[i - 1] - 1e-9), 'sale sempre, mai bloccato né indietro');
  const fine = rilascio.tutti.findIndex((s) => s.fase === 'libera');
  assert.ok(fine > 0);
  assert.equal(rilascio.tutti[fine].riga, null);
  assert.equal(rilascio.tutti[fine].cambia, true, 'la riga va tolta');
  assert.equal(rilascio.tutti[fine].controlla, false);
  const durata = fine * PASSO;
  assert.ok(durata >= 300 + 4000 - 400 && durata <= 4600 + 100, `rilascio ${durata}`);
});

test('mano rientrata dopo averla persa: ferma un quarto di secondo e riaggancia al volo, da dov\'era', () => {
  const c = nuovo();
  const t = agganciato(c, { x: 0.5, y: 0.4 });
  corri(c, t + PASSO, t + 2000, (q) => mano({ x: 0.5, y: 0.4 + (q - t) / 4000 }));
  const tenuto = c.valori[0];
  const t1 = t + 2040;
  corri(c, t1, t1 + 1000, () => null);
  const t2 = t1 + 1040;
  const r = corri(c, t2, t2 + 500, ferma({ x: 0.5, y: 0.7 }));
  assert.equal(r.s.fase, 'agganciata');
  const i = r.tutti.findIndex((s) => s.fase === 'agganciata');
  assert.ok(i * PASSO <= 360, `riagganciata a ${i * PASSO} ms`);
  assert.ok(Math.abs(r.s.valori[0] - tenuto) < 0.01, 'nessun salto');
});

test('riaggancio anche durante il rilascio (dopo i 2 s), da dov\'è arrivato', () => {
  const c = nuovo();
  const t = agganciato(c, { x: 0.5, y: 0.4 });
  corri(c, t + PASSO, t + 2000, (q) => mano({ x: 0.5, y: 0.4 + (q - t) / 4000 }));
  const t1 = t + 2040;
  corri(c, t1, t1 + 3000, () => null);
  assert.equal(c.fase, 'rilascio');
  const a = c.valori[0];
  const r = corri(c, t1 + 3040, t1 + 3600, ferma({ x: 0.5, y: 0.5 }));
  assert.equal(r.s.fase, 'agganciata');
  assert.ok(Math.abs(r.s.valori[0] - a) < 0.1);
});

test('pugno: blocca, il valore torna a un attimo prima, e poi non cambia più (né con la mano mossa né persa)', () => {
  const c = nuovo();
  const t = agganciato(c, { x: 0.5, y: 0.4 });
  const prima = corri(c, t + PASSO, t + 1500, (q) => mano({ x: 0.5, y: 0.4 + (q - t) / 3000 }));
  const t1 = t + 1540;
  // la mano si chiude e intanto scivola in basso: il valore deve restare quello di prima di chiudere
  const alChiudere = c.valori[0];
  const r = corri(c, t1, t1 + 400, (q) => mano({ x: 0.5, y: 0.4 + (1500 + q - t1) / 3000, forma: 'pugno' }));
  assert.equal(r.s.fase, 'bloccata');
  assert.ok(Math.abs(r.s.valori[0] - alChiudere) < 0.08, `valore ${r.s.valori[0]} vs ${alChiudere}`);
  const bloccato = r.s.valori[0];
  const dopo = corri(c, t1 + 440, t1 + 3000, (q) => (q < t1 + 1500 ? mano({ x: 0.2, y: 0.9, forma: 'pugno' }) : null));
  assert.ok(dopo.tutti.every((s) => s.fase === 'bloccata' && s.valori[0] === bloccato));
  assert.ok(c.riga !== null, 'la riga resta nel live');
  assert.ok(prima.s.valori[0] <= alChiudere + 1e-9);
});

test('da bloccata: riaggancia con la mano aperta e ferma, da dov\'era', () => {
  const c = nuovo();
  const t = agganciato(c, { x: 0.5, y: 0.4 });
  corri(c, t + PASSO, t + 1500, (q) => mano({ x: 0.5, y: 0.4 + (q - t) / 3000 }));
  const t1 = t + 1540;
  corri(c, t1, t1 + 500, ferma({ x: 0.5, y: 0.6, forma: 'pugno' }));
  assert.equal(c.fase, 'bloccata');
  const v = c.valori[0];
  const r = corri(c, t1 + 540, t1 + 1200, ferma({ x: 0.5, y: 0.6 })); // da bloccata serve l'aggancio intero (½ s)
  assert.equal(r.s.fase, 'agganciata');
  assert.ok(Math.abs(r.s.valori[0] - v) < 0.01);
});

test('un pugno brevissimo (la mano che si chiude e si riapre) non blocca', () => {
  const c = nuovo();
  const t = agganciato(c);
  corri(c, t + PASSO, t + 120, ferma({ forma: 'pugno' }));
  const r = corri(c, t + 160, t + 600, ferma({}));
  assert.equal(r.s.fase, 'agganciata');
});

test('ferma() e cambiaModo(): tolgono la riga subito, solo se c\'era', () => {
  const c = nuovo();
  assert.equal(c.ferma().cambia, false);
  const t = agganciato(c, { x: 0.5, y: 0.3 });
  corri(c, t + PASSO, t + 1500, (q) => mano({ x: 0.5, y: 0.3 + (q - t) / 2500 }));
  assert.ok(c.riga);
  const r = c.cambiaModo('spazio');
  assert.equal(r.cambia, true);
  assert.equal(r.controlla, false);
  assert.equal(r.nomeModo, 'SPAZIO');
  assert.equal(r.fase, 'libera');
  assert.equal(c.ferma().cambia, false);
});

test('i tre modi scrivono righe «mano» e partono da neutro', () => {
  assert.equal(MODI.filtro.riga([1, 0]), `all(x => x.lpf(${hzDaAltezza(1)})) // mano`);
  assert.equal(MODI.filtro.riga([0.5, 0.5]), `all(x => x.lpf(${hzDaAltezza(0.5)}).lpq(12)) // mano`);
  assert.equal(MODI.spazio.riga([0, 0]), null);
  assert.equal(MODI.spazio.riga([0.4, 0.5]), 'all(x => x.room(0.4).delay(0.45)) // mano');
  assert.equal(MODI.ctx.riga([0, 0]), null);
  assert.equal(MODI.ctx.riga([1, 1]), 'all(x => x.crush(3).distort(8)) // mano');
  assert.deepEqual([modoDopo('filtro'), modoDopo('spazio'), modoDopo('ctx')], ['spazio', 'ctx', 'filtro']);
});

test('modo SPAZIO: l\'altezza dà il riverbero, le dita l\'eco; la mano alta non salta', () => {
  const c = nuovo({ modo: 'spazio' });
  const t = agganciato(c, { x: 0.5, y: 0.7 });
  const r = corri(c, t + PASSO, t + 1500, (q) => mano({ x: 0.5, y: Math.max(0.1, 0.7 - (q - t) / 1000), dita: 1 }));
  assert.ok(r.s.valori[0] > 0.8, 'su = più riverbero');
  assert.ok(/room\(/.test(r.s.riga));
});
