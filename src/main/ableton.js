// Ableton nel processo principale: legge i progetti (in un worker, uno alla volta, con una piccola memoria)
// e passa all'interfaccia solo quello che serve. Non scrive mai niente in un progetto.
import { Worker } from 'node:worker_threads';
import { stat, open, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
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

// --- i file audio di un progetto: dove stanno davvero, e come farli sentire in cuffia prima di importarli ---


const AUDIO = new Set(['.wav', '.aif', '.aiff', '.mp3', '.flac', '.ogg', '.m4a']);
export const eAudio = (percorso) => AUDIO.has(path.extname(percorso).toLowerCase());

// id → percorso: cutx://app/anteprima/<id> serve questi file e nient'altro (solo audio, solo quelli che
// abbiamo trovato noi o che Valerio ha scelto a mano).
const anteprime = new Map();
export const percorsoAnteprima = (id) => anteprime.get(id) ?? null;

function registra(percorso) {
  for (const [id, p] of anteprime) if (p === percorso) return id;
  const id = randomBytes(8).toString('hex');
  anteprime.set(id, percorso);
  return id;
}

async function esiste(percorso) {
  try {
    return (await stat(percorso)).isFile() && eAudio(percorso);
  } catch {
    return false;
  }
}

// file: [{ relativo, assoluto }] come li scrive Ableton. Il relativo parte dalla cartella del progetto;
// se non c'è si prova il percorso assoluto di quando è stato salvato. { chiave, percorso | null, id }.
export async function risolviFile(cartellaProgetto, file) {
  const risultati = [];
  for (const f of file) {
    const chiave = f.relativo || f.assoluto;
    const candidati = [f.relativo && path.resolve(cartellaProgetto, f.relativo), f.assoluto && path.resolve(f.assoluto)].filter(Boolean);
    let trovato = null;
    for (const c of candidati) if (!trovato && (await esiste(c))) trovato = c;
    risultati.push({ chiave, percorso: trovato, id: trovato ? registra(trovato) : null });
  }
  return risultati;
}

// Un file scelto a mano: si può sentire in cuffia e importare.
export async function fileScelto(percorso) {
  if (!(await esiste(percorso))) return { errore: 'non è un file audio (wav, aif, mp3, flac, ogg, m4a)' };
  return { percorso, id: registra(percorso) };
}

// La durata in secondi di un WAV, dall'intestazione. Altri formati: null (CUTX non ne legge la durata).
export async function durataWav(percorso) {
  if (path.extname(percorso).toLowerCase() !== '.wav') return null;
  const f = await open(percorso, 'r');
  try {
    const testa = Buffer.alloc(12);
    await f.read(testa, 0, 12, 0);
    if (testa.toString('ascii', 0, 4) !== 'RIFF' || testa.toString('ascii', 8, 12) !== 'WAVE') return null;
    let pos = 12;
    let byteAlSecondo = 0;
    for (let i = 0; i < 64; i++) {
      const c = Buffer.alloc(8);
      const { bytesRead } = await f.read(c, 0, 8, pos);
      if (bytesRead < 8) return null;
      const id = c.toString('ascii', 0, 4);
      const dimensione = c.readUInt32LE(4);
      if (id === 'fmt ') {
        const fmt = Buffer.alloc(16);
        await f.read(fmt, 0, 16, pos + 8);
        byteAlSecondo = fmt.readUInt32LE(8);
      } else if (id === 'data') {
        return byteAlSecondo ? dimensione / byteAlSecondo : null;
      }
      pos += 8 + dimensione + (dimensione % 2);
    }
    return null;
  } finally {
    await f.close();
  }
}

// --- importare: i suoni di un progetto vanno nello stash, una cartella per file ---


// Formati che Chromium sa decodificare (AIFF e M4A no: vanno esportati in WAV).
const LEGGIBILI = new Set(['.wav', '.mp3', '.flac', '.ogg']);

// suoni: [{ nome, percorso | null }] → suoni/<nome>/<file originale>. Si copiano solo file che abbiamo trovato noi
// (o che Valerio ha scelto a mano): da qui non si copia niente di altro. Mai una cancellazione.
export async function copiaSuoni(radiceStash, suoni) {
  const consentiti = new Set(anteprime.values());
  const copiati = [];
  const mancanti = [];
  const nonSupportati = [];
  for (const { nome, percorso } of suoni) {
    if (!/^[a-z0-9_]{1,64}$/.test(nome)) throw new Error(`nome di suono non valido: ${nome}`);
    if (!percorso || !consentiti.has(percorso)) {
      mancanti.push(nome);
      continue;
    }
    if (!LEGGIBILI.has(path.extname(percorso).toLowerCase())) {
      nonSupportati.push(nome);
      continue;
    }
    const cartella = path.join(radiceStash, 'suoni', nome);
    await mkdir(cartella, { recursive: true });
    await copyFile(percorso, path.join(cartella, path.basename(percorso)));
    copiati.push(nome);
  }
  return { copiati, mancanti, nonSupportati };
}
