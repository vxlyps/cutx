// Il lato interfaccia delle mani (sperimentale): accende e spegne la finestra «mani» (processo a parte) e riceve da lei la mano,
// l'immagine piccola della camera e lo stato. Niente logica qui: il filtro è in mani-filtro.js, la finestrella in mani-vista.js.
export class ManiClient {
  // suMano({ visibile, y, punti }), suImmagine(ArrayBuffer jpeg), suStato({ fps, ms, errore }), suChiusa(motivo)
  constructor({ suMano, suImmagine, suStato, suChiusa } = {}) {
    this.suMano = suMano;
    this.suImmagine = suImmagine;
    this.suStato = suStato;
    this.suChiusa = suChiusa;
    this.acceso = false;
    this.config = null;
    this.porta = null;
    this.stato = { fps: 0, ms: 0, errore: '' };
    this.ultimaMano = null;
    window.addEventListener('message', (e) => {
      if (e.data?.porta !== 'mani' || !e.ports[0]) return;
      this.porta = e.ports[0];
      this.porta.onmessage = ({ data }) => this.ricevi(data);
    });
    window.cutx.mani.suChiusa((motivo) => {
      this.acceso = false;
      this.porta = null;
      this.suChiusa?.(motivo);
    });
  }

  ricevi(m) {
    if (!this.acceso) return;
    if (m.tipo === 'pronta') this.porta?.postMessage({ tipo: 'config', ...this.config });
    else if (m.tipo === 'mano') {
      this.ultimaMano = m;
      this.suMano?.(m);
    } else if (m.tipo === 'immagine') this.suImmagine?.(m.jpeg);
    else if (m.tipo === 'stato') {
      this.stato = m;
      this.suStato?.(m);
    }
  }

  // config: { camera, fps ('bassa'|'normale'|'alta'), anteprima }
  async accendi(config = {}) {
    this.config = config;
    this.acceso = true;
    this.stato = { fps: 0, ms: 0, errore: '' };
    await window.cutx.mani.accendi();
  }

  async spegni() {
    this.acceso = false;
    this.porta = null;
    this.ultimaMano = null;
    await window.cutx.mani.spegni();
  }

  anteprima(on) {
    if (this.config) this.config.anteprima = on;
    this.porta?.postMessage({ tipo: 'config', ...this.config });
  }
}
