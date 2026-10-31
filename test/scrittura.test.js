import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MS_PER_UNITA, RUSH_MS, Scrittore, diffTesto, durataNaturaleMs, inizioScrittura, pesi, piano, unitaA, vedi } from '../src/renderer/scrittura.js';

const A = 's("bd*4").gain(.5)\n  .room(.3)';

test('i pesi sono sempre gli stessi per lo stesso testo e vanno più lenti dopo . , ( e a fine riga', () => {
  assert.deepEqual([...pesi(A)], [...pesi(A)]);
  const w = pesi('ab.cd\nef  gh');
  assert.ok(dettagli('ab.cd\nef  gh').attesa[3] >= 1.6, 'pausa dopo il punto');
  assert.ok(w[5] > w[0] + 4, 'pausa a fine riga');
  assert.ok(pesi('x\n  y')[2] < 0.2, 'indentazione quasi gratis');
  assert.ok([...pesi(A)].every((p) => p > 0));
});

test('il tratto che cambia', () => {
  assert.deepEqual(diffTesto('s("bd*4").gain(.5)', 's("bd*8").gain(.5)'), { pre: 6, tolti: '4', aggiunti: '8', suf: 11 });
  assert.deepEqual(diffTesto('abc', 'abcdef'), { pre: 3, tolti: '', aggiunti: 'def', suf: 0 });
  assert.deepEqual(diffTesto('abcdef', 'abc'), { pre: 3, tolti: 'def', aggiunti: '', suf: 0 });
  assert.deepEqual(diffTesto('', 'xy'), { pre: 0, tolti: '', aggiunti: 'xy', suf: 0 });
  assert.deepEqual(diffTesto('uguale', 'uguale'), { pre: 6, tolti: '', aggiunti: '', suf: 0 });
});

test('un livello nuovo si scrive da zero, un carattere alla volta, fino in fondo', () => {
  const p = piano('', A);
  let prima = vedi(p, 0);
  assert.equal(prima.prima, '');
  assert.equal(prima.cursore, true);
  let lunghezza = 0;
  for (let x = 0; x < p.totale; x += p.totale / 200) {
    const v = vedi(p, x);
    assert.ok(v.prima.length >= lunghezza, 'non torna mai indietro');
    assert.equal(v.prima + v.nascosto, A, 'il resto è sempre al suo posto, invisibile');
    lunghezza = v.prima.length;
  }
  const fine = vedi(p, p.totale);
  assert.deepEqual(fine, { prima: A, nascosto: '', dopo: '', cursore: false, fatto: true, lampeggia: false });
});

test('una modifica non riscrive tutto: cursore al punto, cancella il vecchio, scrive il nuovo', () => {
  const base = 's("bd*4").gain(.5)';
  const nuovo = 's("bd*16").gain(.5)';
  const p = piano(base, nuovo);
  assert.equal(p.pre, 6);
  assert.equal(p.tolti, '4');
  assert.equal(p.aggiunti, '16');
  const subito = vedi(p, 0);
  assert.equal(subito.prima + subito.dopo, base, 'all\'inizio si vede il codice di prima, col cursore al punto');
  assert.equal(subito.prima, 's("bd*');
  const dopoSalto = vedi(p, p.salto + p.cancella - 1e-6);
  assert.equal(dopoSalto.prima, 's("bd*');
  assert.equal(dopoSalto.dopo, '").gain(.5)');
  const finito = vedi(p, p.salto + p.cancella + p.battitura * 0.5);
  assert.equal(finito.prima + finito.nascosto + finito.dopo, nuovo);
  assert.ok(finito.dopo.endsWith('").gain(.5)'));
  assert.equal(vedi(p, p.totale).prima, nuovo);
});

test('l\'ultimo carattere arriva esattamente alla fine; se c\'è tempo si parte più tardi, se ce n\'è poco si accelera', () => {
  const p = piano('', A);
  const naturale = durataNaturaleMs(p);
  // tanto tempo: parte più tardi, e prima di partire non c'è niente
  const fine = 100000;
  assert.equal(inizioScrittura(p, 0, fine), fine - naturale);
  assert.equal(unitaA(p, 0, fine, fine - naturale - 1), 0);
  assert.ok(Math.abs(unitaA(p, 0, fine, fine) - p.totale) < 1e-9);
  assert.equal(vedi(p, unitaA(p, 0, fine, fine - 1000)).fatto, false);
  // poco tempo: parte subito e arriva comunque
  const breve = naturale / 4;
  assert.equal(inizioScrittura(p, 0, breve), 0);
  assert.ok(Math.abs(unitaA(p, 0, breve, breve / 2) - p.totale / 2) < 1e-6);
  assert.equal(unitaA(p, 0, breve, breve * 2), p.totale);
});

