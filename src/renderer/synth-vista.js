// La vista SYNTH: pannello a manopole (oscillatore, filtro, ampiezza, effetti), barra, codice sempre visibile.
// Ogni manopola è un parametro di Strudel (synth-modello.js); il codice si riscrive mentre giro (synth-codice.js).
// Qui non suona niente da sola: la cuffia la comanda app.js, attraverso le funzioni di `opz`.
import { COSTO_AVVISO, COSTO_MAX, GRUPPI, PARAMETRI, aPosizione, attivo, costo, daPosizione, imposta, iniziale, mutate, noteValide, pulisci, pulisciValore } from './synth-modello.js';
import { CATEGORIE } from './categorie.js';
import { PianoRoll } from './synth-roll.js';
import { conCicli, eventiDaMini, leggiScala, miniDaEventi, notaInGrado, scalaDelCiclo, velDaEventi, velocitaPerNote } from './synth-note.js';
import { OTTAVA_INIZIALE, inCampoDiTesto, notaDaTasto, ottavaDopo } from './synth-tastiera.js';
import { nuovoValore } from './controller-synth.js';
import { Registratore } from './synth-rec.js';
import { clip, codice, conVelocity, funzioniDi, inGradi, leggiCodice, noteEffettive } from './synth-codice.js';
import it from './testi/it.json';

const T = it.synth;
// Un testo dal file dei testi con i suoi {segnaposto}.
export const formatta = (modello, vars = {}) => String(modello).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

const PASSO_FINE = 0.002; // per pixel di trascinamento con ⇧
const PASSO = 0.006; // per pixel
const STORIA_MAX = 100;
const PAUSA_ANTEPRIMA_MS = 90;
const PAUSA_SALVA_MS = 800;
const PAUSA_CODICE_MS = 350;

const crea = (tag, classe, testo) => {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined) el.textContent = testo;
  return el;
};

// Il valore come lo si legge sulla manopola.
export function etichettaValore(p, v) {
  if (p.tipo === 'scelta') return T.scelte[v] ?? String(v);
  if (p.k === 'cutoff') return v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v));
  if (['attack', 'decay', 'release', 'fattacco', 'fdecay', 'frelease', 'pdecay'].includes(p.k)) return v < 1 ? `${Math.round(v * 1000)}ms` : `${Math.round(v * 100) / 100}s`;
  if (p.k === 'ottava') return v > 0 ? `+${v}` : String(v);
  if (p.k === 'crush') return v >= 16 ? T.valori.off : formatta(T.valori.bit, { n: v });
  if (p.k === 'coarse') return v <= 1 ? T.valori.off : formatta(T.valori.x, { n: v });
  if (p.k === 'tremolo') return v === 0 ? T.valori.off : formatta(T.valori.ciclo, { n: v });
  return String(v);
}

export class VistaSynth {
  // opz: { suona(codice, nome) → Promise<errore|null>, ferma(), suonaOra() → bool, mandaCue(dest, nome, testo) → errore|null,
  //        destinazioni() → [{ id, nome, ok }], salva(contenuto), aiuto: bool }
  constructor(radice, opz) {
    this.r = radice;
    this.opz = opz;
    this.slot = { A: iniziale(), B: null, lato: 'A' };
    this.nome = 'synth';
    this.storia = [];
    this.ripeti = [];
    this.inGesto = false;
    this.aperta = null; // { nome } se il suono è stato aperto da una clip: allora lo schema «note della clip» c'è
    this.timerAnteprima = null;
    this.timerSalva = null;
    this.timerRuota = null;
    this.quanto = 30; // quanto cambia mutate (0–100)
    this.ottava = OTTAVA_INIZIALE; // l'ottava dei tasti del Mac (Z e X)
    this.tenuti = new Map(); // tasto premuto → nota suonata
    this.rec = null;
    this.attiva_ = false;
    this.timerSuono = null;
    this.cicliScelti = 1; // quanti cicli mostra il pianoroll (almeno quelli del pattern)
    this.scrivendo = false; // sto scrivendo nel pannello del codice: il pannello non lo riscrive sotto le dita
    this.erroreCodice = null; // il codice scritto non si legge: resta com'è finché non si corregge
    this.timerCodice = null;
    this.controlli = new Map();
    this.costruisci();
    this.disegna();
  }

  get stato() {
    return this.slot[this.slot.lato];
  }

  // --- costruzione ---

