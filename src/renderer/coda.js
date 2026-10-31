// La coda di un livello live: righe concatenate sotto il codice (.lpf(1200), .delay(.4), .fast(2)…) che sovrascrivono i
// parametri, perché in Strudel il valore scritto dopo vince. Il codice del livello non si legge e non si riscrive mai:
// la coda sta a parte, ed è il motore a metterla sul pattern già compilato (niente rivalutazione del codice, niente suoni ricaricati).
// Nel file .cutx sta in fondo alla sezione, dopo una riga `// @coda`: resta Strudel valido anche letto così com'è.
// Modulo puro: lo provano i test.

export const MARCA = '// @coda';
const RIGA_MARCA = /^\s*\/\/\s*@coda\s*$/;
const VOCE = /^\s*\.([A-Za-z_]\w*)\s*\(.*\)\s*;?\s*$/;

// ".lpf(1200)" → { chiave: 'lpf', testo: '.lpf(1200)' }; qualsiasi altra riga non è una voce.
export function leggiVoce(testo) {
  const m = String(testo).match(VOCE);
  return m ? { chiave: m[1], testo: String(testo).trim() } : null;
}

// Il codice di una sezione → { codice, coda: ['.lpf(1200)', …] }. Se dopo `// @coda` c'è qualcosa che non è una voce non si
// separa niente: il codice resta intero (e suona com'è).
export function separa(codice) {
  const righe = String(codice).split('\n');
  const i = righe.findLastIndex((r) => RIGA_MARCA.test(r));
  if (i < 0) return { codice, coda: [] };
  const dopo = righe.slice(i + 1).filter((r) => r.trim() !== '');
  const voci = dopo.map(leggiVoce);
  if (voci.some((v) => !v)) return { codice, coda: [] };
  return { codice: righe.slice(0, i).join('\n'), coda: voci.map((v) => v.testo) };
}

// L'inverso, per scriverla nel file: la coda in fondo, dopo la marca. Senza voci il codice resta com'è.
export function unisci(codice, coda) {
  const voci = (coda ?? []).filter((t) => leggiVoce(t));
  if (!voci.length) return codice;
  return `${codice.replace(/\s+$/, '')}\n${MARCA}\n${voci.join('\n')}`;
}

// La voce con quella chiave si sostituisce al suo posto; una nuova va in fondo (l'ultima vince). Una riga non valida non cambia niente.
export function imposta(coda, testo) {
  const v = leggiVoce(testo);
  if (!v) return coda;
  const i = coda.findIndex((t) => leggiVoce(t)?.chiave === v.chiave);
  if (i < 0) return [...coda, v.testo];
  return coda.map((t, j) => (j === i ? v.testo : t));
}

export const togli = (coda, chiave) => coda.filter((t) => leggiVoce(t)?.chiave !== chiave);

const NUMERO = '(-?(?:\\d+\\.?\\d*|\\.\\d+))';

// Il numero scritto in una voce della coda (.lpf(1200) → 1200), o null.
export function valoreDi(coda, chiave) {
  const t = coda.find((x) => leggiVoce(x)?.chiave === chiave);
  const m = t?.match(new RegExp(`^\\s*\\.${chiave}\\(\\s*${NUMERO}\\s*\\)`));
  return m ? Number(m[1]) : null;
}

// Il valore che c'è già nel codice scritto da me (l'ultimo .lpf(800)), per partire da lì: si legge soltanto, mai analizzato né riscritto.
export function valoreLetterale(codice, chiave) {
  const tutti = [...String(codice).matchAll(new RegExp(`\\.${chiave}\\(\\s*${NUMERO}\\s*\\)`, 'g'))];
  return tutti.length ? Number(tutti.at(-1)[1]) : null;
}

// Le righe come si vedono (card e proiettore): la coda e, se non è al massimo, il volume del livello, che è l'ultima parola.
export function righeVisibili(coda, volume = 1) {
  const righe = [...(coda ?? [])];
  if (Number.isFinite(volume) && Math.abs(volume - 1) >= 0.005) righe.push(`.gain(${Math.round(volume * 100) / 100})`);
  return righe;
}

