// I testi che il pubblico può leggere sul proiettore, e come si decidono (Impostazioni → proiezione → testi per il pubblico).
// Modulo puro: lo provano i test; il disegno vero è in uscita.js, le impostazioni in impostazioni.js.
// Avvisi ed errori non compaiono mai sul proiettore e non sono configurabili: la finestra di uscita non li riceve.

// Ogni voce: acceso/spento e, dove ha senso, il testo con i segnaposto ({bpm}, {n}, {cicli}…).
export const PREDEFINITI = {
  logo: { acceso: true, immagine: null }, // immagine: percorso di un file svg/png scelto da me
  bpm: { acceso: true, testo: '{bpm} BPM' },
  frase: { acceso: true, testo: '{n}' },
  neon: { acceso: true, testo: 'TECNOLOGIA CANAGLIA' }, // l'interruttore è la preferenza `insegna`
  titolo: { acceso: true, testo: 'CUTX · uscita' }, // la barra del titolo, se la finestra non è a tutto schermo
  etichette: { acceso: true, nomi: { libero: 'libero', jam: 'jam' } }, // nome vuoto = quell'etichetta non si vede; «paracadute» mai
  muto: { acceso: true, testo: '· muto' },
  conto: { acceso: true, testo: 'tra {n} {cicli}' },
  scrittura: { acceso: true, testo: 'in scrittura' },
  coda: { acceso: true },
  commenti: { acceso: false }, // le righe // del codice
  preambolo: { acceso: false }, // il preambolo del brano (setcpm…): un setcpm scritto io dal vivo è un gesto e si vede
  controller: { acceso: false, testo: '{pezzo} · {parametro} {valore}' }, // fase 4: la scritta grande di quello che tocco
  momento: { acceso: false, testo: '{momento}' }, // fase 4: il nome del momento della spina
};

// Segnaposto di ogni testo (per le impostazioni).
export const SEGNAPOSTO = {
  bpm: ['bpm'],
  frase: ['n'],
  conto: ['n', 'cicli'],
  controller: ['pezzo', 'parametro', 'valore'],
  momento: ['momento'],
};

// Le preferenze salvate sopra i predefiniti, voce per voce. `insegna` (vecchia preferenza) è l'interruttore del neon.
export function risolvi(preferenze = {}) {
  const salvati = preferenze.testiPubblico ?? {};
  const r = {};
  for (const [k, base] of Object.entries(PREDEFINITI)) {
    r[k] = { ...base, ...(salvati[k] ?? {}) };
    if (k === 'etichette') r[k].nomi = { ...base.nomi, ...(salvati[k]?.nomi ?? {}) };
  }
  r.neon.acceso = preferenze.insegna !== false;
  return r;
}

export function riempi(modello, valori) {
  return String(modello ?? '').replace(/\{(\w+)\}/g, (tutto, k) => (k in valori ? String(valori[k]) : tutto));
}

export const parolaCicli = (n) => (n === 1 ? 'ciclo' : 'cicli');

// Il nome che si vede sull'etichetta di un livello, o null se non si vede.
export function nomePubblico(nome, cfg) {
  if (nome === 'paracadute') return null; // il pubblico non deve sapere che mi sto salvando
  if (!cfg.etichette.acceso) return null;
  const nomi = cfg.etichette.nomi ?? {};
  // «libero 2», «libero 3»… sono lo stesso nome automatico con il numero
  const m = /^(.*?)( \d+)?$/.exec(nome);
  const base = Object.hasOwn(nomi, nome) ? nome : Object.hasOwn(nomi, m[1]) && m[2] ? m[1] : null;
  if (base !== null) {
    const rinominato = String(nomi[base]).trim();
    return rinominato ? `${rinominato}${base === nome ? '' : m[2]}` : null;
  }
  return nome;
}

// L'etichetta sopra il codice. stato: 'normale' | 'arriva' | 'scrittura'. null = nessuna etichetta.
export function testoEtichetta({ nome, stato = 'normale', muto = false, mancano = 0, punto = true }, cfg) {
  const base = nomePubblico(nome, cfg);
  if (!base) return null;
  if (stato === 'arriva') {
    const n = Math.max(1, Math.ceil(mancano));
    return cfg.conto.acceso ? `${base} · ${riempi(cfg.conto.testo, { n, cicli: parolaCicli(n) })}` : base;
  }
  const iniziale = punto ? `● ${base}` : base;
  if (stato === 'scrittura') return cfg.scrittura.acceso ? `${iniziale} · ${cfg.scrittura.testo}` : iniziale;
  return muto && cfg.muto.acceso ? `${iniziale} ${cfg.muto.testo}` : iniziale;
}

// --- il codice come lo vede il pubblico ---

// Dove inizia un commento // fuori da stringhe, in una riga (o -1).
function inizioCommento(riga) {
  let q = null;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (q) {
      if (c === '\\') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'" || c === '`') q = c;
    else if (c === '/' && riga[i + 1] === '/') return i;
  }
  return -1;
}

// Il codice senza quello che il pubblico non deve leggere: commenti e/o il preambolo del brano (le righe prima di `inizio`; un setcpm
// scritto dentro il livello, dal CUE, dalla card o dal jam, è un gesto e resta).
// Ritorna { testo, inv }: inv[i] = dove sta nel testo nuovo il carattere i del vecchio (-1 se non c'è più), per riportare le note evidenziate.
export function filtraCodice(codice, { commenti = true, preambolo = true, inizio = 0 } = {}) {
  if (commenti && preambolo) return { testo: codice, inv: null };
  const inv = new Int32Array(codice.length + 1).fill(-1);
  const righe = [];
  let uscita = 0;
  let s = 0;
  for (const riga of codice.split('\n')) {
    const fine = s + riga.length;
    let tieni = riga;
    let via = false;
    if (!preambolo && s < inizio) via = true;
    else if (!commenti) {
      const c = inizioCommento(riga);
      if (c === 0 || (c > 0 && riga.slice(0, c).trim() === '')) via = true; // riga di solo commento
      else if (c > 0) tieni = riga.slice(0, c).trimEnd();
    }
    if (!via && righe.length === 0 && tieni.trim() === '' && (!commenti || !preambolo)) via = true; // niente righe vuote all'inizio
    if (!via) {
      for (let j = 0; j < tieni.length; j++) inv[s + j] = uscita + j;
      righe.push(tieni);
      uscita += tieni.length + 1;
    }
    s = fine + 1;
  }
  return { testo: righe.join('\n'), inv };
}

// Gli intervalli [da, a) del codice vero → quelli del testo filtrato (quelli che non ci sono più cadono).
export function convertiIntervalli(intervalli, inv) {
  if (!inv) return intervalli;
  const out = [];
  for (const [a, b] of intervalli) {
    let minimo = Infinity;
    let massimo = -1;
    for (let i = Math.max(0, a); i < b && i < inv.length; i++) {
      if (inv[i] < 0) continue;
      minimo = Math.min(minimo, inv[i]);
      massimo = Math.max(massimo, inv[i]);
    }
    if (massimo >= 0) out.push([minimo, massimo + 1]);
  }
  return out;
}
