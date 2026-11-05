// La MOVIOLA, la scatola nera delle prove: mentre suono scrive un registro con l'ora al millisecondo (controller, tastiera, codice mandato,
// errori, guardiano, livello del master, CPU, segni) per rivedere la prova dopo. Una riga JSON per evento, in prove/AAAA-MM-GG_HH-MM-SS.jsonl
// nella cartella dati dell'app.
//
// Pesa zero sul suono: si scrive solo qui, nel processo principale, con uno stream asincrono; le finestre mandano gli eventi a pacchetti
// (ipc `send`, senza risposta) e i motori non toccano mai il disco. Se il disco non risponde o il file non si apre, si va avanti senza.
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';

const MAX_PACCHETTO = 500; // eventi per pacchetto dalle finestre
const MAX_IN_CODA = 8 * 1024 * 1024; // byte in attesa di scrittura: oltre, si buttano gli eventi (e si conta)
const MAX_RIGA = 256 * 1024; // un codice più lungo di così si taglia

const due = (n) => String(n).padStart(2, '0');
const tre = (n) => String(n).padStart(3, '0');

// Il nome del file di una prova: la data e l'ora di quando comincia.
export function nomeFile(d = new Date()) {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}_${due(d.getHours())}-${due(d.getMinutes())}-${due(d.getSeconds())}.jsonl`;
}

// L'ora locale di un istante (ms dal 1970), al millisecondo: 21:04:09.318
export function ora(t) {
  const d = new Date(t);
  return `${due(d.getHours())}:${due(d.getMinutes())}:${due(d.getSeconds())}.${tre(d.getMilliseconds())}`;
}

// Un evento → la sua riga di registro (con il \n), o null se non è un evento. t = ms dal 1970, anche con la virgola.
export function riga(ev) {
  if (!ev || typeof ev.tipo !== 'string' || typeof ev.fonte !== 'string') return null;
  const t = Number.isFinite(ev.t) ? ev.t : Date.now();
  let testo;
  try {
    testo = JSON.stringify({ t: Math.round(t * 1000) / 1000, ora: ora(t), fonte: ev.fonte, tipo: ev.tipo, dati: ev.dati ?? null });
  } catch {
    return null;
  }
  if (testo.length > MAX_RIGA) testo = JSON.stringify({ t, ora: ora(t), fonte: ev.fonte, tipo: ev.tipo, dati: { tagliato: testo.length } });
  return `${testo}\n`;
}

// Un pacchetto che arriva da una finestra: solo gli eventi fatti bene, e non troppi.
export const pulisci = (pacchetto) => (Array.isArray(pacchetto) ? pacchetto.slice(0, MAX_PACCHETTO).filter((e) => e && typeof e.tipo === 'string' && typeof e.fonte === 'string') : []);

export class Moviola {
  // cartella: dove stanno le prove; cpu(): { nome: percentuale } ogni secondo; ora(): ms dal 1970 (per le prove)
  constructor({ cartella, cpu = () => ({}), adesso = () => Date.now() }) {
    this.cartella = cartella;
    this.cpu = cpu;
    this.adesso = adesso;
    this.flusso = null;
    this.file = null;
    this.timer = null;
    this.perse = 0;
  }

  get accesa() {
    return !!this.flusso;
  }

  // Comincia una prova nuova (un file nuovo). Ritorna il file, o null se non si può.
  avvia(info = {}) {
    if (this.flusso) return this.file;
    try {
      mkdirSync(this.cartella, { recursive: true });
      this.file = path.join(this.cartella, nomeFile(new Date(this.adesso())));
      this.flusso = createWriteStream(this.file, { flags: 'a' });
      this.flusso.on('error', () => this.ferma(true)); // il disco non risponde: la scatola nera si ferma, l'app no
    } catch {
      this.flusso = null;
      this.file = null;
      return null;
    }
    this.perse = 0;
    this.evento('main', 'inizio', { versione: 1, ...info });
    this.timer = setInterval(() => this.evento('main', 'cpu', this.cpu()), 1000);
    return this.file;
  }

  ferma(dopoErrore = false) {
    clearInterval(this.timer);
    this.timer = null;
    const flusso = this.flusso;
    this.flusso = null;
    if (!flusso) return;
    try {
      if (!dopoErrore) {
        flusso.write(riga({ t: this.adesso(), fonte: 'main', tipo: 'fine', dati: { perse: this.perse } }));
        flusso.end();
      } else flusso.destroy();
    } catch {
      // niente da fare
    }
  }

  // Un evento. dati: oggetto semplice. t: quando è successo (ms dal 1970); se manca, adesso.
  evento(fonte, tipo, dati = null, t = this.adesso()) {
    if (!this.flusso) return;
    if (this.flusso.writableLength > MAX_IN_CODA) {
      this.perse++;
      return;
    }
    const r = riga({ t, fonte, tipo, dati });
    if (r) this.flusso.write(r);
  }

  // Un pacchetto da una finestra: [{ t, fonte, tipo, dati }]
  eventi(pacchetto) {
    for (const e of pulisci(pacchetto)) this.evento(e.fonte, e.tipo, e.dati ?? null, Number.isFinite(e.t) ? e.t : this.adesso());
  }
}
