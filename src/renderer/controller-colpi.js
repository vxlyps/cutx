// I colpi sui tasti della fila bassa (DROP … REC): si suonano tenendo premuto. Entrano sulla griglia (1/4 o 1/8, nelle impostazioni) e al rilascio tutto
// torna esattamente a tempo sulla stessa griglia. Ogni colpo è codice visibile: una riga nella coda delle clip (beat), una riga globale all(x => …)
// su tutto, o un livello temporaneo (il «sale»). Le definizioni stanno in colpi.cutx nello stash (colpi.js).
// Bersagli: un colpo da solo va sul beat (finché non c'è, il livello 1); con la manopola di una clip tenuta premuta va su quella clip (più manopole:
// tutti); in pagina B va sul livello scelto. «tutto» e «livello» vanno sempre su tutto.
import { gradinoMs, leggiColpi, rigaCodaAl, rigaGlobaleAl, vociAl } from './colpi.js';
import { leggiVoce } from './coda.js';

export class GestoreColpi {
  constructor(controller) {
    this.c = controller;
    this.colpi = [];
    this.errori = [];
    this.attivi = new Map(); // indice del tasto (0–7) → { colpo, k, bersagli, prima, timer, quando }
  }

  carica(testo) {
    const { colpi, errori } = leggiColpi(testo ?? '');
    this.colpi = colpi.slice(0, 8);
    this.errori = errori;
    this.c.cambiato();
    return { colpi: this.colpi, errori };
  }

  eStop(colpo) {
    return colpo.nome === 'stop' && colpo.bersaglio === 'tutto';
  }

  // La griglia di rilascio: lo stop torna di default sull'1 della battuta (il vuoto prima del drop), gli altri sulla griglia ¼ o ⅛.
  grigliaRilascio(colpo) {
    return colpo.nome === 'stop' && (this.c.azioni.stopTorna?.() ?? 'battuta') === 'battuta' ? 1 : this.griglia;
  }

  get griglia() {
    return Number(this.c.azioni.colpiGriglia?.()) > 0 ? Number(this.c.azioni.colpiGriglia()) : 0.25;
  }

  // Quanto dura una griglia in ms, al tempo di adesso.
  grigliaMs() {
    const bpm = this.c.azioni.bpm?.() ?? 120;
    return (60000 / Math.max(20, bpm)) * 4 * this.griglia; // un ciclo = 4 battiti
  }

  // I livelli su cui va un colpo «beat»: quelli con la manopola tenuta premuta, altrimenti il livello selezionato (in pagina B è quello che scolpisco), altrimenti il beat.
  bersagliBeat() {
    const c = this.c;
    this.senzaBeat = false;
    if (c.pagina === 'A') {
      const tenute = [...c.push].filter(([, s]) => s.giu).map(([n]) => c.livello(n)).filter(Boolean);
      if (tenute.length) return tenute;
    }
    // il livello selezionato (bordo verde: ⌃1-9, clic, manopola tenuta, pagina B)
    const scelto = c.posti().find((l) => l && l.id === c.azioni.selezionato?.());
    if (scelto) return [scelto];
    // niente di selezionato: il beat vero; se non c'è, il primo livello che suona (e lo specchio lo dice)
    const beat = c.livello(1);
    if (beat) return [beat];
    const primo = c.posti().find(Boolean);
    this.senzaBeat = !!primo;
    return primo ? [primo] : [];
  }

  premi(i, giu) {
    const c = this.c;
    if (giu) {
      const colpo = this.colpi[i];
      if (!colpo) return c.riga(this.errori.length ? `colpo ${i + 1}: non assegnato (controlla colpi.cutx)` : `colpo ${i + 1}: non assegnato in colpi.cutx`);
      if (this.attivi.has(i)) return;
      // una manopola tenuta con un colpo: non è più un muto
      for (const s of c.push.values()) if (s.giu) s.usato = true;
      const stato = { colpo, k: 0, bersagli: [], prima: new Map(), timer: null, quando: c.ora() };
      this.attivi.set(i, stato);
      this.applica(stato, 0, true);
      if (colpo.passi > 1) this.avanza(stato);
      c.toccata = { n: null, quando: c.ora(), testo: `COLPO · ${colpo.nome.toUpperCase()}${stato.bersagli.length ? ` · ${stato.bersagli.map((l) => l.nome).join(' + ')}${colpo.bersaglio === 'beat' && this.senzaBeat ? ' (non c\'è il beat)' : ''}` : colpo.bersaglio === 'tutto' ? ' · TUTTO' : ''}` };
      c.azioni.scritta?.(c.toccata.testo);
      c.cambiato();
      return;
    }
    const stato = this.attivi.get(i);
    if (!stato) return;
    this.attivi.delete(i);
    c.ferma(stato.timer);
    // un tocco più breve della griglia: il rilascio aspetta (l'entrata c'è stata, il ritorno parte dalla griglia dopo)
    const trascorso = c.ora() - stato.quando;
    const ms = this.grigliaMs() * (this.grigliaRilascio(stato.colpo) / this.griglia);
    // lo stop non aspetta: taglia subito e al rilascio riparte all'1 (anche con un tocco brevissimo)
    if (trascorso < ms && !this.eStop(stato.colpo)) c.imposta(() => this.togli(stato), ms - trascorso);
    else this.togli(stato);
    c.cambiato();
  }

