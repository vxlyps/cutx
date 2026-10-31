import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREDEFINITI, convertiIntervalli, filtraCodice, nomePubblico, risolvi, riempi, testoEtichetta } from '../src/renderer/testi-pubblico.js';

const cfg = risolvi({});

test('i predefiniti scelti: tutto acceso tranne commenti, preambolo, scritta del controller e momento', () => {
  for (const k of ['logo', 'bpm', 'frase', 'neon', 'muto', 'conto', 'scrittura', 'coda', 'etichette']) assert.equal(cfg[k].acceso, true, k);
  for (const k of ['commenti', 'preambolo', 'controller', 'momento']) assert.equal(cfg[k].acceso, false, k);
  assert.equal(cfg.neon.testo, 'TECNOLOGIA CANAGLIA');
});

test('le preferenze salvate stanno sopra i predefiniti, voce per voce; il neon segue `insegna`', () => {
  const c = risolvi({ insegna: false, testiPubblico: { bpm: { testo: '{bpm}' }, etichette: { nomi: { jam: '' } } } });
  assert.equal(c.neon.acceso, false);
  assert.equal(c.bpm.testo, '{bpm}');
  assert.equal(c.bpm.acceso, true);
  assert.equal(c.etichette.nomi.libero, 'libero');
  assert.equal(c.etichette.nomi.jam, '');
});

test('segnaposto', () => {
  assert.equal(riempi('{bpm} BPM', { bpm: 128 }), '128 BPM');
  assert.equal(riempi('tra {n} {cicli}', { n: 2, cicli: 'cicli' }), 'tra 2 cicli');
  assert.equal(riempi('{ignoto}', {}), '{ignoto}');
});

test('etichette: il paracadute non compare mai, i nomi automatici si rinominano o si nascondono', () => {
  assert.equal(nomePubblico('paracadute', cfg), null);
  assert.equal(nomePubblico('basso', cfg), 'basso');
  assert.equal(nomePubblico('libero', risolvi({ testiPubblico: { etichette: { nomi: { libero: 'pezzo' } } } })), 'pezzo');
  assert.equal(nomePubblico('jam', risolvi({ testiPubblico: { etichette: { nomi: { jam: '' } } } })), null);
  assert.equal(nomePubblico('basso', risolvi({ testiPubblico: { etichette: { acceso: false } } })), null);
});

test('testo dell\'etichetta nei vari stati', () => {
  assert.equal(testoEtichetta({ nome: 'basso' }, cfg), '● basso');
  assert.equal(testoEtichetta({ nome: 'basso', muto: true }, cfg), '● basso · muto');
  assert.equal(testoEtichetta({ nome: 'basso', stato: 'arriva', mancano: 1.2 }, cfg), 'basso · tra 2 cicli');
  assert.equal(testoEtichetta({ nome: 'basso', stato: 'arriva', mancano: 0.4 }, cfg), 'basso · tra 1 ciclo');
  assert.equal(testoEtichetta({ nome: 'basso', stato: 'scrittura' }, cfg), '● basso · in scrittura');
  assert.equal(testoEtichetta({ nome: 'jam', stato: 'scrittura', punto: false }, cfg), 'jam · in scrittura');
  const spento = risolvi({ testiPubblico: { muto: { acceso: false }, conto: { acceso: false }, scrittura: { acceso: false } } });
  assert.equal(testoEtichetta({ nome: 'basso', muto: true }, spento), '● basso');
  assert.equal(testoEtichetta({ nome: 'basso', stato: 'arriva', mancano: 3 }, spento), 'basso');
  assert.equal(testoEtichetta({ nome: 'basso', stato: 'scrittura' }, spento), '● basso');
  assert.equal(testoEtichetta({ nome: 'paracadute' }, cfg), null);
});

test('filtra i commenti: righe intere e code, ma non dentro le stringhe', () => {
  const codice = '// intro\ns("bd*4") // cassa\n  // nota\n.lpf(800)\ns("http://x")';
  const { testo } = filtraCodice(codice, { commenti: false, preambolo: true });
  assert.equal(testo, 's("bd*4")\n.lpf(800)\ns("http://x")');
});

test('filtra il preambolo del brano (le righe prima dell\'inizio); un setcpm scritto io dal vivo resta', () => {
  const pre = '// brano\nsetcpm(120/4)\n\n';
  const codice = `${pre}s("bd*4")\nsetcpm(130/4)\n.lpf(800)`;
  const { testo } = filtraCodice(codice, { commenti: true, preambolo: false, inizio: pre.length });
  assert.equal(testo, 's("bd*4")\nsetcpm(130/4)\n.lpf(800)');
  // senza preambolo (inizio 0: CUE libero, jam, card) niente si nasconde
  assert.equal(filtraCodice('setcpm(130/4)\ns("bd")', { commenti: true, preambolo: false, inizio: 0 }).testo, 'setcpm(130/4)\ns("bd")');
  assert.equal(filtraCodice(codice, { commenti: true, preambolo: true }).testo, codice);
});

test('le note evidenziate si riportano sul testo filtrato', () => {
  const codice = '// c\ns("bd sd")';
  const { testo, inv } = filtraCodice(codice, { commenti: false, preambolo: true });
  const bd = codice.indexOf('bd');
  const [[a, b]] = convertiIntervalli([[bd, bd + 2]], inv);
  assert.equal(testo.slice(a, b), 'bd');
  assert.deepEqual(convertiIntervalli([[0, 3]], inv), []); // il commento non c'è più
});
