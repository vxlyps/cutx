// I tipi di suono delle clip: bass, lead, arp, pad, keys, fx. Stanno nella riga della clip (`// @clip reese · bass`), così valgono per
// qualsiasi clip, non solo per quelle del synth. Modulo puro: lo usano brano.js (gruppi nel CUE), il synth e i test.
export const CATEGORIE = ['bass', 'lead', 'arp', 'pad', 'keys', 'fx'];

export const eCategoria = (x) => CATEGORIE.includes(x);

// Il tipo scritto nella riga di una clip (info = { bass: true, volume: 0.8 … }), o '' se non c'è.
export const categoriaDi = (info) => CATEGORIE.find((c) => info?.[c] === true) ?? '';

// Gli indici delle clip nell'ordine dei gruppi: bass, lead, arp, pad, keys, fx, poi quelle senza tipo (nell'ordine del brano dentro ogni gruppo).
// Ritorna [{ categoria, indici }]; se nessuna clip ha un tipo c'è un gruppo solo (categoria null) e il CUE non mette titoli.
export function gruppiClip(clip) {
  const tipi = clip.map((s) => categoriaDi(s.info));
  if (!tipi.some(Boolean)) return [{ categoria: null, indici: clip.map((_, i) => i) }];
  const gruppi = [...CATEGORIE, ''].map((c) => ({ categoria: c, indici: tipi.flatMap((t, i) => (t === c ? [i] : [])) }));
  return gruppi.filter((g) => g.indici.length);
}

export const ordineClip = (clip) => gruppiClip(clip).flatMap((g) => g.indici);
