// Le note del SYNTH: il pianoroll e la mini-notazione sono la STESSA cosa, e si convertono avanti e indietro.
// Un evento è { i, l, n }: parte allo scatto i (1/16 di ciclo, contati da 0 su tutti i cicli), dura l scatti, altezza n (midi, c3 = 48).
// Modulo puro: lo provano i test. Sottoinsieme della mini-notazione che si legge: note (c3 eb3 f#2 o numeri midi), riposo ~, tenuta _,
// peso @n, ripetizione *n e !n, gruppi [ ], accordi [c3,e3,g3], alternanze <a b>, pile con la virgola. Altro (? / . | euclidei) non si
// legge: il pianoroll lo dice e il testo resta com'è.

export const SCATTI = 16; // scatti per ciclo (griglia 1/16)
export const GRIGLIE = [16, 12, 32, 24, 48]; // scatti per ciclo che il pianoroll sa usare: 1/16, terzine (1/12), 1/32 e i loro doppi
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

// Le scale di Strudel che il pianoroll conosce (nome tonal → nome del pianoroll). Un'altra scala resta scritta a mano.
const SCALE_STRUDEL = {
  major: 'maggiore', ionian: 'maggiore', minor: 'minore', aeolian: 'minore', dorian: 'dorica', phrygian: 'frigia', lydian: 'lidia', mixolydian: 'misolidia',
  'major pentatonic': 'pentatonica maggiore', 'minor pentatonic': 'pentatonica minore', blues: 'blues',
};

