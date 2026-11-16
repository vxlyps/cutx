import test from 'node:test';
import assert from 'node:assert/strict';
import { DISPETTI, costruisci, creaDispetti, durata, FREQUENZE_DISPETTI } from '../src/cimice/dispetti.js';
import { creaDispettiApp } from '../src/cimice/dispetti-app.js';
import { imposta as impostaVoce, leggiVoce, togli as togliVoce } from '../src/renderer/coda.js';

// Un pattern finto che accetta qualunque metodo (come Strudel), e sine per il tremolo.
const finto = () => new Proxy({ queryArc: () => [] }, { get: (t, k) => (k in t ? t[k] : () => finto()) });
globalThis.sine = { range: () => ({ fast: () => 1 }) };
const seme = (n = 7) => () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296);
const livello = (o = {}) => ({ id: 1, nome: 'basso', codice: 'note("c2").s("sawtooth").lpf(3000).gain(.8)', coda: [], a: null, da: null, muto: false, ...o });
const prefs = { dispetti: true, dispettiFrequenza: 'spesso' };
const base = { ciclo: 10, cps: 0.5, prefs, pattern: () => finto(), forza: true };

test('ogni dispetto dà righe valide, dentro i limiti', () => {
  const caso = seme();
  for (const def of DISPETTI) {
    for (let i = 0; i < 40; i++) {
      const righe = costruisci(def, livello(), caso);
      if (!righe) continue;
      for (const r of righe) assert.ok(leggiVoce(r), `${def.id}: ${r}`);
      const testo = righe.join(' ');
      for (const [, n] of testo.matchAll(/\.lpf\((\d+)\)/g)) assert.ok(Number(n) >= 250 && Number(n) <= 3000, testo);
      for (const [, n] of testo.matchAll(/\.lpq\(([\d.]+)\)/g)) assert.ok(Number(n) <= 8, testo);
      for (const [, n] of testo.matchAll(/\.room\(([\d.]+)\)/g)) assert.ok(Number(n) <= 0.8, testo);
      for (const [, n] of testo.matchAll(/\.crush\((\d+)\)/g)) assert.ok(Number(n) >= 4, testo);
      for (const [, n] of testo.matchAll(/\.delayfeedback\(([\d.]+)\)/g)) assert.ok(Number(n) <= 0.65, testo);
    }
  }
});

test('mai più forte di prima: il tremolo parte dal gain che c\'è già', () => {
  const def = DISPETTI.find((d) => d.id === 'tremolo');
  assert.equal(costruisci(def, livello({ codice: 'note("c2").gain(.3)' }), seme())[0], '.gain(sine.range(0.15, 0.3).fast(4))');
  assert.match(costruisci(def, livello({ codice: 'note("c2").gain(5)' }), seme())[0], /range\(0\.5, 1\)/); // oltre 1 si ferma a 1
});

test('un filtro già chiuso non si chiude ancora, mai si apre', () => {
  const def = DISPETTI.find((d) => d.id === 'filtro');
  assert.equal(costruisci(def, livello({ codice: 'note("c2").lpf(280)' }), seme()), null);
  for (let i = 0; i < 30; i++) assert.ok(Number(/\((\d+)\)/.exec(costruisci(def, livello({ codice: 'x.lpf(900)' }), seme(i + 1))[0])[1]) <= 900);
});

test('la durata: da mezzo secondo a 2 secondi, in multipli della griglia, almeno un sedicesimo', () => {
  const caso = seme(3);
  for (const cps of [0.35, 0.5, 0.75]) {
    for (const def of DISPETTI) {
      for (let i = 0; i < 25; i++) {
        const { g, cicli } = durata(def, cps, caso);
        const secondi = cicli / cps;
        assert.ok(cicli >= 1 / 16 - 1e-9);
        assert.ok(secondi <= 2 + 1e-9, `${def.id} ${secondi}`);
        assert.ok(Math.abs(cicli / g - Math.round(cicli / g)) < 1e-9, 'multiplo della griglia');
      }
    }
  }
});

