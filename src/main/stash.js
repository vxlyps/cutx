// Lo stash: cartella del set (di solito su SSD esterno). CUTX ricorda l'ultimo usato.
import { app } from 'electron';
import path from 'node:path';
import { constants, existsSync, readFileSync, renameSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat, statfs, utimes, writeFile } from 'node:fs/promises';
import * as preferenze from './preferenze.js';
import * as brano from '../renderer/brano.js';
import { COLPI_PREDEFINITI } from '../renderer/colpi.js';
import * as log from './log.js';
import { leggiJson, mettiDaParte, scriviSicuro } from './scrivi-sicuro.js';

export const FORMATO = 1;
const CARTELLE = ['suoni', 'libreria', 'video', 'estensioni'];
const AUDIO = new Set(['wav', 'mp3', 'ogg', 'flac']);

let percorso = null;

const fileImpostazioni = () => path.join(app.getPath('userData'), 'impostazioni.json');
const fileConfig = () => path.join(attivo() ?? percorso, 'stash.json');

// La copia di sicurezza dello stash sul Mac: la cartella vista dall'utente (Documenti) nella CUTX vera; nelle prove e in CUTX dev
// dentro i loro dati, così non si pestano i piedi.
export const cartellaCopia = () =>
  path.basename(app.getPath('userData')) === 'CUTX' ? path.join(app.getPath('documents'), 'CUTX copia stash') : path.join(app.getPath('userData'), 'copia-stash');
const copiaPronta = () => existsSync(path.join(cartellaCopia(), 'stash.json'));

// Lo stash vero se c'è; altrimenti, se lo voglio (preferenza) e la copia esiste, la copia. Si rivaluta a ogni chiamata: quando l'SSD torna si torna da solo.
export function attivo() {
  if (percorso && existsSync(percorso)) return percorso;
  if (percorso && preferenze.leggi().usaCopiaStash !== false && copiaPronta()) return cartellaCopia();
  return null;
}
export const inCopia = () => !!percorso && !existsSync(percorso) && attivo() !== null;
// Il disco c'è? Un controllo leggero (non legge suoni né config), da fare spesso: l'interfaccia si accorge se l'SSD sparisce mentre si suona.
export const presenza = () => ({ mancante: !!percorso && !attivo(), inCopia: inCopia() });

export const radice = () => attivo();

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
  await scriviSicuro(fileImpostazioni(), JSON.stringify({ stash: nuovo }, null, 2));
}

// Una cartella qualsiasi diventa uno stash: crea quello che manca, non tocca il resto.
async function prepara() {
  const base = attivo() ?? percorso;
  const vecchio = path.join(base, 'daneel.json'); // stash di quando si chiamava DANEEL
  if (existsSync(vecchio) && !existsSync(fileConfig())) renameSync(vecchio, fileConfig());
  for (const c of CARTELLE) await mkdir(path.join(base, c), { recursive: true });
  if (!existsSync(fileConfig())) {
    await scriviConfig({ nome: path.basename(percorso), formato: FORMATO, uscite: {}, offsetCuffiaMs: 0 });
  }
}

const configVuota = () => ({ nome: path.basename(percorso), formato: FORMATO, uscite: {}, offsetCuffiaMs: 0 });

async function leggiConfig() {
  return (await leggiJson(fileConfig())).dati ?? configVuota();
}

const scriviConfig = (config) => scriviSicuro(fileConfig(), JSON.stringify(config, null, 2) + '\n');

export async function salvaConfig(modifiche) {
  if (!radice()) return null;
  const letto = await leggiJson(fileConfig());
  // stash.json c'è ma non si legge: prima di scriverci sopra se ne tiene una copia (uscite e offset di prima si recuperano da lì)
  if (letto.illeggibile) {
    const copiato = await mettiDaParte(fileConfig());
    log.scrivi('avviso', 'stash', `stash.json non si legge: riparto dai valori di base${copiato ? ' (quello di prima è in stash.json.illeggibile)' : ''}`);
  }
  const config = { ...(letto.dati ?? configVuota()), ...modifiche };
  await scriviConfig(config);
  return config;
}

export async function stato() {
  if (!percorso) return { percorso: null };
  if (!radice()) return { percorso, mancante: true, copia: copiaPronta() };
  await prepara();
  return { percorso, copiaAttiva: inCopia(), config: await leggiConfig(), suoni: await mappaSuoni() };
}

// Ogni sottocartella di suoni/ diventa un suono Strudel (come @strudel/sampler).
// I file sciolti in suoni/ diventano un suono col nome del file.
async function mappaSuoni() {
  const base = path.join(attivo(), 'suoni');
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
  const radiceLibreria = path.join(attivo(), 'libreria');
  const file = path.resolve(radiceLibreria, path.basename(nome));
  return file.startsWith(radiceLibreria + path.sep) && file.endsWith(ESTENSIONE) ? file : null;
}

