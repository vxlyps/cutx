// Il codice sul proiettore: quanto ci sta, e come scorrere quando non ci sta. Funzioni pure (lo provano i test):
// il disegno vero è in uscita.js. Le regole:
//  - il codice usa tutta l'altezza che ha; se non ci sta si rimpicciolisce il carattere, fino a un minimo leggibile da lontano;
//  - se ancora non basta si scorre piano e da soli, una riga alla volta, e ci si ferma sul livello appena entrato o modificato;
//  - mai righe tagliate a metà: lo scorrimento parte sempre dall'inizio di una riga e il bordo in basso si ferma su una riga intera.

// Il carattere più grande (scala da `minima` a 1) con cui il contenuto sta in `disponibile` px.
// altezzaA(scala) → altezza del contenuto a quella scala. ci: false se neanche alla scala minima sta.
export function trovaScala(altezzaA, disponibile, minima) {
  if (altezzaA(1) <= disponibile) return { scala: 1, ci: true };
  if (altezzaA(minima) > disponibile) return { scala: minima, ci: false };
  let basso = minima;
  let alto = 1;
  for (let i = 0; i < 9; i++) {
    const m = (basso + alto) / 2;
    if (altezzaA(m) <= disponibile) basso = m;
    else alto = m;
  }
  return { scala: basso, ci: true };
}

// Tra più disposizioni (ampia, o stretta ma più alta) sceglie quella col carattere più grande; a parità la prima.
// Se in nessuna ci sta (si scorre) vince quella con la finestra più alta: meno scorrimento, più righe insieme.
export function scegliDisposizione(opzioni) {
  let meglio = null;
  for (const o of opzioni) {
    if (!meglio) meglio = o;
    else if (o.ci && !meglio.ci) meglio = o;
    else if (o.ci === meglio.ci) {
      if (o.ci ? o.scala > meglio.scala + 1e-6 : (o.altezza ?? 0) > (meglio.altezza ?? 0) + 1) meglio = o;
    }
  }
  return meglio;
}

// righe: [{ top, bottom }] in px del contenuto, in ordine. I punti dove si può fermare lo scorrimento: l'inizio di una riga,
// fino alla prima che mostra anche l'ultima riga per intero.
export function puntiDiScorrimento(righe, altezza) {
  if (!righe.length) return [0];
  const fine = righe.at(-1).bottom;
  const ultimo = righe.find((r) => r.top >= fine - altezza - 0.5)?.top ?? righe.at(-1).top;
  return [...new Set(righe.filter((r) => r.top <= ultimo + 0.5).map((r) => r.top))];
}

// Quanti px nascondere in basso perché non resti una riga a metà: il bordo cade sul fondo dell'ultima riga intera.
export function bordoInBasso(righe, offset, altezza) {
  const limite = offset + altezza;
  let bordo = offset;
  for (const r of righe) if (r.bottom <= limite + 0.5 && r.bottom > bordo) bordo = r.bottom;
  return Math.max(0, limite - bordo);
}

const indiceDa = (punti, y) => {
  let i = 0;
  while (i + 1 < punti.length && punti[i + 1] <= y + 0.5) i++;
  return i;
};

// Lo scorrimento automatico: un passo (una riga) ogni `passoS`, avanti e indietro, con una sosta a ogni estremo.
// Quando entra o cambia un livello ci si porta sul suo inizio e ci si ferma `tieniS` secondi (se è più alto della finestra si
// scende piano fino a vederlo tutto), poi si riprende.
export class Scorrimento {
  constructor({ passoS = 1.8, pausaS = 4, tieniS = 14 } = {}) {
    this.passoS = passoS;
    this.pausaS = pausaS;
    this.tieniS = tieniS;
    this.i = 0;
    this.dir = 1;
    this.prossimo = 0;
    this.tieniFino = -Infinity;
    this.focusVisto = null;
    this.iniziato = false;
  }

  // t: secondi (qualsiasi origine, crescente). focus: { id, quando, top, bottom } del livello da mostrare, o null.
  // segui: { top, bottom } della riga dove si sta scrivendo adesso, o null: finché c'è, la vista la tiene in vista
  aggiorna(t, { righe, altezza, focus = null, segui = null }) {
    if (!this.iniziato) {
      this.iniziato = true;
      this.prossimo = t + this.pausaS; // all'inizio si resta un attimo in cima
    }
    const punti = puntiDiScorrimento(righe, altezza);
    this.i = Math.min(this.i, punti.length - 1);
    if (focus && (this.focusVisto?.id !== focus.id || this.focusVisto?.quando !== focus.quando)) {
      this.focusVisto = { id: focus.id, quando: focus.quando };
      this.i = indiceDa(punti, focus.top);
      this.tieniFino = t + this.tieniS;
      this.prossimo = t + this.passoS;
    }
    if (segui && punti.length > 1) {
      if (segui.top < punti[this.i] - 0.5) this.i = indiceDa(punti, segui.top);
      else while (segui.bottom > punti[this.i] + altezza + 0.5 && this.i < punti.length - 1) this.i++;
      this.prossimo = t + this.passoS * 2; // finché si scrive non si scorre da soli: dopo, una breve sosta
      this.tieniFino = Math.max(this.tieniFino, t + this.passoS * 2);
    }
    if (punti.length > 1 && t >= this.prossimo) {
      if (t < this.tieniFino) {
        // sul livello appena entrato: se è più alto della finestra si scende piano finché non si vede tutto
        if (focus && focus.bottom > punti[this.i] + altezza + 0.5 && this.i < punti.length - 1) this.i++;
        this.prossimo = t + this.passoS;
      } else {
        this.i += this.dir;
        let pausa = 0;
        if (this.i >= punti.length - 1) {
          this.i = punti.length - 1;
          this.dir = -1;
          pausa = this.pausaS;
        } else if (this.i <= 0) {
          this.i = 0;
          this.dir = 1;
          pausa = this.pausaS;
        }
        this.prossimo = t + (pausa || this.passoS);
      }
    }
    const offset = punti[this.i] ?? 0;
    return { offset, taglio: bordoInBasso(righe, offset, altezza), punti: punti.length };
  }
}
