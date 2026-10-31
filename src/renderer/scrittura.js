// La scrittura «umana» del codice sul proiettore. Funzioni pure (lo provano i test): il disegno vero è in uscita.js.
//  - un livello nuovo si scrive da zero; uno che ne sostituisce un altro con lo stesso nome non si riscrive tutto: il cursore va
//    nel punto cambiato, cancella il vecchio e scrive il nuovo;
//  - la velocità varia a raffiche (parole veloci, poi un'esitazione, soprattutto prima dei numeri), con piccole pause dopo . , ( e
//    più lunghe a fine riga; ogni tanto si ferma a metà parola col cursore che lampeggia; i refusi (rari, spenti di default) si
//    scrivono sbagliati, si vedono un attimo e si correggono: è tutto solo visivo, al motore arriva sempre il codice giusto;
//  - velocità, imperfezione e refusi si regolano nelle impostazioni (`opz`);
//  - l'ultimo carattere arriva esattamente quando il suono entra: se c'è tempo si parte più tardi, se ce n'è poco si va più svelti;
//  - una modifica per volta: se ne arriva un'altra mentre sta ancora scrivendo, la prima si finisce di corsa e poi parte la nuova.
// Tutto è solo visivo: la musica non dipende mai da questo.

export const MS_PER_UNITA = 70; // un carattere medio, a velocità naturale (circa 14 al secondo)
const SALTO = 5; // il cursore va al punto cambiato
const CANCELLA = 0.3; // un carattere cancellato
export const RUSH_MS = 450; // la scrittura che stava finendo, quando ne arriva un'altra

