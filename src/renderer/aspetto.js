// Come si vede un livello adesso (in arrivo, che suona, in uscita), dalla mappa del tempo.
// Lo usano la pila del LIVE e la finestra di uscita, così mostrano la stessa cosa.

import { cicloDi, epocaDi } from './tempo.js';

export { cicloDi, epocaDi };

// Come si vede un livello adesso: quanto testo, se arriva o se esce. Serve anche all'uscita.
export function aspetto(l, livelli, mappa, epoca, { scrittura = true, inizioUscita = null } = {}) {
  const ciclo = cicloDi(mappa, epoca);
  const testo = l.codice.replace(/\s+$/, '');
  const arriva = l.da !== null && ciclo < l.da;
  const sostituito = l.a !== null && livelli.some((x) => x !== l && x.nome === l.nome && x.da === l.a);
  const esce = l.a !== null && !sostituito;
  const a = { testo, mostrato: testo, cursore: false, arriva, esce, sostituito, parte: 1, mancano: 0, ciclo };
  if (arriva) {
    const fine = epocaDi(mappa, l.da);
    a.parte = Math.min(1, Math.max(0, (epoca - l.richiesto) / Math.max(1, fine - l.richiesto)));
    a.mancano = Math.max(0, l.da - ciclo);
    if (scrittura && !l.scritto) {
      a.mostrato = testo.slice(0, Math.floor(testo.length * a.parte));
      a.cursore = true;
    }
  } else if (esce && scrittura) {
    const fine = epocaDi(mappa, l.a);
    const inizio = inizioUscita ?? Math.min(epoca, fine);
    const resta = Math.min(1, Math.max(0, (fine - epoca) / Math.max(1, fine - inizio)));
    a.mostrato = testo.slice(0, Math.ceil(testo.length * resta));
    a.cursore = true;
  }
  return a;
}
