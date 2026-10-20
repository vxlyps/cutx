// Ableton nel processo principale: legge i progetti (in un worker, uno alla volta, con una piccola memoria)
// e passa all'interfaccia solo quello che serve. Non scrive mai niente in un progetto.
import { Worker } from 'node:worker_threads';
import { stat } from 'node:fs/promises';
import { consentito } from '../ableton/scansione.js';

const memoria = new Map(); // percorso → { modificato, modello }
const MASSIMO = 6;
let coda = Promise.resolve();

function leggiInWorker(percorso) {
  return new Promise((risolvi, rifiuta) => {
    const w = new Worker(new URL('../ableton/worker.js', import.meta.url), { workerData: { percorso } });
    w.once('message', (m) => (m.errore ? rifiuta(new Error(m.errore)) : risolvi(m.modello)));
    w.once('error', rifiuta);
    w.once('exit', (codice) => codice && rifiuta(new Error(`lettura interrotta (${codice})`)));
  });
}

// Il modello di un progetto (leggi.js). Una lettura alla volta; rifatta solo se il file è cambiato.
export function modello(percorso, cartelle) {
  if (!consentito(percorso, cartelle)) return Promise.reject(new Error('progetto fuori dalle cartelle scelte'));
  const lavoro = coda.then(async () => {
    const modificato = (await stat(percorso)).mtimeMs;
    const prima = memoria.get(percorso);
    if (prima?.modificato === modificato) return prima.modello;
    const m = await leggiInWorker(percorso);
    memoria.delete(percorso);
    memoria.set(percorso, { modificato, modello: m });
    if (memoria.size > MASSIMO) memoria.delete(memoria.keys().next().value);
    return m;
  });
  coda = lavoro.catch(() => {});
  return lavoro;
}

// Per l'elenco del browser: tempo e tracce, senza il resto.
export async function info(percorso, cartelle) {
  try {
    const m = await modello(percorso, cartelle);
    return {
      bpm: m.bpm,
      battute: m.battute,
      versione: m.versione,
      tracce: m.tracce.length,
      midi: m.tracce.filter((t) => t.tipo === 'midi').length,
      audio: m.tracce.filter((t) => t.tipo === 'audio').length,
    };
  } catch (e) {
    return { errore: String(e.message ?? e) };
  }
}
