// La pila dei livelli nel LIVE. Tutto si ricava dallo stato del motore live e dalla mappa del
// tempo, così dopo un crash dell'interfaccia (o nella finestra di uscita) si vede uguale.
// - in arrivo: il codice si scrive lettera per lettera e finisce esattamente quando entra;
// - suona: il codice intero, con le note che suonano in verde, volume, muto, griglia ritmica;
// - in uscita: il codice si cancella all'indietro fino alla fine del ciclo.
// Ogni livello si modifica sul posto: suona la versione di prima finché ⌘↵ non applica le
// modifiche al ciclo successivo; esc annulla. In fondo c'è il jam, per improvvisare.
import { creaEditor } from './editor.js';
import { attivi, griglia, riempi } from './evidenzia.js';
import { aspetto, epocaDi } from './aspetto.js';
import { resta } from './dissolvenza.js';
import { righeVisibili } from './coda.js';

const PASSI = 16;

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
}

export class Pila {
  // azioni: { togli(id), volume(id, v), muto(id, muto), applica(livello|null, codice) → errore, bozze(bozze), paracadute() }
  constructor(contenitore, jam, azioni) {
    this.contenitore = contenitore;
    this.azioni = azioni;
    this.livelli = [];
    this.carte = new Map(); // id → carta
    this.inizioUscita = new Map(); // id → epoca in cui ho visto partire l'uscita
    this.scritturaAMacchina = true;
    this.selezionato = null; // id del livello scelto con un clic sulla card: a lui vanno le code da sole (e, col controller, i colpi)
    this.modifiche = new Map(); // nome del livello → { editor, carta } mentre lo modifico
    this.creaJam(jam);
  }

  // --- il jam: si scrive direttamente live ---

  creaJam(contenitore) {
    const testa = el('div', 'card-testa');
    testa.append(el('span', 'nome nome-jam', '+ jam'), el('span', 'lbl', 'scrivi qui per improvvisare · ⌘↵ applica al prossimo ciclo'));
    const corpo = el('div', 'editor editor-carta');
    const errore = el('p', 'errore');
    contenitore.append(testa, corpo, errore);
    this.jam = {
      el: contenitore,
      errore,
      editor: creaEditor({ root: corpo, codice: '', suValuta: () => this.applica(), suCambio: () => this.mandaBozze() }),
    };
  }

