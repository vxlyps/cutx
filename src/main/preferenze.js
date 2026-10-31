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
  suggerimenti: true,
  riquadroHelp: true,
  gatto: true,
  insegna: true,
  dissolvenzaEntrata: 0, // cicli di sfumata di un livello che entra (0 = di botto)
  dissolvenzaUscita: 0,
  dissolvenzaTipo: 'volume', // 'volume' | 'filtro'
  dissolvenzaFiltroUscita: 'hp', // 'hp' (passa-alto che sale) | 'lp' (passa-basso che chiude)
  paracaduteCicli: 2, // la transizione del paracadute
  sfondoProiettore: 'niente', // dietro al codice sul proiettore: niente, note, oscilloscopio
  hydra: true,
  logoSopraHydra: true,
  cartelleAbleton: [], // dove tengo i progetti Ableton (solo letti)
  scorciatoie: {}, // solo quelle cambiate: id → combinazione (vedi scorciatoie.js)
  uscitaApriAvvio: false, // l'uscita si apre all'avvio solo se lo chiedo; il resto del tempo solo col tasto «uscita» o ⌃⌘F
  uscita: { bordi: null, schermoIntero: false, schermo: null }, // dove stava l'ultima volta
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
