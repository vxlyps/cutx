// I gesti sul video vero di Valerio (mano2): i punti che la camera ha visto, rigiocati nel controllo come li vede l'app (un passo ogni 40 ms).
// I punti stanno fuori dal repo (sono la sua mano): ~/Progetti/cutx-prova-mani/mano2-punti.json, o CUTX_MANI_PUNTI. Senza il file i test si saltano.
// Si rifanno con: CUTX_VIDEO_MANO=…/mano2.mjpeg CUTX_MANI_DUMP=…/mano2-punti.json CUTX_MANI_DUMP_S=62 node scripts/prova-silenziosa.mjs mani-dump (volume basso).
// Il video: 0–3 s fuori inquadratura · 3–10 s la mano entra ed esce di corsa (3 volte) · poi mano ferma, su e giù · 28 s pugno, aperta, pugno… · dura 51,2 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ControlloMano } from '../src/renderer/mani-controllo.js';
import { analizza } from '../src/renderer/mani-gesto.js';

const FILE = process.env.CUTX_MANI_PUNTI || path.join(os.homedir(), 'Progetti', 'cutx-prova-mani', 'mano2-punti.json');
const ho = existsSync(FILE);
const salta = ho ? false : `manca ${FILE}`;
const FINE_VIDEO = 51200;

// [{ t, ar, p }]: p = i 21 punti della mano (o null)
const fotogrammi = () => JSON.parse(readFileSync(FILE, 'utf8')).map(([t, ar, mani]) => ({ t, ar, p: mani[0] ?? null }));

function rigioca(modo = 'filtro') {
  const d = fotogrammi();
  const c = new ControlloMano({ modo, cicloMs: () => 2000 });
  const fasi = []; // { t, fase, valori }
  let i = 0;
  let ultimo = null;
  for (let t = 0; t <= FINE_VIDEO; t += 40) {
    while (i < d.length && d[i].t <= t) ultimo = d[i++];
    const fresca = ultimo && t - ultimo.t < 400 && ultimo.p;
    const r = c.aggiorna({ mano: fresca ? { punti: ultimo.p, ar: ultimo.ar } : null, ora: t });
    fasi.push({ t, fase: r.fase, valori: r.valori, riga: r.riga });
  }
  return { fasi, d };
}
const a = (fasi, t) => fasi.find((f) => f.t >= t).fase;
const primo = (fasi, fase, da = 0) => fasi.find((f) => f.t >= da && f.fase === fase)?.t ?? null;

test('video vero: la mano che entra ed esce di corsa non aggancia mai (primi 12 s)', { skip: salta }, () => {
  const { fasi } = rigioca();
  assert.ok(fasi.filter((f) => f.t < 12000).every((f) => f.fase === 'libera'));
});

test('video vero: la mano ferma aggancia (tra 12 e 13,5 s)', { skip: salta }, () => {
  const t = primo(rigioca().fasi, 'agganciata');
  assert.ok(t >= 12000 && t <= 13500, `agganciata a ${t}`);
});

test('video vero: il pugno blocca, e aprendo la mano ferma si riaggancia (28–33 s)', { skip: salta }, () => {
  const { fasi } = rigioca();
  const b1 = primo(fasi, 'bloccata');
  assert.ok(b1 >= 28000 && b1 <= 29000, `prima bloccata a ${b1}`);
  const r1 = primo(fasi, 'agganciata', b1);
  assert.ok(r1 >= 29600 && r1 <= 30800, `riagganciata a ${r1}`);
  const b2 = primo(fasi, 'bloccata', r1);
  assert.ok(b2 >= 30700 && b2 <= 31600, `seconda bloccata a ${b2}`);
});

test('video vero: bloccata resta bloccata anche con la mano fuori inquadratura, finché non riaggancio', { skip: salta }, () => {
  const { fasi } = rigioca();
  assert.equal(a(fasi, 34000), 'bloccata'); // la mano è fuori dal frame tra 32,7 e 35,5 s
  assert.equal(a(fasi, 36500), 'bloccata'); // rientra a pugno
  const t = primo(fasi, 'agganciata', 36000);
  assert.ok(t >= 37800 && t <= 39000, `riagganciata a ${t}`);
});

test('video vero: il valore non fa mai salti (nessun passo oltre 0,2 tra due passi da 40 ms), tranne il ritorno indietro del pugno', { skip: salta }, () => {
  const { fasi } = rigioca();
  let salto = 0;
  for (let i = 1; i < fasi.length; i++) {
    if (fasi[i].fase === 'bloccata' && fasi[i - 1].fase !== 'bloccata') continue; // chiudere la mano muove un po' il valore: al blocco torna a un attimo prima
    for (let k = 0; k < 2; k++) salto = Math.max(salto, Math.abs(fasi[i].valori[k] - fasi[i - 1].valori[k]));
  }
  assert.ok(salto < 0.2, `salto massimo ${salto.toFixed(3)}`);
});

test('video vero: le righe non partono più di ~15 al secondo, in tutti e tre i modi', { skip: salta }, () => {
  for (const modo of ['filtro', 'spazio', 'ctx']) {
    const { fasi } = rigioca(modo);
    const cambi = fasi.filter((f, i) => i > 0 && f.riga !== fasi[i - 1].riga).length;
    assert.ok(cambi / (FINE_VIDEO / 1000) <= 15, `${modo}: ${cambi} righe in ${FINE_VIDEO / 1000} s`);
  }
});

test('video vero: pugno e mano aperta stanno ben separati, le dita non saturano', { skip: salta }, () => {
  const { d } = rigioca();
  const forme = { aperta: [], pugno: [] };
  const dita = [];
  for (const f of d) {
    const an = f.p ? analizza(f.p, f.ar) : null;
    if (!an) continue;
    if (an.forma === 'aperta') {
      forme.aperta.push(an.estese);
      dita.push(an.dita);
    } else if (an.forma === 'pugno') forme.pugno.push(an.estese);
  }
  assert.ok(Math.min(...forme.aperta) >= 1.6 && Math.max(...forme.pugno) <= 1.25);
  assert.ok(forme.aperta.length > 300 && forme.pugno.length > 50);
  const saturate = dita.filter((x) => x <= 0.01 || x >= 0.99).length / dita.length;
  assert.ok(saturate < 0.25, `dita ai due estremi: ${(saturate * 100).toFixed(0)}%`);
});