  // --- stato dal motore live ---

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
    this.contenitore.querySelector('.vuoto')?.remove();
    for (const l of this.livelli) {
      if (!this.carte.has(l.id)) this.carte.set(l.id, this.carta(l));
      const c = this.carte.get(l.id);
      c.livello = l;
      c.nome.textContent = l.nome;
      c.provenienza.textContent = l.provenienza;
      c.pienoVolume.style.width = `${Math.min(1, l.volume) * 100}%`;
      c.muto.classList.toggle('on', l.muto);
      // la coda cambia mentre si gira: solo il testo, sul posto
      const righe = righeVisibili(l.coda, l.volume);
      const chiaveCoda = righe.join('\n');
      if (c.codaTesto.textContent !== chiaveCoda) c.codaTesto.textContent = chiaveCoda;
      c.righeCoda = righe;
      c.coda.classList.toggle('con-errore', !!l.codaErrore);
      c.codaTesto.title = l.codaErrore ?? '';
      c.el.classList.toggle('muto', l.muto);
      // solo se è fuori posto: spostare la carta toglierebbe il fuoco a chi ci sta scrivendo
      if (this.contenitore.children[this.livelli.indexOf(l)] !== c.el) this.contenitore.append(c.el);
    }
    this.mostraSelezione();
    // una modifica aperta passa al livello nuovo con lo stesso nome (quello appena applicato)
    for (const [nome, m] of this.modifiche) {
      const ora = this.attivoDi(nome);
      if (!ora) this.chiudiModifica(nome);
      else if (m.carta.livello.id !== ora.id) this.chiudiModifica(nome);
    }
    if (!this.livelli.length) this.contenitore.append(el('div', 'vuoto', 'niente live · scegli una sezione nel CUE e premi go live ⇧⌘↵, o scrivi nel jam'));
  }

  // ⌘Z su una modifica live: la versione di prima va nell'editor del livello, non applicata. La applica chi suona.
  proponi(nome, codice) {
    const l = this.attivoDi(nome);
    const c = l && this.carte.get(l.id);
    if (!c) return false;
    this.apriModifica(c);
    const m = this.modifiche.get(nome);
    if (!m) return false;
    m.editor.codice = codice.replace(/\s+$/, '');
    this.segna(c);
    return 'la versione di prima è nell\'editor del livello: ⌘↵ per applicarla';
  }

  attivoDi(nome) {
    return this.livelli.filter((l) => l.nome === nome && l.a === null).at(-1);
  }

  // I livelli che suonano o stanno per entrare, nell'ordine in cui si vedono: ⌥1–9 li mette in muto.
  attivi() {
    return this.livelli.filter((l) => l.a === null);
  }

  carta(l) {
    const art = el('article', 'card livello');
    const testa = el('div', 'card-testa');
    const nome = el('span', 'nome');
    const provenienza = el('span', 'lbl');
    const stato = el('span', 'lbl stato-livello');
    const conto = el('span', 'conto');
    const volume = el('div', 'volume');
    volume.dataset.aiuto = 'livello-volume';
    const pienoVolume = el('div');
    volume.append(pienoVolume);
    const muto = el('button', 'key piccolo', 'm');
    muto.dataset.aiuto = 'livello-muto';
    const togli = el('button', 'key piccolo', '×');
    togli.dataset.aiuto = 'livello-togli';
    togli.setAttribute('aria-label', 'Togli a fine ciclo');
    testa.append(el('span', 'punto', '●'), nome, provenienza, stato, el('div', 'spazio'), conto, volume, muto, togli);
    const barra = el('div', 'barra-arrivo');
    const pieno = el('div');
    barra.append(pieno);
    const codice = el('pre', 'codice');
    codice.dataset.aiuto = 'livello-codice';
    const editor = el('div', 'editor editor-carta');
    editor.hidden = true;
    // la coda (coda.js): le righe che girano le manopole, sotto il codice, aggiornate sul posto
    const coda = el('div', 'coda-blocco');
    coda.hidden = true;
    coda.dataset.aiuto = 'livello-coda';
    const codaTesto = el('pre', 'coda');
    const pulisci = el('button', 'key piccolo', 'pulisci coda');
    coda.append(codaTesto, pulisci);
    const celle = el('div', 'griglia');
    for (let i = 0; i < PASSI; i++) celle.append(el('div'));
    const piede = el('div', 'lbl piede-carta');
    const errore = el('p', 'errore');
    art.append(testa, barra, codice, editor, coda, celle, piede, errore);
    const c = { el: art, livello: l, nome, provenienza, stato, conto, barra, pieno, codice, editorEl: editor, celle, piede, errore, pienoVolume, muto, coda, codaTesto, righeCoda: [] };
    pulisci.onclick = () => this.azioni.pulisciCoda?.(c.livello.id);

    togli.onclick = () => this.azioni.togli(c.livello.id);
    art.addEventListener('pointerdown', () => this.seleziona(c.livello.id));
    // un clic sulla card che sta sfumando la salva: l'uscita si annulla e il livello torna al suo volume
    art.addEventListener('click', (e) => {
      if (c.livello.a !== null && c.livello.sfuma?.verso === 'esce' && !e.target.closest('button, .volume')) this.azioni.salvaLivello(c.livello.id);
    });
    muto.onclick = () => this.azioni.muto(c.livello.id, !c.livello.muto);
    const imposta = (e) => {
      const r = volume.getBoundingClientRect();
      const v = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 100) / 100;
      pienoVolume.style.width = `${v * 100}%`;
      this.azioni.volume(c.livello.id, v);
    };
    volume.onpointerdown = (e) => {
      volume.setPointerCapture(e.pointerId);
      this.azioni.volumeInizio?.(c.livello.id);
      imposta(e);
      volume.onpointermove = imposta;
    };
    volume.onpointerup = () => {
      volume.onpointermove = null;
      this.azioni.volumeFine?.(c.livello.id);
    };
    codice.onclick = () => (c.livello.sfuma?.verso === 'esce' && c.livello.a !== null ? null : this.apriModifica(c));
    return c;
  }

  // Un clic su una card la sceglie; un secondo clic non la toglie (si cambia scegliendone un'altra).
  seleziona(id) {
    this.selezionato = id;
    this.mostraSelezione();
  }

  mostraSelezione() {
    if (this.selezionato !== null && !this.livelli.some((l) => l.id === this.selezionato && l.a === null)) this.selezionato = null;
    for (const [id, c] of this.carte) c.el.classList.toggle('selezionato', id === this.selezionato);
  }

  // --- modificare sul posto ---

  apriModifica(c) {
    const l = c.livello;
    if (l.a !== null || this.modifiche.has(l.nome)) return this.modifiche.get(l.nome)?.editor.focus();
    c.codice.hidden = true;
    c.editorEl.hidden = false;
    const editor = creaEditor({
      root: c.editorEl,
      codice: l.codice.replace(/\s+$/, ''),
      suValuta: () => this.applica(),
      suCambio: () => {
        this.segna(c);
        this.mandaBozze();
      },
    });
    this.modifiche.set(l.nome, { editor, carta: c });
    c.el.classList.add('in-modifica');
    this.segna(c);
    editor.focus();
  }

  segna(c) {
    const m = this.modifiche.get(c.livello.nome);
    const cambiato = m && m.editor.codice !== c.livello.codice.replace(/\s+$/, '');
    c.el.classList.toggle('non-applicato', !!cambiato);
    c.piede.textContent = m ? (cambiato ? 'modifiche non applicate · ⌘↵ applica al prossimo ciclo · esc annulla' : 'in modifica · esc chiude') : '';
  }

  chiudiModifica(nome) {
    const m = this.modifiche.get(nome);
    if (!m) return;
    m.editor.distruggi();
    m.carta.editorEl.replaceChildren();
    m.carta.editorEl.hidden = true;
    m.carta.codice.hidden = false;
    m.carta.el.classList.remove('in-modifica', 'non-applicato');
    m.carta.piede.textContent = '';
    m.carta.errore.textContent = '';
    this.modifiche.delete(nome);
    this.mandaBozze();
  }

  // Dove sto scrivendo nel LIVE: { tipo: 'jam' } o { tipo: 'livello', nome }, oppure null.
  fuoco() {
    if (this.jam.editor.haFuoco()) return { tipo: 'jam' };
    for (const [nome, m] of this.modifiche) if (m.editor.haFuoco()) return { tipo: 'livello', nome };
    return null;
  }

  // ⌘↵ nel LIVE: il jam o il livello in modifica entrano al prossimo ciclo, già scritti.
  async applica() {
    const f = this.fuoco();
    if (!f) return false;
    if (f.tipo === 'jam') {
      const errore = await this.azioni.applica(null, this.jam.editor.codice);
      this.jam.errore.textContent = errore ?? '';
      return true;
    }
    const m = this.modifiche.get(f.nome);
    const errore = await this.azioni.applica(m.carta.livello, m.editor.codice);
    // L'errore si vede solo qui: il livello continua con la versione di prima.
    m.carta.errore.textContent = errore ?? '';
    if (!errore) {
      m.carta.piede.textContent = 'applicato · entra al prossimo ciclo';
      m.carta.el.classList.remove('non-applicato');
    }
    return true;
  }

  // esc nel LIVE: annulla la modifica e torna al codice che sta suonando.
  annulla() {
    const f = this.fuoco();
    if (f?.tipo !== 'livello') return false;
    this.chiudiModifica(f.nome);
    return true;
  }

  // Quello che sto scrivendo, per l'uscita: il pubblico lo vede mentre lo scrivo.
  mandaBozze() {
    const bozze = {};
    for (const [nome, m] of this.modifiche) bozze[m.carta.livello.id] = m.editor.codice;
    const jam = this.jam.editor.codice;
    this.azioni.bozze({ livelli: bozze, jam: jam.trim() ? jam : null, nome: [...this.modifiche.keys()] });
  }

  focusJam() {
    this.jam.editor.focus();
  }

  // --- a ogni fotogramma ---

  disegna(mappa, epoca) {
    if (!mappa) return null;
    let inArrivo = 0;
    let suonano = 0;
    for (const c of this.carte.values()) {
      const l = c.livello;
      if (l.a !== null && !this.inizioUscita.has(l.id)) this.inizioUscita.set(l.id, Math.min(epoca, epocaDi(mappa, l.a)));
      let a = aspetto(l, this.livelli, mappa, epoca, { scrittura: this.scritturaAMacchina, inizioUscita: this.inizioUscita.get(l.id) });
      // una dissolvenza in uscita: la card resta com'è, attenuata, con la barra che dice quanto manca (sul proiettore il codice si cancella)
      const sfuma = l.a !== null && l.sfuma?.verso === 'esce' ? l.sfuma : null;
      if (sfuma) a = { ...a, mostrato: a.testo, cursore: false };
      c.el.classList.toggle('sfuma', !!sfuma);
      if (sfuma) {
        suonano++;
        c.pieno.style.width = `${(resta(sfuma, a.ciclo) * 100).toFixed(1)}%`;
        c.conto.textContent = `-${Math.max(0, sfuma.a - a.ciclo).toFixed(1)}`;
        c.stato.textContent = a.ciclo < sfuma.da ? 'sfuma a fine ciclo · clic per tenerlo' : 'sfuma · clic per tenerlo';
        c.el.classList.remove('in-arrivo');
        c.el.classList.add('in-uscita');
        c.barra.hidden = false;
        c.coda.hidden = !c.righeCoda.length;
        this.disegnaCodice(c, a);
        this.disegnaGriglia(c, a);
        continue;
      }
      if (a.arriva) {
        inArrivo++;
        c.pieno.style.width = `${(a.parte * 100).toFixed(1)}%`;
        c.conto.textContent = `-${a.mancano.toFixed(1)}`;
        c.stato.textContent = `entra tra ${Math.max(1, Math.ceil(a.mancano))}${a.cursore ? ' · in scrittura' : ''}`;
      } else {
        suonano++;
        c.conto.textContent = '';
        c.stato.textContent = a.esce ? 'esce a fine ciclo' : l.muto ? 'muto' : '';
      }
      c.el.classList.toggle('in-arrivo', a.arriva);
      c.el.classList.toggle('in-uscita', a.esce);
      c.barra.hidden = !a.arriva;
      c.coda.hidden = a.arriva || !c.righeCoda.length;
      this.disegnaCodice(c, a);
      this.disegnaGriglia(c, a);
    }
    return { suonano, inArrivo };
  }

  disegnaCodice(c, a) {
    if (c.codice.hidden) return;
    if (a.cursore) {
      const chiave = `${a.mostrato}▌`;
      if (c.codice.dataset.testo === chiave) return;
      c.codice.dataset.testo = chiave;
      c.codice.dataset.evidenza = '';
      c.codice.textContent = a.mostrato;
      c.codice.append(el('span', 'cursore', ' '));
      return;
    }
    // le note che suonano, in verde (non mentre entra o se è muto)
    const accese = a.arriva || c.livello.muto ? [] : attivi(c.livello.codice, a.ciclo);
    riempi(c.codice, a.testo, accese, 'nota');
  }

  disegnaGriglia(c, a) {
    const celle = a.arriva ? null : griglia(c.livello.codice, a.ciclo, PASSI);
    c.celle.hidden = !celle;
    if (!celle) return;
    const ora = Math.floor((a.ciclo - Math.floor(a.ciclo)) * PASSI);
    [...c.celle.children].forEach((d, i) => {
      d.className = celle[i] ? (i === ora && !c.livello.muto ? 'colpo ora' : 'colpo') : i === ora ? 'ora' : '';
    });
  }
}
