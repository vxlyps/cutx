// Preferenze della macchina (non del set): lunghezza della frase, poi scorciatoie e interruttori.
// Stanno nei dati dell'app; quelle del set stanno in stash.json.
import { app } from 'electron';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

export const PREDEFINITE = {
  lunghezzaFrase: 16,
  scritturaAMacchina: true,
  scrittura: { velocita: 1, imperfezione: 0.5, refusi: 0 }, // la scrittura umana sul proiettore (scrittura.js): quanto veloce, quanto imperfetta, quanti refusi
  paracadute: true,
  suggerimenti: true,
  riquadroHelp: true,
  gatto: true,
  insegna: true,
  dissolvenzaEntrata: 0, // cicli di sfumata di un livello che entra (0 = di botto)
  dissolvenzaUscita: 0,
  dissolvenzaTipo: 'volume', // 'volume' | 'filtro'
  dissolvenzaFiltroUscita: 'hp', // 'hp' (passa-alto che sale) | 'lp' (passa-basso che chiude)
  stopTorna: 'battuta', // lo stop dei colpi torna sull'1 della battuta (il vuoto prima del drop) o sul battito
  colpiGriglia: 0.25, // i colpi del controller entrano e escono sulla griglia: ¼ di ciclo (un battito) o ⅛
  scivolata: 0.25, // quanto scivola un numero della coda cambiato a mano, in cicli (battute): 0, ¼ (un battito), ½, 1
  moviola: false, // la scatola nera delle prove (moviola.js): spenta finché non la accendo
  moviolaTastoController: null, // il numero MIDI del tasto del controller che mette un SEGNO nel registro
  paracaduteCicli: 2, // la transizione del paracadute
  transizione: 'sweep 8', // come si passa al prossimo brano: 'sweep 8' | 'sweep 4' | 'cut' (transizioni.js); il set può scriverne una per brano
  sfondoProiettore: 'niente', // dietro al codice sul proiettore: niente, note, oscilloscopio
  hydra: true,
  logoSopraHydra: true,
  aperturaFantasma: true, // il testo fantasma dell'apertura (il codice scritto a casa, in grigio sotto quello che scrivo)
  usaCopiaStash: true, // se l'SSD non c'è all'avvio, si usa la copia dello stash sul Mac (Impostazioni → stash)
  cartellaSuoni: null, // dove stanno i suoni di Strudel scaricati (suoni-strudel.js); null = non ancora scelta
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
