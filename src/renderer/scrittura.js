// La scrittura «umana» del codice sul proiettore. Funzioni pure (lo provano i test): il disegno vero è in uscita.js.
//  - un livello nuovo si scrive da zero; uno che ne sostituisce un altro con lo stesso nome non si riscrive tutto: il cursore va
//    nel punto cambiato, cancella il vecchio e scrive il nuovo;
//  - la velocità varia, con piccole pause dopo . , ( e pause più lunghe a fine riga; niente errori finti, il testo si rivela e basta;
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

// Quanto dura battere ogni carattere (in unità): un po' a caso, più lento dopo . , ( e a fine riga, quasi niente per l'indentazione.
export function pesi(testo) {
  const caso = mulberry32(seme(testo));
  const w = new Float64Array(testo.length);
  let inizioRiga = true;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    let p = 0.6 + caso() * 0.9;
    if (c === ' ' && inizioRiga) p = 0.12;
    else inizioRiga = c === '\n';
    if (c === ' ' && !inizioRiga) p *= 0.7;
    if (c === '.' || c === ',' || c === '(') p += 1.6 + caso() * 1.4;
    if (c === '\n') p += 5 + caso() * 3;
    w[i] = p;
  }
  return w;
}

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
export function piano(base, testo) {
  const chiave = `${base.length}:${base}\u0001${testo}`;
  if (memoria.has(chiave)) return memoria.get(chiave);
  const d = diffTesto(base, testo);
  const w = pesi(d.aggiunti);
  const cum = new Float64Array(w.length + 1);
  for (let i = 0; i < w.length; i++) cum[i + 1] = cum[i] + w[i];
  const salto = base && (d.tolti || d.pre < base.length) ? SALTO : 0;
  const cancella = d.tolti.length * CANCELLA;
  const p = { base, testo, ...d, salto, cancella, battitura: cum[w.length], cum, totale: salto + cancella + cum[w.length] };
  memoria.set(chiave, p);
  if (memoria.size > 120) memoria.delete(memoria.keys().next().value);
  return p;
}

export const durataNaturaleMs = (p) => p.totale * MS_PER_UNITA;

// Cosa si vede dopo `x` unità: il testo prima del cursore, quello che sta per essere scritto (invisibile, ma al suo posto, così
// il livello non cambia altezza mentre si scrive), e quello che resta dopo il cursore (visibile: è codice che c'era già).
export function vedi(p, x) {
  const pre = p.testo.slice(0, p.pre);
  const suf = p.suf ? p.testo.slice(p.testo.length - p.suf) : '';
  if (p.totale <= 0 || x >= p.totale) return { prima: p.testo, nascosto: '', dopo: '', cursore: false, fatto: true };
  if (x < p.salto) return { prima: p.base.slice(0, p.pre), nascosto: '', dopo: p.base.slice(p.pre), cursore: true, fatto: false };
  const y = x - p.salto;
  if (y < p.cancella) {
    const cancellati = Math.ceil(y / CANCELLA);
    return { prima: pre + p.tolti.slice(0, p.tolti.length - cancellati), nascosto: '', dopo: suf, cursore: true, fatto: false };
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
  return { prima: pre + p.aggiunti.slice(0, basso), nascosto: p.aggiunti.slice(basso), dopo: suf, cursore: true, fatto: false };
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
  stato(id, base, testo, richiesto, fine, epoca, vecchioId = null) {
    let s = this.scritture.get(id);
    if (!s) {
      s = { piano: piano(base, testo), richiesto, rush: null };
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
