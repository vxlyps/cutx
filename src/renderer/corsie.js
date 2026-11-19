// CORSIE: lo stato puro del nuovo LIVE (paradigma CANALI). Nessun DOM, nessun motore audio: la REGIA, lo SCALPELLO e lo schermo
// leggono questo stato e gli mandano intenzioni; lui risponde con «effetti» (cosa deve fare chi parla col motore). Si prova con
// test/corsie.test.js. Il motore sa solo cosa suona; qui si sa cosa è in canna, cosa aspetta, cosa è «vecchio».
//
// Parole: CORSIA = un canale (8, col suo Banco) · IN CANNA = la clip scelta dalla manopolina, pronta · ENTRA/ESCE/MUTO = R/S/M ·
// ARREMBAGGIO = PLAY (entra tutto quello che è in canna) · CANAGLIA = la corsia dei senza tipo e dei «in più».

export const TIPI = ['drum', 'perc', 'bass', 'lead', 'keys', 'arp', 'pad', 'fx']; // lista fissa; i nomi delle corsie sono liberi
export const ENTRA_TRA = [1, 2, 4, 8]; // battute (cicli)
export const N_CORSIE = 8;
export const ISTERESI = 0.03; // ai bordi delle zone della manopolina
export const ZONA_MORTA = 0.04; // al centro di ACQUA·ARIA

// --- il Banco ---

export const bancoPredefinito = () => [
  { nome: 'DRUM', colore: '#e8e8e8', tipi: ['drum'], canaglia: false }, // qui entra anche la @beat con le sue scene
  { nome: 'MELODIA', colore: '#e0b23c', tipi: ['keys', 'arp'], canaglia: false },
  { nome: 'BASSO', colore: '#d9582b', tipi: ['bass'], canaglia: false },
  { nome: 'LEAD', colore: '#3cc0e0', tipi: ['lead'], canaglia: false },
  { nome: 'PAD', colore: '#8a6fe0', tipi: ['pad'], canaglia: false },
  { nome: 'PERC', colore: '#e06fae', tipi: ['perc'], canaglia: false },
  { nome: 'FX', colore: '#6fe0a8', tipi: ['fx'], canaglia: false },
  { nome: 'CANAGLIA', colore: '#9bd02a', tipi: [], canaglia: true }, // i senza tipo, e qualsiasi clip del brano
];

// Gli errori del Banco, in italiano; lista vuota = va bene. Otto corsie, una sola CANAGLIA, ogni tipo in una corsia sola.
export function validaBanco(banco) {
  const errori = [];
  if (!Array.isArray(banco) || banco.length !== N_CORSIE) return [`servono ${N_CORSIE} corsie`];
  const visti = new Map();
  banco.forEach((c, i) => {
    if (!String(c?.nome ?? '').trim()) errori.push(`la corsia ${i + 1} non ha un nome`);
    for (const t of c?.tipi ?? []) {
      if (!TIPI.includes(t)) errori.push(`«${t}» non è un tipo`);
      else if (visti.has(t)) errori.push(`il tipo ${t} è in due corsie (${visti.get(t) + 1} e ${i + 1})`);
      else visti.set(t, i);
    }
  });
  const canaglie = banco.filter((c) => c?.canaglia).length;
  if (canaglie !== 1) errori.push(canaglie ? 'la CANAGLIA deve essere una sola' : 'manca la CANAGLIA');
  return errori;
}

export const indiceCanaglia = (banco) => Math.max(0, banco.findIndex((c) => c.canaglia));

// La corsia di un tipo ('' = senza tipo → CANAGLIA). Un tipo che nessuna corsia prende va in CANAGLIA.
export function corsiaDelTipo(banco, tipo) {
  const i = tipo ? banco.findIndex((c) => c.tipi.includes(tipo)) : -1;
  return i >= 0 ? i : indiceCanaglia(banco);
}

// La @beat e le sue scene vanno nella corsia del tipo drum.
export const corsiaDellaBeat = (banco) => corsiaDelTipo(banco, 'drum');

export const tipoDellaClip = (info) => TIPI.find((t) => info?.[t] === true) ?? '';

// --- le alternative (cosa può entrare in una corsia) ---

