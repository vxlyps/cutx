// CANALI: lo stato puro del nuovo LIVE. Nessun DOM, nessun motore audio: il NANO, l'X-TOUCH e lo schermo
// leggono questo stato e gli mandano intenzioni; lui risponde con «effetti» (cosa deve fare chi parla col motore). Si prova con
// test/canali.test.js. Il motore sa solo cosa suona; qui si sa cosa è in NEXT, cosa aspetta, cosa è «vecchio».
//
// Parole: CH = un canale (CH1…CH8, definiti nella pagina CANALI) · NEXT = la clip scelta dalla manopolina, pronta · GO/OUT/MUTE = R/S/M ·
// GO ALL = PLAY (entra tutto quello che è in NEXT) · FREE = il CH dei senza tipo e dei «in più» · SWEEP = la manopola ACQUA/ARIA.

import { TIPI } from './categorie.js';
export { TIPI }; // lista fissa, fonte in categorie.js; i nomi dei CH sono liberi
export const ENTRA_TRA = [1, 2, 4, 8]; // battute (cicli)
export const N_CH = 8;
export const ISTERESI = 0.03; // ai bordi delle zone della manopolina
export const ZONA_MORTA = 0.04; // al centro di SWEEP

// --- la pagina CANALI (le 8 definizioni) ---

export const canaliPredefiniti = () => [
  { nome: 'DRUM', colore: '#e8e8e8', tipi: ['drum'], free: false }, // qui entra anche la @beat con le sue scene
  { nome: 'MELODIA', colore: '#e0b23c', tipi: ['keys', 'arp'], free: false },
  { nome: 'BASSO', colore: '#d9582b', tipi: ['bass'], free: false },
  { nome: 'LEAD', colore: '#3cc0e0', tipi: ['lead'], free: false },
  { nome: 'PAD', colore: '#8a6fe0', tipi: ['pad'], free: false },
  { nome: 'PERC', colore: '#e06fae', tipi: ['perc'], free: false },
  { nome: 'FX', colore: '#6fe0a8', tipi: ['fx'], free: false },
  { nome: 'FREE', colore: '#9bd02a', tipi: [], free: true }, // i senza tipo, e qualsiasi clip del brano
];

// Gli errori della pagina CANALI, in italiano; lista vuota = va bene. Otto CH, una sola FREE, ogni tipo in un CH solo.
export function validaCanali(config) {
  const errori = [];
  if (!Array.isArray(config) || config.length !== N_CH) return [`servono ${N_CH} CH`];
  const visti = new Map();
  config.forEach((c, i) => {
    if (!String(c?.nome ?? '').trim()) errori.push(`il CH${i + 1} non ha un nome`);
    for (const t of c?.tipi ?? []) {
      if (!TIPI.includes(t)) errori.push(`«${t}» non è un tipo`);
      else if (visti.has(t)) errori.push(`il tipo ${t} è in due CH (CH${visti.get(t) + 1} e CH${i + 1})`);
      else visti.set(t, i);
    }
  });
  const nFree = config.filter((c) => c?.free).length;
  if (nFree !== 1) errori.push(nFree ? 'la FREE deve essere una sola' : 'manca la FREE');
  return errori;
}

export const indiceFree = (config) => Math.max(0, config.findIndex((c) => c.free));

// La ch di un tipo ('' = senza tipo → FREE). Un tipo che nessuna ch prende va in FREE.
export function chDelTipo(config, tipo) {
  const i = tipo ? config.findIndex((c) => c.tipi.includes(tipo)) : -1;
  return i >= 0 ? i : indiceFree(config);
}

// La @beat e le sue scene vanno nella ch del tipo drum.
export const chDellaBeat = (config) => chDelTipo(config, 'drum');

export const tipoDellaClip = (info) => TIPI.find((t) => info?.[t] === true) ?? '';

// --- le alternative (cosa può entrare in una ch) ---

// brano = { nome, bpm, beat: { scene: [{ nome }] } | null, sezioni: [{ nome, info }] }. NELL'ORDINE DEL FILE, mai per tipo.
// DRUM: prima le scene della @beat, poi le sue clip. FREE: tutte le clip del brano (le scene no). Le altre: le clip dei suoi tipi.
export function alternative(config, brano, ch) {
  if (!brano) return [];
  const di = (extra) => ({ brano: brano.nome, bpm: brano.bpm ?? null, ...extra });
  const out = [];
  if (ch === chDellaBeat(config)) (brano.beat?.scene ?? []).forEach((s, k) => out.push(di({ id: `${brano.nome}#scena${k}`, tipo: 'scena', indice: k, nome: s.nome, tipoClip: 'drum' })));
  (brano.sezioni ?? []).forEach((s, k) => {
    const tc = tipoDellaClip(s.info);
    if (chDelTipo(config, tc) === ch || config[ch]?.free) out.push(di({ id: `${brano.nome}#clip${k}`, tipo: 'clip', indice: k, nome: s.nome, tipoClip: tc }));
  });
  return out;
}