  costruisci() {
    const barra = crea('div', 'synth-barra');
    this.nomeEl = crea('input', 'synth-nome');
    this.nomeEl.value = this.nome;
    this.nomeEl.spellcheck = false;
    this.nomeEl.setAttribute('aria-label', T.barra.nome);
    this.nomeEl.oninput = () => (this.nome = this.nomeEl.value);

    this.playEl = this.tasto(T.barra.play, '⌘↵', () => this.suonaOFerma(), 'synth-play');
    this.recEl = crea('button', 'key synth-rec', T.barra.rec);
    this.recEl.dataset.aiuto = 'synth-rec';
    this.recEl.onclick = () => this.avviaRec();
    this.ottavaEl = crea('span', 'lbl synth-ottava');
    this.ottavaEl.dataset.aiuto = 'synth-tastiera';
    this.anteprimaEl = crea('select', 'synth-select');
    this.anteprimaEl.setAttribute('aria-label', T.barra.schema);
    this.anteprimaEl.dataset.aiuto = 'synth-schema';
    for (const [id, nome] of Object.entries(T.anteprime)) this.anteprimaEl.append(new Option(nome, id));
    this.anteprimaEl.onchange = () => this.passo(() => this.imponi({ ...this.stato, anteprima: this.anteprimaEl.value }));

    // A e B sono due slot: quello acceso è il suono che senti e che modifichi
    this.slotEl = crea('div', 'synth-slot');
    this.slotEl.dataset.aiuto = 'synth-slot';
    this.slotA = crea('button', 'key synth-slot-a', T.barra.slotA);
    this.slotB = crea('button', 'key synth-slot-b', T.barra.slotB);
    this.slotA.onclick = () => this.scegliSlot('A');
    this.slotB.onclick = () => this.scegliSlot('B');
    this.slotEl.append(this.slotA, this.slotB);
    this.copiaEl = this.tasto('', '', () => this.copiaInAltro(), 'synth-copia');
    this.copiaEl.dataset.aiuto = 'synth-copia';
    this.initEl = this.tasto(T.barra.init, '', () => this.riparti());
    this.mutateEl = this.tasto(T.barra.mutate, '', () => this.mutate());
    this.mutateEl.dataset.aiuto = 'synth-mutate';
    this.quantoEl = crea('input', 'synth-quanto');
    this.quantoEl.type = 'range';
    this.quantoEl.min = '0';
    this.quantoEl.max = '100';
    this.quantoEl.value = String(this.quanto);
    this.quantoEl.dataset.aiuto = 'synth-quanto';
    this.quantoEl.setAttribute('aria-label', T.barra.quanto);
    this.quantoEl.oninput = () => (this.quanto = Number(this.quantoEl.value));
    this.quantoEl.onchange = () => this.salvaSoon();
    this.categoriaEl = crea('select', 'synth-select');
    this.categoriaEl.setAttribute('aria-label', T.barra.categoria);
    this.categoriaEl.dataset.aiuto = 'synth-categoria';
    for (const [id, nome] of Object.entries(T.categorie)) this.categoriaEl.append(new Option(nome, id));
    this.categoriaEl.onchange = () => this.passo(() => this.imponi({ ...this.stato, categoria: this.categoriaEl.value }));

    this.destinazioneEl = crea('select', 'synth-select');
    this.destinazioneEl.setAttribute('aria-label', T.barra.destinazione);
    this.destinazioneEl.dataset.aiuto = 'synth-destinazione';
    this.cueEl = this.tasto(T.barra.cue, '', () => this.mandaCue(), 'synth-cue acid');

    this.pesoEl = crea('span', 'lbl synth-peso');
    this.pesoEl.dataset.aiuto = 'synth-peso';
    this.avvisoEl = crea('span', 'synth-avviso');
    this.avvisoEl.setAttribute('role', 'status');

    barra.append(this.nomeEl, this.categoriaEl, this.playEl, this.recEl, this.ottavaEl, this.anteprimaEl, crea('span', 'sep'), this.slotEl, this.copiaEl, this.initEl, this.mutateEl, this.quantoEl, crea('span', 'spazio'), this.pesoEl, this.destinazioneEl, this.cueEl);
    for (const [el, chiave] of [[this.playEl, 'synth-play'], [this.initEl, 'synth-init'], [this.cueEl, 'synth-cue']]) el.dataset.aiuto = chiave;

    const corpo = crea('div', 'synth-corpo');
    const pannello = crea('div', 'synth-pannello');
    for (const g of GRUPPI) {
      const sez = crea('section', `synth-gruppo synth-${g.id}`);
      sez.append(crea('h2', 'lbl', T.gruppi[g.id]));
      const griglia = crea('div', 'synth-griglia');
      for (const p of PARAMETRI.filter((x) => x.g === g.id)) griglia.append(this.controllo(p));
      sez.append(griglia);
      pannello.append(sez);
    }

    const lato = crea('aside', 'synth-codice');
    this.titoloCodice = crea('h2', 'lbl', T.barra.codice);
    lato.append(this.titoloCodice);
    // il codice si può scrivere: quello che il pannello conosce sposta le manopole, il resto resta com'è (a mano)
    this.codiceEl = crea('textarea', 'synth-pre');
    this.codiceEl.dataset.aiuto = 'synth-codice';
    this.codiceEl.spellcheck = false;
    this.codiceEl.wrap = 'off';
    this.codiceEl.setAttribute('aria-label', T.barra.codice);
    this.codiceEl.oninput = () => {
      this.scrivendo = true;
      clearTimeout(this.timerCodice);
      this.timerCodice = setTimeout(() => this.daCodice(), PAUSA_CODICE_MS);
    };
    this.codiceEl.onblur = () => {
      clearTimeout(this.timerCodice);
      this.daCodice();
      this.scrivendo = false;
      if (!this.erroreCodice) this.codiceEl.value = codice(this.stato); // il codice come lo scrive il pannello (ordine e spazi in regola)
    };
    this.manoEl = crea('p', 'synth-mano');
    this.manoEl.dataset.aiuto = 'synth-mano';
    lato.append(this.codiceEl, this.manoEl, this.avvisoEl);

    // a sinistra due schede: il suono (manopole) e le note (pianoroll)
    const sinistra = crea('div', 'synth-sinistra');
    const schede = crea('div', 'synth-schede');
    this.schede = {};
    for (const id of ['suono', 'note']) {
      const b = crea('button', 'key piccolo', T.schede[id]);
      b.onclick = () => this.mostraScheda(id);
      this.schede[id] = b;
      schede.append(b);
    }
    this.noteEl = crea('div', 'synth-note');
    this.noteEl.hidden = true;
    this.roll = new PianoRoll(this.noteEl, {
      cambia: (eventi, cicli, gesto) => this.cambiaNote(eventi, cicli, gesto),
      fineGesto: () => (this.inGesto = false),
      testo: (testoMini, fine) => this.daMini(testoMini, fine),
      nota: (n) => this.provaNota(n),
      ciclo: () => this.opz.ciclo?.() ?? null,
      avviso: (chiave, vars) => this.avviso(formatta(T.note[chiave], vars)),
      griglia: (g) => {
        this.grigliaScelta = g;
        this.chiaveNote = null;
        this.disegna();
        if (this.roll.griglia !== g) this.avviso(formatta(T.note.fuoriQuestaGriglia, { g: this.roll.grigliaEl.selectedOptions[0]?.textContent ?? '' }));
      },
    });
    sinistra.append(schede, pannello, this.noteEl);
    corpo.append(sinistra, lato);
    // lo specchio dell'X-Touch (in ambra: il verde è del live); lo riempie l'app quando c'è un controller
    this.specchioEl = crea('div', 'specchio synth-specchio');
    this.specchioEl.hidden = true;
    this.r.replaceChildren(barra, corpo, this.specchioEl);
    this.scheda = 'suono';
    this.mostraScheda('suono');
  }

