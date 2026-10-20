// Lato interfaccia dei due motori: canale diretto, comandi, controllo che siano vivi.
// Qui non si aspetta mai un motore: se tace, l'interfaccia va avanti uguale, e viceversa.

const PING_MS = 500;
const SILENZIO_MS = 1500;

export class Motore {
  constructor(ruolo) {
    this.ruolo = ruolo;
    this.porta = null;
    this.viva = false;
    this.ultimoPong = 0;
    this.stato = {}; // l'ultimo pong: codice, errore, tardi, sentinella…
    this.attese = new Map(); // id → resolve, per le valutazioni
    this.prossimoId = 1;
    this.suStato = null; // (viva) => {}
    this.suCollegato = null; // () => {}: canale nuovo, il motore può essere appena rinato
    this.suMessaggio = null; // (m) => {}: eco, anello…
    window.addEventListener('message', (e) => {
      if (e.data?.porta === ruolo && e.ports[0]) this.collega(e.ports[0]);
    });
    setInterval(() => this.ping(), PING_MS);
  }

  collega(porta) {
    this.porta = porta;
    porta.onmessage = ({ data }) => this.ricevi(data);
    this.ping();
    this.suCollegato?.();
  }

  manda(m) {
    this.porta?.postMessage(m);
  }

  // Ritorna l'errore di valutazione, o null. Se il motore non risponde, non si resta appesi.
  // etichetta: { nome, provenienza } di quello che suona, per i colori di sezioni e mappa.
  valuta(codice, etichetta = {}) {
    const id = this.prossimoId++;
    this.manda({ tipo: 'valuta', codice, id, ...etichetta });
    return new Promise((resolve) => {
      this.attese.set(id, resolve);
      setTimeout(() => this.attese.delete(id) && resolve(`${this.ruolo}: nessuna risposta`), 5000);
    });
  }

  ping() {
    this.manda({ tipo: 'ping' });
    const viva = !!this.porta && performance.now() - this.ultimoPong < SILENZIO_MS;
    if (viva !== this.viva) {
      this.viva = viva;
      this.suStato?.(viva);
    }
  }

  ricevi(m) {
    if (m.tipo === 'pong') {
      this.ultimoPong = performance.now();
      this.stato = m;
      if (!this.viva) this.ping();
    } else if (m.tipo === 'valutato') {
      this.attese.get(m.id)?.(m.errore);
      this.attese.delete(m.id);
    } else {
      this.suMessaggio?.(m);
    }
  }
}
