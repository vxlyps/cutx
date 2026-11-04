// Le note del SYNTH: il pianoroll e la mini-notazione sono la STESSA cosa, e si convertono avanti e indietro.
// Un evento è { i, l, n }: parte allo scatto i (1/16 di ciclo, contati da 0 su tutti i cicli), dura l scatti, altezza n (midi, c3 = 48).
// Modulo puro: lo provano i test. Sottoinsieme della mini-notazione che si legge: note (c3 eb3 f#2 o numeri midi), riposo ~, tenuta _,
// peso @n, ripetizione *n e !n, gruppi [ ], accordi [c3,e3,g3], alternanze <a b>, pile con la virgola. Altro (? / . | euclidei) non si
// legge: il pianoroll lo dice e il testo resta com'è.

export const SCATTI = 16; // scatti per ciclo (griglia 1/16)
export const CICLI = [1, 2, 4, 8];
const CICLI_MAX = 8;
export const NOTA_MIN = 12; // le note del pianoroll stanno tra c0 e c7
export const NOTA_MAX = 108;

// --- nomi delle note ---
const SEMITONI = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const NOMI = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b'];

export function nomeNota(n) {
  const m = Math.round(n);
  return `${NOMI[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

// «c3», «eb2», «f#4», «a» (ottava 3) o un numero midi → numero midi, o null
export function notaDaNome(t) {
  const s = String(t).trim().toLowerCase();
  if (/^-?\d+$/.test(s)) return Number(s);
  const m = /^([a-g])([#bsf]*)(-?\d+)?$/.exec(s);
  if (!m) return null;
  const alt = [...m[2]].reduce((t2, c) => t2 + (c === '#' || c === 's' ? 1 : -1), 0);
  return (Number(m[3] ?? 3) + 1) * 12 + SEMITONI[m[1]] + alt;
}

export const eNero = (n) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);

// --- scale e accordi ---
export const SCALE = {
  cromatica: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  maggiore: [0, 2, 4, 5, 7, 9, 11],
  minore: [0, 2, 3, 5, 7, 8, 10],
  dorica: [0, 2, 3, 5, 7, 9, 10],
  frigia: [0, 1, 3, 5, 7, 8, 10],
  lidia: [0, 2, 4, 6, 7, 9, 11],
  misolidia: [0, 2, 4, 5, 7, 9, 10],
  'pentatonica maggiore': [0, 2, 4, 7, 9],
  'pentatonica minore': [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};
export const ACCORDI = {
  nota: [0],
  magg: [0, 4, 7],
  min: [0, 3, 7],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  5: [0, 7],
};

// La nota più vicina dentro la scala (radice 0–11); a parità, la più bassa. Senza scala (o cromatica) resta com'è.
export function agganciaScala(n, radice = 0, scala = 'cromatica') {
  const gradi = SCALE[scala];
  if (!gradi || scala === 'cromatica') return n;
  for (let d = 0; d <= 6; d++) {
    for (const c of [n - d, n + d]) if (gradi.includes((((c - radice) % 12) + 12) % 12)) return c;
  }
  return n;
}

export const inScala = (n, radice = 0, scala = 'cromatica') => !SCALE[scala] || SCALE[scala].includes((((n - radice) % 12) + 12) % 12);

// --- dalla mini-notazione agli eventi ---

function leggiMini(testo) {
  const src = String(testo);
  let i = 0;
  const salta = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const numero = () => {
    const m = /^-?(?:\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (!m) throw new Error(`manca un numero dopo «${src[i - 1]}»`);
    i += m[0].length;
    return Number(m[0]);
  };
  const intero = (cosa) => {
    const k = numero();
    if (!Number.isInteger(k) || k < 1 || k > 32) throw new Error(`${cosa} vuole un intero da 1 a 32`);
    return k;
  };
  // una pila: sequenze separate da virgole
  const pila = (chiusura) => {
    const voci = [sequenza(chiusura)];
    while (src[i] === ',') {
      i++;
      voci.push(sequenza(chiusura));
    }
    return voci.length === 1 ? voci[0] : { t: 'pila', voci };
  };
  const sequenza = (chiusura) => ({ t: 'seq', passi: passi(chiusura) });
  // i passi fino alla chiusura (o a una virgola): ognuno è un atomo con i suoi modificatori
  const passi = (chiusura) => {
    const lista = [];
    for (;;) {
      salta();
      if (i >= src.length || src[i] === ',' || src[i] === chiusura) break;
      const c = src[i];
      if (c === ']' || c === '>') throw new Error(`«${c}» di troppo`);
      if (c === '_') {
        i++;
        if (!lista.length) throw new Error('una tenuta (_) senza nota prima');
        lista.at(-1).w += 1;
        continue;
      }
      let nodo;
      if (c === '~') {
        i++;
        nodo = { t: 'riposo' };
      } else if (c === '[') {
        i++;
        nodo = pila(']');
        if (src[i] !== ']') throw new Error('manca ]');
        i++;
      } else if (c === '<') {
        i++;
        const figli = passi('>');
        if (src[i] === ',') throw new Error('la virgola dentro <> non si legge');
        if (src[i] !== '>') throw new Error('manca >');
        i++;
        if (!figli.length) throw new Error('<> vuoto');
        nodo = { t: 'alt', figli: figli.map((f) => ({ t: 'seq', passi: [{ w: 1, nodo: f.nodo }] })) };
      } else {
        const m = /^[A-Za-z#]+-?\d*|^-?\d+/.exec(src.slice(i));
        if (!m) throw new Error(`non leggo «${src.slice(i, i + 6)}»`);
        const n = notaDaNome(m[0]);
        if (n === null) throw new Error(`«${m[0]}» non è una nota`);
        i += m[0].length;
        nodo = { t: 'nota', n };
      }
      const passo = { w: 1, nodo };
      for (;;) {
        const x = src[i];
        if (x === '@') {
          i++;
          passo.w = numero();
          if (!(passo.w > 0)) throw new Error('@ vuole un peso positivo');
        } else if (x === '*') {
          i++;
          passo.nodo = { t: 'veloce', k: intero('*n'), nodo: passo.nodo };
        } else if (x === '!') {
          i++;
          const k = /^\d/.test(src[i] ?? '') ? intero('!n') : 2;
          for (let j = 1; j < k; j++) lista.push({ w: passo.w, nodo: passo.nodo });
        } else if (x !== undefined && '?/.|:('.includes(x)) throw new Error(`«${x}» non si legge nel pianoroll`);
        else break;
      }
      lista.push(passo);
    }
    return lista;
  };
  const albero = pila(null);
  salta();
  if (i < src.length) throw new Error(`non leggo «${src.slice(i, i + 6)}»`);
  return albero;
}

function mcm(a, b) {
  let x = a;
  let y = b;
  while (y) [x, y] = [y, x % y];
  return (a * b) / x;
}

// Dopo quanti cicli il pattern si ripete (le alternanze <a b>): 1 se non ce ne sono.
function periodo(nodo) {
  switch (nodo.t) {
    case 'alt':
      return nodo.figli.length * nodo.figli.reduce((p, f) => mcm(p, periodo(f)), 1);
    case 'seq':
      return nodo.passi.reduce((p, x) => mcm(p, periodo(x.nodo)), 1);
    case 'pila':
      return nodo.voci.reduce((p, x) => mcm(p, periodo(x)), 1);
    case 'veloce':
      return periodo(nodo.nodo);
    default:
      return 1;
  }
}

function espandi(nodo, t0, durata, ciclo, fuori) {
  switch (nodo.t) {
    case 'nota':
      fuori.push({ inizio: t0, durata, n: nodo.n });
      return;
    case 'seq': {
      const totale = nodo.passi.reduce((s, p) => s + p.w, 0);
      let cursore = 0;
      for (const p of nodo.passi) {
        espandi(p.nodo, t0 + (durata * cursore) / totale, (durata * p.w) / totale, ciclo, fuori);
        cursore += p.w;
      }
      return;
    }
    case 'pila':
      for (const v of nodo.voci) espandi(v, t0, durata, ciclo, fuori);
      return;
    case 'alt':
      espandi(nodo.figli[ciclo % nodo.figli.length], t0, durata, Math.floor(ciclo / nodo.figli.length), fuori);
      return;
    case 'veloce':
      for (let k = 0; k < nodo.k; k++) espandi(nodo.nodo, t0 + (durata * k) / nodo.k, durata / nodo.k, ciclo * nodo.k + k, fuori);
      return;
    default:
  }
}

// La mini-notazione → { eventi, cicli, fuoriGriglia } oppure { errore }. fuoriGriglia: ci sono note che non cadono sul 1/16
// (terzine, [a b c]…): si vedono ma il pianoroll non le modifica.
export function eventiDaMini(testo) {
  let albero;
  try {
    albero = leggiMini(testo);
  } catch (e) {
    return { errore: String(e.message ?? e) };
  }
  const p = periodo(albero);
  const cicli = CICLI.find((c) => c >= p && c % p === 0);
  if (!cicli) return { errore: `si ripete ogni ${p} cicli: il pianoroll legge 1, 2, 4 o 8` };
  const eventi = [];
  let fuoriGriglia = false;
  for (let c = 0; c < cicli; c++) {
    const trovati = [];
    espandi(albero, 0, 1, c, trovati);
    for (const e of trovati) {
      const i = e.inizio * SCATTI;
      const l = e.durata * SCATTI;
      if (Math.abs(i - Math.round(i)) > 1e-6 || Math.abs(l - Math.round(l)) > 1e-6) fuoriGriglia = true;
      eventi.push({ i: c * SCATTI + i, l, n: e.n });
    }
  }
  eventi.sort((a, b) => a.i - b.i || a.n - b.n);
  return { eventi: fuoriGriglia ? eventi : eventi.map((e) => ({ ...e, i: Math.round(e.i), l: Math.round(e.l) })), cicli, fuoriGriglia };
}

// --- dagli eventi alla mini-notazione ---

// Le note che partono insieme e durano uguale sono un accordo; gli accordi che si sovrappongono vanno su piste separate.
function pisteDelCiclo(eventi, c) {
  const da = c * SCATTI;
  const a = da + SCATTI;
  const gruppi = new Map();
  for (const e of eventi) {
    if (e.i < da || e.i >= a) continue;
    const l = Math.min(e.l, a - e.i); // una nota non esce dal suo ciclo
    const chiave = `${e.i}:${l}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, { i: e.i - da, l, note: [] });
    gruppi.get(chiave).note.push(e.n);
  }
  const lista = [...gruppi.values()].sort((x, y) => x.i - y.i || y.l - x.l);
  const piste = [];
  for (const g of lista) {
    const pista = piste.find((p) => p.fine <= g.i);
    if (pista) {
      pista.gruppi.push(g);
      pista.fine = g.i + g.l;
    } else piste.push({ gruppi: [g], fine: g.i + g.l });
  }
  return piste;
}

