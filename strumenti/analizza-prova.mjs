#!/usr/bin/env node
// analizza-prova · dati il registro della MOVIOLA, il video della prova e la sua trascrizione Whisper, fa la lista dei momenti storti
// (segni, errori, silenzi, ritardi, tentativi ripetuti), con quello che hai detto a voce e 1-2 fotogrammi solo di quei momenti.
// Lista divisa in difetti, inciampi, idee. Il primo SEGNO (il lampo ambra, che è nel video e nel registro) fa da ciak e allinea tutto da solo.
// Niente AI e niente rete: regole semplici in analizza-prova-lib.mjs. Serve ffmpeg; per la voce serve `trascrivi` (o un file .srt già fatto).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SOGLIE, allinea, frazioneAmbra, istantiFotogrammi, leggiRegistro, leggiSrt, motiviDaParlato, parlatoAttorno, raggruppa, rapportoHtml, rapportoMd, trovaLampi, trovaMotivi } from './analizza-prova-lib.mjs';

process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${os.homedir()}/.local/bin:${process.env.PATH}`;

const AIUTO = `uso: analizza-prova REGISTRO [VIDEO] [opzioni]

  REGISTRO   il file .jsonl della MOVIOLA (o «ultimo»: l'ultimo in prove/ della cartella dati)
  VIDEO      il video della prova (con il lampo ambra di SEGNA dentro). Senza video: solo il registro, niente voce né fotogrammi

  --srt FILE        la trascrizione già fatta (se manca, la faccio con \`trascrivi\`)
  --senza-voce      niente trascrizione
  --sposta SECONDI  riserva se il lampo non si trova: il secondo del VIDEO in cui hai premuto il primo SEGNA
  --scansiona MIN   quanti minuti del video guardo per trovare i lampi (5)
  --ritardo MS      da quanto un ingresso è «lento» (4000)
  --fuori CARTELLA  dove scrivo il rapporto (di default: accanto al registro, in analisi-NOME)
  --senza-aprire    non apro il rapporto alla fine
`;

// ---------- argomenti ----------
const argv = process.argv.slice(2);
const pos = [];
const opz = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--aiuto' || a === '-h') {
    console.log(AIUTO);
    process.exit(0);
  } else if (a === '--senza-voce' || a === '--senza-aprire') opz[a.slice(2)] = true;
  else if (['--srt', '--sposta', '--scansiona', '--ritardo', '--fuori'].includes(a)) opz[a.slice(2)] = argv[++i];
  else if (a.startsWith('--')) esci(`opzione sconosciuta: ${a}\n\n${AIUTO}`);
  else pos.push(a);
}
function esci(testo, codice = 2) {
  console.error(testo);
  process.exit(codice);
}
if (pos.length < 1) esci(AIUTO);

// ---------- i file ----------
function ultimoRegistro() {
  const base = path.join(os.homedir(), 'Library', 'Application Support');
  const trovati = [];
  for (const cartella of readdirSync(base).filter((d) => /^CUTX/.test(d))) {
    const prove = path.join(base, cartella, 'prove');
    if (!existsSync(prove)) continue;
    for (const f of readdirSync(prove).filter((x) => x.endsWith('.jsonl'))) trovati.push(path.join(prove, f));
  }
  trovati.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return trovati[0] ?? null;
}
const registro = pos[0] === 'ultimo' ? ultimoRegistro() : path.resolve(pos[0]);
if (!registro || !existsSync(registro)) esci(`non trovo il registro: ${pos[0]}`);
const video = pos[1] ? path.resolve(pos[1]) : null;
if (video && !existsSync(video)) esci(`non trovo il video: ${pos[1]}`);
if (video) for (const programma of ['ffmpeg', 'ffprobe']) if (spawnSync(programma, ['-version']).error) esci(`manca ${programma}: brew install ffmpeg`);

const nome = path.basename(registro, '.jsonl');
const fuori = path.resolve(opz.fuori ?? path.join(path.dirname(registro), `analisi-${nome}`));
mkdirSync(path.join(fuori, 'frames'), { recursive: true });
const log = (t) => console.error(t);

// ---------- il registro ----------
const eventi = leggiRegistro(readFileSync(registro, 'utf8'));
if (!eventi.length) esci('il registro è vuoto');
const segni = eventi.filter((e) => e.fonte === 'app' && e.tipo === 'segno').map((e) => e.t);
log(`registro: ${eventi.length} eventi, ${segni.length} SEGNO`);

