// Una sola prova alla volta: l'app di prova ha UNA istanza e UNA cartella dati (CUTX-prova), e il volume del Mac è uno solo.
// Se un'altra sessione di lavoro (un altro ramo, un altro terminale) ne sta già facendo girare una, qui lo si vede.
// Chi ha dati propri (CUTX_PROVA_NOME) non aspetta, ma il volume resta in comune: le prove che suonano si fanno una per volta.
import { execFileSync } from 'node:child_process';

export function proveInCorso() {
  try {
    return execFileSync('pgrep', ['-f', 'MacOS/Electron \\. --prova'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch {
    return []; // pgrep esce con errore quando non trova niente
  }
}

// Aspetta (al massimo `minuti`) che nessun'altra prova giri; ritorna false se non si è liberato.
export async function aspettaLibero(minuti = 10) {
  if (process.env.CUTX_PROVA_NOME) return true;
  const fine = Date.now() + minuti * 60000;
  let detto = false;
  while (proveInCorso().length) {
    if (!detto) console.log('[prova] un\'altra prova è in corso (un altro terminale o ramo?): aspetto che finisca…');
    detto = true;
    if (Date.now() > fine) return false;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return true;
}
