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
      c.el.classList.toggle('muto', l.muto);
      // solo se è fuori posto: spostare la carta toglierebbe il fuoco a chi ci sta scrivendo
      if (this.contenitore.children[this.livelli.indexOf(l)] !== c.el) this.contenitore.append(c.el);
    }
    // una modifica aperta passa al livello nuovo con lo stesso nome (quello appena applicato)
    for (const [nome, m] of this.modifiche) {
      const ora = this.attivoDi(nome);
      if (!ora) this.chiudiModifica(nome);
      else if (m.carta.livello.id !== ora.id) this.chiudiModifica(nome);
    }
    if (!this.livelli.length) this.contenitore.append(el('div', 'vuoto', 'niente live · scegli una sezione nel CUE e premi go live ⇧⌘↵, o scrivi nel jam'));
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
    volume.title = 'Volume: clic o trascina';
    const pienoVolume = el('div');
    volume.append(pienoVolume);
    const muto = el('button', 'key piccolo', 'm');
    muto.title = 'Muto · ⌥ e il numero del livello';
    const togli = el('button', 'key piccolo', '×');
    togli.title = 'Togli a fine ciclo · ⇧⌘⌫';
    togli.setAttribute('aria-label', 'Togli a fine ciclo');
    testa.append(el('span', 'punto', '●'), nome, provenienza, stato, el('div', 'spazio'), conto, volume, muto, togli);
    const barra = el('div', 'barra-arrivo');
    const pieno = el('div');
    barra.append(pieno);
    const codice = el('pre', 'codice');
    codice.title = 'Clic per modificare: suona la versione di prima finché non applichi (⌘↵)';
    const editor = el('div', 'editor editor-carta');
    editor.hidden = true;
    const celle = el('div', 'griglia');
    for (let i = 0; i < PASSI; i++) celle.append(el('div'));
    const piede = el('div', 'lbl piede-carta');
    const errore = el('p', 'errore');
    art.append(testa, barra, codice, editor, celle, piede, errore);
    const c = { el: art, livello: l, nome, provenienza, stato, conto, barra, pieno, codice, editorEl: editor, celle, piede, errore, pienoVolume, muto };

    togli.onclick = () => this.azioni.togli(c.livello.id);
    muto.onclick = () => this.azioni.muto(c.livello.id, !c.livello.muto);
    const imposta = (e) => {
      const r = volume.getBoundingClientRect();
      const v = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 100) / 100;
      pienoVolume.style.width = `${v * 100}%`;
      this.azioni.volume(c.livello.id, v);
    };
    volume.onpointerdown = (e) => {
      volume.setPointerCapture(e.pointerId);
      imposta(e);
      volume.onpointermove = imposta;
    };
    volume.onpointerup = () => (volume.onpointermove = null);
    codice.onclick = () => this.apriModifica(c);
    return c;
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
      const a = aspetto(l, this.livelli, mappa, epoca, { scrittura: this.scritturaAMacchina, inizioUscita: this.inizioUscita.get(l.id) });
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