// «A2:minor», «C3:minor:pentatonic», «D:dorian» → { tipo (nome del pianoroll), radice 0–11, base (la tonica, midi), gradi } o null.
// Come in Strudel: la stringa passa dalla mini-notazione, quindi niente spazi (due parole sarebbero due passi) e i due punti fanno da spazio.
// Senza ottava la tonica è all'ottava 3.
export function leggiScala(spec) {
  if (typeof spec !== 'string' || spec.length > 120) return null;
  // una scala diversa a ogni ciclo: <A:minor F:major E:major> (le alternanze si leggono; il pianoroll prende per radice e tipo la prima)
  const turni = /^<([^<>]+)>$/.exec(spec.trim());
  if (turni) {
    const lista = turni[1].trim().split(/\s+/).map(leggiScala);
    return lista.length >= 1 && lista.length <= 8 && lista.every((x) => x && !x.lista) ? { ...lista[0], lista } : null;
  }
  if (spec.length > 60 || /\s/.test(spec)) return null;
  const [tonica, ...nome] = spec.split(':');
  const m = /^([A-Ga-g])([#b]?)(-?\d)?$/.exec(tonica);
  const tipo = SCALE_STRUDEL[nome.join(' ').toLowerCase()];
  if (!m || !tipo) return null;
  const alt = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const pc = SEMITONI[m[1].toLowerCase()] + alt;
  const ottava = m[3] === undefined ? 3 : Number(m[3]);
  return { tipo, radice: ((pc % 12) + 12) % 12, base: (ottava + 1) * 12 + pc, gradi: SCALE[tipo] };
}

// La scala che vale al ciclo c (se sono alternate, a turno).
export const scalaDelCiclo = (sc, c) => (sc.lista ? sc.lista[((c % sc.lista.length) + sc.lista.length) % sc.lista.length] : sc);

// Il grado della scala (0 = la tonica, 7 = l'ottava sopra in una scala di sette note, −1 = sotto) → nota midi, e ritorno (null se la nota non è nella scala).
export function gradoInNota(g, sc) {
  const L = sc.gradi.length;
  return sc.base + 12 * Math.floor(g / L) + sc.gradi[((g % L) + L) % L];
}
export function notaInGrado(n, sc) {
  const d = n - sc.base;
  const ottava = Math.floor(d / 12);
  const k = sc.gradi.indexOf(d - 12 * ottava);
  return k < 0 ? null : ottava * sc.gradi.length + k;
}

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

function leggiMini(testo, scala = null) {
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
        // con n(…).scale(…) i numeri sono gradi della scala (la nota vera si sa dopo: dipende dal ciclo)
        const g = scala && /^-?\d+$/.test(m[0]) ? Number(m[0]) : null;
        const n = scala ? 0 : notaDaNome(m[0]);
        if (scala ? g === null : n === null) throw new Error(scala ? `«${m[0]}»: con la scala vogliono numeri (gradi)` : `«${m[0]}» non è una nota`);
        i += m[0].length;
        nodo = { t: 'nota', n, g };
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
      fuori.push({ inizio: t0, durata, n: nodo.n, g: nodo.g });
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

// La mini-notazione → { eventi, cicli, griglia, fuoriGriglia } oppure { errore }. La griglia è quanti scatti ha un ciclo (16, o 12 per
// le terzine…): la prima di GRIGLIE su cui cadono tutte le note (prima quella chiesta, se c'è). fuoriGriglia: non cade su nessuna (si vede
// ma il pianoroll non la modifica). Con { scala } i numeri sono gradi della scala (n("0 2 4").scale("C:major")).
export function eventiDaMini(testo, { scala = null, griglia = null } = {}) {
  let albero;
  try {
    albero = leggiMini(testo, scala);
  } catch (e) {
    return { errore: String(e.message ?? e) };
  }
  const p = scala?.lista ? mcm(periodo(albero), scala.lista.length) : periodo(albero);
  const cicli = CICLI.find((c) => c >= p && c % p === 0);
  if (!cicli) return { errore: `si ripete ogni ${p} cicli: il pianoroll legge 1, 2, 4 o 8` };
  const grezzi = [];
  for (let c = 0; c < cicli; c++) {
    const trovati = [];
    espandi(albero, 0, 1, c, trovati);
    for (const e of trovati) grezzi.push({ ciclo: c, inizio: e.inizio, durata: e.durata, n: scala ? gradoInNota(e.g, scalaDelCiclo(scala, c)) : e.n });
  }
  const cade = (x, g) => Math.abs(x * g - Math.round(x * g)) < 1e-6;
  const scelta = [griglia, ...GRIGLIE].filter(Boolean).find((g) => grezzi.every((e) => cade(e.inizio, g) && cade(e.durata, g)));
  const g = scelta ?? SCATTI;
  const eventi = grezzi.map((e) => ({ i: e.ciclo * g + e.inizio * g, l: e.durata * g, n: e.n }));
  eventi.sort((a, b) => a.i - b.i || a.n - b.n);
  return { eventi: scelta ? eventi.map((e) => ({ ...e, i: Math.round(e.i), l: Math.round(e.l) })) : eventi, cicli, griglia: g, fuoriGriglia: !scelta };
}

// --- dagli eventi alla mini-notazione ---

// Le note che partono insieme e durano uguale sono un accordo; gli accordi che si sovrappongono vanno su piste separate.
function pisteDelCiclo(eventi, c, g) {
  const da = c * g;
  const a = da + g;
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
  for (const gr of lista) {
    const pista = piste.find((p) => p.fine <= gr.i);
    if (pista) {
      pista.gruppi.push(gr);
      pista.fine = gr.i + gr.l;
    } else piste.push({ gruppi: [gr], fine: gr.i + gr.l });
  }
  return piste;
}

const mcd = (a, b) => (b ? mcd(b, a % b) : a);
const pesato = (testo, l) => (l === 1 ? testo : `${testo}@${l}`);

function pistaInMini(pista, g, scrivi, ciclo) {
  const pezzi = []; // { testo, peso }
  let cursore = 0;
  for (const gr of pista.gruppi) {
    if (gr.i > cursore) pezzi.push({ testo: '~', peso: gr.i - cursore });
    const note = [...new Set(gr.note)].sort((a, b) => a - b).map((n) => scrivi(n, ciclo));
    pezzi.push({ testo: note.length === 1 ? note[0] : `[${note.join(',')}]`, peso: gr.l });
    cursore = gr.i + gr.l;
  }
  if (cursore < g) pezzi.push({ testo: '~', peso: g - cursore });
  // i pesi contano solo fra loro: se sono tutti multipli dello stesso numero si dividono (a b c d invece di a@2 b@2 c@2 d@2)
  const comune = pezzi.reduce((m, x) => mcd(m, x.peso), 0) || 1;
  const scritti = pezzi.map((x) => pesato(x.testo, x.peso / comune));
  // una nota sola lunga quanto il ciclo è solo la nota (un peso dentro <…> allungherebbe il passo)
  return pezzi.length === 1 ? pezzi[0].testo : scritti.join(' ');
}

// Gli eventi → mini-notazione (un ciclo: la sequenza; più cicli: <[…] […]>). Senza note: «~».
export function miniDaEventi(eventi, cicli = 1, g = SCATTI, scrivi = nomeNota) {
  const perCiclo = [];
  for (let c = 0; c < cicli; c++) {
    const piste = pisteDelCiclo(eventi, c, g);
    perCiclo.push(piste.length ? piste.map((pista) => pistaInMini(pista, g, scrivi, c)).join(', ') : '~');
  }
  if (cicli === 1) return perCiclo[0];
  // cicli uguali di seguito non servono: <a a> è a
  const tutti = perCiclo.map((x) => (/[,]/.test(x) ? `[${x}]` : x.includes(' ') ? `[${x}]` : x));
  if (tutti.every((x) => x === tutti[0])) return perCiclo[0];
  return `<${tutti.join(' ')}>`;
}

// --- modifiche sugli eventi (immutabili) ---

export function senzaCiclo(eventi, cicli, g = SCATTI) {
  return eventi.filter((e) => e.i < cicli * g);
}

// Il pattern portato a più (o meno) cicli: i cicli nuovi ripetono quelli che c'erano, così il suono non cambia.
export function conCicli(eventi, da, a, g = SCATTI) {
  if (a <= da) return eventi.filter((e) => e.i < a * g).map((e) => ({ ...e, l: Math.min(e.l, a * g - e.i) }));
  const fuori = [...eventi];
  for (let c = da; c < a; c++) {
    const k = c % da;
    for (const e of eventi) if (Math.floor(e.i / g) === k) fuori.push({ ...e, i: e.i + (c - k) * g });
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

const fineCiclo = (i, g = SCATTI) => (Math.floor(i / g) + 1) * g;
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
export function muovi(eventi, sel, di, dn, cicli, g = SCATTI) {
  const scelte = eventi.filter((e) => eScelta(sel, e));
  if (!scelte.length) return { eventi, sel, di: 0, dn: 0 };
  const iMin = Math.min(...scelte.map((e) => e.i));
  const iMax = Math.max(...scelte.map((e) => e.i));
  const nMin = Math.min(...scelte.map((e) => e.n));
  const nMax = Math.max(...scelte.map((e) => e.n));
  const tetto = cicli * g; // il pattern finisce qui
  const d = Math.max(-iMin, Math.min(tetto - 1 - iMax, di));
  const t = Math.max(NOTA_MIN - nMin, Math.min(NOTA_MAX - nMax, dn));
  const mosse = scelte.map((e) => {
    const i = e.i + d;
    return { i, l: Math.min(e.l, fineCiclo(i, g) - i), n: e.n + t };
  });
  const resto = eventi.filter((e) => !eScelta(sel, e) && !mosse.some((m) => m.i === e.i && m.n === e.n));
  return { eventi: [...resto, ...mosse].sort((x, y) => x.i - y.i || x.n - y.n), sel: mosse.map(riferimento), di: d, dn: t };
}

// Trasporre di delta semitoni: o tutte o niente (se una uscisse da c0–c7 non si muove nulla).
export function trasponi(eventi, sel, delta, cicli, g = SCATTI) {
  const r = muovi(eventi, sel, 0, delta, cicli, g);
  return r.dn === delta ? r : { eventi, sel, di: 0, dn: 0 };
}

// Le note scelte allungate (o accorciate) di dl scatti, ognuna dentro il suo ciclo.
export function allunga(eventi, sel, dl, g = SCATTI) {
  return eventi.map((e) => (eScelta(sel, e) ? { ...e, l: Math.max(1, Math.min(fineCiclo(e.i, g) - e.i, e.l + dl)) } : e));
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
export function incolla(eventi, clip, i0, cicli, g = SCATTI) {
  const fine = cicli * g;
  const nuove = [];
  let fuori = 0;
  for (const c of clip.note) {
    const i = i0 + c.d;
    if (i < 0 || i >= fine) fuori++;
    else nuove.push({ i, l: Math.min(c.l, fineCiclo(i, g) - i), n: c.n });
  }
  const resto = eventi.filter((e) => !nuove.some((m) => m.i === e.i && m.n === e.n));
  return { eventi: [...resto, ...nuove].sort((x, y) => x.i - y.i || x.n - y.n), sel: nuove.map(riferimento), fuori, fine: i0 + clip.durata };
}

// Duplica le note scelte subito dopo il blocco (come ⌘D di Ableton).
export function duplica(eventi, sel, cicli, g = SCATTI) {
  const clip = appunti(eventi, sel);
  if (!clip) return null;
  const da = Math.min(...eventi.filter((e) => eScelta(sel, e)).map((e) => e.i));
  return incolla(eventi, clip, da + clip.durata, cicli, g);
}

// --- scrittura a passi ---

// Le note (un accordo, se sono più d'una) scritte allo scatto `cursore`, lunghe `lunghezza` (una nota non esce dal suo ciclo).
// fuori = quante non ci stanno (il cursore è oltre la fine). Quelle uguali già lì (stessa altezza, stesso inizio) si sostituiscono.
export function scriviPasso(eventi, cursore, lunghezza, note, cicli, g = SCATTI) {
  if (cursore < 0 || cursore >= cicli * g) return { eventi, sel: [], fuori: note.length };
  const l = Math.max(1, Math.min(lunghezza, fineCiclo(cursore, g) - cursore));
  const nuove = note.filter((n) => n >= NOTA_MIN && n <= NOTA_MAX).map((n) => ({ i: cursore, l, n }));
  const resto = eventi.filter((e) => !nuove.some((m) => m.i === e.i && m.n === e.n));
  return { eventi: [...resto, ...nuove].sort((x, y) => x.i - y.i || x.n - y.n), sel: nuove.map(riferimento), fuori: 0 };
}

// Un passo indietro: il cursore va a `cursore − lunghezza` (non sotto 0) e le note che partono in quel passo si tolgono.
export function indietroPasso(eventi, cursore, lunghezza) {
  const nuovo = Math.max(0, cursore - lunghezza);
  return { eventi: eventi.filter((e) => e.i < nuovo || e.i >= nuovo + lunghezza), cursore: nuovo };
}