const pesato = (testo, l) => (l === 1 ? testo : `${testo}@${l}`);

function pistaInMini(pista) {
  const pezzi = [];
  let cursore = 0;
  for (const g of pista.gruppi) {
    if (g.i > cursore) pezzi.push(pesato('~', g.i - cursore));
    const note = [...new Set(g.note)].sort((a, b) => a - b).map(nomeNota);
    pezzi.push(pesato(note.length === 1 ? note[0] : `[${note.join(',')}]`, g.l));
    cursore = g.i + g.l;
  }
  if (cursore < SCATTI) pezzi.push(pesato('~', SCATTI - cursore));
  // una nota sola lunga quanto il ciclo è solo la nota (un peso dentro <…> allungherebbe il passo)
  return pezzi.length === 1 ? pezzi[0].replace(/@16$/, '') : pezzi.join(' ');
}

// Gli eventi → mini-notazione (un ciclo: la sequenza; più cicli: <[…] […]>). Senza note: «~».
export function miniDaEventi(eventi, cicli = 1) {
  const perCiclo = [];
  for (let c = 0; c < cicli; c++) {
    const piste = pisteDelCiclo(eventi, c);
    perCiclo.push(piste.length ? piste.map(pistaInMini).join(', ') : '~');
  }
  if (cicli === 1) return perCiclo[0];
  // cicli uguali di seguito non servono: <a a> è a
  const tutti = perCiclo.map((x) => (/[,]/.test(x) ? `[${x}]` : x.includes(' ') ? `[${x}]` : x));
  if (tutti.every((x) => x === tutti[0])) return perCiclo[0];
  return `<${tutti.join(' ')}>`;
}