export async function elencoLibreria() {
  if (!radice()) return [];
  const cartella = path.join(attivo(), 'libreria');
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

// colpi.cutx, nella radice dello stash: gli otto colpi dei tasti del controller. Se non c'è si crea con quelli predefiniti (poi è mio).
export async function leggiColpi() {
  if (!radice()) return null;
  const file = path.join(attivo(), 'colpi.cutx');
  try {
    return await readFile(file, 'utf8');
  } catch {
    try {
      await writeFile(file, COLPI_PREDEFINITI);
      return COLPI_PREDEFINITI;
    } catch {
      return null; // stash in sola lettura: si usano i predefiniti senza scrivere
    }
  }
}

// set.cutx (la serata: i brani in ordine) e kit.cutx (le clip sempre disponibili), nella radice dello stash. Li scrive Valerio a mano
// o dall'interfaccia: se non ci sono, ritornano null e non si creano da soli.
async function leggiFileStash(nome) {
  if (!radice()) return null;
  try {
    return await readFile(path.join(attivo(), nome), 'utf8');
  } catch {
    return null;
  }
}

export const leggiSet = () => leggiFileStash('set.cutx');
export const leggiKit = () => leggiFileStash('kit.cutx');

async function scriviFileStash(nome, testo) {
  if (!radice()) throw new Error('nessuno stash');
  await scriviSicuro(path.join(attivo(), nome), String(testo));
  return true;
}

export const scriviSet = (testo) => scriviFileStash('set.cutx', testo);
export const scriviKit = (testo) => scriviFileStash('kit.cutx', testo);

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
  await scriviSicuro(file, testo);
  return { file: path.basename(file) };
}

// Solo per le prove: cambia il percorso senza crearlo, per far finta che l'SSD non sia collegato. Ritorna quello di prima.
export function _percorsoPerProva(nuovo) {
  const vecchio = percorso;
  percorso = nuovo;
  return vecchio;
}

// --- la copia di sicurezza: tutto lo stash (libreria, suoni, colpi.cutx, stash.json…) in una cartella sul Mac, per la serata in cui l'SSD non c'è ---

async function elencaFile(base) {
  const voci = await readdir(base, { recursive: true, withFileTypes: true });
  return voci
    .filter((v) => v.isFile() && !v.name.startsWith('.'))
    .map((v) => path.relative(base, path.join(v.parentPath, v.name)))
    .filter((rel) => !rel.split(path.sep).some((parte) => parte.startsWith('.')));
}

// Cosa si sa della copia: dove sta, se c'è, quando è stata fatta.
export async function infoCopia() {
  const cartella = cartellaCopia();
  let quando = null;
  try {
    quando = JSON.parse(await readFile(path.join(cartella, '.copia.json'), 'utf8')).quando;
  } catch {}
  return { cartella, esiste: copiaPronta(), quando, usa: preferenze.leggi().usaCopiaStash !== false, inUso: inCopia() };
}

// Copia lo stash vero nella cartella: solo quello che manca o è cambiato (la seconda volta è veloce), mai cancella niente.
// avanza({ fatti, totale, byte, byteTotali }) a ogni file.
export async function copiaStash(avanza = () => {}) {
  if (!percorso || !existsSync(percorso)) return { errore: 'l\'SSD non c\'è: la copia si fa con lo stash vero collegato' };
  const dest = cartellaCopia();
  if (dest === percorso || dest.startsWith(percorso + path.sep) || percorso.startsWith(dest + path.sep)) return { errore: 'la cartella della copia coincide con lo stash' };
  await prepara();
  const file = await elencaFile(percorso);
  const dafare = [];
  let byteTotali = 0;
  for (const rel of file) {
    const da = path.join(percorso, rel);
    const a = path.join(dest, rel);
    const s = await stat(da);
    let uguale = false;
    try {
      const d = await stat(a);
      uguale = d.size === s.size && d.mtimeMs >= s.mtimeMs - 2000;
    } catch {}
    if (!uguale) {
      dafare.push({ rel, da, a, s });
      byteTotali += s.size;
    }
  }
  await mkdir(dest, { recursive: true });
  try {
    const sp = await statfs(dest);
    if (sp.bavail * sp.bsize < byteTotali + 200 * 1024 * 1024) {
      return { errore: `non c'è spazio sul Mac: servono ${Math.ceil(byteTotali / 1048576)} MB e ne restano ${Math.floor((sp.bavail * sp.bsize) / 1048576)}` };
    }
  } catch {}
  let byte = 0;
  for (const [i, f] of dafare.entries()) {
    await mkdir(path.dirname(f.a), { recursive: true });
    await copyFile(f.da, f.a, constants.COPYFILE_FICLONE);
    await utimes(f.a, f.s.atime, f.s.mtime);
    byte += f.s.size;
    avanza({ fatti: i + 1, totale: dafare.length, byte, byteTotali });
  }
  const quando = Date.now();
  await writeFile(path.join(dest, '.copia.json'), JSON.stringify({ da: percorso, quando }) + '\n');
  return { copiati: dafare.length, uguali: file.length - dafare.length, byte, quando, cartella: dest };
}
