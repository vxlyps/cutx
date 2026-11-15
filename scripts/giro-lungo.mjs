// Il giro lungo: tutte le parti di --prova (tranne le «mano-»), in silenzio, col volume del Mac al 20% e poi rimesso com'era.
// npm run prova:tutto
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { proveInCorso } from './prova-libera.mjs';

const sorgente = readFileSync(new URL('../src/main/prova.js', import.meta.url), 'utf8');
const parti = [...new Set([...sorgente.matchAll(/parti\.includes\('([a-z-]+)'\)/g)].map((m) => m[1]))];
// Il giro lungo vuole l'app di prova tutta per sé (e il volume del Mac): se un'altra prova gira, non parte e non tocca il volume.
if (proveInCorso().length && !process.env.CUTX_PROVA_NOME) {
  console.log('giro lungo: c\'è già una prova in corso (un altro terminale o ramo?). Fermala e rilancia: due prove insieme si rovinano a vicenda e il volume si perde.');
  process.exit(2);
}
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
