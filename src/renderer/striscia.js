// La striscia viva sotto ogni card live (e, se acceso, sul proiettore): le note vere del ciclo (la forma della melodia, scalata sull'estensione
// di quel livello; le batterie come tacche), una testina che scorre e un misuratore del suono VERO del livello (dopo effetti e guadagno).
// Qui la parte pura (lo provano i test): dagli eventi del pattern alle note da disegnare, e dalle misure al suo stato.
// Un evento è un array compatto: [inizio 0..1, durata 0..1, y, velocità 0..1] dove y è una nota MIDI (≥ 0) o una classe di batteria (−1 grave,
// −2 media, −3 acuta).

export const SOGLIA_SILENZIO_DB = -60; // sotto questo livello (di picco) non c'è suono
export const SOGLIA_FORTE_DB = -1; // sopra questo il livello esagera
export const TENUTA_FORTE_MS = 1500; // l'avviso «troppo» resta un po'

// Il suono di batteria (bd, sd, hh…) → grave, media o acuta.
export function classeBatteria(nome) {
  const s = String(nome ?? '').toLowerCase();
  if (/^(bd|kick|bass|sub|lt|tom|ltom|mt)/.test(s)) return -1;
  if (/^(hh|oh|ch|cy|rd|cr|rim|shaker|perc|hat|ride|crash|cb|tb|ag|cabasa)/.test(s)) return -3;
  return -2; // rullante, clap, il resto
}

// Dagli eventi di un ciclo (hap di Strudel: { whole, value }) agli eventi compatti. `noteMidi(nota)` converte un nome di nota in numero.
export function eventiDaHap(haps, ciclo, noteMidi, massimo = 96) {
  const eventi = [];
  for (const h of haps) {
    if (!h.whole || !h.hasOnset?.()) continue;
    const v = h.value ?? {};
    const inizio = Number(h.whole.begin.valueOf()) - ciclo;
    if (inizio < -1e-6 || inizio >= 1 - 1e-6) continue;
    const durata = Math.min(1 - inizio, Math.max(0, Number(h.whole.end.valueOf()) - Number(h.whole.begin.valueOf())));
    let y;
    const nota = v.note ?? (typeof v.n === 'number' && v.s && /^[a-z]*$/i.test(String(v.s)) && !v.bank ? undefined : undefined);
    if (nota !== undefined) {
      try {
        y = typeof nota === 'number' ? nota : noteMidi(String(nota));
      } catch {
        y = undefined;
      }
    }
    if (y === undefined && typeof v.freq === 'number' && v.freq > 0) y = Math.round(69 + 12 * Math.log2(v.freq / 440));
    if (!Number.isFinite(y)) y = classeBatteria(v.s);
    const forza = Math.max(0, Math.min(1, (Number(v.gain) || 1) * (Number(v.velocity) || 1)));
    eventi.push([Math.round(inizio * 1000) / 1000, Math.round(durata * 1000) / 1000, y, Math.round(forza * 100) / 100]);
    if (eventi.length >= massimo) break;
  }
  return eventi;
}

// L'estensione delle note di un livello (min, max), o null se non ne ha (solo batteria).
export function estensione(eventi) {
  const note = eventi.filter((e) => e[2] >= 0).map((e) => e[2]);
  return note.length ? [Math.min(...note), Math.max(...note)] : null;
}

// Dove disegnare un evento, da 0 (in alto) a 1 (in basso): le note scalate sull'estensione del livello (le più acute in alto); le batterie
// in tre fasce in basso (grave sotto, acuta sopra le altre).
export function posizioneVerticale(evento, est) {
  const y = evento[2];
  if (y < 0) return y === -1 ? 0.88 : y === -2 ? 0.7 : 0.55;
  if (!est || est[1] === est[0]) return 0.4; // una nota sola: a metà
  return 0.12 + (1 - (y - est[0]) / (est[1] - est[0])) * 0.62; // 0.12 (acuta) … 0.74 (grave)
}

export const dbDa = (x) => (x > 1e-6 ? 20 * Math.log10(x) : -120);

// Lo stato del misuratore di un livello, aggiornato a ogni misura. Silenzio = nessun suono per più di un ciclo (e almeno 1,5 s) mentre
// il livello ha note e non è in muto.
export class StatoMisura {
  constructor() {
    this.ultimoSuono = null;
    this.ultimoForte = -Infinity;
    this.db = -120;
    this.liscio = 0; // il livello mostrato (0..1), con una discesa lenta
  }

  // pk: picco (0..1) dall'ultima misura; ora: ms; cicloMs: la durata di un ciclo; haNote: il ciclo ha eventi; muto
  aggiorna({ pk, ora, cicloMs, haNote, muto }) {
    const db = dbDa(pk);
    this.db = db;
    if (this.ultimoSuono === null) this.ultimoSuono = ora;
    if (db > SOGLIA_SILENZIO_DB) this.ultimoSuono = ora;
    if (db > SOGLIA_FORTE_DB) this.ultimoForte = ora;
    const livello = Math.max(0, Math.min(1, (db + 60) / 60)); // da −60 dB (0) a 0 dB (1)
    this.liscio = livello > this.liscio ? livello : Math.max(livello, this.liscio - 0.04);
    let stato = 'suono';
    if (muto) stato = 'muto';
    else if (ora - this.ultimoForte < TENUTA_FORTE_MS) stato = 'troppo';
    else if (haNote && ora - this.ultimoSuono > Math.max(1500, cicloMs)) stato = 'silenzio';
    return { stato, db, livello: stato === 'silenzio' || stato === 'muto' ? 0 : this.liscio };
  }
}

// Il testo del misuratore, sempre su una riga: «−14 dB», «TROPPO −1 dB», «SILENZIO», «MUTO».
export function testoMisura({ stato, db }) {
  const n = Math.round(db);
  const valore = n <= -99 ? '−∞' : String(n).replace('-', '−');
  if (stato === 'silenzio') return 'SILENZIO';
  if (stato === 'muto') return 'MUTO';
  if (stato === 'troppo') return `TROPPO ${valore} dB`;
  return `${valore} dB`;
}
