// Il pianoroll del SYNTH: si disegna col mouse e resta allineato alla mini-notazione (synth-note.js).
// Due strumenti (B li alterna). Selezione: trascini nel vuoto per un rettangolo, doppio clic mette una nota. Matita: un clic mette una
// nota (o un accordo) lunga quanto la «lunghezza»; trascinando a destra si allunga.
// Su una nota: la scegli, la sposti (anche in altezza, tutte le scelte insieme); dal bordo destro si allunga; ⌥-clic o clic destro
// la tolgono, ⌫ toglie le scelte. ⌘A tutte, ⌘C ⌘X ⌘V, ⌘D duplica, ↑↓ trasponi (⇧ un'ottava).
// Con la scala scelta le note si agganciano ai gradi della scala. Ogni gesto è un cambio solo (un passo di ⌘Z).
import it from './testi/it.json';
import {
  ACCORDI, CICLI, GRIGLIE, NOTA_MAX, NOTA_MIN, SCALE, SCATTI, accordoEventi, agganciaScala, allunga, appunti, conCicli, duplica, eNero, inScala, incolla, muovi,
  nelRettangolo, nomeNota, senzaEvento, senzaScelte, trasponi, uniscisel,
} from './synth-note.js';

const T = it.synth.note;
const TASTI_W = 52; // la colonna dei tasti a sinistra
const RIGA_H = 13;
const OTTAVE_VISTE = 3;
const RIGHE = OTTAVE_VISTE * 12;
const LARGHEZZA_MIN = 12;
const LARGHEZZA_MAX = 40;
const BORDO_PX = 7; // gli ultimi pixel di una nota sono la maniglia per allungarla
const DOPPIO_MS = 500; // due clic sulla stessa cella vuota
const TENUTO_B_MS = 450; // B tenuto più di così: lo strumento torna com'era al rilascio
const riferimento = (e) => ({ i: e.i, n: e.n });
const mcd = (a, b) => (b ? mcd(b, a % b) : a);
// k scatti di una griglia da g scatti per ciclo, come frazione del ciclo: 4 su 16 → «1/4», 1 su 12 → «1/12», 12 su 12 → «1»
export function frazione(k, g) {
  const d = mcd(k, g);
  return g / d === 1 ? String(k / d) : `${k / d}/${g / d}`;
}
let negliAppunti = null; // ⌘C: restano anche cambiando clip

const crea = (tag, classe, testo) => {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined) el.textContent = testo;
  return el;
};
const css = (nome, riserva) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || riserva;

export class PianoRoll {
  // opz: { cambia(eventi, cicli), nota(midi), testo(mini), ciclo() → numero|null }
  constructor(radice, opz) {
    this.r = radice;
    this.opz = opz;
    this.eventi = [];
    this.cicli = 1;
    this.editabile = true;
    this.messaggio = '';
    this.scala = { radice: 0, tipo: 'cromatica' };
    this.accordo = 'nota';
    this.griglia = SCATTI; // scatti per ciclo: 16 (1/16), 12 (terzine)…
    this.lunghezza = 4; // in scatti
    this.basso = 36; // la nota più bassa che si vede (c2)
    this.sel = []; // le note scelte: { i, n }
    this.cursore = null; // lo scatto dove ⌘V incolla (l'ultimo clic)
    this.strumento = 'seleziona'; // o 'matita'
    this.gesto = null;
    this.larghezza = 16;
    this.costruisci();
  }

