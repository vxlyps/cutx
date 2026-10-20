// Ableton nel processo principale: legge i progetti (in un worker, uno alla volta, con una piccola memoria)
// e passa all'interfaccia solo quello che serve. Non scrive mai niente in un progetto.
import { Worker } from 'node:worker_threads';
import { stat, open, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
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
    const dimensione = trovato ? (await stat(trovato)).size : null;
    risultati.push({ chiave, percorso: trovato, id: trovato ? registra(trovato) : null, dimensione, wav: !!trovato && path.extname(trovato).toLowerCase() === '.wav' });
  }
  return risultati;
}

// Un file scelto a mano: si può sentire in cuffia e importare.
export async function fileScelto(percorso) {
  if (!(await esiste(percorso))) return { errore: 'non è un file audio (wav, aif, mp3, flac, ogg, m4a)' };
  return { percorso, id: registra(percorso), dimensione: (await stat(percorso)).size, wav: path.extname(percorso).toLowerCase() === '.wav' };
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

// Le parti di un WAV che servono per ritagliarlo: il blocco `fmt `, dove stanno i dati e come sono fatti.
async function interpretaWav(percorso) {
  const f = await open(percorso, 'r');
  try {
    const testa = Buffer.alloc(12);
    await f.read(testa, 0, 12, 0);
    if (testa.toString('ascii', 0, 4) !== 'RIFF' || testa.toString('ascii', 8, 12) !== 'WAVE') return null;
    let pos = 12;
    let fmt = null;
    for (let i = 0; i < 64; i++) {
      const c = Buffer.alloc(8);
      const { bytesRead } = await f.read(c, 0, 8, pos);
      if (bytesRead < 8) return null;
      const id = c.toString('ascii', 0, 4);
      const dimensione = c.readUInt32LE(4);
      if (id === 'fmt ') {
        const dati = Buffer.alloc(dimensione);
        await f.read(dati, 0, dimensione, pos + 8);
        fmt = { byte: dati, byteAlSecondo: dati.readUInt32LE(8), blocco: dati.readUInt16LE(12) };
      } else if (id === 'data') {
        if (!fmt || !fmt.blocco || !fmt.byteAlSecondo) return null;
        // un file ancora in scrittura (o troncato) ha una dimensione dei dati più grande di quella vera
        const vera = (await f.stat()).size - (pos + 8);
        return { ...fmt, inizioDati: pos + 8, dimensioneDati: Math.min(dimensione, vera) };
      }
      pos += 8 + dimensione + (dimensione % 2);
    }
    return null;
  } finally {
    await f.close();
  }
}

// Scrive in `destinazione` solo i secondi da..a di un WAV, come un WAV vero (senza decodificare: si tagliano i byte).
// Ritorna la durata scritta in secondi.
export async function ritagliaWav(percorso, destinazione, da, a) {
  const w = await interpretaWav(percorso);
  if (!w) throw new Error('WAV non leggibile');
  const frame = w.byteAlSecondo / w.blocco; // campioni al secondo
  const inizio = Math.min(w.dimensioneDati, Math.max(0, Math.floor(da * frame)) * w.blocco);
  const fine = Math.min(w.dimensioneDati, Math.max(0, Math.ceil(a * frame)) * w.blocco);
  const dimensione = Math.max(0, fine - inizio);
  const fmtPad = w.byte.length % 2;
  const testa = Buffer.alloc(12 + 8 + w.byte.length + fmtPad + 8);
  testa.write('RIFF', 0);
  testa.writeUInt32LE(testa.length - 8 + dimensione + (dimensione % 2), 4);
  testa.write('WAVE', 8);
  testa.write('fmt ', 12);
  testa.writeUInt32LE(w.byte.length, 16);
  w.byte.copy(testa, 20);
  testa.write('data', 20 + w.byte.length + fmtPad);
  testa.writeUInt32LE(dimensione, 24 + w.byte.length + fmtPad);
  const fuori = createWriteStream(destinazione);
  fuori.write(testa);
  if (dimensione > 0) await pipeline(createReadStream(percorso, { start: w.inizioDati + inizio, end: w.inizioDati + fine - 1 }), fuori, { end: false });
  if (dimensione % 2) fuori.write(Buffer.alloc(1));
  await new Promise((ok, no) => fuori.end((e) => (e ? no(e) : ok())));
  return dimensione / w.byteAlSecondo;
}

// suoni: [{ nome, percorso | null, ritaglio?: { da, a } }] → suoni/<nome>/<file originale>. Si copiano solo file che abbiamo trovato noi
// (o che Valerio ha scelto a mano): da qui non si copia niente di altro. Mai una cancellazione.
export async function copiaSuoni(radiceStash, suoni) {
  const consentiti = new Set(anteprime.values());
  const copiati = [];
  const mancanti = [];
  const nonSupportati = [];
  const ritagliati = [];
  for (const { nome, percorso, ritaglio } of suoni) {
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
    const destinazione = path.join(cartella, path.basename(percorso));
    if (ritaglio && path.extname(percorso).toLowerCase() === '.wav') {
      // un file lungo di cui si usa una parte: si copia solo quella (con il margine deciso dal convertitore)
      const prima = (await stat(percorso)).size;
      await ritagliaWav(percorso, destinazione, ritaglio.da, ritaglio.a);
      ritagliati.push({ nome, prima, dopo: (await stat(destinazione)).size });
    } else await copyFile(percorso, destinazione);
    copiati.push(nome);
  }
  return { copiati, mancanti, nonSupportati, ritagliati };
}
