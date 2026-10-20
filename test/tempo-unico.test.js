// Il tempo del set ha un solo punto da cui si cambia e si legge (serve alla fase 4: il click di sync del PO-33 segue la
// mappa del tempo del live, quindi nessun cambio di BPM può passare da un'altra strada). Qui lo si controlla sui sorgenti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const radice = new URL('../src/renderer/', import.meta.url);

test('il motore live cambia il tempo solo da cambiaTempo()', async () => {
  const sorgente = await readFile(new URL('motore.js', radice), 'utf8');
  const dentro = sorgente.slice(sorgente.indexOf('function cambiaTempo('), sorgente.indexOf('rip.suMappa = pubblicaMappa'));
  const conta = (testo, chiamata) => testo.split(chiamata).length - 1;
  for (const chiamata of ['rip.cambiaCps(', 'rip.cambiaCpsA(', 'rip.annullaCambiDopo(']) {
    assert.equal(conta(sorgente, chiamata), conta(dentro, chiamata), `${chiamata} deve stare solo dentro cambiaTempo()`);
  }
  assert.ok(conta(dentro, 'rip.cambiaCps(') >= 1 && conta(dentro, 'rip.cambiaCpsA(') >= 1);
  // e non si assegna la mappa del riproduttore del live da nessun'altra parte (la cuffia la segue in seguiLive)
  assert.equal(sorgente.split("tipo: 'mappa'").length - 1, 1, 'la mappa si pubblica in un posto solo');
});

test('nessun altro file ricalcola il ciclo dalla mappa: tutti passano da tempo.js', async () => {
  for (const nome of await readdir(radice)) {
    if (!nome.endsWith('.js') || nome === 'tempo.js' || nome === 'motore.js') continue;
    const sorgente = await readFile(new URL(nome, radice), 'utf8');
    assert.ok(!/epoca0\)\s*\/\s*1000\)\s*\*\s*\w+\.cps/.test(sorgente), `${nome} ricalcola il ciclo a mano: usa cicloDi()`);
  }
});
