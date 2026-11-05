// Le transizioni tra due brani («passa al prossimo brano»): regole fisse, sempre a tempo, uguali ogni volta.
// Si scrivono nel set (`brano_2.cutx · transizione sweep 8`); senza riga vale la predefinita delle impostazioni.
//   sweep N: il vecchio si chiude, il nuovo si apre, in N cicli.
//   cut: il vecchio si ferma sull'1 in cui entra il nuovo.
// Scambio dei bassi: sull'1 in cui entra il beat nuovo il passa-alto sale su TUTTO il vecchio (beat compreso, cioè la cassa),
// e da lì il vecchio continua a chiudersi. Modulo puro: lo provano i test.

export const PREDEFINITA = 'sweep 8';
export const CICLI_SWEEP = 8;
export const CICLI_MAX = 32;
export const BASSO_HZ = 150; // da dove parte il passa-alto del vecchio (il taglio dei bassi)

// «sweep 8» → { tipo: 'sweep', cicli: 8 }; «cut» → { tipo: 'cut', cicli: 0 }; altro → null.
export function leggiTransizione(testo) {
  const m = /^\s*(sweep|cut)(?:\s+(\d+))?\s*$/i.exec(String(testo ?? ''));
  if (!m) return null;
  if (m[1].toLowerCase() === 'cut') return m[2] === undefined ? { tipo: 'cut', cicli: 0 } : null;
  const cicli = m[2] === undefined ? CICLI_SWEEP : Number(m[2]);
  return cicli >= 1 && cicli <= CICLI_MAX ? { tipo: 'sweep', cicli } : null;
}

export const scriviTransizione = (t) => (t.tipo === 'cut' ? 'cut' : `sweep ${t.cicli}`);

// Quale transizione vale: quella scritta nel set se è valida, altrimenti la predefinita (anche lei se è scritta male).
// → { transizione, scartata } (scartata: il testo del set che non si capisce, per dirlo).
export function sceglieTransizione(scritta, predefinita = PREDEFINITA) {
  const valida = leggiTransizione(scritta);
  const base = leggiTransizione(predefinita) ?? leggiTransizione(PREDEFINITA);
  return { transizione: valida ?? base, scartata: scritta && !valida ? String(scritta) : '' };
}

// Cosa mandare al live: { tipo, cicli, hz, tieni }.
export const perIlLive = (t, tieni = []) => ({ tipo: t.tipo, cicli: t.cicli, hz: BASSO_HZ, tieni: tieni.filter((x) => x !== null && x !== undefined) });

// Quali livelli escono con la transizione che comincia al ciclo `da`: tutti quelli che suonano adesso (a = Infinity) e sono già entrati,
// tranne chi sta uscendo, il paracadute, il livello nuovo e quelli da tenere (il selezionato sul controller).
// livelli: [{ id, nome, da, a }].
export function chiEsce(livelli, { da, nuovo, tieni = [] }) {
  const resta = new Set(tieni);
  return livelli.filter((l) => l.id !== nuovo && l.a === Infinity && l.da < da && l.nome !== 'paracadute' && !resta.has(l.id));
}
