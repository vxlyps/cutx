// La mappa dei CANALI (canali.json) sta nella radice dello stash: una sola per tutti i PROJ.
// stash.js importa electron: qui lo si sostituisce con un finto `app` (cartella dati in una cartella temporanea).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register } from 'node:module';

const dati = fs.mkdtempSync(path.join(os.tmpdir(), 'cutx-dati-'));
process.env.CUTX_TEST_DATI = dati;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) {
  if (s === 'electron') return { url: 'data:text/javascript,' + encodeURIComponent('const app={getPath:()=>process.env.CUTX_TEST_DATI,isPackaged:false};export {app};export default {app};'), shortCircuit: true };
  return n(s, c);
}`));

test('canali.json: una mappa sola per tutti i PROJ; la prima volta parte da quella del PROJ aperto; i vecchi non si toccano', async () => {
  const stashDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutx-stash-'));
  fs.writeFileSync(path.join(dati, 'impostazioni.json'), JSON.stringify({ stash: stashDir }));
  fs.writeFileSync(path.join(stashDir, 'stash.json'), '{}');
  const st = await import('../src/main/stash.js');
  st.carica();
  assert.equal(await st.leggiCanali(), null, 'nessun PROJ aperto e nessuna mappa: predefiniti');
  await st.nuovoProj('uno');
  const c1 = st.cartellaProj();
  await st.nuovoProj('due');
  const c2 = st.cartellaProj();
  fs.writeFileSync(path.join(c1, 'canali.json'), 'MAPPA-DI-UNO');
  fs.writeFileSync(path.join(c2, 'canali.json'), 'MAPPA-DI-DUE');
  await st.apriProj(1);
  assert.equal(await st.leggiCanali(), 'MAPPA-DI-UNO', 'prima volta: la mappa del PROJ aperto');
  assert.ok(fs.existsSync(path.join(stashDir, 'canali.json')), 'copiata nella radice');
  await st.apriProj(2);
  assert.equal(await st.leggiCanali(), 'MAPPA-DI-UNO', 'cambiando PROJ la mappa è la stessa');
  await st.scriviCanali('NUOVA');
  await st.apriProj(1);
  assert.equal(await st.leggiCanali(), 'NUOVA');
  assert.equal(fs.readFileSync(path.join(c1, 'canali.json'), 'utf8'), 'MAPPA-DI-UNO');
  assert.equal(fs.readFileSync(path.join(c2, 'canali.json'), 'utf8'), 'MAPPA-DI-DUE');
  fs.rmSync(stashDir, { recursive: true, force: true });
  fs.rmSync(dati, { recursive: true, force: true });
});
