import test from 'node:test';
import assert from 'node:assert/strict';
import { curva, fattoreLivello, livelloUscito, statoParola, volumeLivello } from '../src/cimice/hack.js';

test('la curva: il brano continua identico all\'inizio, poi cresce e alla fine non c\'è più niente', () => {
  assert.equal(curva(0.05).fase, 'brano');
  assert.equal(curva(0.05).ogni, null);
  assert.equal(curva(0.05).mangia, 0);
  assert.equal(curva(0.2).fase, 'inizio');
  assert.equal(curva(0.2).insieme, 1);
  assert.equal(curva(0.4).insieme, 3);
  assert.equal(curva(0.9).fase, 'collasso');
  assert.equal(curva(1).mangia, 1);
  assert.equal(curva(1).volume, 0);
  assert.equal(curva(1).fase, 'fine');
});

test('più si va avanti più dispetti, più cimici, più codice mangiato, meno volume (mai il contrario)', () => {
  let prima = curva(0);
  for (let f = 0.01; f <= 1.0001; f += 0.01) {
    const c = curva(f);
    assert.ok(c.cimici >= prima.cimici, `cimici a ${f}`);
    assert.ok(c.mangia >= prima.mangia - 1e-9, `mangia a ${f}`);
    assert.ok(c.volume <= prima.volume + 1e-9, `volume a ${f}`);
    assert.ok(c.volume <= 1 && c.volume >= 0);
    prima = c;
  }
  assert.equal(curva(0.1).cimici, 1);
  assert.equal(curva(0.99).cimici >= 8, true);
});

test('il collasso: i livelli escono uno alla volta e alla fine sono tutti andati', () => {
  const n = 4;
  assert.deepEqual([0, 1, 2, 3].map((i) => fattoreLivello(0.7, i, n)), [1, 1, 1, 1]);
  let usciti = 0;
  for (let f = 0.8; f <= 0.9501; f += 0.005) {
    const ora = [0, 1, 2, 3].filter((i) => livelloUscito(f, i, n)).length;
    assert.ok(ora >= usciti, 'un livello uscito non rientra');
    usciti = ora;
  }
  assert.equal(usciti, 4);
  // il primo esce prima dell'ultimo
  assert.ok(fattoreLivello(0.84, 0, n) < fattoreLivello(0.84, 3, n));
});

test('il volume non sale mai sopra quello di partenza', () => {
  for (const partenza of [0.3, 1, 1.4]) {
    for (let f = 0; f <= 1; f += 0.02) for (let i = 0; i < 3; i++) assert.ok(volumeLivello(partenza, f, i, 3) <= partenza + 1e-9);
  }
  assert.equal(volumeLivello(0.8, 0, 0, 3), 0.8);
  assert.equal(volumeLivello(0.8, 1, 0, 3), 0);
});

test('il codice mangiato: ogni parola sempre uguale a sé stessa, intatta → glitch → sparita, mai al contrario', () => {
  for (let seme = 1; seme < 200; seme++) {
    let ultimo = 0;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const s = statoParola(seme, p);
      assert.ok(s >= ultimo, 'non torna indietro');
      ultimo = s;
    }
    assert.equal(statoParola(seme, 1), 2, 'a mangia=1 non resta niente');
    assert.equal(statoParola(seme, 0), 0);
  }
  // a metà più o meno la metà delle parole è toccata
  let toccate = 0;
  for (let seme = 1; seme <= 1000; seme++) if (statoParola(seme, 0.5) > 0) toccate++;
  assert.ok(toccate > 400 && toccate < 600, `${toccate}`);
});

// --- l'esecuzione ---
import { creaHackApp } from '../src/cimice/hack-app.js';
import { imposta as impostaVoce, togli as togliVoce } from '../src/renderer/coda.js';

