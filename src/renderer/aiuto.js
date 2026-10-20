// L'help al passaggio: dopo circa 800 ms di mouse fermo su un comando compare un riquadro chiaro con
// nome, spiegazione e scorciatoia; il riquadro help in basso a sinistra spiega subito quello che
// c'è sotto il mouse (come l'Info View di Ableton). I testi stanno in testi/it.json.
// Gli elementi si segnano con data-aiuto="chiave"; un title (anche nato dopo) fa da riserva.
import it from './testi/it.json';
import { caps } from './scorciatoie.js';

const ATTESA_MS = 800;

export class Aiuto {
  // combo(azione) → la combinazione attuale di quell'azione (le scorciatoie si possono cambiare)
  constructor({ riquadro, combo }) {
    this.riquadro = riquadro;
    this.combo = combo;
    this.suggerimenti = true;
    this.mostraRiquadro = true;
    this.corrente = null;
    this.timer = null;
    this.tip = document.createElement('div');
    this.tip.className = 'suggerimento';
    this.tip.hidden = true;
    document.body.append(this.tip);
    document.addEventListener('mouseover', (e) => this.sopra(e), true);
    document.addEventListener('mousemove', (e) => this.muove(e), true);
    document.addEventListener('mousedown', () => this.nascondi(), true);
    document.addEventListener('keydown', () => this.nascondi(), true);
    document.addEventListener('scroll', () => this.nascondi(), true);
    document.addEventListener('mouseleave', () => this.lascia());
    this.aggiorna({});
  }

  aggiorna({ suggerimenti = true, riquadroHelp = true }) {
    this.suggerimenti = suggerimenti;
    this.mostraRiquadro = riquadroHelp;
    this.riquadro.hidden = !riquadroHelp;
    if (!suggerimenti) this.nascondi();
    this.disegnaRiquadro();
  }

  // Cosa spiegare per quell'elemento: dal file dei testi, o dal suo title.
  info(el) {
    const chiave = el.dataset.aiuto;
    if (chiave && it.aiuto[chiave]) return it.aiuto[chiave];
    if (el.hasAttribute('title')) {
      el.dataset.aiutoTesto = el.getAttribute('title');
      el.removeAttribute('title'); // niente suggerimento nativo in più
    }
    const testo = el.dataset.aiutoTesto ?? el.getAttribute('aria-label');
    return testo ? { nome: el.textContent.trim().split('\n')[0].slice(0, 30), testo } : null;
  }

  bersaglio(e) {
    const el = e.target.closest?.('[data-aiuto], [title], [data-aiuto-testo]');
    return el && this.info(el) ? el : null;
  }

  sopra(e) {
    const el = this.bersaglio(e);
    if (el === this.corrente) return;
    this.corrente = el;
    this.nascondi();
    this.disegnaRiquadro();
    this.punto = { x: e.clientX, y: e.clientY };
    this.avvia();
  }

  muove(e) {
    // un movimento vero (più di 3 px) rimette a zero l'attesa
    if (this.punto && Math.hypot(e.clientX - this.punto.x, e.clientY - this.punto.y) < 3) return;
    this.punto = { x: e.clientX, y: e.clientY };
    if (!this.tip.hidden) this.nascondi();
    this.avvia();
  }

  lascia() {
    this.corrente = null;
    this.nascondi();
    this.disegnaRiquadro();
  }

  avvia() {
    clearTimeout(this.timer);
    if (!this.corrente || !this.suggerimenti) return;
    this.timer = setTimeout(() => this.mostra(), ATTESA_MS);
  }

  nascondi() {
    clearTimeout(this.timer);
    this.tip.hidden = true;
  }

  // Titolo, spiegazione e keycap della scorciatoia attuale.
  contenuto(info) {
    const frag = document.createDocumentFragment();
    const nome = document.createElement('strong');
    nome.textContent = info.nome;
    const testo = document.createElement('span');
    testo.textContent = info.testo;
    frag.append(nome, testo);
    const combo = info.azione ? this.combo(info.azione) : null;
    if (combo) {
      const riga = document.createElement('div');
      riga.className = 'caps';
      for (const c of caps(combo)) {
        const k = document.createElement('kbd');
        k.textContent = c;
        riga.append(k);
      }
      frag.append(riga);
    }
    return frag;
  }

  mostra() {
    if (!this.corrente?.isConnected) return;
    const info = this.info(this.corrente);
    if (!info) return;
    this.tip.replaceChildren(this.contenuto(info));
    this.tip.hidden = false;
    const r = this.corrente.getBoundingClientRect();
    const t = this.tip.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left), window.innerWidth - t.width - 8);
    const sotto = r.bottom + 8 + t.height < window.innerHeight;
    this.tip.style.left = `${x}px`;
    this.tip.style.top = `${sotto ? r.bottom + 8 : Math.max(8, r.top - t.height - 8)}px`;
  }

  disegnaRiquadro() {
    if (!this.mostraRiquadro) return;
    const info = this.corrente && this.info(this.corrente);
    this.riquadro.replaceChildren(...(info ? [this.contenuto(info)] : [Object.assign(document.createElement('span'), { className: 'vuoto', textContent: it.riquadroVuoto })]));
  }
}
