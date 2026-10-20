// La lettura di un .als in un thread a parte: un progetto grande non deve fermare il processo principale
// (che fa da guardiano ai motori) né l'interfaccia.
import { parentPort, workerData } from 'node:worker_threads';
import { leggiAlsFile } from './leggi.js';

try {
  parentPort.postMessage({ modello: await leggiAlsFile(workerData.percorso) });
} catch (e) {
  parentPort.postMessage({ errore: String(e.message ?? e) });
}
