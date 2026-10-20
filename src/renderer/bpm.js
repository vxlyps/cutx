// Il numero dei BPM in alto: è il tempo del set e si cambia da lì.
//   clic            scrivo il numero e invio
//   trascino su/giù ±1 ogni pochi pixel (con ⇧ ±0,1)
//   ↑ ↓             ±1 (con ⇧ ±0,1) quando il numero ha il fuoco
// Il cambio entra all'inizio del ciclo dopo (lo decide il motore live): finché non entra il numero mostra "140 → 128".
import { arrotondaBpm } from './tempo.js';

const MIN = 20;
const MAX = 300;
const PIXEL_PER_PASSO = 5;
const SOGLIA_TRASCINA = 3;
const ATTESA_INVIO_MS = 120; // tanti ±1 di fila diventano un solo messaggio
const SCADE_MS = 4000; // se il motore non conferma, si torna a mostrare quello vero

const limita = (bpm) => Math.min(MAX, Math.max(MIN, arrotondaBpm(bpm)));

export class ControlloBpm {
  // el: l'elemento col numero. leggi() → { attuale, inArrivo } in BPM (inArrivo null se nessun cambio); manda(bpm) → al motore live.
  constructor(el, { leggi, manda }) {
    this.el = el;
    this.leggi = leggi;
    this.manda = manda;
    this.voluto = null; // l'ultimo valore che ho chiesto, finché il motore non lo conferma
    this.dal = 0;
    this.timer = null;
    this.modifica = null; // l'input mentre scrivo
    el.tabIndex = 0;
    el.setAttribute('role', 'spinbutton');
    el.setAttribute('aria-label', 'BPM del set');
    el.addEventListener('keydown', (e) => this.tasto(e));
    el.addEventListener('pointerdown', (e) => this.premuto(e));
  }

  // quello da cui partono i ±: l'ultimo chiesto, o il cambio in arrivo, o il tempo di adesso
  base() {
    const { attuale, inArrivo } = this.leggi();
    return this.voluto ?? inArrivo ?? attuale;
  }

  chiedi(bpm) {
    this.voluto = limita(bpm);
    this.dal = performance.now();
    this.disegna();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.manda(this.voluto), ATTESA_INVIO_MS);
  }

  passo(su, fine) {
    const base = this.base();
    if (base === null || base === undefined) return;
    this.chiedi(base + (su ? 1 : -1) * (fine ? 0.1 : 1));
  }

  tasto(e) {
    if (this.modifica) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this.passo(e.key === 'ArrowUp', e.shiftKey);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.scrivi();
    }
  }

  // Un clic scrive, un trascinamento cambia: si decide dopo qualche pixel.
  premuto(e) {
    if (this.modifica || e.button !== 0) return;
    const y0 = e.clientY;
    let resto = 0;
    let ultimo = y0;
    let trascina = false;
    const muovi = (m) => {
      if (!trascina && Math.abs(m.clientY - y0) < SOGLIA_TRASCINA) return;
      if (!trascina) {
        trascina = true;
        this.el.classList.add('trascina');
      }
      resto += ultimo - m.clientY; // su = più veloce
      ultimo = m.clientY;
      while (Math.abs(resto) >= PIXEL_PER_PASSO) {
        this.passo(resto > 0, m.shiftKey);
        resto -= Math.sign(resto) * PIXEL_PER_PASSO;
      }
    };
    const finito = () => {
      this.el.removeEventListener('pointermove', muovi);
      this.el.removeEventListener('pointerup', finito);
      this.el.removeEventListener('pointercancel', finito);
      this.el.classList.remove('trascina');
      if (!trascina) this.scrivi();
    };
    try {
      this.el.setPointerCapture?.(e.pointerId);
    } catch {
      // un puntatore finto (le prove) non si può catturare: si va avanti lo stesso
    }
    this.el.addEventListener('pointermove', muovi);
    this.el.addEventListener('pointerup', finito);
    this.el.addEventListener('pointercancel', finito);
    e.preventDefault(); // niente selezione di testo mentre trascino
    this.el.focus();
  }

  // Scrivo il numero: invio lo manda, esc (o un clic altrove) lo lascia com'era.
  scrivi() {
    const { attuale } = this.leggi();
    if (attuale === null || attuale === undefined) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.className = 'bpm-input';
    input.value = String(arrotondaBpm(this.base() ?? attuale));
    input.setAttribute('aria-label', 'BPM del set');
    this.modifica = input;
    this.el.replaceChildren(input);
    input.focus();
    input.select();
    const chiudi = (manda) => {
      if (this.modifica !== input) return;
      this.modifica = null;
      const n = Number(input.value.trim().replace(',', '.'));
      if (manda && Number.isFinite(n) && n > 0) this.chiedi(n);
      this.disegna();
      this.el.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') chiudi(true);
      else if (e.key === 'Escape') chiudi(false);
    });
    input.addEventListener('blur', () => chiudi(false));
  }

  // Dal ciclo di vita della postazione, a ogni giro: mostra il tempo di adesso e, se c'è, quello in arrivo.
  disegna() {
    if (this.modifica) return;
    const { attuale, inArrivo } = this.leggi();
    if (attuale === null || attuale === undefined) {
      this.el.textContent = '–';
      return;
    }
    // chiesto e arrivato (o scaduta l'attesa): si torna al valore vero
    if (this.voluto !== null && ((inArrivo === null && Math.abs(attuale - this.voluto) < 0.05) || performance.now() - this.dal > SCADE_MS)) this.voluto = null;
    const arrivo = this.voluto !== null && Math.abs(this.voluto - attuale) >= 0.05 ? this.voluto : inArrivo;
    const testo = `${arrotondaBpm(attuale)}${arrivo !== null && arrivo !== undefined ? ` → ${arrotondaBpm(arrivo)}` : ''}`;
    if (this.el.textContent !== testo) this.el.textContent = testo;
    this.el.classList.toggle('in-arrivo', arrivo !== null && arrivo !== undefined);
    this.el.setAttribute('aria-valuenow', String(arrotondaBpm(attuale)));
  }
}
