// STOP del nano (e ogni «annulla le attese»): quali livelli del live non sono ancora cominciati, e come si toglie una rampa di tempo.
// Puro: lo usa il motore live, lo prova test/attese.test.js. Un livello: { da, a (Infinity = non esce), sfuma: { verso, da } | null }.

// Cosa non è ancora cominciato, a `soglia` (il ciclo fino a cui è già tutto programmato: quello che c'è prima è partito).
// entrate: i livelli che non sono ancora entrati · uscite: i livelli la cui uscita (o la cui sfumata) non è ancora partita.
// Una sfumata già iniziata (la transizione di un passaggio, una clip sostituita a metà dissolvenza) NON si tocca: A non torna pieno sopra B.
export function scegliAttese(livelli, soglia, { salta = () => false } = {}) {
  const entrate = [];
  const uscite = [];
  for (const l of livelli) {
    if (salta(l)) continue;
    if (l.a === Infinity) {
      if (l.da > soglia) entrate.push(l);
    } else if (l.da <= soglia && l.a > soglia) {
      const parte = l.sfuma?.verso === 'esce' ? l.sfuma.da : l.a;
      if (parte > soglia) uscite.push(l);
    }
  }
  return { entrate, uscite };
}

// I gradini di tempo di una rampa si tolgono, solo i suoi; i cambi che il suo arrivo aveva cancellato (e non sono ancora passati) tornano.
// rampa: { gradini: [{ ciclo, cps }], tolti: [{ ciclo, cps }] } · rimetti(cambi): chi sa rimettere i cambi (il motore, da cambiaTempo).
export function togliRampa(rip, rampa, rimetti) {
  if (!rampa) return;
  for (const g of rampa.gradini) rip.annullaCambio(g.ciclo, g.cps);
  const passato = rip.fine ?? -Infinity;
  const tolti = rampa.tolti.filter((c) => c.ciclo > passato);
  if (tolti.length) rimetti(tolti);
}
