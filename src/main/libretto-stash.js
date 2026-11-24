// Lo stash pulito del libretto (--libretto): uno stash nuovo a ogni giro, con un PROJ, pochi suoni con nomi veri e niente dei miei file.
// Si crea prima che l'app parta (main.js), dentro la cartella dati separata CUTX-libretto.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const SUONI = ['kick', 'snare', 'clap', 'hats', 'rim', 'perc', 'riser', 'impact', 'noise', 'vox'];

// un WAV mono da 50 ms di silenzio quasi totale: basta a farlo comparire come suono dello stash
function wavSilenzioso() {
  const campioni = 2205;
  const dati = Buffer.alloc(campioni * 2);
  const testa = Buffer.alloc(44);
  testa.write('RIFF', 0);
  testa.writeUInt32LE(36 + dati.length, 4);
  testa.write('WAVEfmt ', 8);
  testa.writeUInt32LE(16, 16);
  testa.writeUInt16LE(1, 20);
  testa.writeUInt16LE(1, 22);
  testa.writeUInt32LE(44100, 24);
  testa.writeUInt32LE(88200, 28);
  testa.writeUInt16LE(2, 32);
  testa.writeUInt16LE(16, 34);
  testa.write('data', 36);
  testa.writeUInt32LE(dati.length, 40);
  return Buffer.concat([testa, dati]);
}

// dati = la cartella dati del libretto (CUTX-libretto): si rifà da zero, così il giro è sempre uguale. Ritorna il percorso dello stash.
export function preparaStashLibretto(dati) {
  if (path.basename(dati) !== 'CUTX-libretto') throw new Error(`cartella dati inattesa: ${dati}`);
  rmSync(dati, { recursive: true, force: true });
  const base = path.join(dati, 'stash-libretto');
  for (const c of ['suoni', 'video', 'estensioni', path.join('PROJ', 'PROJ 01', 'libreria')]) mkdirSync(path.join(base, c), { recursive: true });
  for (const nome of SUONI) {
    mkdirSync(path.join(base, 'suoni', nome), { recursive: true });
    writeFileSync(path.join(base, 'suoni', nome, `${nome}.wav`), wavSilenzioso());
  }
  const creato = new Date().toISOString();
  writeFileSync(path.join(base, 'PROJ', 'PROJ 01', 'proj.json'), JSON.stringify({ numero: 1, sottotitolo: 'prima serata al circolo', creato, vieneDa: null }, null, 2) + '\n');
  writeFileSync(path.join(base, 'stash.json'), JSON.stringify({ nome: 'serata', formato: 1, uscite: {}, offsetCuffiaMs: 0, proj: { ultimo: 1 } }, null, 2) + '\n');
  writeFileSync(path.join(dati, 'impostazioni.json'), JSON.stringify({ stash: base }));
  return base;
}