  costruisci() {
    const barra = crea('div', 'roll-barra');
    this.cicliEl = crea('div', 'roll-cicli');
    this.cicliEl.dataset.aiuto = 'roll-cicli';
    this.cicliBottoni = CICLI.map((c) => {
      const b = crea('button', 'key piccolo', String(c));
      b.onclick = () => this.cambiaCicli(c);
      this.cicliEl.append(b);
      return [c, b];
    });
    const campo = (nome, el, aiuto) => {
      const w = crea('label', 'roll-campo');
      w.append(crea('span', 'lbl', nome), el);
      if (aiuto) w.dataset.aiuto = aiuto;
      return w;
    };
    this.lunghezzaEl = crea('select', 'synth-select');
    this.lunghezzaEl.onchange = () => (this.lunghezza = Number(this.lunghezzaEl.value));
    this.opzioniLunghezza();
    this.grigliaEl = crea('select', 'synth-select');
    for (const g of GRIGLIE) this.grigliaEl.append(new Option(frazione(1, g), String(g)));
    this.grigliaEl.value = String(this.griglia);
    this.grigliaEl.onchange = () => this.opz.griglia?.(Number(this.grigliaEl.value));
    this.scalaEl = crea('select', 'synth-select');
    this.scalaEl.append(new Option(T.nessunaScala, 'cromatica'));
    for (const n of Object.keys(SCALE).filter((x) => x !== 'cromatica')) this.scalaEl.append(new Option(n, n));
    this.scalaEl.onchange = () => {
      this.scala.tipo = this.scalaEl.value;
      this.disegna();
    };
    this.radiceEl = crea('select', 'synth-select');
    T.radici.forEach((n, i) => this.radiceEl.append(new Option(n, String(i))));
    this.radiceEl.onchange = () => {
      this.scala.radice = Number(this.radiceEl.value);
      this.disegna();
    };
    this.accordoEl = crea('select', 'synth-select');
    for (const n of Object.keys(ACCORDI)) this.accordoEl.append(new Option(n, n));
    this.accordoEl.onchange = () => (this.accordo = this.accordoEl.value);
    const su = crea('button', 'key piccolo', '▲');
    const giu = crea('button', 'key piccolo', '▼');
    su.onclick = () => this.muoviVista(12);
    giu.onclick = () => this.muoviVista(-12);
    su.dataset.aiuto = giu.dataset.aiuto = 'roll-ottava';
    const pulisci = crea('button', 'key piccolo', T.pulisci);
    pulisci.onclick = () => this.pulisci();
    this.matitaEl = crea('button', 'key piccolo', T.matita);
    this.matitaEl.dataset.aiuto = 'roll-matita';
    this.matitaEl.onclick = () => this.usaStrumento(this.strumento === 'matita' ? 'seleziona' : 'matita');
    barra.append(this.matitaEl, this.cicliEl, campo(T.griglia, this.grigliaEl, 'roll-griglia'), campo(T.lunghezza, this.lunghezzaEl, 'roll-lunghezza'), campo(T.scala, this.scalaEl, 'roll-scala'), this.radiceEl, campo(T.accordo, this.accordoEl, 'roll-accordo'), su, giu, pulisci);

    // la stessa cosa in mini-notazione: si modifica l'una o l'altra e restano allineate
    const riga = crea('div', 'roll-mini');
    this.miniEl = crea('input', 'synth-nome roll-mini-testo');
    this.miniEl.spellcheck = false;
    this.miniEl.dataset.aiuto = 'roll-mini';
    this.miniEl.setAttribute('aria-label', T.mini);
    this.miniEl.oninput = () => this.opz.testo(this.miniEl.value, false);
    this.miniEl.onchange = () => this.opz.testo(this.miniEl.value, true);
    this.messaggioEl = crea('span', 'roll-messaggio');
    riga.append(crea('span', 'lbl', T.mini), this.miniEl, this.messaggioEl);

    this.scorri = crea('div', 'roll-scorri');
    this.canvas = crea('canvas', 'roll-canvas');
    this.canvas.tabIndex = 0;
    this.canvas.dataset.aiuto = 'roll';
    this.scorri.append(this.canvas);
    this.r.replaceChildren(barra, riga, this.scorri);

    this.canvas.addEventListener('pointerdown', (e) => this.premuto(e));
    this.canvas.addEventListener('pointermove', (e) => this.mosso(e));
    this.canvas.addEventListener('pointerup', (e) => this.rilasciato(e));
    this.canvas.addEventListener('pointercancel', (e) => this.rilasciato(e));
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const c = this.cella(e);
      const h = c && this.trova(c.passo, c.nota);
      if (h && this.editabile) this.togli([h]);
    });
    this.canvas.addEventListener('keydown', (e) => this.tasto(e));
    this.canvas.addEventListener('keyup', (e) => {
      if (e.code !== 'KeyB' || !this.tastoB) return;
      if (performance.now() - this.tastoB.quando > TENUTO_B_MS) this.usaStrumento(this.tastoB.prima);
      this.tastoB = null;
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // lo scorrimento orizzontale è quello del contenitore
        e.preventDefault();
        this.muoviVista(Math.sign(e.deltaY) * -3);
      },
      { passive: false },
    );
    new ResizeObserver(() => this.disegna()).observe(this.scorri);
  }

  // Cosa mostrare: gli eventi, i cicli, se si possono modificare, il testo mini e un messaggio.
  imposta({ eventi, cicli, griglia = SCATTI, editabile = true, messaggio = '', mini }) {
    if (griglia !== this.griglia) {
      this.griglia = griglia;
      this.grigliaEl.value = String(griglia);
      this.lunghezza = Math.max(1, Math.round(griglia / 4));
      this.opzioniLunghezza();
    }
    this.eventi = eventi;
    this.cicli = cicli;
    this.editabile = editabile;
    this.messaggio = messaggio;
    if (mini !== undefined && document.activeElement !== this.miniEl) this.miniEl.value = mini;
    this.messaggioEl.textContent = messaggio;
    this.miniEl.classList.toggle('errore', !!messaggio && !editabile);
    this.sel = this.sel.filter((s) => eventi.some((e) => e.i === s.i && e.n === s.n)); // ⌘Z, il testo o un'altra clip possono togliere note
    if (this.cursore !== null && this.cursore >= cicli * this.griglia) this.cursore = null;
    for (const [c, b] of this.cicliBottoni) b.classList.toggle('on', c === cicli);
    const note = eventi.map((e) => e.n);
    if (note.length && !this.visitato) {
      // la prima volta la vista si porta dove sono le note
      const medio = Math.round(note.reduce((a, b) => a + b, 0) / note.length);
      this.basso = Math.max(NOTA_MIN, Math.min(NOTA_MAX - RIGHE, Math.floor((medio - RIGHE / 2) / 12) * 12));
      this.visitato = true;
    }
    this.disegna();
  }

  // Le lunghezze della nota nuova per la griglia di adesso: i divisori del ciclo, scritti come frazioni.
  opzioniLunghezza() {
    const g = this.griglia;
    this.lunghezzaEl.replaceChildren(...Array.from({ length: g }, (_, k) => k + 1).filter((k) => g % k === 0).map((k) => new Option(frazione(k, g), String(k))));
    if (!Array.from(this.lunghezzaEl.options).some((o) => Number(o.value) === this.lunghezza)) this.lunghezza = Math.max(1, Math.round(g / 4));
    this.lunghezzaEl.value = String(this.lunghezza);
  }

  // La scala del brano (n("…").scale("A2:minor")): il pianoroll la prende come sua, una volta; poi si può cambiare.
  impostaScala({ radice, tipo }) {
    this.scala = { radice, tipo };
    this.scalaEl.value = tipo;
    this.radiceEl.value = String(radice);
  }

  usaStrumento(s) {
    this.strumento = s;
    this.matitaEl.classList.toggle('on', s === 'matita');
    this.canvas.style.cursor = '';
  }

  eScelta(e) {
    return this.sel.some((s) => s.i === e.i && s.n === e.n);
  }

  muoviVista(delta) {
    this.basso = Math.max(NOTA_MIN, Math.min(NOTA_MAX - RIGHE, this.basso + delta));
    this.disegna();
  }

  get alto() {
    return this.basso + RIGHE - 1;
  }

  // --- geometria ---

  // La cella sotto il mouse; fuori dalla griglia è null, oppure (fermo = true) la cella più vicina.
  cella(e, fermo = false) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let passo = Math.floor((x - TASTI_W) / this.larghezza);
    let nota = this.alto - Math.floor(y / RIGA_H);
    if (fermo) {
      passo = Math.max(0, Math.min(this.cicli * this.griglia - 1, passo));
      nota = Math.max(this.basso, Math.min(this.alto, nota));
    } else if (x < TASTI_W || y < 0 || passo < 0 || passo >= this.cicli * this.griglia || nota < this.basso || nota > this.alto) return null;
    return { passo, nota, x: x - TASTI_W - passo * this.larghezza };
  }

  trova(passo, nota) {
    return this.eventi.find((e) => e.n === nota && passo >= e.i && passo < e.i + e.l) ?? null;
  }

  // --- gesti ---

  premuto(e) {
    this.canvas.focus();
    if (e.button !== 0 || !this.editabile) return;
    const c = this.cella(e);
    if (!c) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.cursore = c.passo;
    const h = this.trova(c.passo, c.nota);
    if (h && e.altKey) return this.togli([h]);
    if (h && this.strumento === 'matita') {
      // la matita su una nota: cancella, e trascinando cancella tutte quelle che incontra
      this.gesto = { tipo: 'cancella', ultima: c, cambiato: false };
      this.cancellaTra(this.gesto, c, c);
      return this.disegna();
    }
    if (h) {
      if (e.shiftKey) {
        if (this.eScelta(h)) {
          this.sel = this.sel.filter((s) => !(s.i === h.i && s.n === h.n)); // ⇧-clic su una scelta: la toglie dalla scelta
          return this.disegna();
        }
        this.sel = [...this.sel, riferimento(h)];
      } else if (!this.eScelta(h)) this.sel = [riferimento(h)];
      const alBordo = (h.i + h.l) * this.larghezza - (c.passo * this.larghezza + c.x) <= BORDO_PX;
      this.gesto = { tipo: alBordo ? 'allunga' : 'sposta', ancora: { ...h }, base: this.eventi, sel0: this.sel.map((s) => ({ ...s })), scostamento: c.passo - h.i, dn: 0, cambiato: false };
      this.opz.nota?.(h.n);
    } else {
      const ora = performance.now();
      const doppio = this.vuoto && ora - this.vuoto.t < DOPPIO_MS && this.vuoto.passo === c.passo && this.vuoto.nota === c.nota;
      this.vuoto = this.strumento === 'matita' ? null : { t: ora, passo: c.passo, nota: c.nota };
      if (this.strumento === 'matita') {
        // la matita nel vuoto: una nota per ogni «lunghezza» (a passi di quella lunghezza, a partire dal clic) lungo il trascinamento; l'altezza segue il mouse
        this.gesto = { tipo: 'matita', passo0: c.passo, L: this.lunghezza, fatti: new Set(), ultimoK: null, nuovi: [], base: this.eventi, cambiato: true };
        this.matitaPassa(this.gesto, c);
        this.vuoto = null;
      } else if (doppio) {
        const n = agganciaScala(c.nota, this.scala.radice, this.scala.tipo);
        const fine = (Math.floor(c.passo / this.griglia) + 1) * this.griglia; // una nota non esce dal suo ciclo
        const l = Math.min(this.lunghezza, fine - c.passo);
        const nuovi = accordoEventi(n, this.accordo, c.passo, l).filter((x) => x.n >= NOTA_MIN && x.n <= NOTA_MAX);
        this.gesto = { tipo: 'disegna', inizio: c.passo, fine, nuovi, base: this.eventi, cambiato: true };
        this.eventi = this.unisci(this.eventi, nuovi);
        this.sel = nuovi.map(riferimento);
        this.vuoto = null;
        this.opz.nota?.(n);
      } else {
        this.gesto = { tipo: 'rettangolo', da: c, a: c, prima: e.shiftKey ? this.sel : [], cambiato: false };
        if (!e.shiftKey) this.sel = [];
      }
    }
    this.disegna();
  }

  // La matita arriva sulla cella c: mette le note dei passi che ha attraversato (anche tutti insieme, se il mouse è veloce), all'altezza di adesso.
  matitaPassa(g, c) {
    const k1 = Math.floor((c.passo - g.passo0) / g.L);
    const k0 = g.ultimoK ?? k1;
    const n = agganciaScala(c.nota, this.scala.radice, this.scala.tipo);
    for (let k = k0; k0 <= k1 ? k <= k1 : k >= k1; k += k0 <= k1 ? 1 : -1) {
      if (g.fatti.has(k)) continue;
      g.fatti.add(k);
      const i = g.passo0 + k * g.L;
      if (i < 0 || i >= this.cicli * this.griglia) continue;
      const l = Math.min(g.L, (Math.floor(i / this.griglia) + 1) * this.griglia - i); // una nota non esce dal suo ciclo
      g.nuovi.push(...accordoEventi(n, this.accordo, i, l).filter((x) => x.n >= NOTA_MIN && x.n <= NOTA_MAX));
      if (k === k1) this.opz.nota?.(n);
    }
    g.ultimoK = k1;
    this.eventi = this.unisci(g.base, g.nuovi);
    this.sel = g.nuovi.map(riferimento);
  }

  // La matita-gomma passa da una cella all'altra: toglie le note che incontra (si seguono le celle in mezzo, il mouse può saltare).
  cancellaTra(g, da, a) {
    let [x, y] = [da.passo, da.nota];
    const dx = Math.abs(a.passo - x);
    const dy = -Math.abs(a.nota - y);
    const sx = x < a.passo ? 1 : -1;
    const sy = y < a.nota ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      const h = this.trova(x, y);
      if (h) {
        this.eventi = senzaEvento(this.eventi, h);
        this.sel = this.sel.filter((q) => !(q.i === h.i && q.n === h.n));
        g.cambiato = true;
      }
      if (x === a.passo && y === a.nota) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    g.ultima = a;
  }

  mosso(e) {
    const g = this.gesto;
    if (g?.tipo === 'matita') {
      this.matitaPassa(g, this.cella(e, true));
      return this.disegna();
    }
    if (g?.tipo === 'cancella') {
      this.cancellaTra(g, g.ultima, this.cella(e, true));
      return this.disegna();
    }
    if (g?.tipo === 'rettangolo') {
      const c = this.cella(e, true);
      g.a = c;
      this.sel = uniscisel(g.prima, nelRettangolo(this.eventi, { i0: g.da.passo, i1: c.passo, n0: g.da.nota, n1: c.nota }));
      return this.disegna();
    }
    const c = this.cella(e);
    if (!g) {
      this.canvas.style.cursor = c && this.trova(c.passo, c.nota) ? 'grab' : this.strumento === 'matita' ? 'crosshair' : '';
      return;
    }
    if (!c) return;
    if (g.tipo === 'disegna') {
      const l = Math.max(1, Math.min(g.fine - g.inizio, c.passo - g.inizio + 1));
      this.eventi = this.unisci(g.base, g.nuovi.map((x) => ({ ...x, l })));
    } else if (g.tipo === 'allunga') {
      const a = g.ancora;
      const fine = (Math.floor(a.i / this.griglia) + 1) * this.griglia;
      const l = Math.max(1, Math.min(fine - a.i, c.passo - a.i + 1));
      this.eventi = allunga(g.base, g.sel0, l - a.l, this.griglia);
      g.cambiato = l !== a.l;
    } else {
      const n = agganciaScala(c.nota, this.scala.radice, this.scala.tipo);
      const r = muovi(g.base, g.sel0, c.passo - g.scostamento - g.ancora.i, n - g.ancora.n, this.cicli, this.griglia);
      this.eventi = r.eventi;
      this.sel = r.sel;
      if (r.dn !== g.dn) this.opz.nota?.(g.ancora.n + r.dn);
      g.dn = r.dn;
      g.cambiato = r.di !== 0 || r.dn !== 0;
    }
    this.disegna();
  }

  rilasciato(e) {
    const g = this.gesto;
    this.gesto = null;
    if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (g?.cambiato) this.opz.cambia(this.eventi, this.cicli);
    else if (g) this.disegna();
  }

  unisci(base, nuovi) {
    const fuori = base.filter((e) => !nuovi.some((x) => x.i === e.i && x.n === e.n));
    return [...fuori, ...nuovi].sort((a, b) => a.i - b.i || a.n - b.n);
  }

  // Cambia le note e lo dice (un solo passo di ⌘Z). Le scelte seguono se arrivano nuove (sel).
  applica(eventi, sel = this.sel) {
    this.eventi = eventi;
    this.sel = sel;
    this.opz.cambia(this.eventi, this.cicli);
    this.disegna();
  }

  togli(lista) {
    this.applica(senzaScelte(this.eventi, lista), this.sel.filter((s) => !lista.some((x) => x.i === s.i && x.n === s.n)));
  }

  pulisci() {
    if (!this.editabile || !this.eventi.length) return;
    this.applica([], []);
  }

  // --- tastiera (con il pianoroll in primo piano) ---

  tasto(e) {
    if (!this.editabile || e.altKey) return;
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd) {
      const dalMenu = { KeyA: 'selectAll', KeyC: 'copy', KeyX: 'cut', KeyV: 'paste' }[e.code];
      if (dalMenu) {
        if (!e.repeat || dalMenu !== 'paste') this.modifica(dalMenu);
      } else if (e.code === 'KeyD' && !e.repeat) this.duplicaScelte();
      else return;
      return e.preventDefault();
    }
    if (e.code === 'KeyB') {
      if (!e.repeat) {
        // un tocco alterna lo strumento; tenuto più di mezzo secondo vale solo finché lo tengo (come in Ableton)
        this.tastoB = { quando: performance.now(), prima: this.strumento };
        this.usaStrumento(this.strumento === 'matita' ? 'seleziona' : 'matita');
      }
      return e.preventDefault();
    }
    if (!this.sel.length) return;
    if (e.code === 'Backspace' || e.code === 'Delete') {
      this.togli(this.sel);
      return e.preventDefault();
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      if (e.repeat) return;
      const r = trasponi(this.eventi, this.sel, (e.code === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1), this.cicli, this.griglia);
      if (r.dn) {
        this.applica(r.eventi, r.sel);
        this.opz.nota?.(Math.min(...r.sel.map((s) => s.n)));
      }
    }
  }

  // Il pianoroll ha il fuoco: ⌘X ⌘C ⌘V ⌘A sono suoi (dal menu del Mac o dalla tastiera: una volta sola).
  inPrimoPiano() {
    return this.editabile && document.activeElement === this.canvas;
  }

  modifica(azione) {
    const ora = performance.now();
    if (this.ultimaModifica?.azione === azione && ora - this.ultimaModifica.t < 250) return;
    this.ultimaModifica = { azione, t: ora };
    if (azione === 'selectAll') this.tutte();
    else if (azione === 'copy') this.copia();
    else if (azione === 'cut') this.copia(true);
    else if (azione === 'paste') this.incollaQui();
  }

  tutte() {
    this.sel = this.eventi.map(riferimento);
    this.disegna();
  }

  copia(taglia = false) {
    const clip = appunti(this.eventi, this.sel);
    if (!clip) return;
    negliAppunti = clip;
    this.opz.avviso?.('copiate', { n: clip.note.length });
    if (taglia) this.togli(this.sel);
  }

  incollaQui() {
    if (!negliAppunti) return this.opz.avviso?.('appuntiVuoti');
    this.mettiBlocco(incolla(this.eventi, negliAppunti, this.cursore ?? 0, this.cicli, this.griglia));
  }

  duplicaScelte() {
    const r = duplica(this.eventi, this.sel, this.cicli, this.griglia);
    if (r) this.mettiBlocco(r);
  }

  // Un blocco messo (incolla o duplica): le note nuove sono le scelte e il cursore va dopo, così ⌘V di seguito le accoda.
  mettiBlocco(r) {
    if (r.fuori) this.opz.avviso?.('fuoriPattern', { n: r.fuori });
    if (r.sel.length) {
      this.cursore = r.fine < this.cicli * this.griglia ? r.fine : null;
      this.applica(r.eventi, r.sel);
    }
  }

  cambiaCicli(c) {
    if (!this.editabile || c === this.cicli) return;
    this.opz.cambia(conCicli(this.eventi, this.cicli, c, this.griglia), c);
  }

  // --- disegno ---

  disegna() {
    const passi = this.cicli * this.griglia;
    const disponibile = Math.max(200, this.scorri.clientWidth - TASTI_W - 2);
    this.larghezza = Math.max(LARGHEZZA_MIN, Math.min(LARGHEZZA_MAX, Math.floor(disponibile / passi)));
    const w = TASTI_W + passi * this.larghezza;
    const h = RIGHE * RIGA_H;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    const g = this.canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fondo = css('--fondo', '#050604');
    const pannello = css('--pannello', '#0b0b0b');
    const linea = css('--linea', '#1f1f1f');
    const bordo = css('--bordo', '#2a2a28');
    const testo = css('--testo', '#d9dccc');
    const spento = css('--spento', '#7a7e72');
    const avviso = css('--avviso', '#e0a03a');
    g.clearRect(0, 0, w, h);
    const colonne = this.scala.tipo !== 'cromatica';
    for (let r = 0; r < RIGHE; r++) {
      const nota = this.alto - r;
      const y = r * RIGA_H;
      g.fillStyle = eNero(nota) ? fondo : pannello;
      if (colonne && inScala(nota, this.scala.radice, this.scala.tipo)) g.fillStyle = eNero(nota) ? '#14160c' : '#16190d';
      g.fillRect(TASTI_W, y, w - TASTI_W, RIGA_H);
      g.fillStyle = linea;
      g.fillRect(TASTI_W, y + RIGA_H - 1, w - TASTI_W, 1);
      if (nota % 12 === 0) {
        g.fillStyle = bordo;
        g.fillRect(TASTI_W, y + RIGA_H - 1, w - TASTI_W, 1);
      }
      // la tastiera a sinistra
      g.fillStyle = eNero(nota) ? '#1c1c1a' : '#cfd2c2';
      g.fillRect(0, y, TASTI_W - 2, RIGA_H - 1);
      if (nota % 12 === 0) {
        g.fillStyle = '#050604';
        g.font = '10px ui-monospace, monospace';
        g.fillText(nomeNota(nota), 6, y + RIGA_H - 3);
      }
    }
    for (let p = 0; p <= passi; p++) {
      g.fillStyle = p % this.griglia === 0 ? spento : p % (this.griglia / 4) === 0 ? bordo : linea;
      g.fillRect(TASTI_W + p * this.larghezza, 0, 1, h);
    }
    for (const e of this.eventi) {
      if (e.n < this.basso || e.n > this.alto) continue;
      const x = TASTI_W + e.i * this.larghezza;
      const y = (this.alto - e.n) * RIGA_H;
      const scelta = this.eScelta(e);
      g.fillStyle = this.editabile ? testo : spento;
      g.fillRect(x + 1, y + 1, Math.max(3, e.l * this.larghezza - 2), RIGA_H - 2);
      if (scelta) {
        g.strokeStyle = avviso;
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, Math.max(3, e.l * this.larghezza - 2), RIGA_H - 2);
      }
    }
    if (this.cursore !== null) {
      const x = TASTI_W + this.cursore * this.larghezza;
      g.fillStyle = testo;
      g.globalAlpha = 0.45;
      g.fillRect(x, 0, 1, h);
      g.beginPath();
      g.moveTo(x - 4, 0);
      g.lineTo(x + 5, 0);
      g.lineTo(x + 0.5, 6);
      g.fill();
      g.globalAlpha = 1;
    }
    const rett = this.gesto?.tipo === 'rettangolo' ? this.gesto : null;
    if (rett) {
      const x0 = TASTI_W + Math.min(rett.da.passo, rett.a.passo) * this.larghezza;
      const x1 = TASTI_W + (Math.max(rett.da.passo, rett.a.passo) + 1) * this.larghezza;
      const y0 = (this.alto - Math.max(rett.da.nota, rett.a.nota)) * RIGA_H;
      const y1 = (this.alto - Math.min(rett.da.nota, rett.a.nota) + 1) * RIGA_H;
      g.fillStyle = avviso;
      g.globalAlpha = 0.14;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.globalAlpha = 1;
      g.strokeStyle = avviso;
      g.lineWidth = 1;
      g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    }
    this.sfondoH = h;
    this.disegnaTestina(g, w, h);
  }

  // La testina: dov'è la prova in cuffia nel loop (la sezione si ripete ogni `cicli` cicli).
  disegnaTestina(g, w, h) {
    const ciclo = this.opz.ciclo?.();
    if (ciclo === null || ciclo === undefined || !this.testinaViva) return;
    const x = TASTI_W + (((ciclo % this.cicli) + this.cicli) % this.cicli) * this.griglia * this.larghezza;
    g.fillStyle = css('--avviso', '#e0a03a');
    g.fillRect(x, 0, 1.5, h);
  }

  // La testina si muove solo mentre la prova suona e la scheda è in vista.
  testina(viva) {
    this.testinaViva = viva;
    if (!viva) return this.disegna();
    if (this.rafAttivo) return;
    this.rafAttivo = true;
    const passo = () => {
      if (!this.testinaViva || !this.canvas.isConnected || this.r.hidden) {
        this.rafAttivo = false;
        return;
      }
      this.disegna();
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
}