// --- la manopolina SCELTA ---

// pos 0…1, n alternative → zona 0…n-1. Con la zona di prima si resta in quella finché non si esce di più di ISTERESI dal suo bordo.
export function zona(pos, n, prima = null, isteresi = ISTERESI) {
  if (!(n > 0)) return null;
  const p = Math.min(1, Math.max(0, pos));
  if (prima !== null && prima >= 0 && prima < n && p >= prima / n - isteresi && p <= (prima + 1) / n + isteresi) return prima;
  return Math.min(n - 1, Math.floor(p * n));
}

// --- il fisico: fader e SWEEP ---

// Curva da mixer: in cima 1 (il volume del codice, mai sopra), a metà −15 dB, in fondo silenzio.
export function gainFader(v) {
  if (v === null || v === undefined) return 1; // «non letto»: vale il codice
  const x = Math.min(1, Math.max(0, v));
  if (x <= 0.02) return 0;
  return 10 ** ((30 * (x - 1)) / 20) * Math.min(1, (x - 0.02) / 0.08);
}

// Centro neutro (zona morta ±4%); a sinistra ACQUA = passa-basso da 20 kHz a ~200 Hz; a destra ARIA = passa-alto da 20 Hz a ~5 kHz. Scala logaritmica.
export function sweep(pos) {
  if (pos === null || pos === undefined) return { tipo: 'neutro' };
  const p = Math.min(1, Math.max(0, pos));
  if (Math.abs(p - 0.5) <= ZONA_MORTA + 1e-9) return { tipo: 'neutro' };
  if (p < 0.5) return { tipo: 'acqua', lp: 20000 * (200 / 20000) ** ((0.5 - ZONA_MORTA - p) / (0.5 - ZONA_MORTA)) };
  return { tipo: 'aria', hp: 20 * (5000 / 20) ** ((p - 0.5 - ZONA_MORTA) / (0.5 - ZONA_MORTA)) };
}

// --- lo stato ---

const vuota = () => ({ suona: null, pos: null, zona: null, fader: null, aa: null, mute: false, attesa: null });

export class StatoCanali {
  constructor(config = canaliPredefiniti()) {
    this.config = config;
    this.brano = null; // il brano nel CUE
    this.canali = Array.from({ length: N_CH }, vuota);
    this.entraTra = 1;
    this.bpm = null; // il tempo del set: lo porta la ch DRUM
  }

  // I CANALI si cambiano a live fermo (lo garantisce chi chiama); cambiato, NEXT e attese si azzerano.
  impostaCANALI(config) {
    this.config = config;
    for (const c of this.canali) Object.assign(c, { suona: null, zona: null, attesa: null });
  }

  // Un brano nuovo nel CUE: la stessa posizione di ogni manopolina sceglie tra le alternative del brano nuovo.
  impostaBrano(brano) {
    this.brano = brano;
    for (const c of this.canali) c.zona = null;
  }

  alternative(i) {
    return alternative(this.config, this.brano, i);
  }

  // Cosa c'è in NEXT: la zona della manopolina (mai mossa = la prima), o niente se il brano non ha nulla per questo CH.
  next(i) {
    const alt = this.alternative(i);
    const c = this.canali[i];
    if (!alt.length) return null;
    c.zona = c.pos === null ? 0 : zona(c.pos, alt.length, c.zona);
    return alt[c.zona] ?? null;
  }

  scegli(i, pos) {
    this.canali[i].pos = pos;
    return this.next(i);
  }

  // --- entra / esce ---

  // GO (R): la clip in NEXT entra al prossimo «entra tra». Ripremuto mentre aspetta: annulla.
  go(i, { annullando = true } = {}) {
    const c = this.canali[i];
    if (c.attesa?.tipo === 'go') {
      if (!annullando) return [];
      c.attesa = null;
      return [{ tipo: 'annulla', ch: i }];
    }
    const alt = this.next(i);
    if (!alt) return [{ tipo: 'avviso', ch: i, testo: `niente in NEXT per ${this.config[i].nome}` }];
    if (c.suona?.id === alt.id) return []; // è già quella che suona
    const effetti = c.attesa ? [{ tipo: 'annulla', ch: i }] : []; // vince l'ultimo premuto
    c.attesa = { tipo: 'go', alt };
    const bpm = i === chDellaBeat(this.config) && alt.bpm && alt.bpm !== this.bpm ? alt.bpm : undefined;
    effetti.push({ tipo: 'go', ch: i, alt, cicli: this.entraTra, ...(bpm ? { bpm } : {}) });
    return effetti;
  }

