import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLPI_PREDEFINITI, dividiCatena, espandi, gradinoMs, leggiColpi, passiDi, rigaGlobaleAl, vociAl } from '../src/renderer/colpi.js';

test('una catena si divide in voci, anche con funzioni dentro e virgole', () => {
  assert.deepEqual(dividiCatena('.fast(2)').map((v) => v.chiave), ['fast']);
  assert.deepEqual(dividiCatena('.degradeBy(.4).sometimesBy(.3, x => x.ply(2))').map((v) => v.chiave), ['degradeBy', 'sometimesBy']);
  assert.equal(dividiCatena('.sometimesBy(.3, x => x.ply(2))')[0].testo, '.sometimesBy(.3, x => x.ply(2))');
  assert.deepEqual(dividiCatena('.s("a.b").lpf(2)').map((v) => v.chiave), ['s', 'lpf'], 'un punto dentro una stringa non divide');
  assert.equal(dividiCatena('fast(2)'), null);
  assert.equal(dividiCatena('.fast(2'), null);
  assert.equal(dividiCatena('.fast(2).'), null);
});

test('i valori a gradini avanzano e si fermano sull\'ultimo', () => {
  assert.equal(passiDi('.ply({2,4,8})'), 3);
  assert.equal(passiDi('.hpf({400,900}).gain({.1,.2,.3,.4})'), 4);
  assert.equal(passiDi('.fast(2)'), 1);
  assert.equal(espandi('.ply({2,4,8})', 0), '.ply(2)');
  assert.equal(espandi('.ply({2,4,8})', 1), '.ply(4)');
  assert.equal(espandi('.ply({2,4,8})', 9), '.ply(8)');
  assert.equal(espandi('.sometimes(x => { return x.fast(2) })', 1), '.sometimes(x => { return x.fast(2) })', 'il corpo di una funzione non è un gradino');
});

test('il file dei colpi: gli otto predefiniti, nell\'ordine dei tasti', () => {
  const { colpi, errori } = leggiColpi(COLPI_PREDEFINITI);
  assert.deepEqual(errori, []);
  assert.deepEqual(colpi.map((c) => c.nome), ['roll', 'spezza', 'mezzo', 'doppio', 'indietro', 'stop', 'sale', 'eco']);
  assert.deepEqual(colpi.map((c) => c.bersaglio), ['beat', 'beat', 'beat', 'beat', 'beat', 'tutto', 'livello', 'tutto']);
  const roll = colpi[0];
  assert.equal(roll.passi, 3);
  assert.deepEqual(vociAl(roll, 2), [{ chiave: 'ply', testo: '.ply(8)' }]);
  assert.equal(colpi[1].voci.length, 2);
  assert.equal(rigaGlobaleAl(colpi[5], 0), 'all(x => x.gain(0))');
  assert.equal(rigaGlobaleAl(colpi[7], 0), 'all(x => x.delay(.7).delayfeedback(.6))');
  const sale = colpi[6];
  assert.equal(sale.base, 's("white*16").decay(.12).sustain(0)');
  assert.deepEqual(vociAl(sale, 4).map((v) => v.testo), ['.hpf(9000)', '.gain(.26)']);
  assert.equal(sale.passi, 5);
});

test('righe sbagliate: si dice quale e perché, le altre vanno', () => {
  const { colpi, errori } = leggiColpi(['// c', 'uno · beat · .fast(2)', 'due · nessuno · .rev()', 'tre · beat · fast(2)', 'quattro', 'cinque · livello · .gain(1)', '', 'sei · tutto · .lpf(900)'].join('\n'));
  assert.deepEqual(colpi.map((c) => c.nome), ['uno', 'sei']);
  assert.equal(errori.length, 4);
  assert.deepEqual(errori.map((e) => e.riga), [3, 4, 5, 6]);
  assert.match(errori[0].errore, /bersaglio/);
});

test('un gradino dura due battiti', () => {
  assert.equal(gradinoMs(120), 1000);
  assert.equal(gradinoMs(60), 2000);
});

test('il bersaglio «spina» dei file vecchi vale «beat»', () => {
  const { colpi, errori } = leggiColpi('mezzo · spina · .slow(2)\ndoppio · beat · .fast(2)');
  assert.deepEqual(errori, []);
  assert.deepEqual(colpi.map((c) => c.bersaglio), ['beat', 'beat']);
});
