// Le note che suonano adesso, per evidenziarle nel codice, e la griglia ritmica di un livello.
// Il codice si valuta qui (senza suonarlo) e, dato il ciclo della mappa del tempo, si chiede al
// pattern cosa sta suonando: Strudel è deterministico, quindi è proprio quello che si sente.
import { valuta } from './analisi.js';

const MASSIMO = 60;
const pattern = new Map(); // codice → { pattern } | { errore } | null (in valutazione)

export function patternDi(codice) {
  if (!codice?.trim()) return null;
  if (!pattern.has(codice)) {
    pattern.set(codice, null);
    valuta(codice).then((r) => pattern.set(codice, r), () => pattern.set(codice, { errore: true }));
    if (pattern.size > MASSIMO) pattern.delete(pattern.keys().next().value);
  }
  return pattern.get(codice)?.pattern ?? null;
}

// Gli intervalli [inizio, fine) del codice delle note che suonano al ciclo dato.
export function attivi(codice, ciclo) {
  const p = patternDi(codice);
  if (!p) return [];
  const intervalli = [];
  try {
    for (const hap of p.queryArc(ciclo, ciclo + 1e-4)) {
      if (!hap.whole || hap.whole.begin.valueOf() > ciclo || hap.whole.end.valueOf() <= ciclo) continue;
      for (const { start, end } of hap.context?.locations ?? []) intervalli.push([start, end]);
    }
  } catch {
    return [];
  }
  return intervalli;
}

// 16 passi del ciclo in corso: true dove parte una nota.
const griglie = new Map(); // `${ciclo}|${codice}` → [bool]
export function griglia(codice, ciclo, passi = 16) {
  const intero = Math.floor(ciclo);
  const chiave = `${intero}|${codice}`;
  if (griglie.has(chiave)) return griglie.get(chiave);
  const p = patternDi(codice);
  if (!p) return null;
  const celle = Array(passi).fill(false);
  try {
    for (const hap of p.queryArc(intero, intero + 1)) {
      if (!hap.hasOnset()) continue;
      celle[Math.min(passi - 1, Math.floor((hap.whole.begin.valueOf() - intero) * passi))] = true;
    }
  } catch {
    return null;
  }
  griglie.set(chiave, celle);
  if (griglie.size > 200) griglie.delete(griglie.keys().next().value);
  return celle;
}

// Il testo con le parti attive dentro <span class=classe>. Ritorna una chiave per non ridisegnare
// quando non cambia niente.
export function riempi(el, testo, intervalli, classe) {
  const validi = intervalli
    .filter(([a, b]) => a < b && b <= testo.length)
    .sort((x, y) => x[0] - y[0]);
  const chiave = `${testo.length}:${validi.map((x) => x.join('-')).join(',')}`;
  if (el.dataset.evidenza === chiave && el.dataset.testo === testo) return;
  el.dataset.evidenza = chiave;
  el.dataset.testo = testo;
  el.replaceChildren();
  let pos = 0;
  for (const [a, b] of validi) {
    if (a < pos) continue; // sovrapposti: basta il primo
    if (a > pos) el.append(testo.slice(pos, a));
    const s = document.createElement('span');
    s.className = classe;
    s.textContent = testo.slice(a, b);
    el.append(s);
    pos = b;
  }
  if (pos < testo.length) el.append(testo.slice(pos));
}
