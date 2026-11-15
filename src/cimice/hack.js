// Il finale «HACK»: la cimice si prende il codice e chiude il set. Qui c'è solo la curva (puro, si prova con i test):
// dato a che punto siamo (f = 0…1 della durata scelta) dice cosa deve succedere. Chi esegue è hack-app.js.

export const HACK = { minMinuti: 1, maxMinuti: 3, predefinitoMinuti: 2 };

// Punti della curva: da f fino al successivo. ogni = ogni quante battute tenta un dispetto (null = nessuno), insieme = quanti
// dispetti insieme al massimo, secondi = durata massima di un dispetto, cimici = quante sul proiettore, mangia = quanto codice è mangiato (0…1),
// volume = quanto resta del volume dei livelli (0…1; mai sopra 1).
const PUNTI = [
  { f: 0.0, ogni: null, insieme: 0, secondi: 2, cimici: 1, mangia: 0, volume: 1 },
  { f: 0.1, ogni: 2, insieme: 1, secondi: 2, cimici: 1, mangia: 0, volume: 1 },
  { f: 0.3, ogni: 1, insieme: 3, secondi: 4, cimici: 2, mangia: 0.08, volume: 1 },
  { f: 0.55, ogni: 0.5, insieme: 3, secondi: 4, cimici: 4, mangia: 0.4, volume: 0.85 },
  { f: 0.8, ogni: 0.25, insieme: 3, secondi: 4, cimici: 6, mangia: 0.85, volume: 0.5 },
  { f: 0.95, ogni: 0.25, insieme: 3, secondi: 4, cimici: 8, mangia: 1, volume: 0 },
  { f: 1.0, ogni: null, insieme: 0, secondi: 2, cimici: 8, mangia: 1, volume: 0 },
];
const lerp = (a, b, t) => a + (b - a) * t;

// I numeri della curva al punto f. `ogni` e `insieme` sono a gradini (dal punto in cui sei), il resto scorre.
export function curva(f) {
  const x = Math.max(0, Math.min(1, f));
  let i = PUNTI.findIndex((p, k) => x >= p.f && x < (PUNTI[k + 1]?.f ?? 2));
  if (i < 0) i = PUNTI.length - 1;
  const a = PUNTI[i];
  const b = PUNTI[i + 1] ?? a;
  const t = b.f > a.f ? (x - a.f) / (b.f - a.f) : 0;
  return {
    f: x,
    fase: x < 0.1 ? 'brano' : x < 0.3 ? 'inizio' : x < 0.55 ? 'sale' : x < 0.8 ? 'caos' : x < 0.95 ? 'collasso' : x < 1 ? 'ultimo' : 'fine',
    ogni: a.ogni,
    insieme: a.insieme,
    secondi: a.secondi,
    cimici: Math.round(lerp(a.cimici, b.cimici, t)),
    mangia: lerp(a.mangia, b.mangia, t),
    volume: lerp(a.volume, b.volume, t),
  };
}

// Il livello i di n: quanto del suo volume resta nel collasso (80–95%). Uno alla volta, con una breve dissolvenza; mai sopra 1.
export function fattoreLivello(f, i, n) {
  if (n <= 0 || f < 0.8) return 1;
  const c = Math.min(1, (f - 0.8) / 0.15); // 0…1 dentro il collasso
  const fine = (i + 1) / n; // quando questo livello è del tutto andato
  const dur = 0.08;
  return Math.max(0, Math.min(1, (fine - c) / dur));
}

// Il livello è del tutto uscito (il suo codice, sulle card, è mangiato per intero).
export const livelloUscito = (f, i, n) => n > 0 && f >= 0.8 && fattoreLivello(f, i, n) === 0;

// Il volume di un livello: prima di tutti i livelli insieme (curva), poi uno alla volta. Mai sopra quello di partenza.
export function volumeLivello(partenza, f, i, n) {
  return Math.max(0, Math.min(partenza, partenza * curva(f).volume * fattoreLivello(f, i, n)));
}

// Una parola (il suo numero e un seme) com'è a mangia = p: 0 intatta, 1 in glitch (caratteri sostituiti), 2 sparita. Deterministico.
export function statoParola(seme, p) {
  const r = (0.94 * ((Math.imul(seme ^ 0x9e3779b9, 2654435761) >>> 0) % 10000)) / 10000; // 0…0.94, sempre uguale per la stessa parola (così a p=1 sono tutte sparite)
  if (p <= r) return 0;
  return p - r < 0.06 ? 1 : 2;
}
