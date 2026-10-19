// Lato controllo del motore cuffia: canale diretto, configurazione, controllo che sia vivo.
// Qui non si aspetta mai la cuffia: se tace, il live va avanti uguale.

const PING_MS = 500;
const SILENZIO_MS = 1500;

// Solo dati semplici attraversano il canale: niente funzioni dentro i valori.
function clonabile(valore) {
  const v = {};
  for (const k in valore) if (typeof valore[k] !== 'function') v[k] = valore[k];
  return v;
}

export class Cuffia {
  constructor() {
    this.porta = null;
    this.config = {};
    this.viva = false;
    this.ultimoPong = 0;
    this.tardi = 0;
    this.errore = null;
    this.suStato = null; // (viva) => {}
    this.suEco = null; // ({ id, epoca }) => {}
    window.addEventListener('message', (e) => {
      if (e.data === 'porta-cuffia' && e.ports[0]) this.collega(e.ports[0]);
    });
    window.daneel.suCuffiaRiavvio(() => {
      this.porta = null;
      this.controlla();
    });
    setInterval(() => this.ping(), PING_MS);
  }

  collega(porta) {
    this.porta = porta;
    porta.onmessage = ({ data }) => this.ricevi(data);
    this.porta.postMessage({ tipo: 'config', ...this.config });
  }

  configura(modifiche) {
    Object.assign(this.config, modifiche);
    this.porta?.postMessage({ tipo: 'config', ...modifiche });
  }

  evento(valore, epoca, durata, cps, ciclo, id) {
    this.porta?.postMessage({ tipo: 'evento', valore: clonabile(valore), epoca, durata, cps, ciclo, id });
  }

  blocca(ms) {
    this.porta?.postMessage({ tipo: 'blocca', ms });
  }

  ping() {
    this.porta?.postMessage({ tipo: 'ping' });
    this.controlla();
  }

  controlla() {
    const viva = !!this.porta && performance.now() - this.ultimoPong < SILENZIO_MS;
    if (viva !== this.viva) {
      this.viva = viva;
      this.suStato?.(viva);
    }
  }

  ricevi(m) {
    if (m.tipo === 'pong') {
      this.ultimoPong = performance.now();
      this.tardi = m.tardi;
      this.errore = m.errore;
      this.controlla();
    } else if (m.tipo === 'configurata') {
      this.errore = m.errore;
    } else if (m.tipo === 'eco') {
      this.suEco?.(m);
    }
  }
}
