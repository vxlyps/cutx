// Trova i progetti Ableton (.als) dentro le cartelle scelte. Solo lettura.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

// Cartelle che dentro un progetto non contengono progetti: le copie di sicurezza di Ableton, i campioni.
const IGNORA = new Set(['backup', 'samples', 'ableton project info', 'node_modules']);

async function scendi(cartella, profondita, trovati) {
  let voci;
  try {
    voci = await readdir(cartella, { withFileTypes: true });
  } catch {
    return; // cartella sparita o senza permesso: si salta
  }
  for (const v of voci) {
    if (v.name.startsWith('.')) continue;
    const percorso = path.join(cartella, v.name);
    if (v.isFile() && v.name.toLowerCase().endsWith('.als')) {
      try {
        const s = await stat(percorso);
        trovati.push({ percorso, cartella, nome: v.name.replace(/\.als$/i, ''), modificato: s.mtimeMs, dimensione: s.size });
      } catch {
        // sparito mentre lo guardavo
      }
    } else if (v.isDirectory() && profondita > 0 && !IGNORA.has(v.name.toLowerCase())) {
      await scendi(percorso, profondita - 1, trovati);
    }
  }
}

// I progetti trovati, i più recenti prima. Una cartella scelta può essere un progetto o la cartella che li contiene tutti.
export async function trovaProgetti(cartelle, { profondita = 3 } = {}) {
  const trovati = [];
  for (const c of cartelle) await scendi(c, profondita, trovati);
  const visti = new Set();
  return trovati
    .filter((p) => !visti.has(p.percorso) && visti.add(p.percorso))
    .sort((a, b) => b.modificato - a.modificato || a.nome.localeCompare(b.nome));
}

// Un percorso è leggibile solo se è un .als dentro una delle cartelle scelte.
export function consentito(percorso, cartelle) {
  const p = path.resolve(percorso);
  return p.toLowerCase().endsWith('.als') && cartelle.some((c) => p.startsWith(path.resolve(c) + path.sep));
}