// un generatore di numeri a caso che, dallo stesso testo, dà sempre gli stessi numeri (i ridisegni coincidono)
function mulberry32(seme) {
  let a = seme >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seme = (testo) => [...testo].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// Le regolazioni: velocità (1 = naturale), imperfezione (0 = regolare … 1 = molto umana), refusi (0 = mai … 1 = ogni tanto).
export const OPZIONI = { velocita: 1, imperfezione: 0.5, refusi: 0 };
const fra = (x, min, max, predefinito) => (Number.isFinite(Number(x)) ? Math.min(max, Math.max(min, Number(x))) : predefinito);
export const norma = (o = {}) => ({
  velocita: fra(o.velocita, 0.4, 3, OPZIONI.velocita),
  imperfezione: fra(o.imperfezione, 0, 1, OPZIONI.imperfezione),
  refusi: fra(o.refusi, 0, 1, OPZIONI.refusi),
});

// i tasti vicini sulla tastiera: dove cade un refuso
const VICINI = {
  q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'ryg', y: 'tuh', u: 'yij', i: 'uok', o: 'ipl', p: 'ol',
  a: 'qsz', s: 'awdx', d: 'sefc', f: 'drgv', g: 'fthb', h: 'gyjn', j: 'hukm', k: 'jil', l: 'kop',
  z: 'asx', x: 'zsc', c: 'xdv', v: 'cfb', b: 'vgn', n: 'bhm', m: 'nj',
};
const eLettera = (c) => c !== undefined && /[a-z]/i.test(c);
const eCifra = (c) => c !== undefined && /\d/.test(c);

// Per ogni carattere: quanto aspetta il cursore prima (`attesa`), quanto dura il refuso (`refuso`, con il carattere sbagliato in
// `sbagliato`) e quanto dura battere (`tocco`), in unità. Sempre gli stessi dallo stesso testo: i ridisegni coincidono.
export function dettagli(testo, opz) {
  const { imperfezione: imp, refusi } = norma(opz);
  const caso = mulberry32(seme(testo));
  const n = testo.length;
  const attesa = new Float64Array(n);
  const tocco = new Float64Array(n);
  const refuso = new Float64Array(n);
  const sbagliato = new Array(n).fill(null);
  let inizioRiga = true;
  let raffica = 0;
  let veloce = false;
  for (let i = 0; i < n; i++) {
    const c = testo[i];
    const prima = testo[i - 1];
    const r = [caso(), caso(), caso(), caso(), caso(), caso()]; // sempre le stesse estrazioni per carattere
    let t = 0.6 + r[0] * 0.9;
    if (c === ' ' && inizioRiga) t = 0.12;
    else inizioRiga = c === '\n';
    if (c === ' ' && !inizioRiga) t *= 0.7;
    let a = 0;
    // a raffiche: parole veloci, poi un'esitazione prima di ripartire
    if (raffica <= 0) {
      const eraVeloce = veloce;
      veloce = r[1] < 0.5 + 0.25 * imp;
      raffica = veloce ? 4 + Math.floor(r[2] * 10) : 3 + Math.floor(r[2] * 6);
      if (i > 0 && eraVeloce) a += (1.2 + r[3] * 3.5) * imp;
    }
    raffica--;
    t *= veloce ? 1 - 0.6 * imp : 1 + 0.25 * imp;
    if (prima === '.' || prima === ',' || prima === '(') a += 1.6 + r[4] * 1.4; // dopo . , (
    if (c === '\n') a += 5 + r[4] * 3; // a fine riga
    if (eCifra(c) && !eCifra(prima) && prima !== '.' && r[4] < 0.8) a += (1.5 + r[5] * 3.5) * (0.4 + 0.8 * imp); // prima dei numeri
    // ogni tanto si ferma a metà parola
    if (imp > 0 && eLettera(c) && eLettera(prima) && eLettera(testo[i + 1]) && r[5] < 0.012 + 0.03 * imp) a += 6 + r[3] * 8;
    // refusi: un tasto vicino, sbagliato e corretto subito
    if (refusi > 0 && eLettera(c) && r[2] < refusi * 0.02 && VICINI[c.toLowerCase()]) {
      const vicini = VICINI[c.toLowerCase()];
      const x = vicini[Math.floor(r[1] * vicini.length)];
      sbagliato[i] = c === c.toUpperCase() ? x.toUpperCase() : x;
      refuso[i] = 3.8 + r[4] * 1.5;
    }
    attesa[i] = a;
    tocco[i] = t;
  }
  return { attesa, tocco, refuso, sbagliato };
}

// Quanto dura ogni carattere in tutto: attesa + refuso + tocco.
export function pesi(testo, opz) {
  const d = dettagli(testo, opz);
  return d.tocco.map((t, i) => d.attesa[i] + d.refuso[i] + t);
}

const IN_VISTA = 0.7; // la parte del refuso in cui il carattere sbagliato si vede, prima che lo cancelli
const LAMPEGGIA = 3; // un'attesa più lunga di così è una vera pausa: il cursore lampeggia

// Il tratto che cambia tra due testi: l'inizio uguale, quello tolto, quello nuovo, la fine uguale.
export function diffTesto(vecchio, nuovo) {
  let pre = 0;
  const max = Math.min(vecchio.length, nuovo.length);
  while (pre < max && vecchio[pre] === nuovo[pre]) pre++;
  let suf = 0;
  while (suf < max - pre && vecchio[vecchio.length - 1 - suf] === nuovo[nuovo.length - 1 - suf]) suf++;
  return {
    pre,
    tolti: vecchio.slice(pre, vecchio.length - suf),
    aggiunti: nuovo.slice(pre, nuovo.length - suf),
    suf,
  };
}

const memoria = new Map();
// Il piano di una scrittura da `base` a `testo`: le fasi e quanto durano, in unità.
export function piano(base, testo, opz) {
  const o = norma(opz);
  const chiave = `${o.velocita}|${o.imperfezione}|${o.refusi}|${base.length}:${base}\u0001${testo}`;
  if (memoria.has(chiave)) return memoria.get(chiave);
  const d = diffTesto(base, testo);
  const det = dettagli(d.aggiunti, o);
  const cum = new Float64Array(d.aggiunti.length + 1); // quando comincia ogni carattere (la sua attesa compresa)
  for (let i = 0; i < d.aggiunti.length; i++) cum[i + 1] = cum[i] + det.attesa[i] + det.refuso[i] + det.tocco[i];
  const salto = base && (d.tolti || d.pre < base.length) ? SALTO : 0;
  const cancella = d.tolti.length * CANCELLA;
  const battitura = cum[d.aggiunti.length];
  const p = { base, testo, ...d, salto, cancella, battitura, cum, det, msPerUnita: MS_PER_UNITA / o.velocita, totale: salto + cancella + battitura };
  memoria.set(chiave, p);
  if (memoria.size > 120) memoria.delete(memoria.keys().next().value);
  return p;
}

export const durataNaturaleMs = (p) => p.totale * (p.msPerUnita ?? MS_PER_UNITA);

// Cosa si vede dopo `x` unità: il testo prima del cursore, quello che sta per essere scritto (invisibile, ma al suo posto, così
// il livello non cambia altezza mentre si scrive), e quello che resta dopo il cursore (visibile: è codice che c'era già).
export function vedi(p, x) {
  const pre = p.testo.slice(0, p.pre);
  const suf = p.suf ? p.testo.slice(p.testo.length - p.suf) : '';
  if (p.totale <= 0 || x >= p.totale) return { prima: p.testo, nascosto: '', dopo: '', cursore: false, fatto: true, lampeggia: false };
  if (x < p.salto) return { prima: p.base.slice(0, p.pre), nascosto: '', dopo: p.base.slice(p.pre), cursore: true, fatto: false, lampeggia: false };
  const y = x - p.salto;
  if (y < p.cancella) {
    const cancellati = Math.ceil(y / CANCELLA);
    return { prima: pre + p.tolti.slice(0, p.tolti.length - cancellati), nascosto: '', dopo: suf, cursore: true, fatto: false, lampeggia: false };
  }
  const z = y - p.cancella;
  // quanti caratteri sono già stati battuti: l'ultimo cum[n] <= z
  let basso = 0;
  let alto = p.aggiunti.length;
  while (basso < alto) {
    const m = (basso + alto + 1) >> 1;
    if (p.cum[m] <= z) basso = m;
    else alto = m - 1;
  }
  const scritto = pre + p.aggiunti.slice(0, basso);
  const intero = { prima: scritto, nascosto: p.aggiunti.slice(basso), dopo: suf, cursore: true, fatto: false, lampeggia: false };
  const det = p.det;
  if (!det || basso >= p.aggiunti.length) return intero;
  // il carattere che si sta battendo adesso: prima aspetta, poi (a volte) sbaglia e corregge, poi lo batte
  const o = z - p.cum[basso];
  const attesa = det.attesa[basso];
  if (o < attesa) return { ...intero, lampeggia: attesa >= LAMPEGGIA };
  const r = det.refuso[basso];
  if (r > 0 && o - attesa < r) {
    // il carattere sbagliato si vede (e il cursore lampeggia: se n'è accorto), poi sparisce
    if (o - attesa < r * IN_VISTA) return { ...intero, prima: scritto + det.sbagliato[basso], nascosto: p.aggiunti.slice(basso + 1), lampeggia: o - attesa > 1 };
    return { ...intero, lampeggia: false };
  }
  return intero;
}

// Quando comincia a scrivere: la fine è il momento in cui il livello entra. Se c'è più tempo del necessario parte più tardi,
// se ce n'è meno va più svelto (parte da `richiesto` e arriva comunque alla fine).
export function inizioScrittura(p, richiesto, fine) {
  return Math.max(richiesto, fine - durataNaturaleMs(p));
}

// A che punto è: da 0 a p.totale unità, all'epoca data.
export function unitaA(p, richiesto, fine, epoca) {
  const inizio = inizioScrittura(p, richiesto, fine);
  if (epoca <= inizio) return 0;
  if (epoca >= fine) return p.totale;
  return ((epoca - inizio) / Math.max(1, fine - inizio)) * p.totale;
}

// Le scritture in corso, una per livello: tiene da parte quella che stava finendo quando ne arriva una sul livello con lo stesso nome.
export class Scrittore {
  constructor() {
    this.scritture = new Map(); // id del livello → { piano, richiesto, rush: { p, da, x0, finoA } | null }
  }

  // base: il testo da cui si parte ('' se è nuovo); `vecchioId` il livello che sostituisce, se ce n'è uno.
  stato(id, base, testo, richiesto, fine, epoca, vecchioId = null, opz = undefined) {
    let s = this.scritture.get(id);
    if (!s) {
      s = { piano: piano(base, testo, opz), richiesto, rush: null };
      // il livello che sostituisco stava ancora scrivendo: lo finisco di corsa, poi parto io
      const prima = vecchioId !== null ? this.scritture.get(vecchioId) : null;
      if (prima) {
        const x0 = unitaA(prima.piano, prima.richiesto, prima.fine ?? fine, epoca);
        if (x0 < prima.piano.totale) s.rush = { piano: prima.piano, x0, da: epoca, finoA: epoca + RUSH_MS };
      }
      this.scritture.set(id, s);
      if (this.scritture.size > 40) this.scritture.delete(this.scritture.keys().next().value);
    }
    s.fine = fine;
    if (s.rush) {
      if (epoca < s.rush.finoA) {
        const f = (epoca - s.rush.da) / RUSH_MS;
        return { ...vedi(s.rush.piano, s.rush.x0 + (s.rush.piano.totale - s.rush.x0) * f), rush: true };
      }
      // la scrittura nuova usa il tempo che resta dopo la corsa
      richiesto = Math.max(richiesto, s.rush.finoA);
    }
    return { ...vedi(s.piano, unitaA(s.piano, richiesto, fine, epoca)), rush: false };
  }

  dimentica(id) {
    this.scritture.delete(id);
  }
}
