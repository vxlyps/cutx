// Una prova in silenzio: node scripts/prova-silenziosa.mjs synth,tempo (senza argomenti: la sequenza completa).
// A schermo solo le righe [prova] con i fallimenti e il conteggio finale; il resto sta nel file di log.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const electron = createRequire(import.meta.url)('electron');
const parti = process.argv[2];
const cp = spawn(electron, ['.', parti ? `--prova=${parti}` : '--prova', '--silenzioso'], { stdio: ['ignore', 'pipe', 'pipe'] });
let resto = '';
cp.stdout.on('data', (d) => {
  resto += d;
  const righe = resto.split('\n');
  resto = righe.pop();
  for (const r of righe) if (r.startsWith('[prova]')) console.log(r);
});
cp.on('exit', (codice) => process.exit(codice ?? 1));