// brano = { nome, bpm, beat: { scene: [{ nome }] } | null, sezioni: [{ nome, info }] }. NELL'ORDINE DEL FILE, mai per tipo.
// DRUM: prima le scene della @beat, poi le sue clip. CANAGLIA: tutte le clip del brano (le scene no). Le altre: le clip dei suoi tipi.
export function alternative(banco, brano, corsia) {
  if (!brano) return [];
  const di = (extra) => ({ brano: brano.nome, bpm: brano.bpm ?? null, ...extra });
  const out = [];
  if (corsia === corsiaDellaBeat(banco)) (brano.beat?.scene ?? []).forEach((s, k) => out.push(di({ id: `${brano.nome}#scena${k}`, tipo: 'scena', indice: k, nome: s.nome, tipoClip: 'drum' })));
  (brano.sezioni ?? []).forEach((s, k) => {
    const tc = tipoDellaClip(s.info);
    if (corsiaDelTipo(banco, tc) === corsia || banco[corsia]?.canaglia) out.push(di({ id: `${brano.nome}#clip${k}`, tipo: 'clip', indice: k, nome: s.nome, tipoClip: tc }));
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

// --- il fisico: fader e ACQUA·ARIA ---

// Curva da mixer: in cima 1 (il volume del codice, mai sopra), a metà −15 dB, in fondo silenzio.
export function gainFader(v) {
  if (v === null || v === undefined) return 1; // «non letto»: vale il codice
  const x = Math.min(1, Math.max(0, v));
  if (x <= 0.02) return 0;
  return 10 ** ((30 * (x - 1)) / 20) * Math.min(1, (x - 0.02) / 0.08);
}

// Centro neutro (zona morta ±4%); a sinistra ACQUA = passa-basso da 20 kHz a ~200 Hz; a destra ARIA = passa-alto da 20 Hz a ~5 kHz. Scala logaritmica.
export function acquaAria(pos) {
  if (pos === null || pos === undefined) return { tipo: 'neutro' };
  const p = Math.min(1, Math.max(0, pos));
  if (Math.abs(p - 0.5) <= ZONA_MORTA + 1e-9) return { tipo: 'neutro' };
  if (p < 0.5) return { tipo: 'acqua', lp: 20000 * (200 / 20000) ** ((0.5 - ZONA_MORTA - p) / (0.5 - ZONA_MORTA)) };
  return { tipo: 'aria', hp: 20 * (5000 / 20) ** ((p - 0.5 - ZONA_MORTA) / (0.5 - ZONA_MORTA)) };
}

// --- lo stato ---

const vuota = () => ({ suona: null, pos: null, zona: null, fader: null, aa: null, muto: false, attesa: null });

export class StatoCorsie {
  constructor(banco = bancoPredefinito()) {
    this.banco = banco;
    this.brano = null; // il brano nel CUE
    this.corsie = Array.from({ length: N_CORSIE }, vuota);
    this.entraTra = 1;
    this.bpm = null; // il tempo del set: lo porta la corsia DRUM
  }

  // Il Banco si cambia a live fermo (lo garantisce chi chiama); cambiato, in canna e attese si azzerano.
  impostaBanco(banco) {
    this.banco = banco;
    for (const c of this.corsie) Object.assign(c, { suona: null, zona: null, attesa: null });
  }

  // Un brano nuovo nel CUE: la stessa posizione di ogni manopolina sceglie tra le alternative del brano nuovo.
  impostaBrano(brano) {
    this.brano = brano;
    for (const c of this.corsie) c.zona = null;
  }

  alternative(i) {
    return alternative(this.banco, this.brano, i);
  }

  // Cosa è in canna: la zona della manopolina (mai mossa = la prima), o niente se il brano non ha nulla per questa corsia.
  inCanna(i) {
    const alt = this.alternative(i);
    const c = this.corsie[i];
    if (!alt.length) return null;
    c.zona = c.pos === null ? 0 : zona(c.pos, alt.length, c.zona);
    return alt[c.zona] ?? null;
  }

  scegli(i, pos) {
    this.corsie[i].pos = pos;
    return this.inCanna(i);
  }

  // --- entra / esce ---

  // R: la clip in canna entra al prossimo «entra tra». Ripremuto mentre aspetta: annulla.
  entra(i, { annullando = true } = {}) {
    const c = this.corsie[i];
    if (c.attesa?.tipo === 'entra') {
      if (!annullando) return [];
      c.attesa = null;
      return [{ tipo: 'annulla', corsia: i }];
    }
    const alt = this.inCanna(i);
    if (!alt) return [{ tipo: 'avviso', corsia: i, testo: `niente in canna per ${this.banco[i].nome}` }];
    if (c.suona?.id === alt.id) return []; // è già quella che suona
    const effetti = c.attesa ? [{ tipo: 'annulla', corsia: i }] : []; // vince l'ultimo premuto
    c.attesa = { tipo: 'entra', alt };
    const bpm = i === corsiaDellaBeat(this.banco) && alt.bpm && alt.bpm !== this.bpm ? alt.bpm : undefined;
    effetti.push({ tipo: 'entra', corsia: i, alt, cicli: this.entraTra, ...(bpm ? { bpm } : {}) });
    return effetti;
  }

  // S: la corsia esce al prossimo «entra tra». Ripremuto: annulla.
  esce(i) {
    const c = this.corsie[i];
    if (c.attesa?.tipo === 'esce') {
      c.attesa = null;
      return [{ tipo: 'annulla', corsia: i }];
    }
    if (!c.suona) return [];
    const effetti = c.attesa ? [{ tipo: 'annulla', corsia: i }] : [];
    c.attesa = { tipo: 'esce' };
    effetti.push({ tipo: 'esce', corsia: i, cicli: this.entraTra });
    return effetti;
  }

  // S tenuto 1 s: esce subito, con la micro-sfumata.
  esceSubito(i) {
    const c = this.corsie[i];
    if (!c.suona) return [];
    const effetti = c.attesa ? [{ tipo: 'annulla', corsia: i }] : [];
    c.attesa = null;
    c.suona = null;
    effetti.push({ tipo: 'esce-subito', corsia: i });
    return effetti;
  }

  // PLAY: entra tutto quello che è in canna ed è diverso da ciò che suona, alla stessa battuta. Le entrate già in attesa restano.
  arrembaggio() {
    return this.corsie.flatMap((_, i) => this.entra(i, { annullando: false }));
  }

  // Dalla PENNA: un pezzo che entra direttamente nella corsia del suo tipo (senza tipo → CANAGLIA), non passa dalla manopolina.
  entraDiretto(tipo, pezzo) {
    const i = corsiaDelTipo(this.banco, tipo);
    const c = this.corsie[i];
    const alt = { id: `${pezzo.brano ?? 'scratch'}#${pezzo.nome}`, tipo: 'clip', nome: pezzo.nome, brano: pezzo.brano ?? null, bpm: null, tipoClip: tipo ?? '' };
    const effetti = c.attesa ? [{ tipo: 'annulla', corsia: i }] : [];
    c.attesa = { tipo: 'entra', alt };
    effetti.push({ tipo: 'entra', corsia: i, alt, cicli: this.entraTra, codice: pezzo.codice });
    return effetti;
  }

  // Il motore dice che l'attesa è scattata (o chi ascolta lo capisce dai cicli): la clip suona, o la corsia è uscita.
  scattato(i) {
    const c = this.corsie[i];
    if (!c.attesa) return;
    if (c.attesa.tipo === 'entra') {
      c.suona = c.attesa.alt;
      if (i === corsiaDellaBeat(this.banco) && c.suona.bpm) this.bpm = c.suona.bpm;
    } else c.suona = null;
    c.attesa = null;
  }

  // --- il fisico ---

  fader(i, v) {
    this.corsie[i].fader = v;
  }

  aria(i, pos) {
    this.corsie[i].aa = pos;
  }

  muto(i, acceso) {
    const c = this.corsie[i];
    c.muto = acceso ?? !c.muto;
  }

  piuEntraTra(delta) {
    const k = Math.min(ENTRA_TRA.length - 1, Math.max(0, ENTRA_TRA.indexOf(this.entraTra) + delta));
    this.entraTra = ENTRA_TRA[k];
  }

  // --- cosa far vedere ---

  // Una clip di un brano diverso sia da quello della DRUM che suona sia da quello nel CUE.
  vecchia(i) {
    const s = this.corsie[i].suona;
    if (!s || !s.brano) return false;
    const drum = this.corsie[corsiaDellaBeat(this.banco)].suona?.brano ?? null;
    return s.brano !== drum && s.brano !== (this.brano?.nome ?? null);
  }

  // Luce di R: spenta = vuota · accesa = suona e in canna c'è la stessa · lenta = in canna c'è altro · veloce = entrata in attesa.
  luceR(i) {
    const c = this.corsie[i];
    if (c.attesa?.tipo === 'entra') return 'veloce';
    const alt = this.inCanna(i);
    if (alt && alt.id !== c.suona?.id) return 'lenta';
    return c.suona ? 'accesa' : 'spenta';
  }

  luceS(i) {
    return this.corsie[i].attesa?.tipo === 'esce' ? 'veloce' : 'spenta';
  }

  luceM(i) {
    return this.corsie[i].muto ? 'accesa' : 'spenta';
  }

  // Avvisi ben visibili sulla corsia: suona ma non si sente (muta o fader a zero).
  avvisi(i) {
    const c = this.corsie[i];
    if (!c.suona) return [];
    return [...(c.muto ? ['muta'] : []), ...(c.fader !== null && gainFader(c.fader) === 0 ? ['fader a zero'] : [])];
  }

  // La foto per lo schermo.
  vista() {
    return this.corsie.map((c, i) => ({
      indice: i,
      nome: this.banco[i].nome,
      colore: this.banco[i].colore,
      canaglia: !!this.banco[i].canaglia,
      alternative: this.alternative(i),
      suona: c.suona,
      inCanna: this.inCanna(i),
      attesa: c.attesa,
      fader: { valore: c.fader, letto: c.fader !== null, gain: gainFader(c.fader) },
      acquaAria: acquaAria(c.aa),
      muto: c.muto,
      vecchia: this.vecchia(i),
      avvisi: this.avvisi(i),
      luci: { r: this.luceR(i), s: this.luceS(i), m: this.luceM(i) },
    }));
  }
}
