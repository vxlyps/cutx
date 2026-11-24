// I tipi di suono delle clip: bass, lead, arp, pad, keys, fx. Stanno nella riga della clip (`// @clip reese · bass`), così valgono per
// qualsiasi clip, non solo per quelle del synth. Modulo puro: lo usano brano.js (gruppi nel CUE), il synth e i test.
// Tutti i tipi che un CH può accogliere (pagina CANALI). Fonte unica.
export const TIPI = ['drum', 'perc', 'bass', 'lead', 'arp', 'pad', 'keys', 'fx', 'stray'];
// I tipi del SYNTH: drum nasce dal DRUM, perc e stray li dà Valerio dal menu del CUE, quindi qui non ci sono. `stray` = «va nel CH8»: l'unico modo di mandarci una clip.
export const TIPI_SOLO_CH = ['drum', 'perc', 'stray'];
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
  const deiCh = ordine !== ORDINE_PER_TIPO; // con i CH i titoli ci sono sempre: ogni clip deve dire a chi appartiene
  if (!deiCh && !tipi.some(Boolean)) return [{ categoria: null, indici: clip.map((_, i) => i) }];
  const free = ordine.findIndex((g) => g.free);
  const dove = (t) => {
    const i = t ? ordine.findIndex((g) => g.tipi?.includes(t)) : -1;
    return i >= 0 ? i : free; // -1 = in fondo, senza gruppo
  };
  const posti = tipi.map(dove);
  // Con i CH una clip senza tipo non è di nessun canale: sta in un gruppo a parte IN CIMA («da assegnare»), mai nel CH8.
  const senza = deiCh ? tipi.flatMap((t, i) => (t ? [] : [i])) : [];
  if (deiCh) for (const i of senza) posti[i] = -2;
  const gruppi = [...(senza.length ? [{ categoria: '', daAssegnare: true, indici: senza }] : []), ...[...ordine.map((g) => g.nome), ''].map((nome, g) => ({ categoria: nome, ...(deiCh && g < ordine.length ? { ch: g } : {}), indici: posti.flatMap((p, i) => (p !== -2 && (p < 0 ? ordine.length : p) === g ? [i] : [])) }))];
  return gruppi.filter((g) => g.indici.length);
}

export const ordineClip = (clip, ordine) => gruppiClip(clip, ordine).flatMap((g) => g.indici);

// Scrive il tipo di una clip (info = { bass: true, volume: 0.8 … }): prima toglie TUTTI i tipi che aveva, poi mette il nuovo ('' = nessun tipo).
// Il resto (volume, drum come onda…) non si tocca, tranne `drum` che è anche un tipo.
export function conTipo(info, tipo) {
  const resto = Object.fromEntries(Object.entries(info ?? {}).filter(([k]) => !TIPI.includes(k)));
  return tipo ? { ...resto, [tipo]: true } : resto;
}

// Un tipo SUGGERITO dal nome della clip (mai applicato da solo: lo propone il menu del CUE). '' = nessun suggerimento.
const PAROLE = [
  ['bass', /\b(sub|reese|808|bass|basso|growl)\b/i],
  ['pad', /\b(pad|chord|chords|drone|strings?)\b/i],
  ['arp', /\b(arp|arpeggio|pluck)\b/i],
  ['keys', /\b(keys?|piano|rhodes|organ|stab)\b/i],
  ['lead', /\b(lead|melodia|melody|hook|riff)\b/i],
  ['fx', /\b(fx|riser|noise|sweep|impact|rumori)\b/i],
  ['perc', /\b(perc|hat|hats|clap|shaker|tom|rim)\b/i],
  ['drum', /\b(drum|drums|kick|snare|beat|break)\b/i],
];
export const suggerisciTipo = (nome) => PAROLE.find(([, re]) => re.test(String(nome ?? '')))?.[0] ?? '';

// Le clip senza tipo che hanno un tipo suggerito dal nome: [{ i, tipo }] (per «USA I SUGGERITI»).
export const tipiSuggeriti = (sezioni) => sezioni.flatMap((s, i) => (tipoDi(s.info) ? [] : [{ i, tipo: suggerisciTipo(s.nome) }])).filter((x) => x.tipo);
