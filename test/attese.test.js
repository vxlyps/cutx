import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scegliAttese, togliRampa } from '../src/renderer/attese.js';
import { Riproduttore } from '../src/renderer/riproduttore.js';
import { gradiniRampa } from '../src/renderer/passaggio.js';

const L = (nome, da, a = Infinity, sfuma = null) => ({ nome, da, a, sfuma });

test('STOP prima del confine annulla tutto: entrate non ancora entrate e uscite non ancora partite', () => {
  const suona = L('suona', 0);
  const entra = L('entra', 8);
  const esceDopo = L('esce', 0, 8); // OUT senza dissolvenza: esce a 8
  const sfumaDopo = L('sfuma', 0, 10, { verso: 'esce', da: 8 }); // dissolvenza che parte a 8
  const { entrate, uscite } = scegliAttese([suona, entra, esceDopo, sfumaDopo], 4);
  assert.deepEqual(entrate.map((l) => l.nome), ['entra']);
  assert.deepEqual(uscite.map((l) => l.nome), ['esce', 'sfuma']);
});

test('STOP a transizione partita non riprende A: la sfumata già iniziata va avanti', () => {
  const A = L('A', 0, 12, { verso: 'esce', da: 8 }); // esce con filtro dal ciclo 8
  const B = L('B', 8, Infinity, { verso: 'entra', da: 8 });
  const { entrate, uscite } = scegliAttese([A, B], 9);
  assert.deepEqual(entrate, [], 'B è già entrato');
  assert.deepEqual(uscite, [], 'A sta già sfumando: non torna pieno sopra B');
  // una clip sostituita a metà dissolvenza
  const vecchia = L('v', 0, 6, { verso: 'esce', da: 4 });
  assert.deepEqual(scegliAttese([vecchia], 5).uscite, []);
  // una uscita già finita non è un'attesa
  assert.deepEqual(scegliAttese([L('x', 0, 3)], 5).uscite, []);
});

test('STOP salta quello che il chiamante esclude (paracadute, livelli del controller)', () => {
  const p = { ...L('paracadute', 8) };
  const { entrate } = scegliAttese([p, L('altro', 8)], 4, { salta: (l) => l.nome === 'paracadute' });
  assert.deepEqual(entrate.map((l) => l.nome), ['altro']);
});

const conRampa = () => {
  const ac = { currentTime: 0 };
  const rip = new Riproduttore(ac, () => {});
  rip.mappa = { ciclo0: 0, t0: 0, cps: 0.5 };
  return rip;
};

test('STOP su un passaggio con rampa lascia il tempo com\'era: via i suoi gradini, e solo i suoi', () => {
  const rip = conRampa();
  rip.cambiaCpsA(20, 0.6); // un cambio di un altro livello, più avanti
  const prima = rip.cambiTempo.map((c) => ({ ...c }));
  const gradini = gradiniRampa(0.5, 0.55, 8, 4);
  const tolti = rip.cambiTempo.filter((c) => c.ciclo > 7).map((c) => ({ ...c }));
  rip.annullaCambiDopo(7); // come fa il motore quando arriva la rampa
  for (const g of gradini) rip.cambiaCpsA(g.ciclo, g.cps);
  assert.equal(rip.cambiTempo.length, 4);
  const rimessi = [];
  togliRampa(rip, { gradini, tolti }, (cambi) => { rimessi.push(...cambi); for (const c of cambi) rip.cambiaCpsA(c.ciclo, c.cps); });
  assert.deepEqual(rip.cambiTempo, prima, 'il tempo è com\'era, il cambio degli altri è tornato');
  togliRampa(rip, null, () => assert.fail('senza rampa non si fa niente'));
});

test('togliRampa: un cambio che era già passato non torna', () => {
  const rip = conRampa();
  rip.fine = 30;
  const rimessi = [];
  togliRampa(rip, { gradini: [], tolti: [{ ciclo: 10, cps: 0.6 }, { ciclo: 40, cps: 0.7 }] }, (c) => rimessi.push(...c));
  assert.deepEqual(rimessi, [{ ciclo: 40, cps: 0.7 }]);
});