const finto = () => new Proxy({ queryArc: () => [] }, { get: (t, k) => (k in t ? t[k] : () => finto()) });
globalThis.sine = { range: () => ({ fast: () => 1 }) };
function mondo(n = 3) {
  const seme = (() => { let x = 5; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const livelli = Array.from({ length: n }, (_, i) => ({ id: i + 1, nome: `liv${i + 1}`, codice: 'note("c2").s("sawtooth").lpf(3000)', coda: [], volume: 0.8, a: null, da: null, muto: false }));
  const out = { msg: [], proj: [], fermato: 0, eventi: [] };
  const env = {
    livelli: () => livelli, pattern: () => finto(), limiterDb: () => 0, inModifica: () => false, cps: () => 0.5, caso: seme,
    manda: (m) => {
      out.msg.push(m);
      const l = livelli.find((x) => x.id === m.livello);
      if (!l) return;
      if (m.volume !== undefined) l.volume = m.volume;
      let coda = l.coda;
      for (const k of m.togli ?? []) coda = togliVoce(coda, k);
      for (const t of m.imposta ?? []) coda = impostaVoce(coda, t);
      if (m.tipo === 'coda') l.coda = coda;
    },
    scrivi: (t, d) => out.eventi.push([t, d]), alProiettore: (m) => out.proj.push(m), avviso: () => {}, fermaTutto: () => { out.fermato++; livelli.length = 0; },
    imposta: () => 0, togliTimer: () => {},
  };
  return { env, out, livelli };
}
const giro = (app, minuti, passoMs = 100, daF = 0, aF = 1) => {
  const durata = minuti * 60000;
  for (let ms = daF * durata; ms <= aF * durata + passoMs; ms += passoMs) app.tic(ms / 1000 * 0.5, 1000 + ms);
};

test('HACK: non parte se non c\'è niente live', () => {
  const { env } = mondo(0);
  assert.equal(creaHackApp(env).avvia({ minuti: 1, ciclo: 0, ms: 1000 }), false);
});

test('HACK: dura quanto scelto, i volumi non salgono mai, alla fine chiude il set e manda lo schermo nero', () => {
  const { env, out, livelli } = mondo(3);
  const timer = [];
  env.imposta = (f, ms) => timer.push([f, ms]);
  env.togliTimer = () => {};
  const app = creaHackApp(env);
  assert.equal(app.avvia({ minuti: 1, ciclo: 0, ms: 1000 }), true);
  const cime = [];
  for (let ms = 0; ms <= 61000; ms += 100) {
    app.tic((ms / 1000) * 0.5, 1000 + ms);
    for (const m of out.msg.splice(0)) if (m.tipo === 'livello' && m.volume !== undefined) assert.ok(m.volume <= 0.8 + 1e-9, `volume sale: ${m.volume}`);
    cime.push(out.proj.at(-1)?.cimici);
  }
  assert.equal(out.fermato, 1, 'il set si chiude da solo');
  // il suono è fermo ma lo schermo non è ancora nero: prima il silenzio, poi le cimici vanno, poi la scritta
  assert.notEqual(out.proj.at(-1).fase, 'nero');
  assert.equal(app.inChiusura, true);
  const [vanno, nero] = timer.slice(-2); // gli ultimi due: quelli della chiusura
  assert.ok(vanno[1] >= 4000 && nero[1] > vanno[1], 'prima un silenzio, poi le cimici, poi il nero');
  vanno[0]();
  assert.equal(out.proj.at(-1).fase, 'vanno');
  nero[0]();
  assert.equal(out.proj.at(-1).fase, 'nero');
  assert.equal(app.attivo, false);
  assert.ok(out.proj.some((m) => m.fase === 'on' && m.cimici >= 8), 'le cimici si moltiplicano');
  assert.equal(livelli.length, 0);
});

test('HACK: i dispetti sono al massimo 3 insieme, e a un certo punto ce ne sono', () => {
  const { env, out } = mondo(4);
  const app = creaHackApp(env);
  app.avvia({ minuti: 1, ciclo: 0, ms: 1000 });
  let massimo = 0;
  for (let ms = 0; ms <= 40000; ms += 50) {
    app.tic((ms / 1000) * 0.5, 1000 + ms);
    const inizi = out.eventi.filter(([t]) => t === 'dispetto').length;
    const fini = out.eventi.filter(([t]) => t === 'dispetto-fine').length;
    massimo = Math.max(massimo, inizi - fini);
  }
  assert.ok(massimo >= 1 && massimo <= 3, `${massimo}`);
});

test('HACK: lo stop rimette i volumi e tutti i dispetti com\'erano, il proiettore torna normale', () => {
  const { env, out, livelli } = mondo(3);
  const app = creaHackApp(env);
  app.avvia({ minuti: 1, ciclo: 0, ms: 1000 });
  giro(app, 1, 100, 0, 0.6);
  assert.ok(livelli.some((l) => l.volume < 0.8), 'i volumi sono scesi');
  assert.equal(app.ferma(30, 'paracadute'), true);
  assert.ok(livelli.every((l) => l.volume === 0.8), 'volumi come prima');
  assert.ok(livelli.every((l) => l.coda.length === 0), 'nessun dispetto resta nella coda');
  assert.equal(out.proj.at(-1).fase, 'stop');
  assert.equal(app.attivo, false);
  assert.equal(out.fermato, 0, 'fermato non chiude il set');
});