test('se ne arriva un\'altra mentre sta scrivendo, la prima si finisce di corsa e poi parte la nuova', () => {
  const s = new Scrittore();
  const uno = 's("bd*4").gain(.5)\n  .room(.3)\n  .delay(.2)';
  const due = 's("bd*4").gain(.5)\n  .room(.9)\n  .delay(.2)';
  const fine1 = 100000;
  // il primo livello (id 1) è a metà
  const metaEpoca = fine1 - 800;
  const meta = s.stato(1, '', uno, 0, fine1, metaEpoca);
  assert.equal(meta.fatto, false);
  // adesso ne arriva un altro (id 2) sullo stesso nome, a 4 secondi dalla sua entrata
  const adesso = metaEpoca + 100;
  const r0 = s.stato(2, uno, due, adesso, adesso + 6000, adesso, 1);
  assert.equal(r0.rush, true, 'prima si finisce di corsa quella di prima');
  const r1 = s.stato(2, uno, due, adesso, adesso + 6000, adesso + RUSH_MS / 2, 1);
  assert.equal(r1.rush, true);
  assert.ok((r1.prima + r1.nascosto).length >= 0);
  const r2 = s.stato(2, uno, due, adesso, adesso + 6000, adesso + RUSH_MS + 200, 1);
  assert.equal(r2.rush, false, 'poi parte la nuova');
  const rFine = s.stato(2, uno, due, adesso, adesso + 6000, adesso + 6000, 1);
  assert.equal(rFine.prima, due);
  assert.equal(rFine.fatto, true);
});

test('il testo uguale non si anima', () => {
  const p = piano('uguale', 'uguale');
  assert.equal(p.totale, 0);
  assert.equal(vedi(p, 0).fatto, true);
  assert.ok(MS_PER_UNITA > 0);
});

import { OPZIONI, dettagli, norma } from '../src/renderer/scrittura.js';

const LUNGO = 'stack(\n  s("bd*4, hh*8").gain(.8).room(.3),\n  note("c3 e3 g3 b3").s("sawtooth").lpf(900).delay(.25)\n)';

test('le regolazioni stanno nei limiti, con i predefiniti: refusi spenti', () => {
  assert.deepEqual(norma({}), OPZIONI);
  assert.equal(OPZIONI.refusi, 0);
  assert.equal(norma({ velocita: 99 }).velocita, 3);
  assert.equal(norma({ imperfezione: -1 }).imperfezione, 0);
  assert.equal(norma({ refusi: 'x' }).refusi, 0);
});

test('con l\'imperfezione c\'è più varietà e pause prima dei numeri; senza refusi il testo non cambia mai', () => {
  const regolare = dettagli(LUNGO, { imperfezione: 0 });
  const umana = dettagli(LUNGO, { imperfezione: 1 });
  const somma = (a) => a.reduce((x, y) => x + y, 0);
  assert.ok(somma(umana.attesa) > somma(regolare.attesa) + 5, 'più esitazioni');
  const inizioNumero = [...LUNGO].map((c, i) => (/\d/.test(c) && !/[\d.]/.test(LUNGO[i - 1] ?? '') ? i : -1)).filter((i) => i >= 0);
  const conPausa = inizioNumero.filter((i) => umana.attesa[i] >= 0.6).length;
  assert.ok(conPausa >= inizioNumero.length * 0.5, `esita prima dei numeri (${conPausa}/${inizioNumero.length})`);
  assert.ok(umana.sbagliato.every((x) => x === null) && umana.refuso.every((x) => x === 0), 'niente refusi se spenti');
});

test('i refusi: rari, un tasto vicino, e il testo finale è sempre giusto', () => {
  const d = dettagli(LUNGO.repeat(4), { refusi: 1 });
  const n = d.sbagliato.filter(Boolean).length;
  assert.ok(n >= 1 && n <= 20, `refusi: ${n}`);
  const p = piano('', LUNGO.repeat(4), { refusi: 1 });
  let visto = false;
  for (let x = 0; x < p.totale; x += 0.05) {
    const v = vedi(p, x);
    if ((v.prima + v.nascosto).length === LUNGO.repeat(4).length && v.prima + v.nascosto !== LUNGO.repeat(4)) visto = true; // un carattere sbagliato in vista
    assert.ok(v.prima.length <= LUNGO.repeat(4).length);
  }
  assert.ok(visto, 'il refuso si vede');
  assert.equal(vedi(p, p.totale).prima, LUNGO.repeat(4));
});

