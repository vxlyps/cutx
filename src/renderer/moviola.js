// La MOVIOLA lato interfaccia (la scatola nera delle prove, src/main/moviola.js): raccoglie gli eventi e li manda al processo principale
// a pacchetti ogni quarto di secondo, senza aspettare risposta. Spenta non fa niente. Mai su un filo dell'audio: i motori non c'entrano.

const PACCHETTO_MS = 250;
const MAX_IN_CODA = 4000; // se il processo principale non ascolta, si butta il più vecchio

let acceso = false;
let coda = [];
let timer = null;
let segni = 0;
let lampo = null;

const adesso = () => performance.timeOrigin + performance.now(); // ms dal 1970, con la virgola

function svuota() {
  if (!coda.length) return;
  const pacchetto = coda;
  coda = [];
  try {
    window.cutx.moviola(pacchetto);
  } catch {
    // la scatola nera non deve mai disturbare chi suona
  }
}

export const moviola = {
  get acceso() {
    return acceso;
  },
  // Accende o spegne. Accesa, il numero dei segni riparte da 1.
  imposta(on) {
    on = !!on;
    if (on === acceso) return;
    acceso = on;
    if (on) {
      segni = 0;
      timer = setInterval(svuota, PACCHETTO_MS);
    } else {
      clearInterval(timer);
      svuota();
    }
  },
  // Un evento: fonte (controller, tastiera, live, cuffia, app…), tipo e dati (oggetto semplice).
  scrivi(fonte, tipo, dati = null) {
    if (!acceso) return;
    coda.push({ t: adesso(), fonte, tipo, dati });
    if (coda.length > MAX_IN_CODA) coda.splice(0, coda.length - MAX_IN_CODA);
  },
  // SEGNA: un segno nel registro e un lampo ambra su tutto lo schermo (così si vede anche nel video). Ritorna il numero del segno, 0 se spenta.
  segna() {
    if (!acceso) return 0;
    segni++;
    this.scrivi('app', 'segno', { n: segni });
    svuota(); // il segno parte subito
    lampoSegno(segni);
    return segni;
  },
};

// Il lampo: una cornice ambra grossa con «SEGNO n», 0,5 s. Pochi pixel di costo, ma ben visibile in un video.
function lampoSegno(n) {
  if (!lampo) {
    lampo = document.createElement('div');
    lampo.className = 'segno-lampo';
    lampo.setAttribute('aria-hidden', 'true');
    lampo.append(document.createElement('span'));
    document.body.append(lampo);
  }
  lampo.firstChild.textContent = `SEGNO ${n}`;
  lampo.classList.remove('acceso');
  void lampo.offsetWidth; // riparte l'animazione anche per due segni di fila
  lampo.classList.add('acceso');
}

// Un messaggio MIDI del controller in forma leggibile per il registro. I fader mandano raffiche (pitch bend): al massimo uno ogni 30 ms per canale.
const ultimoBend = new Map();
export function midiPerRegistro(bytes) {
  if ((bytes[0] & 0xf0) === 0xe0) {
    const ora = performance.now();
    const grezzo = ((bytes[2] & 0x7f) << 7) | (bytes[1] & 0x7f);
    const estremo = grezzo >= 16000 || grezzo <= 300; // cima e fondo si registrano sempre: lì si vede cosa manda il fader in battuta
    if (!estremo && ora - (ultimoBend.get(bytes[0]) ?? -1e9) < 30) return null;
    ultimoBend.set(bytes[0], ora);
  }
  return { byte: bytes };
}
