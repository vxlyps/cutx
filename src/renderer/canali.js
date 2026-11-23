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
export const OUT_ID = 'OUT'; // la prima zona della manopola e il primo chip: «togli questo CH»
const USCITA = { id: OUT_ID, tipo: 'out', nome: 'OUT' };

// --- la pagina CANALI (le 8 definizioni) ---

export const canaliPredefiniti = () => [
  { nome: 'THUMP', tipi: ['drum'], free: false }, // qui entra anche la @beat con le sue scene
  { nome: 'PURR', tipi: ['keys', 'arp'], free: false },
  { nome: 'GROWL', tipi: ['bass'], free: false },
  { nome: 'HOWL', tipi: ['lead'], free: false },
  { nome: 'FUR', tipi: ['pad'], free: false },
  { nome: 'CLAW', tipi: ['perc'], free: false },
  { nome: 'HISS', tipi: ['fx'], free: false },
  { nome: 'STRAY', tipi: [], free: true }, // i senza tipo, e qualsiasi clip del brano
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

// Il testo di canali.json → le 8 definizioni; se manca o non va bene, le predefinite (con la lista degli errori, per dirlo a Valerio).
export function leggiCanali(testo) {
  if (!testo) return { config: canaliPredefiniti(), errori: [] };
  try {
    const grezzo = JSON.parse(testo);
    const base = canaliPredefiniti();
    const config = Array.isArray(grezzo) ? grezzo.map((c, i) => ({ nome: String(c?.nome ?? '').trim(), tipi: Array.isArray(c?.tipi) ? c.tipi.filter((t) => TIPI.includes(t)) : [], free: c?.free === true })) : null;
    const errori = config ? validaCanali(config) : ['il file non è una lista'];
    return errori.length ? { config: canaliPredefiniti(), errori } : { config, errori: [] };
  } catch (e) {
    return { config: canaliPredefiniti(), errori: [`file illeggibile (${e.message})`] };
  }
}

// L'ordine dei gruppi del CUE (categorie.js, gruppiClip): quello dei CH.
export const ordineCue = (config) => config.map(({ nome, tipi, free }) => ({ nome, tipi, free }));

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

// L'identità di una clip è il suo NOME dentro il brano (non il numero: unisci/dividi/sposta non la confondono); una scena è il suo posto nel beat.
export const idClip = (brano, nome) => `${brano}#${nome}`;
export const idScena = (brano, k) => `${brano}◆${k}`;

// brano = { nome, bpm, beat: { scene: [{ nome }] } | null, sezioni: [{ nome, info }] }. NELL'ORDINE DEL FILE, mai per tipo.
// DRUM: prima le scene della @beat, poi le sue clip. Ogni clip sta in UN CH solo: quello del suo tipo; FREE prende le senza tipo e i tipi che nessuno prende.
export function alternative(config, brano, ch) {
  if (!brano) return [];
  const di = (extra) => ({ brano: brano.nome, bpm: brano.bpm ?? null, ...extra });
  const out = [];
  if (ch === chDellaBeat(config)) (brano.beat?.scene ?? []).forEach((s, k) => out.push(di({ id: idScena(brano.nome, k), tipo: 'scena', indice: k, nome: s.nome, tipoClip: 'drum', provenienza: `${brano.nome} ◆${k + 1}` })));
  (brano.sezioni ?? []).forEach((s, k) => {
    const tc = tipoDellaClip(s.info);
    if (chDelTipo(config, tc) === ch) out.push(di({ id: idClip(brano.nome, s.nome), tipo: 'clip', indice: k, nome: s.nome, tipoClip: tc, provenienza: `${brano.nome} §${k + 1}` }));
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

const vuota = () => ({ suona: null, insieme: [], pos: null, zona: null, scelte: new Map(), fader: null, aa: null, mute: false, attesa: null, attesaMs: 0 });
const ATTESA_MS = 1500; // dopo un GO/OUT il motore ci mette un attimo a dirlo: nel frattempo vale quello che ho chiesto

export class StatoCanali {
  constructor(config = canaliPredefiniti()) {
    this.config = config;
    this.brano = null; // il brano nel CUE
    this.canali = Array.from({ length: N_CH }, vuota);
    this.entraTra = 1;
    this.bpm = null; // il tempo del set: lo porta la ch DRUM
    this.adesso = () => Date.now();
    this.cuffiaCh = null; // { ch, id }: il CH che sto ascoltando in cuffia (S)
  }

  // I CANALI si cambiano a live fermo (lo garantisce chi chiama); cambiato, NEXT e attese si azzerano.
  impostaCANALI(config) {
    this.config = config;
    for (const c of this.canali) Object.assign(c, { suona: null, insieme: [], zona: null, scelte: new Map(), attesa: null });
    this.cuffiaCh = null;
  }

  // Un brano nuovo nel CUE: la manopola riparte da zero (il primo tocco sceglie tra le alternative del brano nuovo). Le scelte già fatte restano:
  // sono per brano, cambiare linguetta del CUE non le perde.
  impostaBrano(brano) {
    const nuovo = (brano?.nome ?? null) !== (this.brano?.nome ?? null);
    this.brano = brano; // chi lo rilegge a ogni giro (le clip cambiano mentre le scrivo) non azzera niente
    if (nuovo) for (const c of this.canali) c.zona = null;
  }

  // La scelta di un CH per il brano nel CUE: un id di clip o scena, OUT_ID, o null. Un id che nel brano non c'è più vale come nessuna scelta.
  scelta(i) {
    const id = this.brano ? this.canali[i].scelte.get(this.brano.nome) ?? null : null;
    if (id === OUT_ID) return id;
    return id && this.alternative(i).some((a) => a.id === id) ? id : null;
  }

  poniScelta(i, id) {
    if (!this.brano) return;
    const c = this.canali[i];
    if (id === null) c.scelte.delete(this.brano.nome);
    else c.scelte.set(this.brano.nome, id);
  }

  alternative(i) {
    return alternative(this.config, this.brano, i);
  }

  // Cosa c'è in NEXT: quello che ho scelto io (manopola, chip della griglia, tasto NEXT di una card), altrimenti quello che suona adesso (nessun cambio:
  // anche se nel CUE c'è un altro brano). Un CH vuoto senza scelta non ha NEXT. La scelta può essere OUT.
  next(i) {
    const id = this.scelta(i);
    if (id === OUT_ID) return USCITA;
    if (id) return this.alternative(i).find((a) => a.id === id);
    return this.canali[i].suona ?? null;
  }

  // Cosa suona nel CH, tutto (la FREE impila più clip).
  suonaId(i, id) {
    const c = this.canali[i];
    return c.suona?.id === id || c.insieme.some((a) => a.id === id);
  }

  // Armato = ho scelto io qualcosa che cambierebbe il CH: una clip che non suona già, oppure OUT con qualcosa che suona. Il CH lampeggia e parte con PLAY.
  armato(i) {
    const id = this.scelta(i);
    if (!id) return false;
    if (id === OUT_ID) return !!this.canali[i].suona;
    return !this.suonaId(i, id);
  }

  // NEXT solo se è una clip vera del brano nel CUE (per il preascolto in cuffia): né OUT né una clip di un altro brano.
  nextDelBrano(i) {
    const n = this.next(i);
    return n && n.id !== OUT_ID && this.alternative(i).some((a) => a.id === n.id) ? n : null;
  }

  // La manopola: la prima zona a sinistra è OUT, poi le alternative nell'ordine del file. La scelta cambia solo quando cambia la zona (con l'isteresi),
  // così non «rumoreggia» sul CUE.
  scegli(i, pos) {
    const alt = this.alternative(i);
    const c = this.canali[i];
    c.pos = pos;
    const z = zona(pos, alt.length + 1, c.zona);
    if (z !== c.zona) {
      c.zona = z;
      this.poniScelta(i, z === 0 ? OUT_ID : alt[z - 1].id);
    }
    return this.next(i);
  }

  // Dal mouse (chip della griglia): gli stessi indici delle zone della manopola, 0 = OUT, 1… = le alternative. La manopola «segue» così non salta quando la tocco.
  scegliAlt(i, k) {
    const alt = this.alternative(i);
    if (!(k >= 0 && k <= alt.length)) return null;
    const c = this.canali[i];
    this.poniScelta(i, k === 0 ? OUT_ID : alt[k - 1].id);
    c.zona = k;
    c.pos = (k + 0.5) / (alt.length + 1);
    return this.next(i);
  }

  // Il tasto NEXT di una card del CUE (l'unico gesto che porta il CUE in NEXT): sceglie quella clip per il suo CH; ricliccato toglie la scelta
  // (il CH torna a «quello che suona»). Ritorna { ch, k, acceso } o null se la clip non è di nessun CH.
  alternaId(id) {
    for (let i = 0; i < N_CH; i++) {
      const k = this.alternative(i).findIndex((a) => a.id === id);
      if (k < 0) continue;
      if (this.scelta(i) === id) {
        this.poniScelta(i, null);
        this.canali[i].zona = null;
        return { ch: i, k: k + 1, acceso: false };
      }
      this.scegliAlt(i, k + 1);
      return { ch: i, k: k + 1, acceso: true };
    }
    return null;
  }

  // --- entra / esce ---

  // L'attesa si annulla: lo dice anche quale era (entrare o uscire), perché chi parla col motore le annulla in modo diverso.
  annullaAttesa(i) {
    const c = this.canali[i];
    const quale = c.attesa.tipo;
    c.attesa = null;
    return { tipo: 'annulla', ch: i, quale };
  }

  // GO: la clip in NEXT entra al prossimo «entra tra». Ripremuto mentre aspetta: annulla.
  go(i, { annullando = true } = {}) {
    const c = this.canali[i];
    if (c.attesa?.tipo === 'go') return annullando ? [this.annullaAttesa(i)] : [];
    const alt = this.next(i);
    if (!alt || alt.id === OUT_ID) return [{ tipo: 'avviso', ch: i, testo: `niente in NEXT per ${this.config[i].nome}` }];
    if (this.suonaId(i, alt.id)) return []; // è già quella che suona
    const effetti = c.attesa ? [this.annullaAttesa(i)] : []; // vince l'ultimo premuto
    c.attesa = { tipo: 'go', alt };
    c.attesaMs = this.adesso();
    const bpm = i === chDellaBeat(this.config) && alt.bpm && alt.bpm !== this.bpm ? alt.bpm : undefined;
    effetti.push({ tipo: 'go', ch: i, alt, cicli: this.entraTra, ...(bpm ? { bpm } : {}) });
    return effetti;
  }

  // Cosa farebbe R adesso: 'ANNULLA' (qualcosa aspetta) · 'OUT' (NEXT è OUT e il CH suona) · 'GO' (NEXT è una clip che non suona) ·
  // 'LIVE' (NEXT è già quello che suona: niente da fare) · '' (CH vuoto, niente da mandare).
  azioneR(i) {
    const c = this.canali[i];
    if (c.attesa) return 'ANNULLA';
    const n = this.next(i);
    if (!n) return '';
    if (n.id === OUT_ID) return c.suona ? 'OUT' : '';
    return this.suonaId(i, n.id) ? 'LIVE' : 'GO';
  }

  // R (premuto e rilasciato in meno di 1 s): UN tasto solo, fa quello che dice la parola sul tasto (azioneR).
  premiR(i) {
    const c = this.canali[i];
    if (c.attesa) return [this.annullaAttesa(i)];
    const azione = this.azioneR(i);
    if (azione === 'OUT') return this.out(i);
    if (azione === 'GO') return this.go(i, { annullando: false });
    if (azione === '') return [{ tipo: 'avviso', ch: i, testo: `niente da fare per ${this.config[i].nome}` }];
    return []; // LIVE: è già in onda
  }

  // R tenuto 1 s: esce subito (micro-sfumata) e cancella ogni attesa.
  tieniR(i) {
    return this.outSubito(i);
  }

  // S: preascolto in cuffia del NEXT di quel CH (come il «cue» di un mixer DJ). Di nuovo S: smette. S su un altro CH: passa lì (la cuffia è una).
  premiS(i) {
    if (this.cuffiaCh?.ch === i) {
      this.cuffiaCh = null;
      return [{ tipo: 'cuffia-stop', ch: i }];
    }
    const alt = this.nextDelBrano(i);
    if (!alt) return [{ tipo: 'avviso', ch: i, testo: `niente da ascoltare per ${this.config[i].nome}` }];
    this.cuffiaCh = { ch: i, id: alt.id };
    return [{ tipo: 'cuffia', ch: i, alt }];
  }

  // Con S acceso, girando la manopola (o cliccando un'altra clip) la cuffia segue NEXT.
  seguiCuffia(i) {
    if (this.cuffiaCh?.ch !== i) return [];
    const alt = this.nextDelBrano(i);
    if (!alt || alt.id === this.cuffiaCh.id) return [];
    this.cuffiaCh = { ch: i, id: alt.id };
    return [{ tipo: 'cuffia', ch: i, alt }];
  }

  // OUT: il CH esce al prossimo «entra tra». Ripremuto: annulla.
  out(i) {
    const c = this.canali[i];
    if (c.attesa?.tipo === 'out') return [this.annullaAttesa(i)];
    if (!c.suona) return [];
    const effetti = c.attesa ? [this.annullaAttesa(i)] : [];
    c.attesa = { tipo: 'out' };
    c.attesaMs = this.adesso();
    effetti.push({ tipo: 'out', ch: i, cicli: this.entraTra });
    return effetti;
  }

  // OUT tenuto 1 s: esce subito, con la micro-sfumata.
  outSubito(i) {
    const c = this.canali[i];
    if (!c.suona) return [];
    const effetti = c.attesa ? [this.annullaAttesa(i)] : [];
    c.attesa = null;
    c.suona = null;
    c.insieme = [];
    effetti.push({ tipo: 'out-subito', ch: i });
    return effetti;
  }

  // GO ALL (PLAY): tutto quello che è ARMATO (scelto da me e diverso da ciò che suona, OUT compresi) parte insieme: chi esegue gli effetti li manda
  // con un solo ciclo d'arrivo. Le attese già in corso restano.
  goAll() {
    return this.canali.flatMap((c, i) => (this.armato(i) && !c.attesa ? (this.scelta(i) === OUT_ID ? this.out(i) : this.go(i, { annullando: false })) : []));
  }

  // Dalla tastiera: un pezzo che entra direttamente nel CH del suo tipo (senza tipo → FREE), non passa dalla manopolina.
  goDiretto(tipo, pezzo) {
    const i = chDelTipo(this.config, tipo);
    const c = this.canali[i];
    const alt = { id: `${pezzo.brano ?? 'scratch'}#${pezzo.nome}`, tipo: 'clip', nome: pezzo.nome, brano: pezzo.brano ?? null, bpm: null, tipoClip: tipo ?? '' };
    const effetti = c.attesa ? [this.annullaAttesa(i)] : [];
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
    } else {
      c.suona = null;
      c.insieme = [];
      this.poniScelta(i, null); // l'OUT è fatto: il CH torna senza scelta
    }
    c.attesa = null;
  }

  // La verità è il motore: dai livelli del live (con il loro `ch`, `da`, `a`) si ricava cosa suona, cosa sta per entrare e cosa sta per uscire.
  // livelli: [{ nome, provenienza, ch, da, a }] (a null = non esce) · ciclo: il ciclo di adesso. Dopo un crash lo stato si ricostruisce da qui.
  sincronizza(livelli, ciclo) {
    const alt = (l) => {
      for (let i = 0; i < N_CH; i++) {
        const t = this.alternative(i).find((a) => (a.tipo === 'scena' ? a.provenienza === l.provenienza : a.nome === l.nome && l.provenienza?.startsWith(`${a.brano} §`)));
        if (t) return t;
      }
      return { id: `?#${l.provenienza ?? l.nome}`, tipo: 'clip', nome: l.nome, brano: null, bpm: null, tipoClip: '', provenienza: l.provenienza ?? null };
    };
    this.canali.forEach((c, i) => {
      const mie = livelli.filter((l) => l.ch === i);
      const suonaL = mie.filter((l) => l.da <= ciclo && (l.a === null || l.a > ciclo)).sort((x, y) => y.da - x.da)[0];
      const prossimo = mie.filter((l) => l.da > ciclo && l.a === null).sort((x, y) => x.da - y.da)[0];
      c.insieme = mie.filter((l) => l.da <= ciclo && (l.a === null || l.a > ciclo)).map(alt);
      c.suona = suonaL ? (c.suona && c.suona.nome === suonaL.nome && c.suona.provenienza?.split(' ')[0] === alt(suonaL).provenienza?.split(' ')[0] ? c.suona : alt(suonaL)) : null;
      if (i === chDellaBeat(this.config) && c.suona?.bpm) this.bpm = c.suona.bpm;
      if (!c.suona && !c.attesa) for (const nome of c.scelte.keys()) if (c.scelte.get(nome) === OUT_ID) c.scelte.delete(nome); // un OUT fatto non resta scelto
      if (this.adesso() - c.attesaMs < ATTESA_MS) return; // ho appena chiesto qualcosa: lo dice il motore tra poco
      if (prossimo) c.attesa = { tipo: 'go', alt: alt(prossimo), da: prossimo.da };
      else if (suonaL && suonaL.a !== null && suonaL.a > ciclo) c.attesa = { tipo: 'out', da: suonaL.a };
      else c.attesa = null;
    });
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
    if (c.attesa) return 'veloce'; // sta per entrare o per uscire (lo schermo dice quale)
    if (this.armato(i)) return 'lenta';
    return c.suona ? 'accesa' : 'spenta';
  }

  // S: accesa = quel CH è in cuffia.
  luceOut(i) {
    return this.cuffiaCh?.ch === i ? 'accesa' : 'spenta';
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
      free: !!this.config[i].free,
      alternative: this.alternative(i),
      suona: c.suona,
      next: this.next(i),
      attesa: c.attesa,
      fader: { valore: c.fader, letto: c.fader !== null, gain: gainFader(c.fader) },
      sweep: sweep(c.aa),
      mute: c.mute,
      armato: this.armato(i),
      azioneR: this.azioneR(i),
      inCuffia: this.cuffiaCh?.ch === i,
      vecchia: this.vecchia(i),
      avvisi: this.avvisi(i),
      luci: { r: this.luceGo(i), s: this.luceOut(i), m: this.luceMute(i) },
    }));
  }
}