test('le pause lunghe fanno lampeggiare il cursore, e la velocità cambia la durata', () => {
  const p = piano('', LUNGO, { imperfezione: 1 });
  let lampeggia = false;
  for (let x = 0; x < p.totale; x += 0.05) lampeggia ||= vedi(p, x).lampeggia === true;
  assert.ok(lampeggia, 'ogni tanto lampeggia');
  assert.ok(durataNaturaleMs(piano('', LUNGO, { velocita: 2 })) < durataNaturaleMs(piano('', LUNGO, { velocita: 1 })) * 0.6);
});

import { pianoCancella, unitaCancella, vediCancella } from '../src/renderer/scrittura.js';

const CODICE = 'stack(\n  s("bd*4, hh*8").gain(.8).room(.3),\n  note("c3 e3 g3 b3").s("sawtooth").lpf(900).delay(.25)\n)';

test('cancellare da umano: sempre lo stesso dallo stesso testo, parte intero e finisce vuoto, mai a salti all\'indietro', () => {
  const a = pianoCancella(CODICE, undefined);
  const b = pianoCancella(CODICE, undefined);
  assert.equal(a, b);
  assert.equal(vediCancella(a, 0).resta, CODICE.length, 'all\'inizio c\'è tutto');
  let prima = CODICE.length;
  for (let x = 0; x < a.totale; x += a.totale / 400) {
    const v = vediCancella(a, x);
    assert.ok(v.resta <= prima, 'il testo non ricresce');
    prima = v.resta;
  }
  assert.equal(vediCancella(a, a.totale).resta, 0);
  assert.equal(vediCancella(a, a.totale).fatto, true);
});

test('cancellare è più svelto che scrivere, e ogni tanto toglie una parola intera', () => {
  const lunga = CODICE.repeat(3);
  const c = pianoCancella(lunga, { imperfezione: 1 });
  const scrittura = piano('', lunga, { imperfezione: 1 });
  assert.ok(c.totale < scrittura.totale * 0.5, `${c.totale} contro ${scrittura.totale}`);
  const parole = c.passi.filter((p, i) => i > 0 && c.passi[i - 1].resta - p.resta > 1).length;
  assert.ok(parole >= 3, `parole intere: ${parole}`);
  const regolare = pianoCancella(lunga, { imperfezione: 0 });
  assert.ok(regolare.passi.filter((p, i) => i > 0 && regolare.passi[i - 1].resta - p.resta > 1).length < parole + 1);
});

test('quando esce un livello intero a volte si seleziona un blocco: evidenziato un attimo e via in un colpo', () => {
  let viste = 0;
  for (let k = 0; k < 40; k++) {
    const testo = `${CODICE}\n// ${k}`;
    const pc = pianoCancella(testo, { imperfezione: 1 }, { blocco: true });
    const sel = pc.passi.findIndex((p) => p.selezione);
    if (sel < 0) continue;
    viste++;
    assert.deepEqual(pc.passi[sel].selezione, [0, testo.length]);
    assert.equal(pc.passi[sel].resta, testo.length, 'durante la selezione c\'è ancora tutto');
    assert.equal(pc.passi[sel + 1].resta, 0, 'poi via tutto in un colpo');
    assert.equal(vediCancella(pc, pc.cum[sel] + 0.1).selezione?.[1], testo.length);
  }
  assert.ok(viste >= 10 && viste < 40, `selezioni: ${viste}/40`);
  // senza blocco (una modifica che toglie testo) non si seleziona mai
  assert.ok(pianoCancella(CODICE, { imperfezione: 1 }, { blocco: false }).passi.every((p) => !p.selezione));
});

test('sincronia: la cancellazione finisce esattamente quando il suono esce; con tempo di sobra parte più tardi, con poco accelera', () => {
  const pc = pianoCancella(CODICE, undefined);
  const naturale = pc.totale * pc.msPerUnita;
  const fine = 100000;
  assert.equal(unitaCancella(pc, 0, fine, fine - naturale - 1), 0, 'tanto tempo: parte più tardi, prima c\'è tutto');
  assert.ok(Math.abs(unitaCancella(pc, 0, fine, fine) - pc.totale) < 1e-9);
  assert.equal(vediCancella(pc, unitaCancella(pc, 0, fine, fine)).resta, 0);
  const poco = naturale / 4;
  assert.ok(Math.abs(unitaCancella(pc, 0, poco, poco / 2) - pc.totale / 2) < 1e-6, 'poco tempo: parte subito e accelera');
  assert.equal(unitaCancella(pc, 0, poco, poco * 2), pc.totale);
});

test('la velocità della scrittura vale anche per la cancellazione', () => {
  const lenta = pianoCancella(CODICE, { velocita: 0.5 });
  const svelta = pianoCancella(CODICE, { velocita: 2 });
  assert.ok(lenta.msPerUnita > svelta.msPerUnita * 3);
});