// --- modifiche sugli eventi (immutabili) ---

export function senzaCiclo(eventi, cicli) {
  return eventi.filter((e) => e.i < cicli * SCATTI);
}

// Il pattern portato a più (o meno) cicli: i cicli nuovi ripetono quelli che c'erano, così il suono non cambia.
export function conCicli(eventi, da, a) {
  if (a <= da) return eventi.filter((e) => e.i < a * SCATTI).map((e) => ({ ...e, l: Math.min(e.l, a * SCATTI - e.i) }));
  const fuori = [...eventi];
  for (let c = da; c < a; c++) {
    const k = c % da;
    for (const e of eventi) if (Math.floor(e.i / SCATTI) === k) fuori.push({ ...e, i: e.i + (c - k) * SCATTI });
  }
  return fuori.sort((x, y) => x.i - y.i || x.n - y.n);
}

// Le note dell'accordo (intervalli sopra la radice) come eventi che partono insieme.
export function accordoEventi(radice, tipo, i, l) {
  return (ACCORDI[tipo] ?? ACCORDI.nota).map((d) => ({ i, l, n: radice + d }));
}

// Mette un evento, togliendo quelli identici (stessa altezza, stesso inizio).
export function conEvento(eventi, nuovo) {
  const resto = eventi.filter((e) => !(e.i === nuovo.i && e.n === nuovo.n));
  return [...resto, nuovo].sort((x, y) => x.i - y.i || x.n - y.n);
}

export const senzaEvento = (eventi, e) => eventi.filter((x) => !(x.i === e.i && x.n === e.n));

// --- selezione, appunti, duplicato (le note scelte sono riferimenti { i, n }) ---

