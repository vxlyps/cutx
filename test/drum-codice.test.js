import test from 'node:test';
import assert from 'node:assert/strict';
import * as drum from '../src/renderer/drum-codice.js';

const piena = (passi = 16, valore = 0) => Array(passi).fill(valore);
const riga = (suono, vel, banco = '') => ({ tipo: 'griglia', suono, banco, vel });
const esempio = `stack(\n  s("bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~").gain(".8 ~ ~ ~ .8 ~ ~ ~ .8 ~ ~ ~ .8 ~ ~ ~"),\n  s("~ ~ ~ ~ sd ~ ~ ~ ~ ~ ~ ~ sd ~ ~ ~").gain("~ ~ ~ ~ .5 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~").bank("RolandTR909")\n)`;

test('costanti, iniziale e validatori', () => {
  assert.deepEqual(drum.PASSI, [16, 32]);
  assert.deepEqual(drum.CICLI, [1, 2, 4]);
  assert.deepEqual(drum.iniziale(), { passi: 16, cicli: 1, righe: [] });
  assert.equal(drum.slot({ passi: 32, cicli: 2 }), 64);
  for (const s of ['bd', 'hh', 'bd:3', 'RolandTR909_bd']) assert.equal(drum.suonoValido(s), true);
  for (const s of ['', 'bd"', 'a'.repeat(41), 'bd:1234', null, 3]) assert.equal(drum.suonoValido(s), false);
  for (const b of ['', 'RolandTR909']) assert.equal(drum.bancoValido(b), true);
  for (const b of ['xx xx', 'x"', 'a'.repeat(41), null]) assert.equal(drum.bancoValido(b), false);
  assert.equal(drum.haMarca('stack()\n // @drum  \n'), true);
  assert.equal(drum.haMarca('// @drum extra'), false);
});

test('numero usa il formato breve', () => {
  for (const [n, atteso] of [[0.8, '.8'], [1, '1'], [0.05, '.05'], [0.333, '.33'], [0.5, '.5']]) assert.equal(drum.numero(n), atteso);
});

test('codice scrive le righe, i cicli e le righe non leggibili', () => {
  const velBd = piena(16);
  [0, 4, 8, 12].forEach((i) => { velBd[i] = 0.8; });
  const velSd = piena(16);
  velSd[4] = 0.5; velSd[12] = 1;
  const stato = { passi: 16, cicli: 1, righe: [riga('bd', velBd), riga('sd', velSd, 'RolandTR909')] };
  assert.equal(drum.codice(stato), esempio);
  assert.match(drum.codice({ ...stato, cicli: 2, righe: stato.righe.map((x) => ({ ...x, vel: [...x.vel, ...x.vel] })) }), /\)\.slow\(2\)$/);
  assert.match(drum.codice({ ...stato, cicli: 4, righe: stato.righe.map((x) => ({ ...x, vel: [...x.vel, ...x.vel, ...x.vel, ...x.vel] })) }), /\)\.slow\(4\)$/);
  assert.match(drum.codice({ passi: 32, cicli: 1, righe: [riga('bd', piena(32))] }), /~(?: ~){31}/);
  assert.equal(drum.codice({ passi: 16, cicli: 1, righe: [riga('hh', piena(16), 'Kit')] }), `stack(\n  s("${Array(16).fill('~').join(' ')}").bank("Kit") // hh\n)`);
  assert.equal(drum.codice({ passi: 16, cicli: 1, righe: [riga('bd', piena(16)), { tipo: 'testo', testo: 's("xx") // note' }, riga('hh', piena(16))] }), `stack(\n  s("${Array(16).fill('~').join(' ')}"), // bd\n  s("xx"), // note\n  s("${Array(16).fill('~').join(' ')}") // hh\n)`);
  assert.equal(drum.codice(drum.iniziale()), 'stack()');
  assert.equal(drum.codice(null), 'stack()');
  assert.equal(drum.codice({ passi: 16, cicli: 1, righe: [riga('no"', piena(16))] }), 'stack()');
});

