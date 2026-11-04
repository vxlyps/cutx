import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// L'app impacchettata parte solo se ogni file importato dal processo principale (e dal worker di Ableton) è nel pacchetto:
// una dimenticanza (successe alla beta 4 con categorie.js) la fa morire all'avvio con ERR_MODULE_NOT_FOUND.
const radice = path.resolve(import.meta.dirname, '..');
const pacchetto = JSON.parse(readFileSync(path.join(radice, 'package.json'), 'utf8')).build.files;

const dentro = (rel) =>
  pacchetto.some((p) => !p.startsWith('!') && (p === rel || (p.endsWith('/**') && rel.startsWith(p.slice(0, -2))))) &&
  !pacchetto.some((p) => p.startsWith('!') && p.slice(1) === rel);

function importati(file, visti = new Set()) {
  if (visti.has(file)) return visti;
  visti.add(file);
  const testo = readFileSync(file, 'utf8');
  for (const m of testo.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
    const f = path.resolve(path.dirname(file), m[1]);
    if (existsSync(f) && f.endsWith('.js') && !f.endsWith('prova.js')) importati(f, visti); // la prova si carica solo con i flag di prova e non sta nel pacchetto
  }
  return visti;
}

test('ogni file che il processo principale importa sta nel pacchetto', () => {
  const partenze = ['src/main/main.js', 'src/ableton/worker.js'].map((f) => path.join(radice, f));
  const tutti = new Set();
  for (const f of partenze) for (const x of importati(f)) tutti.add(x);
  const mancanti = [...tutti].map((f) => path.relative(radice, f)).filter((rel) => !dentro(rel));
  assert.deepEqual(mancanti, [], `mancano nel pacchetto (package.json → build.files): ${mancanti.join(', ')}`);
});

test('il controllo trova davvero una dimenticanza', () => {
  assert.equal(dentro('src/renderer/categorie.js'), true);
  assert.equal(dentro('src/renderer/synth-vista.js'), false, 'i file del renderer stanno in dist, non nell\'asar');
  assert.equal(dentro('src/main/prova.js'), false, 'la prova non va nel pacchetto');
});
