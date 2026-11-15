import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FiltroMano, altezzaDaY, hzDaAltezza, rigaMano } from '../src/renderer/mani-filtro.js';

test('hzDaAltezza: esponenziale 200–16000, mai fuori scala', () => {
  assert.equal(hzDaAltezza(0), 200);
  assert.equal(hzDaAltezza(1), 16000);
  assert.equal(hzDaAltezza(0.5), Math.round(200 * Math.sqrt(80)));
  assert.equal(hzDaAltezza(-3), 200);
  assert.equal(hzDaAltezza(7), 16000);
});

test('altezzaDaY: mano in alto = aperto, in basso = chiuso, al centro a metà', () => {
  assert.equal(altezzaDaY(0.5), 0.5);
  assert.equal(altezzaDaY(0), 1);
  assert.equal(altezzaDaY(1), 0);
  assert.ok(altezzaDaY(0.3) > altezzaDaY(0.6));
});

test('la sensibilità: più alta, meno strada serve alla mano', () => {
  assert.ok(altezzaDaY(0.35, 1) > altezzaDaY(0.35, 0));
  assert.ok(altezzaDaY(0.65, 1) < altezzaDaY(0.65, 0));
  assert.equal(altezzaDaY(0.5, 1), 0.5);
});

test('la riga è una riga globale segnata «mano»', () => {
  assert.equal(rigaMano(1234), 'all(x => x.lpf(1234)) // mano');
});

const passi = (f, da, a, { visibile, y }, ogni = 33) => {
  let ultimo;
  for (let t = da; t <= a; t += ogni) ultimo = f.aggiorna({ visibile, y, ora: t });
  return ultimo;
};

test('la prima volta che vede la mano parte da dov\'è, e scrive subito la riga', () => {
  const f = new FiltroMano();
  const r = f.aggiorna({ visibile: true, y: 0.2, ora: 0 });
  assert.equal(r.controlla, true);
  assert.equal(r.cambia, true);
  assert.equal(r.riga, rigaMano(hzDaAltezza(altezzaDaY(0.2))));
});

test('ammorbidito: un salto della mano arriva piano, senza sorpassare', () => {
  const f = new FiltroMano();
  f.aggiorna({ visibile: true, y: 0.8, ora: 0 });
  let prima = f.a;
  const bersaglio = altezzaDaY(0.2);
  for (let t = 33; t <= 1500; t += 33) {
    const r = f.aggiorna({ visibile: true, y: 0.2, ora: t });
    assert.ok(r.altezza >= prima - 1e-9, 'sale sempre');
    assert.ok(r.altezza <= bersaglio + 1e-9, 'non sorpassa');
    prima = r.altezza;
  }
  assert.ok(Math.abs(prima - bersaglio) < 0.01);
});

test('zona morta: il tremolio della mano non riscrive la riga', () => {
  const f = new FiltroMano();
  f.aggiorna({ visibile: true, y: 0.5, ora: 0 });
  let scritture = 0;
  for (let t = 33, i = 0; t <= 3000; t += 33, i++) {
    const r = f.aggiorna({ visibile: true, y: 0.5 + (i % 2 ? 0.004 : -0.004), ora: t });
    if (r.cambia) scritture++;
  }
  assert.equal(scritture, 0);
});

test('al massimo una riga ogni 66 ms, anche con la mano che corre', () => {
  const f = new FiltroMano();
  const tempi = [];
  for (let t = 0, i = 0; t <= 2000; t += 16, i++) {
    const r = f.aggiorna({ visibile: true, y: 0.5 + 0.4 * Math.sin(i / 3), ora: t });
    if (r.cambia) tempi.push(t);
  }
  for (let i = 1; i < tempi.length; i++) assert.ok(tempi[i] - tempi[i - 1] >= 66);
  assert.ok(tempi.length > 5);
});

test('un fotogramma senza mano (sotto 300 ms) non cambia niente', () => {
  const f = new FiltroMano();
  passi(f, 0, 500, { visibile: true, y: 0.7 });
  const prima = f.a;
  const r = passi(f, 533, 700, { visibile: false });
  assert.equal(r.controlla, true);
  assert.equal(r.rilascio, false);
  assert.equal(f.a, prima);
});

test('mano persa: il filtro torna aperto in 2 cicli, in modo continuo, poi la riga sparisce', () => {
  const cicloMs = 2000;
  const f = new FiltroMano({ cicloMs: () => cicloMs });
  passi(f, 0, 1000, { visibile: true, y: 0.8 }); // mano bassa: filtro chiuso
  assert.ok(f.a < 0.2);
  const t0 = 1033;
  let prima = f.a;
  let fine = null;
  for (let t = t0; t <= t0 + 300 + 2 * cicloMs + 200; t += 33) {
    const r = f.aggiorna({ visibile: false, ora: t });
    if (!r.controlla) {
      fine = { t, r };
      break;
    }
    assert.ok(r.altezza >= prima - 1e-9, 'sale sempre, mai bloccato né indietro');
    prima = r.altezza;
  }
  assert.ok(fine, 'a un certo punto la mano smette di comandare');
  assert.equal(fine.r.riga, null);
  assert.equal(fine.r.cambia, true, 'la riga va tolta');
  const durata = fine.t - t0;
  assert.ok(durata >= 2 * cicloMs && durata <= 300 + 2 * cicloMs + 100, `durata ${durata}`);
});

test('la mano torna durante il rilascio: riprende il comando, senza salti', () => {
  const f = new FiltroMano({ cicloMs: () => 2000 });
  passi(f, 0, 1000, { visibile: true, y: 0.8 });
  passi(f, 1033, 2500, { visibile: false });
  const mezzo = f.a;
  assert.ok(mezzo > 0.3 && mezzo < 1);
  const r = f.aggiorna({ visibile: true, y: 0.8, ora: 2533 });
  assert.equal(r.controlla, true);
  assert.equal(r.rilascio, false);
  assert.ok(Math.abs(r.altezza - mezzo) < 0.1, 'riparte da dov\'era, poi scende piano');
});

test('ferma() (il tasto M): subito niente filtro, e dice di togliere la riga solo se c\'era', () => {
  const f = new FiltroMano();
  assert.equal(f.ferma().cambia, false);
  f.aggiorna({ visibile: true, y: 0.4, ora: 0 });
  const r = f.ferma();
  assert.equal(r.controlla, false);
  assert.equal(r.riga, null);
  assert.equal(r.cambia, true);
  assert.equal(f.aggiorna({ visibile: false, ora: 100 }).controlla, false);
});

test('un ciclo molto corto non fa un rilascio più breve di mezzo secondo', () => {
  const f = new FiltroMano({ cicloMs: () => 50 });
  passi(f, 0, 600, { visibile: true, y: 0.8 });
  let t = 633;
  while (f.aggiorna({ visibile: false, ora: t }).controlla) t += 33;
  assert.ok(t - 633 >= 500 + 300 - 40);
});