  // OUT (S): il CH esce al prossimo «entra tra». Ripremute: annulla.
  out(i) {
    const c = this.canali[i];
    if (c.attesa?.tipo === 'out') {
      c.attesa = null;
      return [{ tipo: 'annulla', ch: i }];
    }
    if (!c.suona) return [];
    const effetti = c.attesa ? [{ tipo: 'annulla', ch: i }] : [];
    c.attesa = { tipo: 'out' };
    effetti.push({ tipo: 'out', ch: i, cicli: this.entraTra });
    return effetti;
  }

  // OUT tenuto 1 s: esce subito, con la micro-sfumata.
  outSubito(i) {
    const c = this.canali[i];
    if (!c.suona) return [];
    const effetti = c.attesa ? [{ tipo: 'annulla', ch: i }] : [];
    c.attesa = null;
    c.suona = null;
    effetti.push({ tipo: 'out-subito', ch: i });
    return effetti;
  }

  // GO ALL (PLAY): entra tutto quello che è in NEXT ed è diverso da ciò che suona, alla stessa battuta. Le entrate già in attesa restano.
  goAll() {
    return this.canali.flatMap((_, i) => this.go(i, { annullando: false }));
  }

  // Dalla tastiera: un pezzo che entra direttamente nel CH del suo tipo (senza tipo → FREE), non passa dalla manopolina.
  goDiretto(tipo, pezzo) {
    const i = chDelTipo(this.config, tipo);
    const c = this.canali[i];
    const alt = { id: `${pezzo.brano ?? 'scratch'}#${pezzo.nome}`, tipo: 'clip', nome: pezzo.nome, brano: pezzo.brano ?? null, bpm: null, tipoClip: tipo ?? '' };
    const effetti = c.attesa ? [{ tipo: 'annulla', ch: i }] : [];
    c.attesa = { tipo: 'go', alt };
    effetti.push({ tipo: 'go', ch: i, alt, cicli: this.entraTra, codice: pezzo.codice });
    return effetti;
  }

  // Il motore dice che l'attesa è scattata (o chi ascolta lo capisce dai cicli): la clip suona, o la ch è uscita.
  scattato(i) {
    const c = this.canali[i];
    if (!c.attesa) return;
    if (c.attesa.tipo === 'go') {
      c.suona = c.attesa.alt;
      if (i === chDellaBeat(this.config) && c.suona.bpm) this.bpm = c.suona.bpm;
    } else c.suona = null;
    c.attesa = null;
  }

  // --- il fisico ---

  fader(i, v) {
    this.canali[i].fader = v;
  }

  sweepPos(i, pos) {
    this.canali[i].aa = pos;
  }

  mute(i, acceso) {
    const c = this.canali[i];
    c.mute = acceso ?? !c.mute;
  }

  piuEntraTra(delta) {
    const k = Math.min(ENTRA_TRA.length - 1, Math.max(0, ENTRA_TRA.indexOf(this.entraTra) + delta));
    this.entraTra = ENTRA_TRA[k];
  }

  // --- cosa far vedere ---

  // Una clip di un brano diverso sia da quello del DRUM che suona sia da quello nel CUE.
  vecchia(i) {
    const s = this.canali[i].suona;
    if (!s || !s.brano) return false;
    const drum = this.canali[chDellaBeat(this.config)].suona?.brano ?? null;
    return s.brano !== drum && s.brano !== (this.brano?.nome ?? null);
  }

  // Luce di GO: spenta = vuoto · accesa = suona e in NEXT c'è la stessa · lenta = in NEXT c'è altro · veloce = entrata in attesa.
  luceGo(i) {
    const c = this.canali[i];
    if (c.attesa?.tipo === 'go') return 'veloce';
    const alt = this.next(i);
    if (alt && alt.id !== c.suona?.id) return 'lenta';
    return c.suona ? 'accesa' : 'spenta';
  }

  luceOut(i) {
    return this.canali[i].attesa?.tipo === 'out' ? 'veloce' : 'spenta';
  }

  luceMute(i) {
    return this.canali[i].mute ? 'accesa' : 'spenta';
  }

  // Avvisi ben visibili sul CH: suona ma non si sente (MUTE o fader a zero).
  avvisi(i) {
    const c = this.canali[i];
    if (!c.suona) return [];
    return [...(c.mute ? ['MUTE'] : []), ...(c.fader !== null && gainFader(c.fader) === 0 ? ['fader a zero'] : [])];
  }

  // La foto per lo schermo.
  vista() {
    return this.canali.map((c, i) => ({
      indice: i,
      nome: this.config[i].nome,
      colore: this.config[i].colore,
      free: !!this.config[i].free,
      alternative: this.alternative(i),
      suona: c.suona,
      next: this.next(i),
      attesa: c.attesa,
      fader: { valore: c.fader, letto: c.fader !== null, gain: gainFader(c.fader) },
      sweep: sweep(c.aa),
      mute: c.mute,
      vecchia: this.vecchia(i),
      avvisi: this.avvisi(i),
      luci: { r: this.luceGo(i), s: this.luceOut(i), m: this.luceMute(i) },
    }));
  }
}