// La coda messa sul pattern: { pattern } oppure { errore } (e allora chi chiama tiene il pattern di prima).
// Le voci sono codice Strudel come quello scritto a mano: .lpf(1200) su un pattern che ha già un .lpf lo sovrascrive.
// extra.scivolate: { chiave: { da, a, t0, t1 } } — il numero di quella voce scivola da `da` ad `a` fra i cicli t0 e t1 (extra.segnale è il
// `signal` di Strudel: si passa da fuori, così questo modulo resta puro).
export function applica(pattern, coda, extra = {}) {
  const voci = (coda ?? []).filter((t) => leggiVoce(t));
  if (!voci.length) return { pattern };
  const scivolate = extra.scivolate ?? {};
  const righe = voci.map((t) => {
    const { chiave } = leggiVoce(t);
    return scivolate[chiave] && extra.segnale ? `.${chiave}(__scivola(${JSON.stringify(scivolate[chiave])}))` : t;
  });
  const scivola = (g) => extra.segnale((t) => valoreScivolato(g, Number(t)));
  try {
    const risultato = new Function('p', '__scivola', `return p\n${righe.join('\n')}`)(pattern, scivola);
    if (typeof risultato?.queryArc !== 'function') throw new Error('la coda non dà un pattern');
    risultato.queryArc(0, 0.001); // un errore pigro (una stringa mini-notation sbagliata) viene fuori qui, non a metà suono
    return { pattern: risultato };
  } catch (e) {
    return { errore: String(e.message ?? e) };
  }
}

// --- effetti morbidi ---
// I valori numerici di questi effetti, cambiati a mano, scivolano dal vecchio al nuovo (legati al tempo); tutto il resto (fast, slow, rev,
// ply… e i valori che non sono un numero) è ritmico: entra sul battito successivo, senza sovrapporre vecchio e nuovo.
export const SCORREVOLI = new Set([
  'lpf', 'hpf', 'bpf', 'cutoff', 'hcutoff', 'bandf', 'lpq', 'hpq', 'bpq', 'resonance', 'hresonance', 'delay', 'delaytime', 'delayfeedback', 'delayfb',
  'room', 'size', 'roomsize', 'rsize', 'gain', 'postgain', 'pan', 'shape', 'distort', 'crush', 'coarse', 'speed', 'detune', 'legato', 'attack', 'release',
  'sustain', 'decay', 'lpenv', 'hpenv', 'vib', 'vibmod', 'phaserdepth', 'phaserrate', 'orbit',
]);
SCORREVOLI.delete('orbit');

// Il numero di una voce (.lpf(1200) → 1200), solo se è un numero scritto e basta.
export function numeroDi(testo) {
  const m = String(testo).match(new RegExp(`^\\s*\\.\\w+\\(\\s*${NUMERO}\\s*\\)\\s*;?\\s*$`));
  return m ? Number(m[1]) : null;
}

// Una voce che scivola: la funzione c'è nell'elenco e il valore è un numero.
export const eScorrevole = (testo) => {
  const v = leggiVoce(testo);
  return !!v && SCORREVOLI.has(v.chiave) && numeroDi(testo) !== null;
};

// Dove sta il numero al ciclo t (lineare fra t0 e t1).
export function valoreScivolato(g, t) {
  if (!(g.t1 > g.t0) || t >= g.t1) return g.a;
  if (t <= g.t0) return g.da;
  return g.da + ((g.a - g.da) * (t - g.t0)) / (g.t1 - g.t0);
}

// Il numero come si scrive mentre scivola: interi se lo sono entrambi gli estremi, altrimenti due decimali (senza zeri inutili).
export function formattaNumero(v, g) {
  const intero = Number.isInteger(g.da) && Number.isInteger(g.a);
  return intero ? String(Math.round(v)) : String(Math.round(v * 100) / 100);
}

// Le righe da mostrare con i numeri che scivolano al ciclo dato (chiave → { da, a, t0, t1 }).
export function righeScorrevoli(righe, scivolate, ciclo) {
  if (!scivolate || !Object.keys(scivolate).length) return righe;
  return righe.map((r) => {
    const v = leggiVoce(r);
    const g = v && scivolate[v.chiave];
    if (!g || ciclo >= g.t1) return r;
    return r.replace(new RegExp(NUMERO), formattaNumero(valoreScivolato(g, ciclo), g));
  });
}

// Due pattern in fila, con il cambio esattamente al ciclo `ciclo`: prima suona solo il vecchio, da lì solo il nuovo (niente sovrapposizioni).
export function commuta(vecchio, nuovo, ciclo) {
  return {
    queryArc(a, b, contesto) {
      const fuori = [];
      if (a < ciclo) fuori.push(...vecchio.queryArc(a, Math.min(b, ciclo), contesto));
      if (b > ciclo) fuori.push(...nuovo.queryArc(Math.max(a, ciclo), b, contesto));
      return fuori;
    },
  };
}

// Un testo fatto solo di voci (con o senza `// @coda`, righe vuote e commenti a parte): è una coda da aggiungere a un livello, non un livello.
// Ritorna le voci, o null se c'è qualsiasi altra cosa.
export function soloCoda(testo) {
  const righe = String(testo).split('\n').filter((r) => r.trim() !== '' && !/^\s*\/\//.test(r));
  if (!righe.length) return null;
  const voci = righe.map(leggiVoce);
  return voci.every(Boolean) ? voci.map((v) => v.testo) : null;
}
