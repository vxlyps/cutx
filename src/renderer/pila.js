// La pila dei livelli nel LIVE. Tutto si ricava dallo stato del motore live e dalla mappa del
// tempo, così dopo un crash dell'interfaccia (o nella finestra di uscita) si vede uguale.
// - in arrivo: il codice si scrive lettera per lettera e finisce esattamente quando entra;
// - suona: il codice intero;
// - in uscita: il codice si cancella all'indietro fino alla fine del ciclo.

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
}

export class Pila {
  // azioni: { togli(id) }
  constructor(contenitore, azioni) {
    this.contenitore = contenitore;
    this.azioni = azioni;
    this.livelli = [];
    this.carte = new Map(); // id → { el, codice, stato, … }
    this.inizioUscita = new Map(); // id → epoca in cui ho visto partire l'uscita
    this.scritturaAMacchina = true;
  }

  aggiorna(livelli) {
    this.livelli = livelli ?? [];
    const ids = new Set(this.livelli.map((l) => l.id));
    for (const [id, c] of this.carte) {
      if (!ids.has(id)) {
        c.el.remove();
        this.carte.delete(id);
        this.inizioUscita.delete(id);
      }
    }
    for (const l of this.livelli) {
      if (!this.carte.has(l.id)) this.carte.set(l.id, this.carta(l));
      const c = this.carte.get(l.id);
      c.livello = l;
      c.nome.textContent = l.nome;
      c.provenienza.textContent = l.provenienza;
      this.contenitore.append(c.el); // nell'ordine di entrata
    }
    this.contenitore.querySelector('.vuoto')?.remove();
    if (!this.livelli.length) this.contenitore.append(el('div', 'vuoto', 'niente live · scegli una sezione nel CUE e premi go live ⇧⌘↵'));
  }

  carta(l) {
    const art = el('article', 'card livello');
    const testa = el('div', 'card-testa');
    const nome = el('span', 'nome');
    const provenienza = el('span', 'lbl');
    const stato = el('span', 'lbl stato-livello');
    const conto = el('span', 'conto');
    const togli = el('button', 'key piccolo', '×');
    togli.title = 'Togli a fine ciclo · ⇧⌘⌫';
    togli.setAttribute('aria-label', 'Togli a fine ciclo');
    togli.onclick = () => this.azioni.togli(l.id);
    testa.append(el('span', 'punto', '●'), nome, provenienza, stato, el('div', 'spazio'), conto, togli);
    const barra = el('div', 'barra-arrivo');
    const pieno = el('div');
    barra.append(pieno);
    const codice = el('pre', 'codice');
    art.append(testa, barra, codice);
    return { el: art, nome, provenienza, stato, conto, barra, pieno, codice, testoMostrato: null };
  }

  // A ogni fotogramma: chi arriva si scrive, chi esce si cancella.
  disegna(mappa, epoca) {
    if (!mappa) return;
    const ciclo = mappa.ciclo0 + ((epoca - mappa.epoca0) / 1000) * mappa.cps;
    const epocaDi = (c) => mappa.epoca0 + ((c - mappa.ciclo0) / mappa.cps) * 1000;
    let inArrivo = 0;
    let suonano = 0;
    for (const c of this.carte.values()) {
      const l = c.livello;
      const testo = l.codice.replace(/\s+$/, '');
      const arriva = l.da !== null && ciclo < l.da;
      const sostituito = l.a !== null && this.livelli.some((x) => x !== l && x.nome === l.nome && x.da === l.a);
      const esce = l.a !== null && !sostituito;
      let mostrato = testo;
      let cursore = false;
      if (arriva) {
        inArrivo++;
        const fine = epocaDi(l.da);
        const parte = Math.min(1, Math.max(0, (epoca - l.richiesto) / Math.max(1, fine - l.richiesto)));
        if (this.scritturaAMacchina) {
          mostrato = testo.slice(0, Math.floor(testo.length * parte));
          cursore = true;
        }
        c.pieno.style.width = `${(parte * 100).toFixed(1)}%`;
        c.conto.textContent = `-${Math.max(0, l.da - ciclo).toFixed(1)}`;
        c.stato.textContent = `entra tra ${Math.max(1, Math.ceil(l.da - ciclo))} · ${this.scritturaAMacchina ? 'in scrittura' : 'in arrivo'}`;
      } else if (esce) {
        if (!this.inizioUscita.has(l.id)) this.inizioUscita.set(l.id, Math.min(epoca, epocaDi(l.a)));
        const inizio = this.inizioUscita.get(l.id);
        const fine = epocaDi(l.a);
        const resta = Math.min(1, Math.max(0, (fine - epoca) / Math.max(1, fine - inizio)));
        if (this.scritturaAMacchina) {
          mostrato = testo.slice(0, Math.ceil(testo.length * resta));
          cursore = true;
        }
        c.conto.textContent = '';
        c.stato.textContent = 'esce a fine ciclo';
        suonano++;
      } else {
        c.conto.textContent = '';
        c.stato.textContent = l.muto ? 'muto' : '';
        suonano++;
      }
      c.el.classList.toggle('in-arrivo', arriva);
      c.el.classList.toggle('in-uscita', esce);
      c.barra.hidden = !arriva;
      const chiave = `${mostrato}${cursore ? '▌' : ''}`;
      if (chiave !== c.testoMostrato) {
        c.testoMostrato = chiave;
        c.codice.textContent = mostrato;
        if (cursore) c.codice.append(el('span', 'cursore', ' '));
      }
    }
    return { suonano, inArrivo };
  }
}
