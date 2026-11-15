import test from 'node:test';
import assert from 'node:assert/strict';
import { chiusuraDaRighe, creaSensore, eBasso, frequenzaDi, midiDi } from '../src/cimice/sensore.js';

const b = (s, o) => s.battuta({ energia: 5, basso: 0, firma: 'a', ...o });

test('prima battuta: niente variazione, niente drop', () => {
  const r = b(creaSensore(), {});
  assert.equal(r.variazione, false);
  assert.equal(r.drop, false);
});

test('un livello che entra o esce è una variazione', () => {
  const s = creaSensore();
  b(s, {});
  const r = b(s, { firma: 'a,b' });
  assert.equal(r.variazione, true);
  assert.equal(r.drop, false);
});

test('un salto di energia è una variazione, un piccolo scarto no', () => {
  const s = creaSensore();
  b(s, { energia: 5 });
  assert.equal(b(s, { energia: 5.5 }).variazione, false);
  assert.equal(b(s, { energia: 9 }).variazione, true);
});

test('la cassa che torna dopo due battute senza è un drop', () => {
  const s = creaSensore();
  b(s, { basso: 8 });
  b(s, { basso: 0 });
  b(s, { basso: 0 });
  const r = b(s, { basso: 8 });
  assert.equal(r.drop, true);
  assert.equal(r.motivo, 'cassa');
});

test('la cassa che non è mai sparita non è un drop', () => {
  const s = creaSensore();
  for (let i = 0; i < 5; i++) assert.equal(b(s, { basso: 8 }).drop, false);
});

test('la sensibilità: con basso poco forte il drop c\'è solo se la sensibilità è alta', () => {
  const prova = (sensibilita) => {
    const s = creaSensore();
    b(s, { basso: 0 }); b(s, { basso: 0 });
    return b(s, { basso: 3, sensibilita }).drop;
  };
  assert.equal(prova(0.1), false);
  assert.equal(prova(0.95), true);
});

test('la scena drop è un drop, una volta sola', () => {
  const s = creaSensore();
  b(s, {});
  assert.equal(b(s, { scenaDrop: true }).drop, true);
  assert.equal(b(s, { scenaDrop: true }).drop, false);
});

test('il fader che si riapre di scatto è un drop; piano no', () => {
  const s = creaSensore();
  s.campionaFader(0.8, 0);
  s.campionaFader(0.05, 300);
  assert.equal(b(s, {}).drop, true);
  const p = creaSensore();
  p.campionaFader(0.8, 0);
  p.campionaFader(0.5, 1000);
  p.campionaFader(0.05, 2600);
  assert.equal(b(p, {}).drop, false);
});

test('il basso: casse, suoni bassi e note sotto il do 2', () => {
  assert.equal(eBasso({ s: 'bd' }), true);
  assert.equal(eBasso({ s: 'hh' }), false);
  assert.equal(eBasso({ s: 'sawtooth', note: 'c1' }), true);
  assert.equal(eBasso({ note: 'c4' }), false);
  assert.equal(eBasso({ note: 36 }), true);
  assert.equal(midiDi('c2'), 36);
  assert.equal(midiDi('eb2'), 39);
});

test('frequenza: i valori dei preset si riconoscono, gli altri sono personalizzati', () => {
  assert.equal(frequenzaDi({ cooldown: 8, probabilita: 0.5 }), 'ogni_tanto');
  assert.equal(frequenzaDi({ cooldown: 9, probabilita: 0.5 }), 'personalizzata');
});

test('quanto è chiuso il fader, dalle righe globali', () => {
  assert.equal(chiusuraDaRighe([]), 0);
  assert.equal(chiusuraDaRighe(['// break · tutti tranne il beat a 40%']), 0);
  assert.ok(chiusuraDaRighe(['all(x => x.lpf(150))']) > 0.99);
  assert.ok(chiusuraDaRighe(['all(x => x.lpf(16000))']) < 0.01);
  assert.ok(chiusuraDaRighe(['all(x => x.hpf(4000))']) > 0.5);
  assert.equal(chiusuraDaRighe(['all(x => x.delay(0.5).delaytime(.375))']), 0.5);
});
