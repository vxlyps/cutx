// Il registro di CUTX: un file con errori e avvisi di tutti i processi (principale, interfaccia, motori, uscita),
// per guardarlo dopo una serata se qualcosa è andato storto. Una riga per evento, con data e ora.
// In ~/Library/Logs/CUTX/cutx.log; oltre 2 MB passa a cutx.1.log (uno solo di scorta).
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const MASSIMO = 2 * 1024 * 1024;
let cartella = null;
let ultima = { chiave: '', quando: 0, saltate: 0 }; // l'ultima riga scritta, per non ripeterla a raffica

export function inizia(dove) {
  cartella = dove;
  ultima = { chiave: '', quando: 0, saltate: 0 };
  try {
    mkdirSync(cartella, { recursive: true });
  } catch {
    cartella = null; // senza cartella dei log si va avanti lo stesso
  }
}

// Chi vuole sentire ogni riga che si scrive (la MOVIOLA): fn(livello, fonte, messaggio). Un errore suo non tocca il log.
let ascolto = null;
export const agganciaA = (fn) => (ascolto = fn);

export const cartellaDeiLog = () => cartella;
export const fileDelLog = () => (cartella ? path.join(cartella, 'cutx.log') : null);

// livello: 'info' | 'avviso' | 'errore'; fonte: chi parla (main, controllo, live, cuffia, uscita, uscite…)
export function scrivi(livello, fonte, messaggio) {
  try {
    ascolto?.(livello, fonte, String(messaggio).replace(/\s+$/, ''));
  } catch {
    // mai far cadere l'app per chi ascolta
  }
  if (!cartella) return;
  // lo stesso messaggio di fila entro un secondo (un guasto che si ripete a ogni fotogramma) si conta e basta:
  // il registro non si riempie e il processo principale non passa il tempo a scrivere
  const chiave = `${livello}|${fonte}|${messaggio}`;
  const adesso = Date.now();
  if (chiave === ultima.chiave && adesso - ultima.quando < 1000) {
    ultima.saltate++;
    return;
  }
  const saltate = ultima.saltate ? `${new Date().toISOString()} [info] [registro] il messaggio qui sopra si è ripetuto altre ${ultima.saltate} volte\n` : '';
  ultima = { chiave, quando: adesso, saltate: 0 };
  const riga = `${saltate}${new Date().toISOString()} [${livello}] [${fonte}] ${String(messaggio).replace(/\s+$/, '').replace(/\n/g, '\n    ')}\n`;
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