  tasto(testo, scorciatoia, fa, classe = '') {
    const b = crea('button', `key ${classe}`.trim());
    b.append(document.createTextNode(testo));
    if (scorciatoia) b.append(crea('i', '', scorciatoia));
    b.onclick = fa;
    return b;
  }

  // Una manopola, una fila di scelte o un interruttore, secondo il tipo del parametro.
  controllo(p) {
    const el = crea('div', `ctl ctl-${p.tipo}`);
    el.dataset.k = p.k;
    el.append(crea('span', 'ctl-nome', T.parametri[p.k]));
    const c = { el, p };
    if (p.tipo === 'scelta') {
      const fila = crea('div', 'ctl-scelte');
      c.bottoni = p.scelte.map((v) => {
        const b = crea('button', 'ctl-b', etichettaValore(p, v));
        b.type = 'button';
        b.onclick = () => this.passo(() => this.cambia(p.k, v));
        fila.append(b);
        return [v, b];
      });
      el.append(fila);
    } else if (p.tipo === 'bool') {
      c.interruttore = crea('button', 'ctl-b ctl-interruttore');
      c.interruttore.type = 'button';
      c.interruttore.onclick = () => this.passo(() => this.cambia(p.k, this.stato[p.k] ? 0 : 1));
      el.append(c.interruttore);
    } else {
      el.insertAdjacentHTML(
        'beforeend',
        '<svg class="ctl-anello" viewBox="0 0 48 48" aria-hidden="true"><circle class="traccia" cx="24" cy="24" r="19" pathLength="100" stroke-dasharray="75 25" transform="rotate(135 24 24)"/><circle class="valore" cx="24" cy="24" r="19" pathLength="100" stroke-dasharray="0 100" transform="rotate(135 24 24)"/></svg>',
      );
      c.valoreEl = crea('span', 'ctl-valore');
      c.anello = el.querySelector('.valore');
      el.append(c.valoreEl);
      el.tabIndex = 0;
      el.setAttribute('role', 'slider');
      el.setAttribute('aria-label', T.parametri[p.k]);
      this.gestiManopola(c);
    }
    this.controlli.set(p.k, c);
    return el;
  }

