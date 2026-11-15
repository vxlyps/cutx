// I PROJ: progetti numerati dentro lo stash (PROJ/PROJ 01, PROJ 02…), ognuno con libreria, set e kit. Suoni, colpi e stash.json restano comuni.
// Funzioni pure sul disco (niente electron): le prova test/proj.test.js su stash finti.
import { existsSync, statSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

const nomeCartella = (numero) => {
  validaNumero(numero);
  return `PROJ ${String(numero).padStart(2, '0')}`;
};

function validaNumero(numero) {
  if (!Number.isInteger(numero) || numero < 1) throw new Error('PROJ non valido');
}

export { nomeCartella };

export function cartella(radice, numero) {
  const percorso = path.join(radice, 'PROJ', nomeCartella(numero));
  try {
    return statSync(percorso).isDirectory() ? percorso : null;
  } catch {
    return null;
  }
}

async function leggiDati(cartella, numero) {
  try {
    const dati = JSON.parse(await readFile(path.join(cartella, 'proj.json'), 'utf8'));
    return {
      ...dati,
      numero,
      sottotitolo: typeof dati.sottotitolo === 'string' ? dati.sottotitolo : '',
      creato: dati.creato ?? null,
      vieneDa: dati.vieneDa ?? null,
    };
  } catch {
    return { numero, sottotitolo: '', creato: null, vieneDa: null };
  }
}

async function fileVisibili(cartella) {
  try {
    return (await readdir(cartella, { withFileTypes: true }))
      .filter((voce) => voce.isFile() && !voce.name.startsWith('.') && voce.name.endsWith('.cutx'))
      .map((voce) => path.join(cartella, voce.name));
  } catch {
    return [];
  }
}

export async function elenca(radice) {
  let voci;
  try {
    voci = await readdir(path.join(radice, 'PROJ'), { withFileTypes: true });
  } catch {
    return [];
  }
  const progetti = [];
  for (const voce of voci) {
    const trovato = /^PROJ (\d+)$/.exec(voce.name);
    if (!voce.isDirectory() || voce.name.startsWith('.') || !trovato) continue;
    const numero = Number(trovato[1]);
    const base = path.join(radice, 'PROJ', voce.name);
    const dati = await leggiDati(base, numero);
    const brani = await fileVisibili(path.join(base, 'libreria'));
    const daControllare = [path.join(base, 'proj.json'), path.join(base, 'set.cutx'), path.join(base, 'kit.cutx'), ...brani];
    let modificato = null;
    for (const file of daControllare) {
      try {
        const mtime = (await stat(file)).mtimeMs;
        if (modificato === null || mtime > modificato) modificato = mtime;
      } catch {}
    }
    progetti.push({ numero, cartella: base, sottotitolo: dati.sottotitolo, creato: dati.creato, vieneDa: dati.vieneDa, modificato, brani: brani.length });
  }
  return progetti.sort((a, b) => a.numero - b.numero);
}

async function pulisciAvanzi(base) {
  try {
    for (const voce of await readdir(base, { withFileTypes: true })) {
      if (voce.isDirectory() && voce.name.startsWith('.tmp-')) await rm(path.join(base, voce.name), { recursive: true, force: true });
    }
  } catch {}
}

async function copiaAlbero(sorgente, destinazione) {
  await mkdir(destinazione, { recursive: true });
  let voci;
  try {
    voci = await readdir(sorgente, { withFileTypes: true });
  } catch {
    return;
  }
  for (const voce of voci) {
    if (voce.name.startsWith('.')) continue;
    const da = path.join(sorgente, voce.name);
    const a = path.join(destinazione, voce.name);
    if (voce.isDirectory()) await copiaAlbero(da, a);
    else if (voce.isFile()) {
      const info = await stat(da);
      await copyFile(da, a);
      await utimes(a, info.atime, info.mtime);
    }
  }
}

async function creaTemporanea(radice) {
  const base = path.join(radice, 'PROJ');
  await mkdir(base, { recursive: true });
  const temporanea = path.join(base, `.tmp-${Math.random().toString(36).slice(2)}`);
  await mkdir(temporanea);
  return temporanea;
}

export async function migra(radice) {
  const base = path.join(radice, 'PROJ');
  await pulisciAvanzi(base);
  if ((await elenca(radice)).length) return { fatto: false };
  const libreria = path.join(radice, 'libreria');
  const brani = await fileVisibili(libreria);
  const set = path.join(radice, 'set.cutx');
  const kit = path.join(radice, 'kit.cutx');
  const haSet = existsSync(set);
  const haKit = existsSync(kit);
  if (!brani.length && !haSet && !haKit) return { fatto: false, vuoto: true };

  const temporanea = await creaTemporanea(radice);
  try {
    await copiaAlbero(libreria, path.join(temporanea, 'libreria'));
    for (const file of [set, kit]) {
      try {
        const info = await stat(file);
        await copyFile(file, path.join(temporanea, path.basename(file)));
        await utimes(path.join(temporanea, path.basename(file)), info.atime, info.mtime);
      } catch (errore) {
        if (errore.code !== 'ENOENT') throw errore;
      }
    }
    const creato = new Date().toISOString();
    await writeFile(path.join(temporanea, 'proj.json'), JSON.stringify({ numero: 1, sottotitolo: '', creato, vieneDa: null, migrato: true }, null, 2) + '\n');
    await rename(temporanea, path.join(base, nomeCartella(1)));
  } catch (errore) {
    await rm(temporanea, { recursive: true, force: true });
    throw errore;
  }
  return { fatto: true, numero: 1 };
}

export function pulisciSottotitolo(s) {
  return String(s ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 60);
}

async function scriviJson(percorso, dati) {
  await writeFile(percorso, JSON.stringify(dati, null, 2) + '\n');
}

export async function crea(radice, { sottotitolo = '', kitDa = null } = {}) {
  const progetti = await elenca(radice);
  const numero = (progetti.at(-1)?.numero ?? 0) + 1;
  const sorgente = Number.isInteger(kitDa) && kitDa >= 1 ? cartella(radice, kitDa) : null;
  const vieneDa = sorgente ? kitDa : null;
  const temporanea = await creaTemporanea(radice);
  try {
    await mkdir(path.join(temporanea, 'libreria'));
    if (sorgente) {
      try {
        const info = await stat(path.join(sorgente, 'kit.cutx'));
        await copyFile(path.join(sorgente, 'kit.cutx'), path.join(temporanea, 'kit.cutx'));
        await utimes(path.join(temporanea, 'kit.cutx'), info.atime, info.mtime);
      } catch (errore) {
        if (errore.code !== 'ENOENT') throw errore;
      }
    }
    const dati = { numero, sottotitolo: pulisciSottotitolo(sottotitolo), creato: new Date().toISOString(), vieneDa };
    await scriviJson(path.join(temporanea, 'proj.json'), dati);
    await rename(temporanea, path.join(radice, 'PROJ', nomeCartella(numero)));
  } catch (errore) {
    await rm(temporanea, { recursive: true, force: true });
    throw errore;
  }
  return (await elenca(radice)).find((p) => p.numero === numero);
}

export async function rinomina(radice, numero, sottotitolo) {
  const base = cartella(radice, numero);
  if (!base) throw new Error('PROJ non trovato');
  let dati = await leggiDati(base, numero);
  try {
    const esistenti = JSON.parse(await readFile(path.join(base, 'proj.json'), 'utf8'));
    dati = { ...esistenti, numero };
  } catch {}
  dati.sottotitolo = pulisciSottotitolo(sottotitolo);
  await scriviJson(path.join(base, 'proj.json'), dati);
  return (await elenca(radice)).find((p) => p.numero === numero);
}

export function rigaVieneDa(numero, nome) {
  return `// viene da ${nomeCartella(numero)} · ${nome}`;
}

export function conVieneDa(testo, numero, nome) {
  const riga = rigaVieneDa(numero, nome);
  const righe = String(testo).split('\n');
  if (righe.some((voce) => voce.replace(/\r$/, '') === riga)) return String(testo);
  let testa = 0;
  while (testa < righe.length && /^\/\/ @/.test(righe[testa])) testa++;
  righe.splice(testa, 0, riga);
  return righe.join('\n');
}

export async function copiaBrano(radice, da, a, file) {
  if (typeof file !== 'string' || path.basename(file) !== file || !file.endsWith('.cutx')) throw new Error('nome non valido');
  if (da === a) throw new Error('stesso PROJ');
  const origine = cartella(radice, da);
  const destinazione = cartella(radice, a);
  if (!origine || !destinazione) throw new Error('PROJ non trovato');
  const testo = await readFile(path.join(origine, 'libreria', file), 'utf8');
  const nome = /^\/\/ @brano\s+(.+)$/m.exec(testo)?.[1]?.trim() || path.basename(file, '.cutx');
  const cartellaDest = path.join(destinazione, 'libreria');
  await mkdir(cartellaDest, { recursive: true });
  const base = path.basename(file, '.cutx');
  let numero = 1;
  while (true) {
    const scelto = `${base}${numero === 1 ? '' : `-${numero}`}.cutx`;
    try {
      await writeFile(path.join(cartellaDest, scelto), conVieneDa(testo, da, nome), { flag: 'wx' });
      return { file: scelto };
    } catch (errore) {
      if (errore.code !== 'EEXIST') throw errore;
      numero++;
    }
  }
}