const fineCiclo = (i) => (Math.floor(i / SCATTI) + 1) * SCATTI;
const eScelta = (sel, e) => sel.some((s) => s.i === e.i && s.n === e.n);
const riferimento = (e) => ({ i: e.i, n: e.n });

// Le note che toccano il rettangolo (scatti i0..i1, altezze n0..n1, estremi compresi).
export function nelRettangolo(eventi, { i0, i1, n0, n1 }) {
  const [a, b] = [Math.min(i0, i1), Math.max(i0, i1)];
  const [lo, hi] = [Math.min(n0, n1), Math.max(n0, n1)];
  return eventi.filter((e) => e.n >= lo && e.n <= hi && e.i <= b && e.i + e.l - 1 >= a).map(riferimento);
}

// Le scelte unite, senza doppioni.
export const uniscisel = (a, b) => [...a, ...b.filter((x) => !eScelta(a, x))];

// Le note scelte spostate di di scatti e dn semitoni. Si fermano al bordo (primo/ultimo scatto, c0–c7) tutte insieme;
// una nota non esce dal suo ciclo. Quelle sotto cui arrivano restano coperte. Ritorna anche di e dn davvero applicati.
export function muovi(eventi, sel, di, dn, cicli) {
  const scelte = eventi.filter((e) => eScelta(sel, e));
  if (!scelte.length) return { eventi, sel, di: 0, dn: 0 };
  const iMin = Math.min(...scelte.map((e) => e.i));
  const iMax = Math.max(...scelte.map((e) => e.i));
  const nMin = Math.min(...scelte.map((e) => e.n));
  const nMax = Math.max(...scelte.map((e) => e.n));
  const tetto = cicli * SCATTI; // il pattern finisce qui
  const d = Math.max(-iMin, Math.min(tetto - 1 - iMax, di));
  const t = Math.max(NOTA_MIN - nMin, Math.min(NOTA_MAX - nMax, dn));
  const mosse = scelte.map((e) => {
    const i = e.i + d;
    return { i, l: Math.min(e.l, fineCiclo(i) - i), n: e.n + t };
  });
  const resto = eventi.filter((e) => !eScelta(sel, e) && !mosse.some((m) => m.i === e.i && m.n === e.n));
  return { eventi: [...resto, ...mosse].sort((x, y) => x.i - y.i || x.n - y.n), sel: mosse.map(riferimento), di: d, dn: t };
}

// Trasporre di delta semitoni: o tutte o niente (se una uscisse da c0–c7 non si muove nulla).
export function trasponi(eventi, sel, delta, cicli) {
  const r = muovi(eventi, sel, 0, delta, cicli);
  return r.dn === delta ? r : { eventi, sel, di: 0, dn: 0 };
}

// Le note scelte allungate (o accorciate) di dl scatti, ognuna dentro il suo ciclo.
export function allunga(eventi, sel, dl) {
  return eventi.map((e) => (eScelta(sel, e) ? { ...e, l: Math.max(1, Math.min(fineCiclo(e.i) - e.i, e.l + dl)) } : e));
}

export const senzaScelte = (eventi, sel) => eventi.filter((e) => !eScelta(sel, e));

// Gli appunti: le note scelte con l'inizio contato da quella che parte per prima, e quanto dura il blocco.
export function appunti(eventi, sel) {
  const scelte = eventi.filter((e) => eScelta(sel, e));
  if (!scelte.length) return null;
  const da = Math.min(...scelte.map((e) => e.i));
  return { note: scelte.map((e) => ({ d: e.i - da, l: e.l, n: e.n })), durata: Math.max(...scelte.map((e) => e.i + e.l)) - da };
}

// Gli appunti messi a partire dallo scatto i0. Quelle che cadono oltre la fine del pattern si scartano (fuori = quante).
export function incolla(eventi, clip, i0, cicli) {
  const fine = cicli * SCATTI;
  const nuove = [];
  let fuori = 0;
  for (const c of clip.note) {
    const i = i0 + c.d;
    if (i < 0 || i >= fine) fuori++;
    else nuove.push({ i, l: Math.min(c.l, fineCiclo(i) - i), n: c.n });
  }
  const resto = eventi.filter((e) => !nuove.some((m) => m.i === e.i && m.n === e.n));
  return { eventi: [...resto, ...nuove].sort((x, y) => x.i - y.i || x.n - y.n), sel: nuove.map(riferimento), fuori, fine: i0 + clip.durata };
}

// Duplica le note scelte subito dopo il blocco (come ⌘D di Ableton).
export function duplica(eventi, sel, cicli) {
  const clip = appunti(eventi, sel);
  if (!clip) return null;
  const da = Math.min(...eventi.filter((e) => eScelta(sel, e)).map((e) => e.i));
  return incolla(eventi, clip, da + clip.durata, cicli);
}
