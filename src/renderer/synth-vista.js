// La vista SYNTH: pannello a manopole (oscillatore, filtro, ampiezza, effetti), barra, codice sempre visibile.
// Ogni manopola è un parametro di Strudel (synth-modello.js); il codice si riscrive mentre giro (synth-codice.js).
// Qui non suona niente da sola: la cuffia la comanda app.js, attraverso le funzioni di `opz`.
import { COSTO_AVVISO, COSTO_MAX, GRUPPI, PARAMETRI, aPosizione, attivo, costo, daPosizione, imposta, iniziale, pulisci, pulisciValore, sorprendi } from './synth-modello.js';
import { clip, codice } from './synth-codice.js';
import it from './testi/it.json';

const T = it.synth;
// Un testo dal file dei testi con i suoi {segnaposto}.
export const formatta = (modello, vars = {}) => String(modello).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

const PASSO_FINE = 0.002; // per pixel di trascinamento con ⇧
const PASSO = 0.006; // per pixel
const STORIA_MAX = 100;
const PAUSA_ANTEPRIMA_MS = 90;
const PAUSA_SALVA_MS = 800;

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
    this.anteprimaEl = crea('select', 'synth-select');
    this.anteprimaEl.setAttribute('aria-label', T.barra.schema);
    this.anteprimaEl.dataset.aiuto = 'synth-schema';
    for (const [id, nome] of Object.entries(T.anteprime)) this.anteprimaEl.append(new Option(nome, id));
    this.anteprimaEl.onchange = () => this.passo(() => this.imponi({ ...this.stato, anteprima: this.anteprimaEl.value }));

    this.abEl = this.tasto('A', T.barra.ab, () => this.scambiaAB(), 'synth-ab');
    this.copiaEl = this.tasto(T.barra.copia, '', () => this.copiaInAltro(), 'synth-copia');
    this.initEl = this.tasto(T.barra.init, '', () => this.riparti());
    this.sorprendiEl = this.tasto(T.barra.sorprendimi, '', () => this.sorprendimi());

    this.destinazioneEl = crea('select', 'synth-select');
    this.destinazioneEl.setAttribute('aria-label', T.barra.destinazione);
    this.destinazioneEl.dataset.aiuto = 'synth-destinazione';
    this.cueEl = this.tasto(T.barra.cue, '', () => this.mandaCue(), 'synth-cue acid');

    this.pesoEl = crea('span', 'lbl synth-peso');
    this.pesoEl.dataset.aiuto = 'synth-peso';
    this.avvisoEl = crea('span', 'synth-avviso');
    this.avvisoEl.setAttribute('role', 'status');

    barra.append(this.nomeEl, this.playEl, this.anteprimaEl, crea('span', 'sep'), this.abEl, this.copiaEl, this.initEl, this.sorprendiEl, crea('span', 'spazio'), this.pesoEl, this.destinazioneEl, this.cueEl);
    for (const [el, chiave] of [[this.playEl, 'synth-play'], [this.abEl, 'synth-ab'], [this.copiaEl, 'synth-copia'], [this.initEl, 'synth-init'], [this.sorprendiEl, 'synth-sorprendi'], [this.cueEl, 'synth-cue']]) el.dataset.aiuto = chiave;

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
    lato.append(crea('h2', 'lbl', T.barra.codice));
    this.codiceEl = crea('pre', 'synth-pre');
    this.codiceEl.dataset.aiuto = 'synth-codice';
    lato.append(this.codiceEl, crea('p', 'secondario', T.msg.nota), this.avvisoEl);

    corpo.append(pannello, lato);
    this.r.replaceChildren(barra, corpo);
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
    this.avviso('');
    this.cambiato();
  }

  cambiato() {
    this.disegna();
    this.programmaAnteprima();
    clearTimeout(this.timerSalva);
    this.timerSalva = setTimeout(() => this.opz.salva?.(this.contenuto()), PAUSA_SALVA_MS);
  }

  contenuto() {
    return { A: this.slot.A, B: this.slot.B, lato: this.slot.lato, nome: this.nome };
  }

  // Lo stato di prima (dalle preferenze o da una clip).
  carica(c) {
    if (!c || typeof c !== 'object') return;
    this.slot = { A: pulisci(c.A), B: c.B ? pulisci(c.B) : null, lato: c.lato === 'B' && c.B ? 'B' : 'A' };
    if (typeof c.nome === 'string' && c.nome.trim()) this.nome = c.nome.slice(0, 60);
    this.nomeEl.value = this.nome;
    this.storia = [];
    this.ripeti = [];
    this.disegna();
  }

  // Un suono aperto da una clip: si riparte da lì, con lo schema «note della clip».
  apri(stato, nome) {
    this.aperta = { nome };
    this.nome = nome || this.nome;
    this.nomeEl.value = this.nome;
    this.registra();
    this.slot = { A: pulisci({ ...stato, anteprima: 'clip' }), B: null, lato: 'A' };
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

  scambiaAB() {
    this.passo(() => {
      this.registra();
      if (!this.slot.B) this.slot.B = this.slot.A; // la prima volta B parte uguale ad A
      this.slot.lato = this.slot.lato === 'A' ? 'B' : 'A';
      this.cambiato();
    });
  }

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

  sorprendimi() {
    this.passo(() => this.imponi(sorprendi(Math.random, this.stato)));
  }

  programmaAnteprima() {
    if (!this.opz.suonaOra()) return;
    clearTimeout(this.timerAnteprima);
    this.timerAnteprima = setTimeout(() => this.suona(), PAUSA_ANTEPRIMA_MS);
  }

  async suona() {
    const errore = await this.opz.suona(codice(this.stato), this.nome);
    this.avviso(errore ? formatta(T.msg.codiceNonParte, { errore }) : '');
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
    const errore = this.opz.mandaCue(dest, this.nome, testo);
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
    this.codiceEl.textContent = codice(s);
    this.anteprimaEl.value = s.anteprima;
    this.anteprimaEl.querySelector('option[value="clip"]').disabled = !this.aperta && s.anteprima !== 'clip';
    this.abEl.firstChild.textContent = this.slot.lato;
    this.abEl.classList.toggle('on', this.slot.lato === 'B');
    this.copiaEl.disabled = !this.slot.B;
    const peso = costo(s);
    this.pesoEl.textContent = formatta(peso >= COSTO_AVVISO ? T.barra.pesante : T.barra.peso, { n: peso, max: COSTO_MAX });
    this.pesoEl.classList.toggle('pesante', peso >= COSTO_AVVISO);
    this.aggiornaDestinazioni();
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
    this.aggiornaDestinazioni();
  }
}