test('legge la griglia d’esempio e le varianti', () => {
  const atteso = { passi: 16, cicli: 1, righe: [riga('bd', [0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0, 0.8, 0, 0, 0]), riga('sd', [0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 'RolandTR909')] };
  assert.deepEqual(drum.leggiCodice(`// commento\n${drum.MARCA}\n${esempio}`), { stato: atteso, avvisi: [] });
  const senzaGain = drum.leggiCodice(`stack(s("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~"))`);
  assert.equal(senzaGain.stato.righe[0].vel[0], 0.8);
  assert.equal(drum.leggiCodice(`stack(s("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").bank("kit").gain(".2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~"))`).stato.righe[0].banco, 'kit');
  assert.equal(drum.leggiCodice(`stack(s("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~" )).slow(2)`).stato.cicli, 2);
  assert.equal(drum.leggiCodice(`stack(s("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").bank(""))`).stato.righe[0].banco, '');
});

test('conserva come testo le righe non leggibili e segnala la posizione', () => {
  const casi = ['s("bd*2")', 's("[bd bd]")', 's("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").lpf(800)', 's("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").gain("2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")', 's("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~").gain(".5")', 's("bd sd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")', 's("bd ~ ~ ~ ~ ~ ~ ~ ~\n~ ~ ~ ~ ~ ~ ~ ~")'];
  for (const raw of casi) {
    const letto = drum.leggiCodice(`stack(${raw})`);
    assert.equal(letto.stato.righe[0].tipo, 'testo', raw);
    assert.deepEqual(letto.avvisi, ['riga 1: non si legge, resta nel testo']);
    assert.equal(drum.codice(drum.leggiCodice(drum.codice(letto.stato)).stato), drum.codice(letto.stato));
  }
  // un commento a mano su una riga con passi accesi non si perde: la riga resta testo
  const conCommento = drum.leggiCodice(`stack(s("bd ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~") // il mio kick\n)`);
  assert.equal(conCommento.stato.righe[0].tipo, 'testo');
  assert.match(drum.codice(conCommento.stato), /il mio kick/);
  const diverso = drum.leggiCodice(`stack(s("bd ${Array(15).fill('~').join(' ')}"), s("sd ${Array(14).fill('~').join(' ')}"))`);
  assert.equal(diverso.stato.righe[1].tipo, 'testo');
  const dodici = drum.leggiCodice(`stack(s("${Array(12).fill('~').join(' ')}") // bd\n)`);
  assert.equal(dodici.stato.righe[0].tipo, 'testo');
});

test('rifiuta sintassi non DRUM e troppe righe', () => {
  for (const testo of ['note("c3")', 'stack(', 'stack().slow(3)', '']) assert.deepEqual(drum.leggiCodice(testo), { errore: 'non è una griglia DRUM' });
  assert.deepEqual(drum.leggiCodice(`stack(${Array(17).fill('x').join(',')})`), { errore: 'troppe righe' });
});

test('giro scrittura e lettura stabile', () => {
  const stati = [
    { passi: 32, cicli: 2, righe: [riga('bd', piena(64, 0.8)), riga('hh', piena(64), 'kit'), riga('sd', piena(64, 0.5))] },
    { passi: 16, cicli: 1, righe: [riga('bd', piena(16, 0.8)), { tipo: 'testo', testo: 's("x") // commento finale' }, riga('hh', piena(16), 'kit')] },
  ];
  for (const stato of stati) {
    const letto = drum.leggiCodice(drum.clip(stato)).stato;
    assert.deepEqual(letto, stato);
    assert.equal(drum.codice(letto), drum.codice(stato));
  }
});

test('operazioni sulle righe e sui passi sono pure', () => {
  const base = drum.iniziale();
  const uno = drum.aggiungiRiga(base, 'bd');
  assert.equal(base.righe.length, 0);
  assert.equal(uno.righe.length, 1);
  assert.equal(drum.aggiungiRiga(uno, 'bad"'), uno);
  let limite = { ...uno, righe: Array(16).fill(uno.righe[0]) };
  assert.equal(drum.aggiungiRiga(limite, 'hh'), limite);
  const due = drum.aggiungiRiga(uno, 'hh');
  assert.equal(drum.togliRiga(due, 0).righe[0].suono, 'hh');
  assert.deepEqual(drum.spostaRiga(due, 0, 1).righe.map((x) => x.suono), ['hh', 'bd']);
  assert.equal(drum.cambiaSuono({ ...due, righe: [{ tipo: 'testo', testo: 'x' }] }, 0, 'sd').righe[0].tipo, 'testo');
  const cambiata = drum.cambiaSuono(due, 0, 'sd', 'kit');
  assert.equal(cambiata.righe[0].suono, 'sd');
  assert.equal(due.righe[0].suono, 'bd');
  const acceso = drum.impostaPasso(uno, 0, 0, 4);
  assert.equal(acceso.righe[0].vel[0], 1);
  assert.equal(drum.impostaPasso(uno, 0, 1, 0.001).righe[0].vel[1], 0.05);
  assert.equal(drum.impostaPasso(uno, 0, 1, 0.337).righe[0].vel[1], 0.34);
  assert.equal(drum.impostaPasso(acceso, 0, 0, -1).righe[0].vel[0], 0);
  assert.equal(drum.impostaPasso(uno, 0, 16, 1), uno);
  const testo = { ...uno, righe: [{ tipo: 'testo', testo: 'x' }] };
  assert.equal(drum.impostaPasso(testo, 0, 0, 1), testo);
});

test('ridimensiona e conta i passi persi', () => {
  const base = { passi: 16, cicli: 1, righe: [riga('bd', piena(16))] };
  const sedici = drum.impostaPasso(base, 0, 3, 0.6);
  assert.equal(drum.ridimensiona(sedici, 32, 1).righe[0].vel[6], 0.6);
  const trentadue = { passi: 32, cicli: 1, righe: [riga('bd', piena(32))] };
  const dispari = drum.impostaPasso(trentadue, 0, 3, 0.7);
  assert.equal(drum.ridimensiona(dispari, 16, 1).righe[0].vel[1], 0.7);
  const pari = drum.impostaPasso(drum.impostaPasso(trentadue, 0, 2, 0.5), 0, 3, 0.7);
  assert.equal(drum.ridimensiona(pari, 16, 1).righe[0].vel[1], 0.5);
  assert.equal(drum.passiPersi(dispari, 16, 1), 0);
  assert.equal(drum.passiPersi(pari, 16, 1), 1);
  assert.equal(drum.passiPersi(sedici, 32, 1), 0);
  assert.equal(drum.passiPersi(sedici, 16, 2), 0);
  const quattro = drum.ridimensiona({ passi: 16, cicli: 4, righe: [riga('bd', Array.from({ length: 64 }, (_, i) => i < 16 ? 0.4 : 0.9))] }, 16, 1);
  assert.equal(quattro.righe[0].vel[0], 0.4);
  const testo = { tipo: 'testo', testo: 'non cambiare' };
  assert.equal(drum.ridimensiona({ ...base, cicli: 2, righe: [testo] }, 32, 4).righe[0], testo);
  const dueCicli = { passi: 16, cicli: 2, righe: [riga('bd', [...piena(16, 0.5), ...piena(16, 0.6)])] };
  assert.equal(drum.passiPersi(dueCicli, 16, 1), 16);
  const uguali = { passi: 16, cicli: 2, righe: [riga('bd', [...piena(16, 0.5), ...piena(16, 0.5)])] };
  assert.equal(drum.passiPersi(uguali, 16, 1), 0);
});