  // I valori a gradini avanzano ogni due battiti finché tengo premuto.
  avanza(stato) {
    const c = this.c;
    stato.timer = c.imposta(() => {
      if (![...this.attivi.values()].includes(stato)) return;
      if (stato.k >= stato.colpo.passi - 1) return;
      stato.k++;
      this.applica(stato, stato.k, false);
      c.toccata = { n: null, quando: c.ora(), testo: `COLPO · ${stato.colpo.nome.toUpperCase()} ${this.etichetta(stato)}` };
      c.azioni.scritta?.(c.toccata.testo);
      this.avanza(stato);
    }, gradinoMs(c.azioni.bpm?.() ?? 120));
  }

  etichetta(stato) {
    const v = vociAl(stato.colpo, stato.k)[0];
    return v ? v.testo.replace(/^\.\w+\(|\)$/g, '') : '';
  }

  // Scrive le righe del colpo al gradino k (la prima volta si ricorda com'erano).
  applica(stato, k, primaVolta) {
    const { colpo } = stato;
    const a = this.c.azioni;
    const griglia = this.griglia;
    if (colpo.bersaglio === 'tutto') {
      // lo stop taglia SUBITO, come su un mixer (la riga resta visibile); gli altri entrano sulla griglia
      if (this.eStop(colpo)) a.globale?.(`colpo:${colpo.nome}`, rigaGlobaleAl(colpo, k), 0, 'giu');
      else a.globale?.(`colpo:${colpo.nome}`, rigaGlobaleAl(colpo, k), griglia);
    } else if (colpo.bersaglio === 'livello') {
      a.livelloTemp?.(`colpo:${colpo.nome}`, { nome: colpo.nome, codice: colpo.base, coda: vociAl(colpo, k).map((v) => v.testo) }, griglia);
    } else {
      if (primaVolta) stato.bersagli = this.bersagliBeat();
      if (primaVolta && !stato.bersagli.length) this.c.riga('nessun livello per il colpo');
      for (const l of stato.bersagli) {
        for (const v of colpo.voci) {
          const chiave = leggiVoce(rigaCodaAl(v, k))?.chiave ?? v.chiave;
          if (primaVolta) stato.prima.set(`${l.id}|${chiave}`, (l.coda ?? []).find((r) => leggiVoce(r)?.chiave === chiave) ?? null);
          a.codaQ?.(l.id, rigaCodaAl(v, k), griglia);
        }
      }
    }
  }

  // Il rilascio: tutto torna com'era (la riga di prima, se c'era), sulla griglia.
  togli(stato) {
    const { colpo } = stato;
    const a = this.c.azioni;
    const griglia = this.grigliaRilascio(colpo);
    if (colpo.bersaglio === 'tutto') a.globale?.(`colpo:${colpo.nome}`, null, griglia, this.eStop(colpo) ? 'su' : null);
    else if (colpo.bersaglio === 'livello') a.livelloTemp?.(`colpo:${colpo.nome}`, null, griglia);
    else {
      for (const l of stato.bersagli) {
        for (const v of colpo.voci) {
          const prima = stato.prima.get(`${l.id}|${v.chiave}`);
          if (prima) a.codaQ?.(l.id, prima, griglia);
          else a.togliQ?.(l.id, v.chiave, griglia);
        }
      }
    }
  }

  // Un tasto di colpo è acceso finché il colpo è attivo.
  acceso(i) {
    return this.attivi.has(i);
  }
}
