// I suoni di strudel.cc, in locale. Stessi nomi (bd, sd, amen, piano, .bank("RolandTR909")…), ma i file stanno in una cartella
// del Mac scelta da Valerio, scaricati una volta dal CDN di Strudel. Niente suoni nel repo né nel .dmg.
// Qui: lista dei file, mappe riscritte verso cutx://app/suoni-strudel/, scarico con avanzamento, verifica/riparazione.
import path from 'node:path';
import { readFile, writeFile, mkdir, rename, stat, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const CDN = 'https://strudel.b-cdn.net';
export const VERSIONE = 1;

// Pacchetto base (~215 MB). Ogni fonte: mappa sul CDN (json) o già scritta qui (dirt), e cartella dei file sul CDN.
// vcsl (2,4 GB) e soundfont sono aggiunte a parte, non qui.
export const FONTI = [
  { id: 'tidal-drum-machines', json: 'tidal-drum-machines.json', dir: 'tidal-drum-machines/machines' },
  { id: 'uzu-drumkit', json: 'uzu-drumkit.json', dir: 'uzu-drumkit' },
  { id: 'uzu-wavetables', json: 'uzu-wavetables.json', dir: 'uzu-wavetables' },
  { id: 'mridangam', json: 'mridangam.json', dir: 'mrid' },
  { id: 'piano', json: 'piano.json', dir: 'piano' },
  { id: 'dirt', locale: 'suoni-strudel-dirt.json', dir: 'Dirt-Samples' },
];
export const ALIAS_JSON = 'tidal-drum-machines-alias.json';
export const BASE_LOCALE = 'cutx://app/suoni-strudel';

const codifica = (rel) => rel.split('/').map(encodeURIComponent).join('/');

// Scorre una mappa di Strudel (array di file, oppure oggetti nota → file) e chiama fn su ogni percorso, ricostruendo la forma.
function mappaForma(v, fn) {
  if (typeof v === 'string') return fn(v);
  if (Array.isArray(v)) return v.map((x) => mappaForma(x, fn));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mappaForma(x, fn)]));
  return v;
}

// Pura. Data la mappa di una fonte, ritorna i file da avere (percorso relativo alla cartella dei suoni, uguale al CDN)
// e la mappa riscritta verso cutx://. I percorsi della mappa restano codificati pezzo per pezzo, come nello stash.
export function pianoFonte(mappa, dir) {
  const file = new Set();
  const locale = { _base: `${BASE_LOCALE}/${codifica(dir)}/` };
  for (const [nome, v] of Object.entries(mappa)) {
    if (nome === '_base') continue;
    locale[nome] = mappaForma(v, (rel) => {
      file.add(`${dir}/${rel}`);
      return codifica(rel);
    });
  }
  return { file: [...file], mappa: locale };
}

const urlCdn = (rel) => `${CDN}/${codifica(rel)}`;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function scaricaJson(nome, segnale) {
  const r = await fetch(`${CDN}/${nome}`, { signal: segnale });
  if (!r.ok) throw new Error(`${nome}: ${r.status}`);
  return r.json();
}

async function scaricaFile(cartella, rel, segnale) {
  const dest = path.join(cartella, ...rel.split('/'));
  for (let tentativo = 1; ; tentativo++) {
    try {
      const r = await fetch(urlCdn(rel), { signal: segnale });
      if (!r.ok) throw new Error(`${r.status}`);
      const dati = Buffer.from(await r.arrayBuffer());
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(`${dest}.parte`, dati);
      await rename(`${dest}.parte`, dest);
      return dati.length;
    } catch (e) {
      if (segnale?.aborted || tentativo >= 3) throw new Error(`${rel}: ${e.message}`);
      await pausa(500 * tentativo);
    }
  }
}

const esiste = async (p) => (await stat(p).catch(() => null))?.size > 0;
const FILE_ELENCO = 'elenco.json';

