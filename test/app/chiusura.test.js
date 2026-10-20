// Chiudere CUTX deve essere pulito, in qualsiasi ordine si chiudano le finestre: niente errori (né nel terminale né nel
// registro), uscita con codice 0 e nessun processo rimasto acceso (motori live e cuffia compresi).
// Gira l'app vera (con dati a parte, in CUTX-chiusura): `npm run test:app` (apre e richiude le finestre, ~1 minuto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const radice = new URL('../../', import.meta.url).pathname;
const electron = path.join(radice, 'node_modules', '.bin', 'electron');
const registro = path.join(os.homedir(), 'Library', 'Application Support', 'CUTX-chiusura', 'log', 'cutx.log');
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

// I processi che appartengono a questa prova (principale, interfaccia, motori, GPU…): quelli con la sua cartella dati o il suo argomento.
const processiAccesi = () =>
  execFileSync('ps', ['-ax', '-o', 'pid=,command='], { maxBuffer: 1 << 26 })
    .toString()
    .split('\n')
    .filter((r) => r.includes('CUTX-chiusura') || r.includes('--chiusura='));

async function chiudiCosi(modo, { segnale } = {}) {
  await rm(registro, { force: true });
  const figlio = spawn(electron, ['.', `--chiusura=${modo}`], { cwd: radice, stdio: ['ignore', 'pipe', 'pipe'] });
  let uscita = '';
  figlio.stdout.on('data', (d) => (uscita += d));
  figlio.stderr.on('data', (d) => (uscita += d));
  const fine = new Promise((risolvi) => figlio.on('exit', (codice, sig) => risolvi({ codice, sig })));
  if (segnale) {
    for (let i = 0; i < 300 && !uscita.includes('CHIUSURA-PRONTA'); i++) await aspetta(100);
    figlio.kill(segnale); // dall'esterno, come un Terminale o lo spegnimento del Mac
  }
  const tempo = setTimeout(() => figlio.kill('SIGKILL'), 60_000);
  const { codice, sig } = await fine;
  clearTimeout(tempo);
  await aspetta(1500); // i processi figli hanno un attimo per andarsene
  const rimasti = processiAccesi();
  for (const r of rimasti) try { process.kill(Number(r.trim().split(/\s+/)[0]), 'SIGKILL'); } catch { /* già andato */ }
  const log = await readFile(registro, 'utf8').catch(() => '');
  return { codice, sig, uscita, rimasti, log };
}

const MODI = [
  ['si chiude la finestra principale', 'controllo'],
  ['si chiude prima l\'uscita, poi la finestra principale', 'uscita-prima'],
  ['si chiude la finestra principale con l\'uscita aperta', 'controllo-con-uscita'],
  ['uscita e finestra principale chiuse insieme', 'tutte-insieme'],
  ['⌘Q con l\'uscita aperta', 'quit'],
  ['⌘Q appena partita', 'quit-subito'],
  ['la cuffia crasha e subito si chiude', 'crash-cuffia'],
  ['il live crasha e subito si chiude', 'crash-live'],
  ['l\'interfaccia crasha e subito si chiude', 'crash-controllo'],
];

for (const [nome, modo] of MODI) {
  test(`chiusura pulita: ${nome}`, async () => {
    const r = await chiudiCosi(modo);
    assert.equal(r.uscita.includes('CHIUSURA-PRONTA'), true, `non è partita:\n${r.uscita.slice(-800)}`);
    assert.equal(r.codice, 0, `codice di uscita ${r.codice} (${r.sig})\n${r.uscita.slice(-800)}`);
    assert.doesNotMatch(r.uscita, /TypeError|has been destroyed|Uncaught|CHIUSURA-BLOCCATA/, r.uscita.slice(-1200));
    assert.doesNotMatch(r.log, /\[errore\] \[main\]/, `errori nel registro:\n${r.log.slice(-1200)}`);
    assert.deepEqual(r.rimasti, [], `processi rimasti accesi:\n${r.rimasti.join('\n')}`);
  });
}

test('chiusura pulita: chiusa da fuori (SIGTERM, come un Terminale o lo spegnimento)', async () => {
  const r = await chiudiCosi('attesa', { segnale: 'SIGTERM' });
  assert.equal(r.codice, 0, `codice ${r.codice} (${r.sig})\n${r.uscita.slice(-800)}`);
  assert.doesNotMatch(r.uscita, /TypeError|has been destroyed|Uncaught/, r.uscita.slice(-1200));
  assert.deepEqual(r.rimasti, [], `processi rimasti accesi:\n${r.rimasti.join('\n')}`);
});
