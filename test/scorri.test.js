import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scorrimento, bordoInBasso, puntiDiScorrimento, scegliDisposizione, trovaScala } from '../src/renderer/scorri.js';

// 30 righe da 50 px
const righe = Array.from({ length: 30 }, (_, i) => ({ top: i * 50, bottom: i * 50 + 50 }));

test('trovaScala: il carattere più grande che ci sta, fino a un minimo', () => {
  const altezzaA = (s) => 2000 * s; // il contenuto cresce con la scala
  assert.deepEqual(trovaScala(altezzaA, 3000, 0.3), { scala: 1, ci: true });
  const r = trovaScala(altezzaA, 1000, 0.3);
  assert.equal(r.ci, true);
  assert.ok(Math.abs(r.scala - 0.5) < 0.01 && altezzaA(r.scala) <= 1000);
  assert.deepEqual(trovaScala(altezzaA, 300, 0.3), { scala: 0.3, ci: false }); // neanche al minimo: si scorre
});

test('tra due disposizioni vince quella col carattere più grande; a parità la prima', () => {
  assert.equal(scegliDisposizione([{ nome: 'ampia', scala: 0.5, ci: true }, { nome: 'stretta', scala: 0.7, ci: true }]).nome, 'stretta');
  assert.equal(scegliDisposizione([{ nome: 'ampia', scala: 0.6, ci: true }, { nome: 'stretta', scala: 0.6, ci: true }]).nome, 'ampia');
  assert.equal(scegliDisposizione([{ nome: 'ampia', scala: 1, ci: false }, { nome: 'stretta', scala: 0.4, ci: true }]).nome, 'stretta');
});

test('i punti di scorrimento sono inizi di riga, fino a vedere anche l\'ultima riga intera', () => {
  const punti = puntiDiScorrimento(righe, 300); // finestra da 6 righe
  assert.equal(punti[0], 0);
  assert.equal(punti.at(-1), 1200); // da lì si vedono le righe 24–29: l'ultima è intera
  assert.ok(punti.every((p) => p % 50 === 0));
  assert.deepEqual(puntiDiScorrimento(righe.slice(0, 4), 300), [0]); // ci sta tutto: niente da scorrere
});

test('mai righe a metà: il bordo in basso si ferma sull\'ultima riga intera', () => {
  assert.equal(bordoInBasso(righe, 0, 300), 0);
  assert.equal(bordoInBasso(righe, 0, 320), 20);
  assert.equal(bordoInBasso(righe, 100, 349), 49);
  // per ogni offset e altezza il bordo visibile non attraversa nessuna riga
  for (const altezza of [260, 300, 333, 410]) {
    for (const offset of puntiDiScorrimento(righe, altezza)) {
      const bordo = offset + altezza - bordoInBasso(righe, offset, altezza);
      assert.ok(!righe.some((r) => r.top < bordo - 0.5 && r.bottom > bordo + 0.5), `altezza ${altezza} offset ${offset}`);
      assert.ok(righe.some((r) => r.top === offset)); // e la prima riga visibile comincia intera
    }
  }
});

test('lo scorrimento è lento (una riga alla volta), con una sosta agli estremi, avanti e indietro', () => {
  const s = new Scorrimento({ passoS: 2, pausaS: 5, tieniS: 10 });
  const visti = [];
  for (let t = 0; t <= 140; t += 0.5) visti.push([t, s.aggiorna(t, { righe, altezza: 300 }).offset]);
  const offsets = visti.map(([, o]) => o);
  // ogni cambio è di una sola riga
  for (let i = 1; i < offsets.length; i++) assert.ok(Math.abs(offsets[i] - offsets[i - 1]) <= 50, `salto a ${visti[i][0]} s`);
  assert.equal(Math.max(...offsets), 1200);
  assert.equal(Math.min(...offsets.slice(offsets.indexOf(1200))), 0, 'torna su');
  // in fondo si ferma: l'offset 1200 resta per almeno la pausa
  const fondo = visti.filter(([, o]) => o === 1200).length * 0.5;
  assert.ok(fondo >= 5, `sosta in fondo: ${fondo} s`);
});