test('uno alla volta, solo se acceso, mai su un livello muto, in modifica o in uscita', () => {
  const d = creaDispetti({ caso: seme() });
  assert.equal(d.proponi({ ...base, livello: livello(), prefs: { dispetti: false } }), null);
  assert.equal(d.proponi({ ...base, livello: livello({ muto: true }) }), null);
  assert.equal(d.proponi({ ...base, livello: livello({ a: 12 }) }), null);
  assert.equal(d.proponi({ ...base, livello: livello(), inModifica: () => true }), null);
  assert.equal(d.proponi({ ...base, livello: livello({ nome: 'jam' }) }), null);
  assert.ok(d.proponi({ ...base, livello: livello() }));
  assert.equal(d.proponi({ ...base, livello: livello() }), null, 'uno alla volta');
});

test('il limiter che fatica ferma i dispetti nuovi', () => {
  const d = creaDispetti({ caso: seme() });
  assert.equal(d.proponi({ ...base, livello: livello(), limiterDb: -3.5 }), null);
  assert.ok(d.proponi({ ...base, livello: livello(), limiterDb: -2 }));
});

test('se la riga non compila, non parte', () => {
  const d = creaDispetti({ caso: seme() });
  const rotto = new Proxy({}, { get: () => () => { throw new Error('rotto'); } });
  assert.equal(d.proponi({ ...base, livello: livello(), pattern: () => rotto }), null);
  assert.equal(d.attivo, null);
});

test('inizia e finisce sulla griglia; il ritorno rimette la coda com\'era e rispetta quello che ho cambiato io', () => {
  const d = creaDispetti({ caso: seme(5) });
  const l = livello({ coda: ['.lpf(1200)', '.room(.2)'] });
  const p = d.proponi({ ...base, ciclo: 10.01, livello: l });
  assert.ok(p);
  assert.ok(Math.abs(p.inizio / p.g - Math.round(p.inizio / p.g)) < 1e-9 && p.inizio >= 10.01);
  assert.ok(p.invioRitorno < p.fine && p.invioRitorno >= p.inizio);
  const inizio = d.messaggioInizio();
  assert.equal(inizio.origine, 'dispetto');
  assert.equal(inizio.griglia, p.g);
  const codaConDispetto = p.righe.reduce((c, r) => [...c.filter((t) => leggiVoce(t).chiave !== leggiVoce(r).chiave), r], l.coda);
  const ritorno = d.messaggioRitorno(codaConDispetto);
  for (const chiave of p.chiavi) {
    const prima = l.coda.find((t) => leggiVoce(t).chiave === chiave);
    if (prima) assert.ok(ritorno.imposta.includes(prima)); else assert.ok(ritorno.togli.includes(chiave));
  }
  // se la riga l'ho cambiata io nel frattempo, il dispetto non la tocca
  const mia = codaConDispetto.map((t) => (leggiVoce(t).chiave === p.chiavi[0] ? '.gain(.4)'.replace('gain', p.chiavi[0]) : t));
  const r2 = d.messaggioRitorno(mia);
  assert.ok(!r2 || (!r2.togli.includes(p.chiavi[0]) && !r2.imposta.some((t) => leggiVoce(t).chiave === p.chiavi[0])));
  assert.equal(d.messaggioRitorno(codaConDispetto, true).griglia, undefined, 'lo stop è subito');
});

// --- l'esecuzione ---
function ambiente(o = {}) {
  const inviati = [];
  const proj = [];
  const eventi = [];
  const cronologia = { passi: [], registra(v) { this.passi.push(v); } };
  let livelli = [livello()];
  // il motore finto: applica i messaggi `coda` alla coda del livello, come farebbe il vero
  const manda = (m) => {
    inviati.push(m);
    const l = livelli.find((x) => x.id === m.livello);
    if (!l) return;
    let coda = l.coda;
    for (const k of m.togli ?? []) coda = togliVoce(coda, k);
    for (const t of m.imposta ?? []) coda = impostaVoce(coda, t);
    l.coda = coda;
  };
  const env = {
    livelli: () => livelli, prefs: () => prefs, manda, pattern: () => finto(), limiterDb: () => 0,
    inModifica: () => false, cps: () => 0.5, cronologia, avviso: () => {}, scrivi: (t, dati) => eventi.push([t, dati]),
    alProiettore: (m) => proj.push(m), caso: seme(11), ...o,
  };
  return { env, inviati, proj, eventi, cronologia, imposta: (l) => { livelli = l; } };
}

