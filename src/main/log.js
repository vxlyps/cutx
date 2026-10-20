// Il registro di CUTX: un file con errori e avvisi di tutti i processi (principale, interfaccia, motori, uscita),
// per guardarlo dopo una serata se qualcosa è andato storto. Una riga per evento, con data e ora.
// In ~/Library/Logs/CUTX/cutx.log; oltre 2 MB passa a cutx.1.log (uno solo di scorta).
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const MASSIMO = 2 * 1024 * 1024;
let cartella = null;

export function inizia(dove) {
  cartella = dove;
  try {
    mkdirSync(cartella, { recursive: true });
  } catch {
    cartella = null; // senza cartella dei log si va avanti lo stesso
  }
}

export const cartellaDeiLog = () => cartella;
export const fileDelLog = () => (cartella ? path.join(cartella, 'cutx.log') : null);

// livello: 'info' | 'avviso' | 'errore'; fonte: chi parla (main, controllo, live, cuffia, uscita, uscite…)
export function scrivi(livello, fonte, messaggio) {
  const riga = `${new Date().toISOString()} [${livello}] [${fonte}] ${String(messaggio).replace(/\s+$/, '').replace(/\n/g, '\n    ')}\n`;
  if (!cartella) return;
  try {
    const file = fileDelLog();
    try {
      if (statSync(file).size > MASSIMO) renameSync(file, path.join(cartella, 'cutx.1.log'));
    } catch {
      // il file non c'è ancora
    }
    appendFileSync(file, riga);
  } catch {
    // mai far cadere l'app per un log che non si scrive
  }
}
