// Lo stash: cartella del set (di solito su SSD esterno). CUTX ricorda l'ultimo usato.
import { app } from 'electron';
import path from 'node:path';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import * as brano from '../renderer/brano.js';

export const FORMATO = 1;
const CARTELLE = ['suoni', 'libreria', 'video', 'estensioni'];
const AUDIO = new Set(['wav', 'mp3', 'ogg', 'flac']);

let percorso = null;

const fileImpostazioni = () => path.join(app.getPath('userData'), 'impostazioni.json');
const fileConfig = () => path.join(percorso, 'stash.json');

export const radice = () => (percorso && existsSync(percorso) ? percorso : null);

export function carica() {
  try {
    const impostazioni = JSON.parse(readFileSync(fileImpostazioni(), 'utf8'));
    percorso = impostazioni.stash ?? impostazioni.valigetta ?? null;
  } catch {
    percorso = null;
  }
}

export async function imposta(nuovo) {
  percorso = nuovo;
  await prepara();
  await writeFile(fileImpostazioni(), JSON.stringify({ stash: nuovo }, null, 2));
}

// Una cartella qualsiasi diventa uno stash: crea quello che manca, non tocca il resto.
async function prepara() {
  const vecchio = path.join(percorso, 'daneel.json'); // stash di quando si chiamava DANEEL
  if (existsSync(vecchio) && !existsSync(fileConfig())) renameSync(vecchio, fileConfig());
  for (const c of CARTELLE) await mkdir(path.join(percorso, c), { recursive: true });
  if (!existsSync(fileConfig())) {
    await scriviConfig({ nome: path.basename(percorso), formato: FORMATO, uscite: {}, offsetCuffiaMs: 0 });
  }
}

async function leggiConfig() {
  try {
    return JSON.parse(await readFile(fileConfig(), 'utf8'));
  } catch {
    return { nome: path.basename(percorso), formato: FORMATO, uscite: {}, offsetCuffiaMs: 0 };
  }
}

const scriviConfig = (config) => writeFile(fileConfig(), JSON.stringify(config, null, 2) + '\n');

export async function salvaConfig(modifiche) {
  if (!radice()) return null;
  const config = { ...(await leggiConfig()), ...modifiche };
  await scriviConfig(config);
  return config;
}

export async function stato() {
  if (!percorso) return { percorso: null };
  if (!radice()) return { percorso, mancante: true };
  await prepara();
  return { percorso, config: await leggiConfig(), suoni: await mappaSuoni() };
}

// Ogni sottocartella di suoni/ diventa un suono Strudel (come @strudel/sampler).
// I file sciolti in suoni/ diventano un suono col nome del file.
async function mappaSuoni() {
  const base = path.join(percorso, 'suoni');
  const mappa = { _base: 'cutx://app/stash/suoni/' };
  let voci;
  try {
    voci = await readdir(base, { recursive: true, withFileTypes: true });
  } catch {
    return mappa;
  }
  const file = voci
    .filter((v) => v.isFile() && AUDIO.has(path.extname(v.name).slice(1).toLowerCase()))
    .map((v) => path.relative(base, path.join(v.parentPath, v.name)))
    .filter((rel) => !rel.split(path.sep).some((parte) => parte.startsWith('.')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const rel of file) {
    const parti = rel.split(path.sep);
    const nome = nomeSuono(parti.length > 1 ? parti[0] : path.parse(rel).name);
    (mappa[nome] ??= []).push(parti.map(encodeURIComponent).join('/'));
  }
  return mappa;
}

const nomeSuono = (s) => s.toLowerCase().trim().replace(/\s+/g, '_');

// --- libreria: i brani .cutx in libreria/ ---

const ESTENSIONE = '.cutx';

function fileBrano(nome) {
  const radiceLibreria = path.join(percorso, 'libreria');
  const file = path.resolve(radiceLibreria, path.basename(nome));
  return file.startsWith(radiceLibreria + path.sep) && file.endsWith(ESTENSIONE) ? file : null;
}

export async function elencoLibreria() {
  if (!radice()) return [];
  const cartella = path.join(percorso, 'libreria');
  let nomi;
  try {
    nomi = (await readdir(cartella)).filter((n) => n.endsWith(ESTENSIONE) && !n.startsWith('.'));
  } catch {
    return [];
  }
  const brani = [];
  for (const file of nomi) {
    try {
      const b = brano.leggi(await readFile(path.join(cartella, file), 'utf8'));
      const t = brano.testa(b);
      brani.push({ file, nome: t.brano || path.basename(file, ESTENSIONE), bpm: t.bpm, data: t.data, sezioni: b.sezioni.length });
    } catch {
      // un file illeggibile non blocca la libreria
    }
  }
  return brani.sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function leggiBrano(nome) {
  const file = radice() && fileBrano(nome);
  if (!file) throw new Error('brano fuori dalla libreria');
  return readFile(file, 'utf8');
}

// Scrive un brano. Senza sovrascrivi, un file che esiste già non si tocca.
export async function scriviBrano(nome, testo, { sovrascrivi = false } = {}) {
  if (!radice()) throw new Error('nessuno stash');
  const file = fileBrano(nome);
  if (!file) throw new Error('nome non valido');
  if (!sovrascrivi && existsSync(file)) return { esiste: true, file: path.basename(file) };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, testo);
  return { file: path.basename(file) };
}
