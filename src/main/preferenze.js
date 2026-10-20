// Preferenze della macchina (non del set): lunghezza della frase, poi scorciatoie e interruttori.
// Stanno nei dati dell'app; quelle del set stanno in stash.json.
import { app } from 'electron';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

export const PREDEFINITE = {
  lunghezzaFrase: 16,
  scritturaAMacchina: true,
  paracadute: true,
  uscita: { aperta: false, bordi: null, schermoIntero: false },
};

const file = () => path.join(app.getPath('userData'), 'preferenze.json');

let preferenze = null;

export function leggi() {
  if (!preferenze) {
    try {
      preferenze = { ...PREDEFINITE, ...JSON.parse(readFileSync(file(), 'utf8')) };
    } catch {
      preferenze = { ...PREDEFINITE };
    }
  }
  return preferenze;
}

export async function salva(modifiche) {
  preferenze = { ...leggi(), ...modifiche };
  await writeFile(file(), JSON.stringify(preferenze, null, 2));
  return preferenze;
}
