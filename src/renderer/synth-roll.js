// Il pianoroll del SYNTH: si disegna col mouse e resta allineato alla mini-notazione (synth-note.js).
// Clic su una cella vuota: mette una nota (o un accordo) lunga quanto la «lunghezza»; trascinando a destra si allunga.
// Clic su una nota: si sposta (anche in altezza); dal bordo destro si allunga; ⌥-clic, clic destro o ⌫ la tolgono.
// Con la scala scelta le note si agganciano ai gradi della scala. Ogni gesto è un cambio solo (un passo di ⌘Z).
import it from './testi/it.json';
import { ACCORDI, CICLI, SCALE, SCATTI, accordoEventi, agganciaScala, conCicli, eNero, inScala, nomeNota, senzaEvento } from './synth-note.js';

const T = it.synth.note;
const TASTI_W = 52; // la colonna dei tasti a sinistra
const RIGA_H = 13;
const OTTAVE_VISTE = 3;
const RIGHE = OTTAVE_VISTE * 12;
const LARGHEZZA_MIN = 12;
const LARGHEZZA_MAX = 40;
const BORDO_PX = 7; // gli ultimi pixel di una nota sono la maniglia per allungarla
const NOTA_MIN = 12;
const NOTA_MAX = 108;

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
    this.lunghezza = 4; // in scatti
    this.basso = 36; // la nota più bassa che si vede (c2)
    this.selezionato = null; // { i, n }
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
    for (const [scatti, nome] of Object.entries(T.lunghezze)) this.lunghezzaEl.append(new Option(nome, scatti));
    this.lunghezzaEl.value = String(this.lunghezza);
    this.lunghezzaEl.onchange = () => (this.lunghezza = Number(this.lunghezzaEl.value));
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
    barra.append(this.cicliEl, campo(T.lunghezza, this.lunghezzaEl, 'roll-lunghezza'), campo(T.scala, this.scalaEl, 'roll-scala'), this.radiceEl, campo(T.accordo, this.accordoEl, 'roll-accordo'), su, giu, pulisci);

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
      if (h && this.editabile) this.togli(h);
    });
    this.canvas.addEventListener('keydown', (e) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && this.selezionato && this.editabile) {
        e.preventDefault();
        this.togli(this.selezionato);
      }
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
  imposta({ eventi, cicli, editabile = true, messaggio = '', mini }) {
    this.eventi = eventi;
    this.cicli = cicli;
    this.editabile = editabile;
    this.messaggio = messaggio;
    if (mini !== undefined && document.activeElement !== this.miniEl) this.miniEl.value = mini;
    this.messaggioEl.textContent = messaggio;
    this.miniEl.classList.toggle('errore', !!messaggio && !editabile);
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

  muoviVista(delta) {
    this.basso = Math.max(NOTA_MIN, Math.min(NOTA_MAX - RIGHE, this.basso + delta));
    this.disegna();
  }

  get alto() {
    return this.basso + RIGHE - 1;
  }

  // --- geometria ---

  cella(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (x < TASTI_W || y < 0) return null;
    const passo = Math.floor((x - TASTI_W) / this.larghezza);
    const nota = this.alto - Math.floor(y / RIGA_H);
    if (passo < 0 || passo >= this.cicli * SCATTI || nota < this.basso || nota > this.alto) return null;
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
    const h = this.trova(c.passo, c.nota);
    if (h && e.altKey) return this.togli(h);
    if (h) {
      const alBordo = (h.i + h.l) * this.larghezza - ((c.passo * this.larghezza) + c.x) <= BORDO_PX;
      this.selezionato = { i: h.i, n: h.n };
      this.gesto = { tipo: alBordo ? 'allunga' : 'sposta', partenza: { ...h }, scostamento: c.passo - h.i, cambiato: false };
      this.opz.nota?.(h.n);
    } else {
      const n = agganciaScala(c.nota, this.scala.radice, this.scala.tipo);
      const fine = (Math.floor(c.passo / SCATTI) + 1) * SCATTI; // una nota non esce dal suo ciclo
      const l = Math.min(this.lunghezza, fine - c.passo);
      const nuovi = accordoEventi(n, this.accordo, c.passo, l).filter((x) => x.n >= NOTA_MIN && x.n <= NOTA_MAX);
      this.gesto = { tipo: 'disegna', inizio: c.passo, fine, nuovi, base: this.eventi, cambiato: true };
      this.eventi = this.unisci(this.eventi, nuovi);
      this.selezionato = { i: nuovi[0].i, n: nuovi[0].n };
      this.opz.nota?.(n);
    }
    this.disegna();
  }

  mosso(e) {
    const g = this.gesto;
    const c = this.cella(e);
    if (!g) {
      this.canvas.style.cursor = c && this.trova(c.passo, c.nota) ? 'grab' : 'crosshair';
      return;
    }
    if (!c) return;
    if (g.tipo === 'disegna') {
      const l = Math.max(1, Math.min(g.fine - g.inizio, c.passo - g.inizio + 1));
      this.eventi = this.unisci(g.base, g.nuovi.map((x) => ({ ...x, l })));
    } else if (g.tipo === 'allunga') {
      const fine = (Math.floor(g.partenza.i / SCATTI) + 1) * SCATTI;
      const l = Math.max(1, Math.min(fine - g.partenza.i, c.passo - g.partenza.i + 1));
      this.eventi = this.eventi.map((x) => (x.i === g.partenza.i && x.n === g.partenza.n ? { ...x, l } : x));
      g.cambiato = l !== g.partenza.l;
    } else {
      const i = Math.max(0, Math.min(this.cicli * SCATTI - 1, c.passo - g.scostamento));
      const ciclo = Math.floor(i / SCATTI);
      const l = Math.min(g.partenza.l, (ciclo + 1) * SCATTI - i);
      const n = agganciaScala(c.nota, this.scala.radice, this.scala.tipo);
      const resto = senzaEvento(this.eventi, this.selezionato);
      const nuovo = { i, l, n };
      if (!resto.some((x) => x.i === i && x.n === n)) {
        this.eventi = this.unisci(resto, [nuovo]);
        if (this.selezionato.n !== n) this.opz.nota?.(n);
        this.selezionato = { i, n };
        g.cambiato = i !== g.partenza.i || n !== g.partenza.n;
      }
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

  togli(h) {
    this.eventi = senzaEvento(this.eventi, h);
    this.selezionato = null;
    this.opz.cambia(this.eventi, this.cicli);
    this.disegna();
  }

  pulisci() {
    if (!this.editabile || !this.eventi.length) return;
    this.eventi = [];
    this.selezionato = null;
    this.opz.cambia(this.eventi, this.cicli);
  }

  cambiaCicli(c) {
    if (!this.editabile || c === this.cicli) return;
    this.opz.cambia(conCicli(this.eventi, this.cicli, c), c);
  }

  // --- disegno ---

  disegna() {
    const passi = this.cicli * SCATTI;
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
      g.fillStyle = p % SCATTI === 0 ? spento : p % 4 === 0 ? bordo : linea;
      g.fillRect(TASTI_W + p * this.larghezza, 0, 1, h);
    }
    for (const e of this.eventi) {
      if (e.n < this.basso || e.n > this.alto) continue;
      const x = TASTI_W + e.i * this.larghezza;
      const y = (this.alto - e.n) * RIGA_H;
      const scelta = this.selezionato && this.selezionato.i === e.i && this.selezionato.n === e.n;
      g.fillStyle = this.editabile ? testo : spento;
      g.fillRect(x + 1, y + 1, Math.max(3, e.l * this.larghezza - 2), RIGA_H - 2);
      if (scelta) {
        g.strokeStyle = avviso;
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, Math.max(3, e.l * this.larghezza - 2), RIGA_H - 2);
      }
    }
    this.sfondoH = h;
    this.disegnaTestina(g, w, h);
  }

  // La testina: dov'è la prova in cuffia nel loop (la sezione si ripete ogni `cicli` cicli).
  disegnaTestina(g, w, h) {
    const ciclo = this.opz.ciclo?.();
    if (ciclo === null || ciclo === undefined || !this.testinaViva) return;
    const x = TASTI_W + (((ciclo % this.cicli) + this.cicli) % this.cicli) * SCATTI * this.larghezza;
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