// Scarica (o ripara: salta i file già interi) il pacchetto base in `cartella`. progresso({fatti, totale, errori, fase}).
// Ritorna { ok, totale, errori:[…] }. Si ferma con segnale.abort().
export async function scarica(cartella, progresso = () => {}, segnale) {
  await mkdir(cartella, { recursive: true });
  progresso({ fase: 'liste', fatti: 0, totale: 0, errori: 0 });
  const elenco = new Set();
  await mkdir(path.join(cartella, 'mappe'), { recursive: true });
  for (const f of FONTI) {
    const grezza = f.json ? await scaricaJson(f.json, segnale) : require(`./${f.locale}`);
    const { file, mappa } = pianoFonte(grezza, f.dir);
    file.forEach((x) => elenco.add(x));
    await writeFile(path.join(cartella, 'mappe', `${f.id}.json`), JSON.stringify(mappa));
  }
  await writeFile(path.join(cartella, 'mappe', 'alias.json'), JSON.stringify(await scaricaJson(ALIAS_JSON, segnale)));
  await writeFile(path.join(cartella, 'CREDITI.md'), CREDITI);

  const lista = [...elenco].sort();
  let fatti = 0;
  let errori = 0;
  const falliti = [];
  const dimensioni = {};
  const emetti = () => progresso({ fase: 'file', fatti, totale: lista.length, errori });
  let i = 0;
  const lavora = async () => {
    while (i < lista.length && !segnale?.aborted) {
      const rel = lista[i++];
      try {
        const dest = path.join(cartella, ...rel.split('/'));
        dimensioni[rel] = (await esiste(dest)) ? (await stat(dest)).size : await scaricaFile(cartella, rel, segnale);
      } catch (e) {
        if (segnale?.aborted) return;
        errori++;
        falliti.push(e.message);
      }
      fatti++;
      emetti();
    }
  };
  emetti();
  await Promise.all(Array.from({ length: 8 }, lavora));
  if (segnale?.aborted) return { ok: false, annullato: true, totale: lista.length, errori: falliti };
  // l'elenco completo (con le dimensioni) si scrive solo se è andato tutto bene: è lui che dice «pacchetto intero»
  if (!falliti.length) await writeFile(path.join(cartella, FILE_ELENCO), JSON.stringify({ versione: VERSIONE, file: dimensioni }));
  else await rm(path.join(cartella, FILE_ELENCO), { force: true });
  return { ok: !falliti.length, totale: lista.length, errori: falliti };
}

// Controllo veloce (solo stat): cosa dice la cartella? stato: 'assente' | 'vuota' | 'incompleta' | 'ok'
export async function verifica(cartella) {
  if (!cartella) return { stato: 'assente', mancanti: 0, totale: 0 };
  if (!(await stat(cartella).catch(() => null))) return { stato: 'assente', mancanti: 0, totale: 0 };
  let el;
  try {
    el = JSON.parse(await readFile(path.join(cartella, FILE_ELENCO), 'utf8'));
  } catch {
    return { stato: 'vuota', mancanti: 0, totale: 0 };
  }
  if (el.versione !== VERSIONE) return { stato: 'incompleta', mancanti: 0, totale: 0, vecchia: true };
  const nomi = Object.keys(el.file);
  let mancanti = 0;
  for (const rel of nomi) {
    const s = await stat(path.join(cartella, ...rel.split('/'))).catch(() => null);
    if (!s || s.size !== el.file[rel]) mancanti++;
  }
  return { stato: mancanti ? 'incompleta' : 'ok', mancanti, totale: nomi.length };
}

// Mappe pronte per samples(): una per fonte, già con indirizzi cutx://. null se non ci sono (o il json è rovinato).
export async function leggiMappe(cartella) {
  const fuori = { mappe: [], alias: null };
  for (const f of FONTI) {
    try {
      fuori.mappe.push(JSON.parse(await readFile(path.join(cartella, 'mappe', `${f.id}.json`), 'utf8')));
    } catch {
      /* la verifica avvisa già: qui si salta */
    }
  }
  try {
    fuori.alias = JSON.parse(await readFile(path.join(cartella, 'mappe', 'alias.json'), 'utf8'));
  } catch {
    /* idem */
  }
  return fuori;
}

const CREDITI = `# Suoni di Strudel · crediti e licenze

Scaricati da CUTX dal CDN di Strudel (${CDN}), gli stessi di strudel.cc. Non fanno parte di CUTX e non sono sotto la sua licenza:
ogni raccolta ha la sua. Prima di ridistribuirli (in un pacco pubblico, in un video, …) leggi la licenza di ciascuna.

- **tidal-drum-machines** — raccolta di drum machine per Tidal/SuperDirt. https://github.com/ritchse/tidal-drum-machines (ogni macchina ha le sue condizioni: vedi il repo)
- **uzu-drumkit** — kit elettronico di Mot4i e Switch Angel, più suoni da modulare di Ludens + Switch Angel. https://github.com/tidalcycles/uzu-drumkit (Unlicense)
- **uzu-wavetables** — wavetable per Strudel. https://github.com/tidalcycles/uzu-wavetables
- **mridangam** — © Arthur Carabott 2022, esecutore Harishankar V Menon, Creative Commons Attribution-ShareAlike. https://www.arthurcarabott.com/konnakkol/ · https://github.com/yaxu/mrid
- **piano** — Salamander Grand Piano V3, di Alexander Holm, CC-BY 3.0. https://archive.org/details/SalamanderGrandPianoV3
- **Dirt-Samples** (casio, crow, insect, wind, …) — https://github.com/tidalcycles/Dirt-Samples (licenze diverse per cartella: vedi il repo)

Elenco aggiornato e licenze originali: repo di Strudel, https://codeberg.org/uzu/strudel
`;