  gestiManopola(c) {
    const { el, p } = c;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      let y = e.clientY;
      let t = aPosizione(p, this.stato, this.stato[p.k]);
      this.inGesto = false;
      const muovi = (m) => {
        t = Math.min(1, Math.max(0, t - (m.clientY - y) * (m.shiftKey ? PASSO_FINE : PASSO)));
        y = m.clientY;
        this.cambia(p.k, daPosizione(p, this.stato, t));
      };
      const fine = () => {
        el.removeEventListener('pointermove', muovi);
        el.removeEventListener('pointerup', fine);
        el.removeEventListener('pointercancel', fine);
        this.inGesto = false;
      };
      el.addEventListener('pointermove', muovi);
      el.addEventListener('pointerup', fine);
      el.addEventListener('pointercancel', fine);
      e.preventDefault();
      el.focus();
    });
    el.addEventListener('dblclick', () => this.passo(() => this.cambia(p.k, p.def)));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.timerRuota) this.inGesto = false;
        clearTimeout(this.timerRuota);
        this.timerRuota = setTimeout(() => ((this.timerRuota = null), (this.inGesto = false)), 400);
        const t = aPosizione(p, this.stato, this.stato[p.k]) - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.02);
        this.cambia(p.k, daPosizione(p, this.stato, t));
      },
      { passive: false },
    );
    el.addEventListener('keydown', (e) => {
      const verso = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (!verso) return;
      e.preventDefault();
      const passo = p.tipo === 'int' ? 1 : null;
      this.passo(() => {
        if (passo) return this.cambia(p.k, this.stato[p.k] + verso * passo);
        const t = aPosizione(p, this.stato, this.stato[p.k]) + verso * (e.shiftKey ? 0.1 : 0.02);
        this.cambia(p.k, daPosizione(p, this.stato, t));
      });
    });
  }

  // --- suonare: la tastiera del Mac e il REC ---

  // La vista si apre o si chiude: aperta, la cuffia riceve il suono dei tasti; chiusa, le note e il REC si fermano.
  attiva(on) {
    this.attiva_ = on;
    if (on) this.inviaSuono();
    else {
      this.fermaNote();
      this.fermaRec(true);
    }
  }

  // Il suono dei tasti: il codice del pannello con una nota sola (l'inizio scritto a mano non conta: i tasti hanno la nota).
  inviaSuono() {
    clearTimeout(this.timerSuono);
    if (!this.attiva_) return;
    this.opz.suonoTasti?.(codice({ ...this.stato, testa: '', anteprima: 'tenuta' }));
  }

  programmaSuono() {
    if (!this.attiva_) return;
    clearTimeout(this.timerSuono);
    this.timerSuono = setTimeout(() => this.inviaSuono(), PAUSA_ANTEPRIMA_MS);
  }

  notaOn(midi, vel = 100) {
    this.opz.nota?.({ on: true, midi, velocita: vel });
    this.rec?.noteOn(midi, vel);
    if (!this.rec) this.roll.passiNota(midi, true); // con «passi» acceso la nota si scrive al cursore
  }

  notaOff(midi) {
    this.opz.nota?.({ on: false, midi });
    this.rec?.noteOff(midi);
    this.roll.passiNota(midi, false);
  }

  // --- l'X-Touch (controller-synth.js): le sue azioni sul synth ---

  // Una manopola gira un parametro; un giro continuo è un passo solo di ⌘Z. `fine`: manopola premuta, un decimo del passo.
  giraControllo(k, passi, fine) {
    const p = PARAMETRI.find((x) => x.k === k);
    if (!p) return;
    const v = nuovoValore(p, this.stato, passi, fine);
    if (v === this.stato[k]) return; // in fondo alla corsa
    if (!this.timerManopola || this.manopolaDi !== k) this.inGesto = false; // un parametro nuovo è un passo nuovo di ⌘Z
    this.manopolaDi = k;
    clearTimeout(this.timerManopola);
    this.timerManopola = setTimeout(() => ((this.timerManopola = null), (this.inGesto = false)), 400);
    this.cambia(k, v);
  }

  // Premuta e rilasciata senza girare: il valore di partenza (quello del suono init).
  reimpostaControllo(k) {
    const p = PARAMETRI.find((x) => x.k === k);
    if (p) this.passo(() => this.cambia(k, p.def));
  }

  comandoControllo(nome) {
    switch (nome) {
      case 'play':
        return this.suonaOFerma();
      case 'stop':
        this.fermaAnteprima();
        this.fermaNote();
        return this.aggiorna();
      case 'rec':
        return this.avviaRec();
      case 'cue':
        return this.mandaCue();
      case 'mutate':
        return this.mutate();
      case 'annulla':
        return this.annulla();
      case 'ripeti':
        return this.rifai();
      case 'ab':
        return this.scegliSlot(this.slot.lato === 'A' ? 'B' : 'A');
      default:
    }
  }

  // Cosa il controller deve sapere del synth.
  perControllo() {
    return {
      stato: () => this.stato,
      nome: (k) => T.parametri[k] ?? k,
      corto: (k) => T.controller.corti[k] ?? String(T.parametri[k] ?? k).slice(0, 8),
      generale: () => T.controller.generale,
      gruppo: (g) => T.gruppi[g] ?? g,
      testo: (p, v) => etichettaValore(p, v),
      nomeComando: (c) => T.controller.comandi[c] ?? c,
      gira: (k, passi, fine) => this.giraControllo(k, passi, fine),
      reset: (k) => this.reimpostaControllo(k),
      comando: (c) => this.comandoControllo(c),
      suona: () => !!this.opz.suonaOra?.(),
      registra: () => !!this.rec,
      lato: () => this.slot.lato,
    };
  }

  // Un tasto del Mac giù: ritorna true se era un tasto della tastiera (da non lasciare al resto dell'app).
  tastoGiu(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || inCampoDiTesto(e.target)) return false;
    // con «passi» acceso: Spazio = pausa, ⌫ = indietro, ←→ muovono il cursore
    if (this.roll.passiAttivi) {
      if (e.code === 'Space') return (e.repeat || this.roll.pausa(), true);
      if (e.code === 'Backspace') return (e.repeat || this.roll.indietro(), true);
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') return (this.roll.muoviCursore((e.code === 'ArrowRight' ? 1 : -1) * this.roll.lunghezza), true);
    }
    // Spazio = ▶/■ della cuffia, come in Ableton (mai dentro un campo di testo: sopra). Un pulsante col fuoco non scatta.
    if (e.code === 'Space') {
      if (!e.repeat) this.suonaOFerma();
      return true;
    }
    const o = ottavaDopo(e.code, this.ottava);
    if (o !== null) {
      if (!e.repeat) this.ottava = o;
      this.disegnaOttava();
      return true;
    }
    const n = notaDaTasto(e.code, this.ottava);
    if (n === null) return false;
    if (!e.repeat && !this.tenuti.has(e.code)) {
      this.tenuti.set(e.code, n);
      this.notaOn(n);
    }
    return true;
  }

  tastoSu(e) {
    if (e.code === 'Space') return !(e.metaKey || e.ctrlKey || e.altKey || inCampoDiTesto(e.target)); // niente clic sul pulsante col fuoco
    const n = this.tenuti.get(e.code);
    if (n === undefined) return false;
    this.tenuti.delete(e.code);
    this.notaOff(n);
    return true;
  }

  // Un tocco sul pianoroll: la nota si sente un attimo.
  provaNota(n) {
    this.opz.nota?.({ on: true, midi: n, velocita: 100 });
    setTimeout(() => this.opz.nota?.({ on: false, midi: n }), 260);
  }

  fermaNote() {
    for (const n of this.tenuti.values()) {
      this.rec?.noteOff(n);
      this.roll.passiNota(n, false);
    }
    this.tenuti.clear();
    this.opz.fermaNote?.();
  }

  disegnaOttava() {
    this.ottavaEl.textContent = formatta(T.barra.tastiera, { n: this.ottava });
  }

  // REC: conteggio, registrazione, note nel pianoroll. Un altro clic: durante il conteggio annulla, durante la registrazione ferma e tiene.
  avviaRec() {
    if (this.rec) return this.fermaRec(this.rec.fase() !== 'registra');
    if (this.opz.ciclo?.() == null) return this.avviso(T.msg.nessunTempo);
    this.rec = new Registratore({ ciclo: () => this.opz.ciclo(), cicli: this.roll.cicli, griglia: this.roll.griglia });
    this.battitoClick = null;
    this.timerRec = setInterval(() => this.tickRec(), 20);
    this.avviso('');
    this.tickRec();
  }

  tickRec() {
    const r = this.rec;
    if (!r) return;
    const c = this.opz.ciclo?.();
    if (c == null) return this.fermaRec(true);
    const fase = r.fase(c);
    if (fase === 'fine') return this.fermaRec(false);
    if (fase === 'conta') {
      const b = Math.floor(c * 4);
      if (b !== this.battitoClick) {
        this.battitoClick = b;
        this.opz.click?.(b % 4 === 0);
      }
    }
    this.recEl.classList.toggle('conta', fase !== 'registra');
    this.recEl.classList.toggle('registra', fase === 'registra');
    this.recEl.firstChild.textContent = fase === 'registra' ? '● REC' : String(r.conto(c) ?? '');
  }

  fermaRec(annulla) {
    const r = this.rec;
    if (!r) return;
    clearInterval(this.timerRec);
    this.rec = null;
    this.recEl.classList.remove('conta', 'registra');
    this.recEl.firstChild.textContent = T.barra.rec;
    if (annulla) return this.avviso(T.msg.recAnnullato);
    r.chiudi();
    const nuovi = r.risultato();
    // con le note già scritte si aggiunge; con lo schema di prova (arpeggio, nota tenuta) si parte da vuoto
    const base = this.stato.anteprima === 'clip' && this.roll.editabile ? this.roll.eventi : [];
    const cicli = Math.max(r.cicli, base.length ? this.roll.cicli : 1);
    const uniti = [...base.filter((b) => !nuovi.some((x) => x.i === b.i && x.n === b.n)), ...nuovi].sort((a, b) => a.i - b.i || a.n - b.n);
    this.avviso(formatta(T.msg.registrate, { n: nuovi.length }));
    if (nuovi.length) this.cambiaNote(uniti, cicli);
  }

  mostraScheda(id) {
    this.scheda = id;
    this.pannelloEl ??= this.r.querySelector('.synth-pannello');
    this.pannelloEl.hidden = id !== 'suono';
    this.noteEl.hidden = id !== 'note';
    for (const [k, b] of Object.entries(this.schede)) b.classList.toggle('on', k === id);
    if (id === 'note') this.roll.disegna();
  }

  // Dal pianoroll: le note nuove (e quanti cicli si vedono). Due cicli uguali si scrivono come uno solo: i cicli scelti si ricordano qui.
  // Con n(…).scale(…) le note si riscrivono come gradi; se una esce dalla scala si passa a note("…") coi nomi, e lo dice.
  // gesto: 'inizio' | 'continua' = i cambi di uno stesso passo (un accordo scritto a passi) sono un solo passo di ⌘Z; senza, ogni cambio è un passo.
  cambiaNote(eventi, cicli, gesto) {
    this.cicliScelti = cicli;
    const g = this.roll.griglia;
    const sc = inGradi(this.stato) ? leggiScala(this.stato.scala) : null;
    const fuoriScala = !!sc && eventi.some((e) => notaInGrado(e.n, scalaDelCiclo(sc, Math.floor(e.i / g))) === null);
    const mini = sc && !fuoriScala ? miniDaEventi(eventi, cicli, g, (n, c) => String(notaInGrado(n, scalaDelCiclo(sc, c)))) : miniDaEventi(eventi, cicli, g);
    const scala = fuoriScala ? '' : this.stato.scala;
    const vel = velDaEventi(eventi, cicli, g);
    this.chiaveNote = null;
    if (mini === noteEffettive(this.stato) && this.stato.anteprima === 'clip' && scala === this.stato.scala && vel === (conVelocity(this.stato) ? this.stato.vel : '')) return this.disegna();
    const fa = () => this.imponi({ ...this.stato, note: mini, scala, vel, anteprima: 'clip' });
    if (gesto === 'continua') fa();
    else if (gesto === 'inizio') {
      this.inGesto = false;
      fa();
    } else this.passo(fa);
    if (fuoriScala) this.avviso(T.msg.fuoriScala);
  }

  // Il testo mini-notazione scritto a mano → le note (e il pianoroll). Un testo che non si può scrivere in un codice resta com'è.
  daMini(testoMini, fine) {
    const t = String(testoMini).trim();
    if (!noteValide(t)) {
      this.roll.miniEl.classList.add('errore');
      return;
    }
    this.roll.miniEl.classList.remove('errore');
    if (t === this.stato.note && this.stato.anteprima === 'clip') return;
    if (!this.miniInCorso) this.inGesto = false; // tutta la scrittura nel campo è un passo solo di ⌘Z
    this.miniInCorso = !fine;
    this.imponi({ ...this.stato, note: t, anteprima: 'clip' });
    if (fine) this.inGesto = false;
  }

  // Il codice scritto a mano → manopole. Se non si legge, o va fuori dai limiti, il suono di prima continua e lo dice.
  daCodice() {
    const r = leggiCodice(this.codiceEl.value, this.stato);
    if (r.errore) {
      this.erroreCodice = r.errore;
      this.codiceEl.classList.add('errore');
      this.avviso(formatta(T.msg.codiceErrore, { errore: r.errore }));
      return;
    }
    this.erroreCodice = null;
    this.codiceEl.classList.remove('errore');
    if (JSON.stringify(r.stato) === JSON.stringify(this.stato)) return this.avviso('');
    if (r.stato.note !== this.stato.note || r.stato.scala !== this.stato.scala) this.cicliScelti = 1; // un codice incollato porta i suoi cicli
    this.imponi(r.stato);
  }

  // --- stato, storia, anteprima ---

  // Un gesto di un colpo solo (un clic, un tasto): il prossimo cambio apre un passo nuovo della storia.
  passo(fa) {
    this.inGesto = false;
    fa();
    this.inGesto = false;
  }

  registra() {
    this.storia.push({ A: this.slot.A, B: this.slot.B, lato: this.slot.lato });
    if (this.storia.length > STORIA_MAX) this.storia.shift();
    this.ripeti = [];
  }

  // Un cambio di manopola: un giro continuo è un passo solo nella storia.
  cambia(k, v) {
    const p = PARAMETRI.find((x) => x.k === k);
    const nuovo = imposta(this.stato, k, v);
    if (nuovo === this.stato) {
      const voluto = { ...this.stato, [k]: pulisciValore(p, v) };
      if (voluto[k] !== this.stato[k] && costo(voluto) > COSTO_MAX) this.avviso(formatta(T.msg.tetto, { n: costo(voluto), max: COSTO_MAX }));
      return;
    }
    this.imponi(nuovo);
  }

  imponi(nuovo) {
    if (!this.inGesto) {
      this.registra();
      this.inGesto = true;
    }
    this.slot[this.slot.lato] = nuovo;
    if (!this.scrivendo) this.erroreCodice = null;
    this.avviso('');
    this.cambiato();
  }

  cambiato() {
    this.disegna();
    this.programmaAnteprima();
    this.programmaSuono();
    clearTimeout(this.timerSalva);
    this.timerSalva = setTimeout(() => this.opz.salva?.(this.contenuto()), PAUSA_SALVA_MS);
  }

  contenuto() {
    return { A: this.slot.A, B: this.slot.B, lato: this.slot.lato, nome: this.nome, quanto: this.quanto };
  }

  // Lo stato di prima (dalle preferenze o da una clip).
  carica(c) {
    if (!c || typeof c !== 'object') return;
    this.slot = { A: pulisci(c.A), B: c.B ? pulisci(c.B) : null, lato: c.lato === 'B' && c.B ? 'B' : 'A' };
    if (typeof c.nome === 'string' && c.nome.trim()) this.nome = c.nome.slice(0, 60);
    if (Number.isFinite(c.quanto)) this.quanto = Math.min(100, Math.max(0, c.quanto));
    this.quantoEl.value = String(this.quanto);
    this.nomeEl.value = this.nome;
    this.storia = [];
    this.ripeti = [];
    this.cicliScelti = 1;
    this.grigliaScelta = null;
    this.scalaDelPianoroll = null;
    this.disegna();
  }

  // Un suono aperto da una clip: si riparte da lì, con lo schema «note della clip».
  apri(stato, nome) {
    this.aperta = { nome };
    this.nome = nome || this.nome;
    this.nomeEl.value = this.nome;
    this.registra();
    this.slot = { A: pulisci({ ...stato, anteprima: 'clip' }), B: null, lato: 'A' };
    this.roll.sel = []; // le note scelte erano di un'altra clip
    this.grigliaScelta = null;
    this.scalaDelPianoroll = null;
    this.cicliScelti = 1;
    this.inGesto = false;
    this.avviso('');
    this.cambiato();
  }

  annulla() {
    const prima = this.storia.pop();
    if (!prima) return false;
    this.ripeti.push({ A: this.slot.A, B: this.slot.B, lato: this.slot.lato });
    this.slot = prima;
    this.inGesto = false;
    this.avviso('');
    this.cambiato();
    return true;
  }

  rifai() {
    const dopo = this.ripeti.pop();
    if (!dopo) return false;
    this.storia.push({ A: this.slot.A, B: this.slot.B, lato: this.slot.lato });
    this.slot = dopo;
    this.inGesto = false;
    this.avviso('');
    this.cambiato();
    return true;
  }

  // Lo slot acceso: la prima volta che si accende B parte uguale ad A. Si sente subito, se la prova suona.
  scegliSlot(lato) {
    if (lato === this.slot.lato) return;
    this.passo(() => {
      this.registra();
      if (!this.slot.B) this.slot.B = this.slot.A;
      this.slot.lato = lato;
      this.cambiato();
    });
  }

  // Copia lo slot acceso nell'altro.
  copiaInAltro() {
    this.passo(() => {
      this.registra();
      const altro = this.slot.lato === 'A' ? 'B' : 'A';
      this.slot[altro] = this.stato;
      this.avviso(formatta(T.msg.copiato, { lato: altro }));
      this.cambiato();
    });
  }

  // Riparte da zero ma tiene le note della clip.
  riparti() {
    this.passo(() => {
      const { note, anteprima } = this.stato;
      this.imponi({ ...iniziale(), note, anteprima });
    });
  }

  mutate() {
    this.passo(() => this.imponi(mutate(this.stato, this.quanto / 100, Math.random)));
  }

  salvaSoon() {
    clearTimeout(this.timerSalva);
    this.timerSalva = setTimeout(() => this.opz.salva?.(this.contenuto()), PAUSA_SALVA_MS);
  }

  programmaAnteprima() {
    if (!this.opz.suonaOra()) return;
    clearTimeout(this.timerAnteprima);
    this.timerAnteprima = setTimeout(() => this.suona(), PAUSA_ANTEPRIMA_MS);
  }

  async suona() {
    const errore = await this.opz.suona(codice(this.stato), this.nome);
    // l'errore di Strudel nomina tutta la catena: qui basta la parte che dice cosa non va. Un suono che parte bene toglie solo quell'errore, non gli altri avvisi.
    if (errore) {
      this.avviso(formatta(T.msg.codiceNonParte, { errore: String(errore).replace(/^[\s\S]*\)\.(\w+ is not a function)$/, '$1') }));
      this.erroreSuono = true;
    } else if (this.erroreSuono) {
      this.avviso('');
      this.erroreSuono = false;
    }
  }

  suonaOFerma() {
    if (this.opz.suonaOra()) this.opz.ferma();
    else this.suona();
    this.aggiorna();
  }

  // ⌘↵ e il tasto: la prova in cuffia della vista SYNTH.
  provaInCuffia() {
    return this.suonaOFerma();
  }

  fermaAnteprima() {
    clearTimeout(this.timerAnteprima);
    if (this.opz.suonaOra()) this.opz.ferma();
  }

  mandaCue() {
    const dest = this.destinazioneEl.value;
    const testo = clip(this.stato);
    const errore = this.opz.mandaCue(dest, this.nome, testo, this.stato.categoria);
    this.avviso(errore ?? formatta(T.msg.mandata, { nome: this.nome, dove: T.destinazioni[dest] }));
  }

  avviso(testo) {
    this.avvisoEl.textContent = testo;
  }

  // --- disegno ---

  disegna() {
    const s = this.stato;
    for (const [k, c] of this.controlli) {
      const p = c.p;
      const v = s[k];
      c.el.classList.toggle('spenta', !attivo(p, s));
      if (p.tipo === 'scelta') {
        for (const [val, b] of c.bottoni) b.classList.toggle('on', val === v);
      } else if (p.tipo === 'bool') {
        c.interruttore.classList.toggle('on', !!v);
        c.interruttore.textContent = v ? T.valori.on : T.valori.off;
      } else {
        const t = aPosizione(p, s, v);
        c.anello.setAttribute('stroke-dasharray', `${(t * 75).toFixed(2)} 100`);
        c.valoreEl.textContent = etichettaValore(p, v);
        c.el.setAttribute('aria-valuenow', String(v));
        c.el.classList.toggle('acceso', t > 0.001);
      }
    }
    if (!this.scrivendo && !this.erroreCodice) {
      this.codiceEl.value = codice(s);
      this.codiceEl.classList.remove('errore');
    }
    this.disegnaNote(s);
    this.disegnaOttava();
    const nomiMano = new Set(s.mano.map((m) => /^\.(\w+)/.exec(m)?.[1]));
    this.manoEl.textContent = s.mano.length || s.testa ? `${T.msg.aMano}: ${[s.testa, ...s.mano].filter(Boolean).join(' ')}` : '';
    this.manoEl.hidden = !this.manoEl.textContent;
    for (const [k, c] of this.controlli) c.el.classList.toggle('a-mano', funzioniDi(k).some((f) => nomiMano.has(f)));
    this.anteprimaEl.value = s.anteprima;
    this.anteprimaEl.querySelector('option[value="clip"]').disabled = !this.aperta && s.anteprima !== 'clip';
    this.slotA.classList.toggle('on', this.slot.lato === 'A');
    this.slotB.classList.toggle('on', this.slot.lato === 'B');
    this.slotB.classList.toggle('vuoto', !this.slot.B);
    this.copiaEl.firstChild.textContent = formatta(T.barra.copia, { lato: this.slot.lato === 'A' ? 'B' : 'A' });
    this.categoriaEl.value = s.categoria;
    this.titoloCodice.textContent = formatta(T.barra.codiceSlot, { lato: this.slot.lato });
    const peso = costo(s);
    this.pesoEl.textContent = formatta(peso >= COSTO_AVVISO ? T.barra.pesante : T.barra.peso, { n: peso, max: COSTO_MAX });
    this.pesoEl.classList.toggle('pesante', peso >= COSTO_AVVISO);
    this.aggiornaDestinazioni();
  }

  disegnaNote(s) {
    const mini = noteEffettive(s);
    const chiave = `${s.testa}|${mini}|${inGradi(s) ? s.scala : ''}|${conVelocity(s) ? s.vel : ''}|${this.cicliScelti}|${this.grigliaScelta}`;
    if (chiave === this.chiaveNote) return;
    this.chiaveNote = chiave;
    const sc = inGradi(s) ? leggiScala(s.scala) : null;
    // la scala del codice diventa la scala del pianoroll, una volta (poi la si può cambiare per scrivere note fuori scala)
    if (sc && s.scala !== this.scalaDelPianoroll) this.roll.impostaScala(sc);
    this.scalaDelPianoroll = sc ? s.scala : null;
    const r = s.testa ? null : eventiDaMini(mini, { scala: sc, griglia: this.grigliaScelta });
    if (s.testa) this.roll.imposta({ eventi: [], cicli: 1, editabile: false, messaggio: it.synth.note.noteMano, mini: '' });
    else if (r.errore) this.roll.imposta({ eventi: [], cicli: 1, editabile: false, messaggio: r.errore, mini });
    else {
      const cicli = r.fuoriGriglia ? r.cicli : Math.max(r.cicli, this.cicliScelti);
      const eventi = cicli > r.cicli ? conCicli(r.eventi, r.cicli, cicli, r.griglia) : r.eventi;
      this.roll.imposta({ eventi: conVelocity(s) ? velocitaPerNote(s.vel, eventi, r.griglia) : eventi, cicli, griglia: r.griglia, editabile: !r.fuoriGriglia, messaggio: r.fuoriGriglia ? it.synth.note.fuoriGriglia : '', mini });
    }
  }

  aggiornaDestinazioni() {
    if (!this.avviata) return; // le destinazioni si chiedono all'app solo a vista aperta (il kit e i brani nascono dopo)
    const dest = this.opz.destinazioni();
    const scelta = this.destinazioneEl.value;
    const firma = JSON.stringify(dest);
    if (firma === this.firmaDest) return;
    this.firmaDest = firma;
    this.destinazioneEl.replaceChildren(...dest.map((d) => Object.assign(new Option(d.nome, d.id), { disabled: !d.ok })));
    const ok = dest.find((d) => d.id === scelta && d.ok) ?? dest.find((d) => d.ok);
    if (ok) this.destinazioneEl.value = ok.id;
    this.cueEl.disabled = !ok;
  }

  // Chiamata ogni 100 ms: il tasto ▶ segue quello che la cuffia sta davvero suonando.
  aggiorna() {
    this.avviata = true;
    this.playEl.classList.toggle('on', !!this.opz.suonaOra());
    this.roll.testina(this.scheda === 'note' && !!this.opz.suonaOra());
    this.aggiornaDestinazioni();
  }
}
