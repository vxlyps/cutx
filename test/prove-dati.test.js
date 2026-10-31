import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Ogni prova usa la cartella dati separata: lo garantisce main.js (un solo elenco di flag, usato per i dati e per il registro).
const main = readFileSync(new URL('../src/main/main.js', import.meta.url), 'utf8');

test('ogni flag di prova è nell\'elenco che sceglie la cartella dati separata', () => {
  const flag = [...main.matchAll(/^const (\w+) = .*process\.argv/gm)].map((m) => m[1]);
  assert.ok(flag.length >= 6, `flag trovati: ${flag}`);
  const elenco = main.match(/const PER_PROVE = !!\(([^)]*)\)/)[1].split('||').map((x) => x.trim());
  for (const f of flag) assert.ok(elenco.includes(f), `${f} manca da PER_PROVE`);
});

test('PER_PROVE sposta i dati prima di ogni uso e la guardia ferma una prova con i dati veri', () => {
  const sposta = main.indexOf("if (PER_PROVE) {");
  assert.ok(sposta > 0 && main.slice(sposta, sposta + 400).includes("setPath('userData'"));
  assert.ok(main.includes('prova con la cartella dati vera'));
  assert.ok(sposta < main.indexOf('log.inizia('));
});
