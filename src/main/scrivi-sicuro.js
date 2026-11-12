// Salvare senza rischiare un file a metà: si scrive un file provvisorio accanto e poi lo si rinomina sopra quello vero
// (rinominare è un passo solo: o c'è il vecchio intero, o c'è il nuovo intero). Se l'app muore a metà, il file di prima resta com'era.
// Le scritture sullo stesso file vanno una dopo l'altra, così vince sempre l'ultima chiesta.
import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises';

const code = new Map(); // file → l'ultima scrittura in corso
let numero = 0;

async function scrivi(file, testo) {
  const provvisorio = `${file}.${process.pid}.${numero++}.tmp`;
  try {
    await writeFile(provvisorio, testo);
    await rename(provvisorio, file);
  } catch (e) {
    await rm(provvisorio, { force: true }).catch(() => {});
    throw e;
  }
}

export function scriviSicuro(file, testo) {
  const lavoro = (code.get(file) ?? Promise.resolve()).catch(() => {}).then(() => scrivi(file, testo));
  code.set(file, lavoro);
  lavoro.catch(() => {}).then(() => code.get(file) === lavoro && code.delete(file));
  return lavoro;
}

// Legge un file JSON e dice com'è andata: { dati } se si legge, { manca: true } se non c'è, { illeggibile: true } se c'è ma è rovinato.
export function interpretaJson(leggi) {
  let testo;
  try {
    testo = leggi();
  } catch (e) {
    return e?.code === 'ENOENT' ? { manca: true } : { illeggibile: true };
  }
  try {
    const dati = JSON.parse(testo);
    return dati && typeof dati === 'object' && !Array.isArray(dati) ? { dati } : { illeggibile: true };
  } catch {
    return { illeggibile: true };
  }
}

// Lo stesso, senza fermare il processo mentre il disco risponde (lo stash sta su un disco esterno).
export async function leggiJson(file) {
  let testo;
  try {
    testo = await readFile(file, 'utf8');
  } catch (e) {
    return e?.code === 'ENOENT' ? { manca: true } : { illeggibile: true };
  }
  return interpretaJson(() => testo);
}

// Prima di scrivere sopra un file rovinato se ne tiene una copia accanto (file.illeggibile): quello che c'era non si butta mai.
export const mettiDaParte = (file) => copyFile(file, `${file}.illeggibile`).then(() => true, () => false);
