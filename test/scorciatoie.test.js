import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AZIONI, caps, comboDa, conflitto, corrisponde, effettive, eRiservata, etichetta, scriveTesto } from '../src/renderer/scorciatoie.js';

const evento = (code, { ctrl, alt, shift, meta } = {}) => ({ code, ctrlKey: !!ctrl, altKey: !!alt, shiftKey: !!shift, metaKey: !!meta });
const azione = (id) => AZIONI.find((a) => a.id === id);

test('le predefinite non si pestano i piedi', () => {
  const m = effettive();
  for (const a of AZIONI) assert.equal(conflitto(m, a.id, m[a.id]), null, a.id);
});

test('comboDa: modificatori in ordine fisso, solo-modificatore = null', () => {
  assert.equal(comboDa(evento('KeyF', { meta: true, ctrl: true })), 'Ctrl+Meta+KeyF');
  assert.equal(comboDa(evento('Enter', { meta: true, shift: true })), 'Shift+Meta+Enter');
  assert.equal(comboDa(evento('MetaLeft', { meta: true })), null);
});

test('corrisponde: tasto semplice e cifre del muto', () => {
  assert.equal(corrisponde(evento('Enter', { meta: true }), azione('provaCuffia'), 'Meta+Enter'), true);
  assert.equal(corrisponde(evento('Enter'), azione('provaCuffia'), 'Meta+Enter'), false);
  assert.equal(corrisponde(evento('Digit5', { alt: true }), azione('muto'), 'Alt+Digit#'), 5);
  assert.equal(corrisponde(evento('Digit5'), azione('muto'), 'Alt+Digit#'), false);
  assert.equal(corrisponde(evento('Digit0', { alt: true }), azione('muto'), 'Alt+Digit#'), false);
});

test('scriveTesto: ⌥ e i tasti semplici scrivono, ⌘ ed esc no', () => {
  assert.equal(scriveTesto('Alt+Digit#'), true);
  assert.equal(scriveTesto('Digit1'), true);
  assert.equal(scriveTesto('Meta+Enter'), false);
  assert.equal(scriveTesto('Ctrl+Meta+KeyF'), false);
  assert.equal(scriveTesto('Escape'), false);
  assert.equal(scriveTesto('Tab'), false);
});

test('conflitto: avvisa chi usa già la combinazione, anche per le cifre', () => {
  const m = effettive();
  assert.equal(conflitto(m, 'goLive', 'Meta+Enter'), 'provaCuffia');
  assert.equal(conflitto(m, 'goLive', 'Meta+KeyG'), null);
  // ⌥ + una cifra è già del muto
  assert.equal(conflitto(m, 'entra1', 'Alt+Digit3'), 'muto');
  assert.equal(conflitto({ ...m, entra1: 'Digit1' }, 'muto', 'Digit#'), 'entra1');
});

test('un tasto personale vince sul predefinito', () => {
  assert.equal(effettive({ goLive: 'Meta+KeyG' }).goLive, 'Meta+KeyG');
  assert.equal(effettive({}).goLive, 'Shift+Meta+Enter');
});

test('etichette da keycap', () => {
  assert.deepEqual(caps('Shift+Meta+Enter'), ['⇧', '⌘', '↵']);
  assert.equal(etichetta('Ctrl+Meta+KeyF'), '⌃⌘F');
  assert.deepEqual(caps('Alt+Digit#'), ['⌥', '1–9']);
  assert.equal(etichetta('Meta+Comma'), '⌘,');
});

test('riservate: ⌘Q e compagnia', () => {
  assert.equal(eRiservata('Meta+KeyQ'), true);
  assert.equal(eRiservata('Meta+KeyG'), false);
});