test('un livello appena entrato: ci si porta sul suo inizio e ci si ferma', () => {
  const s = new Scorrimento({ passoS: 2, pausaS: 5, tieniS: 10 });
  let r = s.aggiorna(0, { righe, altezza: 300 });
  assert.equal(r.offset, 0);
  // entra un livello che comincia alla riga 14 (y = 700) e finisce alla 17 (850)
  const focus = { id: 7, quando: 3, top: 700, bottom: 850 };
  r = s.aggiorna(3, { righe, altezza: 300, focus });
  assert.equal(r.offset, 700);
  for (let t = 3.5; t < 12; t += 0.5) assert.equal(s.aggiorna(t, { righe, altezza: 300, focus }).offset, 700, `fermo a ${t} s`);
  // finito il tempo si riprende a scorrere
  let mosso = false;
  for (let t = 13; t < 30; t += 0.5) mosso ||= s.aggiorna(t, { righe, altezza: 300, focus }).offset !== 700;
  assert.ok(mosso);
});

test('se il livello è più alto della finestra si scende piano finché non si vede tutto', () => {
  const s = new Scorrimento({ passoS: 1, pausaS: 5, tieniS: 30 });
  const focus = { id: 1, quando: 0, top: 200, bottom: 800 }; // 600 px: due finestre
  const offsets = [];
  for (let t = 0; t <= 12; t += 0.5) offsets.push(s.aggiorna(t, { righe, altezza: 300, focus }).offset);
  assert.equal(offsets[0], 200);
  assert.ok(offsets.at(-1) >= 500, 'scende fino a vederne il fondo'); // 500 + 300 = 800
});

test('un livello modificato (stesso id, momento nuovo) richiama lo scorrimento', () => {
  const s = new Scorrimento({ passoS: 2, pausaS: 5, tieniS: 10 });
  s.aggiorna(0, { righe, altezza: 300, focus: { id: 1, quando: 0, top: 300, bottom: 400 } });
  assert.equal(s.aggiorna(1, { righe, altezza: 300, focus: { id: 1, quando: 0, top: 300, bottom: 400 } }).offset, 300);
  assert.equal(s.aggiorna(40, { righe, altezza: 300, focus: { id: 1, quando: 39, top: 900, bottom: 1000 } }).offset, 900);
});

test('se in nessuna disposizione ci sta, vince quella con la finestra più alta', () => {
  const scelta = scegliDisposizione([{ nome: 'ampia', scala: 0.5, ci: false, altezza: 337 }, { nome: 'stretta', scala: 0.5, ci: false, altezza: 560 }]);
  assert.equal(scelta.nome, 'stretta');
  assert.equal(scegliDisposizione([{ nome: 'ampia', scala: 0.5, ci: false, altezza: 337 }, { nome: 'stretta', scala: 0.5, ci: false, altezza: 337 }]).nome, 'ampia');
});

test('la vista segue la riga dove si sta scrivendo', () => {
  const righe = Array.from({ length: 20 }, (_, k) => ({ top: k * 10, bottom: (k + 1) * 10 }));
  const s = new Scorrimento({ passoS: 1.8, pausaS: 4, tieniS: 14 });
  let r = s.aggiorna(0, { righe, altezza: 50, segui: { top: 0, bottom: 10 } });
  assert.equal(r.offset, 0);
  r = s.aggiorna(0.1, { righe, altezza: 50, segui: { top: 60, bottom: 70 } });
  assert.ok(r.offset + 50 >= 70, 'la riga 6 si vede');
  r = s.aggiorna(0.2, { righe, altezza: 50, segui: { top: 150, bottom: 160 } });
  assert.ok(r.offset + 50 >= 160 && r.offset <= 150, 'e poi la 15');
  const giu = r.offset;
  // mentre si scrive non scorre da solo, nemmeno dopo molto
  r = s.aggiorna(1.5, { righe, altezza: 50, segui: { top: 150, bottom: 160 } });
  assert.equal(r.offset, giu);
  // se il cursore torna su (una modifica più in alto) ci si torna
  r = s.aggiorna(1.6, { righe, altezza: 50, segui: { top: 20, bottom: 30 } });
  assert.ok(r.offset <= 20);
});
