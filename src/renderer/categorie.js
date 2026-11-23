// I tipi di suono delle clip: bass, lead, arp, pad, keys, fx. Stanno nella riga della clip (`// @clip reese · bass`), così valgono per
// qualsiasi clip, non solo per quelle del synth. Modulo puro: lo usano brano.js (gruppi nel CUE), il synth e i test.
// Tutti i tipi che un CH può accogliere (pagina CANALI). Fonte unica.
export const TIPI = ['drum', 'perc', 'bass', 'lead', 'arp', 'pad', 'keys', 'fx'];
// I tipi del SYNTH: drum nasce dal DRUM e perc lo dà Valerio dal menu del CUE, quindi qui non ci sono.
export const TIPI_SOLO_CH = ['drum', 'perc'];
export const CATEGORIE = TIPI.filter((t) => !TIPI_SOLO_CH.includes(t));

export const eCategoria = (x) => CATEGORIE.includes(x);

// Il tipo scritto nella riga di una clip (info = { bass: true, volume: 0.8 … }), o '' se non c'è.
export const categoriaDi = (info) => CATEGORIE.find((c) => info?.[c] === true) ?? '';

// Il tipo di una clip tra tutti gli 8 (anche drum e perc), o '' se non c'è.
export const tipoDi = (info) => TIPI.find((t) => info?.[t] === true) ?? '';

// Ordine dei gruppi nel CUE: una lista di { nome, tipi, free }. Di serie un gruppo per tipo; la pagina CANALI passa i suoi 8 CH (nell'ordine dei CH:
// ogni clip va nel gruppo del suo tipo, quelle senza tipo e i tipi che nessuno prende vanno nel gruppo `free`).
export const ORDINE_PER_TIPO = TIPI.map((t) => ({ nome: t, tipi: [t] }));

// Gli indici delle clip nell'ordine dei gruppi (nell'ordine del brano dentro ogni gruppo), poi quelle senza tipo se nessun gruppo è `free`.
// Ritorna [{ categoria, indici }] (categoria = nome del gruppo); se nessuna clip ha un tipo c'è un gruppo solo (categoria null) e il CUE non mette titoli.
export function gruppiClip(clip, ordine = ORDINE_PER_TIPO) {
  const tipi = clip.map((s) => tipoDi(s.info));
  if (!tipi.some(Boolean)) return [{ categoria: null, indici: clip.map((_, i) => i) }];
  const free = ordine.findIndex((g) => g.free);
  const dove = (t) => {
    const i = t ? ordine.findIndex((g) => g.tipi?.includes(t)) : -1;
    return i >= 0 ? i : free; // -1 = in fondo, senza gruppo
  };
  const posti = tipi.map(dove);
  const gruppi = [...ordine.map((g) => g.nome), ''].map((nome, g) => ({ categoria: nome, indici: posti.flatMap((p, i) => ((p < 0 ? ordine.length : p) === g ? [i] : [])) }));
  return gruppi.filter((g) => g.indici.length);
}

export const ordineClip = (clip, ordine) => gruppiClip(clip, ordine).flatMap((g) => g.indici);