test('esecuzione: parte, torna da solo, la cronologia non resta sporca', () => {
  const { env, inviati, proj, cronologia } = ambiente();
  const app = creaDispettiApp(env);
  const piano = app.suTocco({ livello: 'basso', ciclo: 4, forza: true });
  assert.ok(piano);
  assert.equal(inviati.length, 1);
  assert.equal(cronologia.passi.length, 1);
  assert.deepEqual(proj.at(-1).attivo, true);
  app.tic(piano.inizio); // troppo presto: niente
  assert.equal(inviati.length, 1);
  app.tic(piano.invioRitorno + 0.001);
  assert.equal(app.attivo, null);
  assert.equal(inviati.length, 2, 'il ritorno parte');
  assert.equal(cronologia.passi.length, 0, 'la voce dell\'annulla sparisce a dispetto finito');
  assert.equal(proj.at(-1).attivo, false);
});

test('esecuzione: lo stop e il paracadute riportano tutto subito; il ⌘Z annulla', async () => {
  const { env, inviati, cronologia } = ambiente();
  const app = creaDispettiApp(env);
  assert.ok(app.suTocco({ livello: 'basso', ciclo: 4, forza: true }));
  app.fermaTutti(4.1, 'paracadute');
  assert.equal(app.attivo, null);
  assert.equal(inviati.at(-1).griglia, undefined, 'senza griglia: subito');
  // annulla da ⌘Z
  const b = ambiente();
  const app2 = creaDispettiApp(b.env);
  app2.suTocco({ livello: 'basso', ciclo: 4, forza: true });
  assert.equal(await b.cronologia.passi.at(-1).annulla(), true);
  assert.equal(app2.attivo, null);
});

test('esecuzione: se il livello esce o il limiter fatica, si ferma da solo', () => {
  const a = ambiente();
  const app = creaDispettiApp(a.env);
  app.suTocco({ livello: 'basso', ciclo: 4, forza: true });
  a.imposta([]);
  app.tic(4.1);
  assert.equal(app.attivo, null);
  let db = 0;
  const b = ambiente({ limiterDb: () => db });
  const app2 = creaDispettiApp(b.env);
  app2.suTocco({ livello: 'basso', ciclo: 4, forza: true });
  db = -4;
  app2.tic(4.1);
  assert.equal(app2.attivo, null);
});

test('frequenze: più spesso = più probabile e pausa più corta', () => {
  const f = FREQUENZE_DISPETTI;
  assert.ok(f.raro.probabilita < f.ogni_tanto.probabilita && f.ogni_tanto.probabilita < f.spesso.probabilita);
  assert.ok(f.raro.pausa > f.ogni_tanto.pausa && f.ogni_tanto.pausa > f.spesso.pausa);
});

test('intensità e crescita: più il set va avanti e più lo slider è alto, più si sente; quando entra mai sotto 0.6', async () => {
  const { forzaDispetti } = await import('../src/cimice/dispetti.js');
  assert.ok(forzaDispetti({ intensita: 0.8, crescita: 45 }, 0) < forzaDispetti({ intensita: 0.8, crescita: 45 }, 45));
  assert.equal(forzaDispetti({ intensita: 0.8, crescita: 45 }, 90), 0.8);
  assert.equal(forzaDispetti({ intensita: 0.8, crescita: 0 }, 0), 0.8); // crescita spenta: sempre uguale
  assert.ok(forzaDispetti({ intensita: 0.8, crescita: 45 }, 0, true) >= 0.6);
  assert.equal(forzaDispetti({ intensita: 0, crescita: 45 }, 10, true), 0); // slider a zero: niente
  const def = DISPETTI.find((d) => d.id === 'filtro');
  const medio = (k) => { const c = seme(5); let t = 0; for (let i = 0; i < 40; i++) t += Number(/\((\d+)\)/.exec(costruisci(def, livello(), c, k)[0])[1]); return t / 40; };
  assert.ok(medio(1) < medio(0) - 500, 'al massimo il filtro si chiude molto di più');
});