// ---------- il ciak: i lampi nel video ----------
const durataVideo = !video ? Infinity : Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }).stdout) || Infinity;
const FPS = 15;
const L = 192;
const A = 108;
async function cercaLampi(minuti) {
  return new Promise((resolve) => {
    const ff = spawn('ffmpeg', ['-v', 'error', '-t', String(minuti * 60), '-i', video, '-an', '-vf', `fps=${FPS},scale=${L}:${A}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const frameByte = L * A * 3;
    const frazioni = [];
    let resto = Buffer.alloc(0);
    ff.stdout.on('data', (d) => {
      resto = Buffer.concat([resto, d]);
      while (resto.length >= frameByte) {
        frazioni.push(frazioneAmbra(resto.subarray(0, frameByte)));
        resto = resto.subarray(frameByte);
      }
    });
    ff.on('close', () => resolve(frazioni));
  });
}
const sposta = opz.sposta !== undefined ? Number(opz.sposta) : null;
if (sposta !== null && !Number.isFinite(sposta)) esci('--sposta vuole un numero di secondi');
let lampi = [];
if (video && sposta === null) {
  log(`cerco i lampi ambra nei primi ${opz.scansiona ?? 5} minuti del video…`);
  lampi = trovaLampi(await cercaLampi(Number(opz.scansiona) || 5), FPS);
  log(`lampi trovati: ${lampi.length}${lampi.length ? ` (${lampi.map((x) => `${x.toFixed(1)} s`).join(', ')})` : ''}`);
}
const al = video ? allinea(segni, lampi, sposta) : { offsetMs: null, come: 'nessun video: solo il registro', avvisi: [] };
const allineato = al.offsetMs !== null;
log(`allineamento: ${al.come}`);
for (const a of al.avvisi) log(`  ⚠ ${a}`);

// ---------- la voce ----------
let voci = [];
let notaVoce = video ? 'non richiesta' : 'senza video: niente voce';
if (video && !opz['senza-voce']) {
  let srt = opz.srt ? path.resolve(opz.srt) : path.join(path.dirname(video), `${path.basename(video, path.extname(video))}.srt`);
  if (!existsSync(srt) && !opz.srt) {
    log('non c\'è la trascrizione: la faccio con `trascrivi` (serve il disco A002)…');
    spawnSync('trascrivi', [video], { stdio: ['ignore', 'inherit', 'inherit'] });
  }
  if (existsSync(srt)) {
    voci = leggiSrt(readFileSync(srt, 'utf8'));
    notaVoce = `${voci.length} frasi da ${path.basename(srt)}`;
  } else notaVoce = 'nessuna trascrizione (il rapporto è solo dal registro)';
  log(`voce: ${notaVoce}`);
}

// ---------- i momenti ----------
const soglie = { ...SOGLIE, ...(opz.ritardo ? { ritardoIngressoMs: Number(opz.ritardo) } : {}) };
const motivi = [...trovaMotivi(eventi, soglie), ...(allineato ? motiviDaParlato(voci, al.offsetMs) : [])];
const momenti = raggruppa(motivi);
log(`momenti: ${momenti.length}`);

function fotogramma(secondo, file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(secondo), '-i', video, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '3', path.join(fuori, file)]);
  return r.status === 0 && existsSync(path.join(fuori, file));
}
momenti.forEach((m, i) => {
  m.videoS = allineato ? Math.max(0, (m.t0 - al.offsetMs) / 1000) : null;
  m.parlato = allineato ? parlatoAttorno(voci, al.offsetMs, m.t0, m.t1) : [];
  m.fotogrammi = [];
  if (!allineato) return;
  istantiFotogrammi(m, al.offsetMs, durataVideo).forEach((s, k) => {
    const file = `frames/${String(i + 1).padStart(3, '0')}-${'ab'[k]}.jpg`;
    if (fotogramma(s, file)) m.fotogrammi.push(file);
  });
});

// ---------- il rapporto ----------
const info = {
  nome,
  registro: path.basename(registro),
  video: video ? path.basename(video) : '(nessuno)',
  allineamento: al.come,
  avvisi: al.avvisi.concat(allineato ? [] : [video ? 'senza allineamento: niente voce e niente fotogrammi, solo il registro' : 'senza video: solo il registro']),
  voce: notaVoce,
};
writeFileSync(path.join(fuori, 'rapporto.md'), rapportoMd({ momenti, info }));
writeFileSync(path.join(fuori, 'rapporto.html'), rapportoHtml({ momenti, info }));
const conta = (c) => momenti.filter((m) => m.categoria === c).length;
console.log(`difetti ${conta('difetti')} · inciampi ${conta('inciampi')} · idee ${conta('idee')}`);
console.log(`rapporto: ${path.join(fuori, 'rapporto.html')}`);
console.log(`          ${path.join(fuori, 'rapporto.md')}`);
if (!opz['senza-aprire']) spawnSync('open', [path.join(fuori, 'rapporto.html')]);
process.exit(allineato || !video ? 0 : 3);
