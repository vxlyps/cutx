// L'anteprima del proiettore nelle impostazioni: la vera pagina dell'uscita (uscita.html?anteprima) in un riquadro, alimentata con
// dati di esempio (un livello che suona, uno muto, uno che sta per entrare e il jam che si scrive). Mostra esattamente quello che
// vedrebbe il pubblico con le preferenze di adesso; non tocca il live. Esiste solo finché il riquadro si vede.
const LARGHEZZA = 1280;
const ALTEZZA = 720;
const CPS = 0.5; // un ciclo ogni 2 secondi
const GIRO_S = 12; // l'esempio si ripete ogni 12 secondi: entra un livello nuovo e si riscrive

const PREAMBOLO = '// Jungle · 170 bpm\nsetcpm(170/4)\n\n';
const BATTERIA = '// batteria\ns("bd*4, hh*8") // cassa e charleston\n  .bank("RolandTR909")';

export class Anteprima {
  // contenitore: dove mettere il riquadro; preferenze(): le preferenze di adesso
  constructor(contenitore, preferenze) {
    this.contenitore = contenitore;
    this.preferenze = preferenze;
    this.iframe = null;
    this.live = null;
    this.controllo = null;
    this.partenza = Date.now();
    this.giro = -1;
    this.timer = setInterval(() => this.passo(), 250);
    new ResizeObserver(() => this.misura()).observe(contenitore);
  }

  visibile() {
    return this.contenitore.offsetParent !== null && this.contenitore.clientWidth > 0;
  }

  crea() {
    const quadro = document.createElement('div');
    quadro.className = 'anteprima-quadro';
    const iframe = document.createElement('iframe');
    iframe.className = 'anteprima-iframe';
    iframe.title = 'anteprima del proiettore';
    iframe.tabIndex = -1;
    iframe.src = './uscita.html?anteprima=1';
    quadro.append(iframe);
    this.contenitore.replaceChildren(quadro);
    this.quadro = quadro;
    this.iframe = iframe;
    const live = new MessageChannel();
    const controllo = new MessageChannel();
    this.live = live.port1;
    this.controllo = controllo.port1;
    iframe.addEventListener('load', () => {
      iframe.contentWindow.postMessage({ porta: 'live' }, '*', [live.port2]);
      iframe.contentWindow.postMessage({ porta: 'controllo' }, '*', [controllo.port2]);
      this.giro = -1;
      this.mandaPreferenze();
    });
    this.misura();
  }

  distruggi() {
    this.live?.close();
    this.controllo?.close();
    this.live = this.controllo = this.iframe = this.quadro = null;
    this.contenitore.replaceChildren();
  }

  misura() {
    if (!this.quadro) return;
    const k = this.contenitore.clientWidth / LARGHEZZA;
    this.iframe.style.transform = `scale(${k})`;
    this.quadro.style.height = `${ALTEZZA * k}px`;
  }

  mandaPreferenze() {
    this.live?.postMessage({ tipo: 'preferenze', p: this.preferenze() });
  }

  // chiamata quando cambiano le preferenze
  aggiorna() {
    this.mandaPreferenze();
  }

  passo() {
    if (!this.visibile()) {
      if (this.iframe) this.distruggi();
      return;
    }
    if (!this.iframe) this.crea();
    if (!this.live) return;
    const adesso = Date.now();
    const epoca0 = this.partenza;
    const ciclo = ((adesso - epoca0) / 1000) * CPS;
    const giro = Math.floor((adesso - epoca0) / 1000 / GIRO_S);
    const nelGiro = ((adesso - epoca0) / 1000) % GIRO_S;
    // la mappa del tempo (come la manda il live) a ogni passo: costa niente
    this.live.postMessage({ tipo: 'mappa', ciclo0: 0, epoca0, cps: CPS, cambi: [], ancoraFrase: 0, inizioSet: epoca0 });
    if (giro !== this.giro) {
      this.giro = giro;
      this.nuovoGiro(giro, adesso);
    }
    // il jam si scrive negli ultimi secondi del giro
    const scrittura = nelGiro > GIRO_S - 4 ? 's("hh*8").gain(.6)'.slice(0, Math.floor((nelGiro - (GIRO_S - 4)) * 4)) : null;
    this.controllo.postMessage({ tipo: 'bozze', livelli: {}, jam: scrittura });
  }

  nuovoGiro(giro, adesso) {
    const ciclo = ((adesso - this.partenza) / 1000) * CPS;
    const base = { provenienza: '', coda: [], inizio: 0, a: null, volume: 1, muto: false, scritto: false, sfuma: null, richiesto: this.partenza, primo: null, ultimo: null };
    const livelli = [
      { ...base, id: 1, nome: 'libero', codice: PREAMBOLO + BATTERIA, inizio: PREAMBOLO.length, da: null, coda: ['.lpf(1200)'], volume: 0.6 },
      { ...base, id: 2, nome: 'basso', codice: 'note("c1 c1 eb1 g1")\n  .s("sawtooth")', da: null, muto: true },
      // quello che sta per entrare: tra 3 cicli (6 secondi), così si vede il conto alla rovescia e come si scrive
      { ...base, id: 100 + giro, nome: 'melodia', codice: 'note("c3 e3 g3 b3")\n  .s("triangle")\n  .lpf(900)', da: Math.ceil(ciclo) + 3, richiesto: adesso },
    ];
    this.live.postMessage({ tipo: 'livelli', livelli });
  }
}
