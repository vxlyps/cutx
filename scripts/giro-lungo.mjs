// Il giro lungo: tutte le parti di --prova (tranne le «mano-»), in silenzio, col volume del Mac al 20% e poi rimesso com'era.
// npm run prova:tutto
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const sorgente = readFileSync(new URL('../src/main/prova.js', import.meta.url), 'utf8');
const parti = [...new Set([...sorgente.matchAll(/parti\.includes\('([a-z-]+)'\)/g)].map((m) => m[1]))];
const osa = (s) => execFileSync('osascript', ['-e', s], { encoding: 'utf8' }).trim();
const volume = osa('output volume of (get volume settings)');
console.log(`giro lungo: ${parti.length} parti · volume del Mac ${volume}% → 20%`);
osa('set volume output volume 20');
let esito = 1;
try {
  esito = spawnSync('node', ['scripts/prova-silenziosa.mjs', parti.join(',')], { stdio: 'inherit' }).status ?? 1;
} finally {
  osa(`set volume output volume ${volume}`);
  console.log(`volume rimesso a ${volume}%`);
}
process.exit(esito);
