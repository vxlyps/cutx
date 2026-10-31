// Il controller (X-Touch Mini in MC) dentro CUTX: legge i messaggi MIDI, li traduce in comandi (gli stessi della tastiera e del mouse)
// e accende anelli e tasti con i valori veri. Ogni cosa che tocco diventa codice: le manopole scrivono nella coda del livello.
// Non suona niente da solo e non decide niente: gira quello che giro io. Se il controller sparisce, CUTX va avanti uguale.
import { MESSAGGIO_MC, NOME_PORTA, anelloDa, decodifica, esadecimale, messaggioAnello, messaggioTasto, noteTasti, parole, tabella } from './controller-mc.js';
import { ALTEZZA_MAX, ALTEZZA_MIN, PARAMETRI, PAGINA_B, PASSI_PER_SCATTO, PASSO_VOLUME, PASSO_X, SCATTI_VELOCITA, SCATTO_NORMALE, TASTI_A, clamp01, corto, etichettaAltezza, etichettaVelocita, calcolaFader, EFFETTI_FADER, FADER_PREDEFINITO, normalizzato, rigaCoda, valoreTesto } from './controller-mappa.js';
import { valoreDi, valoreLetterale } from './coda.js';
import { GestoreColpi } from './controller-colpi.js';

const TENUTA_MS = 350; // una manopola tenuta così a lungo è «selezione», non un tocco (il muto non scatta)
const PARACADUTE_MS = 1000;
const X_VALIDO_MS = 1500; // il valore che sto girando vale finché giro (e un attimo dopo); poi torna a valere la coda, che è la verità
const FERMO_MS = 500; // fermo così a lungo, la sezione scelta va in cuffia
const LUCI_MS = 150;
const CODA_OGNI_MS = 33; // le righe di coda partono al massimo 30 volte al secondo

export class Controller {
  // azioni: livelli() → [{ id, nome, volume, muto, coda, codice }] (i livelli vivi, nell'ordine delle manopole), selezionato(), seleziona(id),
  //   volume(id, v), muto(id), coda(id, riga), togliRiga(id, chiave), master(v), bpm(), tempo(bpm), goLive(), togli(), cuffia(), inCuffia(),
  //   paracadute(), scritta(testo), calibrazione() → preferenza, salvaCalibrazione({ tasti, layer }), avviso(testo)
  constructor(azioni, { ora = () => performance.now(), imposta = (f, ms) => setTimeout(f, ms), ferma = (x) => clearTimeout(x) } = {}) {
    this.azioni = azioni;
    this.ora = ora;
    this.imposta = imposta;
    this.ferma = ferma;
    this.porta = { ingresso: null, uscita: null };
    this.modo = 'sconosciuto'; // 'MC' | 'standard' | 'sconosciuto'
    this.pagina = 'A';
    this.bersaglio = 1; // pagina B: livello n (1–7) o 'globale'
    this.master = 1; // volume generale, 0..1
    this.push = new Map(); // n → { giu, tenuta, timer }
    this.x = new Map(); // `${id}|${parametro}` → 0..1, finché la coda non lo dice
    this.xT = new Map(); // quando l'ho fissato
    this.codaDa = new Map(); // id|chiave → riga in attesa di partire
    this.codaTimer = null;
    this.ultime = new Map(); // luci già mandate
    this.calibrazione = null; // { passo, tasti, layer } mentre calibro
    this.suMonitor = null; // (testo, grezzo, evento) => {}
    this.ascoltatori = []; // () => {}: chi vuole sapere che lo stato è cambiato (impostazioni, card)
    this.sequenza = 0; // per fermare una prova luci quando ne parte un'altra
    this.colpi = new GestoreColpi(this);
    this.paracaduteTimer = null;
    this.paracaduteTenuto = false;
    this.cuffiaTenuta = null; // { usato } mentre tengo premuto «cuffia»: girare una manopola scorre le sezioni del CUE, ◀ ▶ cambiano brano
    this.fermoTimer = null;
    this.ultimoDiscreto = new Map(); // `${id}|${chiave}` → l'ultimo scatto mandato (velocità, altezza)
    this.lampi = new Map(); // nota → fino a quando resta accesa dopo l'azione (un lampo breve)
    this.toccata = null; // { n, quando }: l'ultima manopola toccata, per lo specchio
    this.tab = tabella(azioni.calibrazione?.());
  }

  quandoCambia(fn) {
    this.ascoltatori.push(fn);
  }

  cambiato() {
    for (const fn of this.ascoltatori) fn();
  }

  // --- MIDI ---

  async collega() {
    if (!navigator.requestMIDIAccess) return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      return;
    }
    const cerca = () => {
      const ingresso = [...this.access.inputs.values()].find((p) => NOME_PORTA.test(p.name));
      const uscita = [...this.access.outputs.values()].find((p) => NOME_PORTA.test(p.name));
      if (ingresso !== this.porta.ingresso) {
        if (this.porta.ingresso) this.porta.ingresso.onmidimessage = null;
        this.porta.ingresso = ingresso ?? null;
        if (ingresso) ingresso.onmidimessage = (e) => this.riceve([...e.data]);
      }
      this.porta.uscita = uscita ?? null;
      if (!ingresso) this.modo = 'sconosciuto';
      this.ultime.clear();
      this.cambiato();
    };
    this.access.onstatechange = cerca;
    cerca();
    this.timerLuci = setInterval(() => this.luci(), LUCI_MS);
  }

  get collegato() {
    return !!this.porta.ingresso && this.porta.ingresso.state !== 'disconnected';
  }

  get nomePorta() {
    return this.porta.ingresso?.name ?? null;
  }

  manda(bytes) {
    try {
      this.porta.uscita?.send(bytes);
    } catch {
      // un controller che sparisce a metà non deve fermare niente
    }
  }

  // Rimette il controller in MC dal computer (CC 127 = 1 sul canale globale).
  passaAMC() {
    this.manda(MESSAGGIO_MC);
  }

  // --- quello che arriva ---

  riceve(bytes) {
    const e = decodifica(bytes, this.tab);
    const nuovoModo = e.tipo === 'standard' ? 'standard' : e.tipo === 'altro' && e.nota === undefined ? this.modo : 'MC';
    if (nuovoModo !== this.modo) {
      this.modo = nuovoModo;
      this.ultime.clear();
      this.cambiato();
      // se è in standard lo rimetto in MC (una volta), e lo dico
      if (nuovoModo === 'standard' && !this.provatoMC) {
        this.provatoMC = true;
        this.passaAMC();
        this.azioni.avviso?.('il controller era in modalità standard: gli ho chiesto di passare a MC (se non cambia: tasto MC in basso a sinistra tenuto premuto mentre colleghi l\'USB)');
      }
    }
    this.suMonitor?.(parole(e), esadecimale(bytes), e);
    if (this.calibrazione) return this.calibra(e);
    if (this.modo !== 'MC') return;
    this.esegui(e);
  }

  esegui(e) {
    switch (e.tipo) {
      case 'layer':
        if (e.giu) this.vaiA(e.pagina);
        break;
      case 'manopola':
        this.giraManopola(e.n, e.passi);
        break;
      case 'push':
        this.premiPush(e.n, e.giu);
        break;
      case 'tasto':
        this.premiTasto(e.n, e.giu);
        break;
      case 'fader':
        this.muoviFader(e.valore);
        break;
    }
  }

  // L'effetto del fader per la pagina in cui sono (scelto nelle impostazioni, separato per A e B).
  effettoFader(pagina = this.pagina) {
    const scelto = this.azioni.faderEffetto?.(pagina);
    return Object.hasOwn(EFFETTI_FADER, scelto) ? scelto : FADER_PREDEFINITO[pagina];
  }

  // Il fader: un effetto su tutto il live, scritto come riga globale (all(x => …)); in fondo (o tutto aperto) la riga sparisce.
  // Il riscontro (lo specchio, il proiettore) è subito; le righe partono al massimo ~30 volte al secondo.
  muoviFader(x) {
    this.fader = x;
    const effetto = this.effettoFader();
    if (this.faderEffetto && this.faderEffetto !== effetto) this.rilasciaFader();
    this.faderEffetto = effetto;
    const r = calcolaFader(effetto, x);
    const testo = `FADER · ${EFFETTI_FADER[effetto].nome} ${r.testo}`;
    this.toccata = { n: null, quando: this.ora(), testo };
    this.azioni.scritta?.(testo);
    this.faderDa = { effetto, r };
    if (this.faderTimer) return;
    this.faderTimer = this.imposta(() => {
      this.faderTimer = null;
      const { effetto: e, r: ultimo } = this.faderDa;
      if (this.faderEffetto !== e) return; // nel frattempo l'ho rilasciato
      this.azioni.globale?.('fader', ultimo.riga);
      this.azioni.breakTutti?.(e === 'break' ? (ultimo.fattore ?? 1) : 1);
      this.azioni.riser?.(e === 'riser' ? ultimo.riser ?? null : null);
    }, CODA_OGNI_MS);
  }

  // Cambio pagina o effetto: quello di prima si ferma (la riga, il break, il rumore) e il nuovo parte dal prossimo movimento del fader.
  rilasciaFader() {
    if (!this.faderEffetto) return;
    this.faderEffetto = null;
    this.faderDa = null;
    this.azioni.globale?.('fader', null);
    this.azioni.breakTutti?.(1);
    this.azioni.riser?.(null);
  }

  // Il tasto layer: cambia pagina. In pagina B premuto di nuovo alterna il livello scelto e il «globale» (B una volta = il livello, B di nuovo = globale, e così via).
  vaiA(pagina) {
    if (pagina === this.pagina) {
      if (pagina === 'B') this.alternaGlobale();
      return;
    }
    this.rilasciaFader();
    this.pagina = pagina;
    this.toccata = null;
    this.ultime.clear();
    this.riga(pagina === 'A' ? 'pagina A · suona' : 'pagina B · scolpisci');
    this.cambiato();
  }

  alternaGlobale() {
    if (this.bersaglio === 'globale') this.bersaglio = this.ultimoLivello ?? 1;
    else {
      this.ultimoLivello = this.bersaglio;
      this.bersaglio = 'globale';
    }
    this.toccata = null;
    this.ultime.clear();
    const l = this.bersaglio === 'globale' ? null : this.livello(this.bersaglio);
    this.riga(this.bersaglio === 'globale' ? 'pagina B · GLOBALE' : `pagina B · ${l ? l.nome : `livello ${this.bersaglio}`}`);
    this.azioni.scritta?.(this.bersaglio === 'globale' ? 'GLOBALE' : `SCOLPISCI · ${l?.nome?.toUpperCase() ?? ''}`);
    this.cambiato();
  }

  // Cosa sta scolpendo la pagina B, in parole: «basso» o «GLOBALE».
  nomeBersaglio() {
    if (this.bersaglio === 'globale') return 'GLOBALE';
    return this.livello(this.bersaglio)?.nome ?? `livello ${this.bersaglio}`;
  }

  livello(n) {
    return this.azioni.livelli()[n - 1] ?? null;
  }

  // --- manopole ---

  giraManopola(n, passi) {
    if (!passi) return;
    // «cuffia» tenuto + una manopola qualsiasi: scorro le sezioni del CUE; fermo mezzo secondo, quella parte in cuffia
    if (this.cuffiaTenuta && this.pagina === 'A') return this.scorriCue(passi);
    if (this.pagina === 'A') {
      if (n === 8) return this.giraMaster(passi);
      const l = this.livello(n);
      if (!l) return this.riga(`manopola ${n}: nessun livello`);
      // tenuta premuta + giro = il filtro di quel livello
      if (this.push.get(n)?.giu && this.push.get(n).tenuta) return this.cambiaParametro(l, 'filtro', passi, n);
      const v = clamp01(l.volume + passi * PASSO_VOLUME);
      this.azioni.volume(l.id, Math.round(v * 100) / 100);
      this.tocca(l, 'volume', `${l.nome.toUpperCase()} · VOLUME ${v.toFixed(2)}`, n);
      return;
    }
    // pagina B: i parametri del bersaglio
    const chiave = PAGINA_B[n - 1];
    if (this.bersaglio === 'globale') return this.giraGlobale(n, passi);
    const l = this.livello(this.bersaglio);
    if (!l) return this.riga('nessun livello scelto');
    if (!chiave) return this.riga(`manopola ${n}: arriva presto`);
    if (chiave === 'volume') {
      const v = clamp01(l.volume + passi * PASSO_VOLUME);
      this.azioni.volume(l.id, Math.round(v * 100) / 100);
      this.tocca(l, 'volume', `${l.nome.toUpperCase()} · VOLUME ${v.toFixed(2)}`, n);
      return;
    }
    this.cambiaParametro(l, chiave, passi, n);
  }

  scorriCue(passi) {
    this.cuffiaTenuta.usato = true;
    const nome = this.azioni.cueSposta?.(Math.sign(passi) * Math.min(3, Math.abs(passi)));
    if (nome === undefined || nome === null) return this.riga('CUE: niente sezioni da scorrere');
    this.toccata = { n: null, quando: this.ora(), testo: `CUE · ${nome}` };
    this.azioni.scritta?.(`CUE · ${nome.toUpperCase()}`);
    this.ferma(this.fermoTimer);
    this.fermoTimer = this.imposta(() => {
      this.azioni.cuffiaScelta?.();
    }, FERMO_MS);
  }

  async cambiaBrano(verso) {
    this.cuffiaTenuta.usato = true;
    const nome = await this.azioni.cueBrano?.(verso);
    if (!nome) return this.riga(verso > 0 ? "CUE: è l'ultimo brano" : 'CUE: è il primo brano');
    this.toccata = { n: null, quando: this.ora(), testo: `CUE · ${nome}` };
    this.azioni.scritta?.(`BRANO · ${nome.toUpperCase()}`);
  }

  giraMaster(passi) {
    this.master = clamp01(this.master + passi * PASSO_VOLUME);
    this.azioni.master?.(Math.round(this.master * 100) / 100);
    this.toccata = { n: 8, quando: this.ora(), testo: `GENERALE · VOLUME ${this.master.toFixed(2)}` };
    this.azioni.scritta?.(`GENERALE · VOLUME ${this.master.toFixed(2)}`);
  }

  // Il valore di partenza di un parametro: quello della coda, o letterale nel codice, o il predefinito.
  xDi(l, chiave) {
    const k = `${l.id}|${chiave}`;
    if (this.x.has(k) && this.ora() - (this.xT.get(k) ?? 0) < X_VALIDO_MS) return this.x.get(k);
    this.x.delete(k);
    if (chiave === 'velocita') {
      const v = valoreDi(l.coda ?? [], 'fast');
      const i = v === null ? -1 : SCATTI_VELOCITA.indexOf(v);
      return i >= 0 ? i : SCATTO_NORMALE;
    }
    if (chiave === 'altezza') return Math.round(valoreDi(l.coda ?? [], 'transpose') ?? 0);
    const p = PARAMETRI[chiave];
    const v = valoreDi(l.coda ?? [], p.chiave) ?? valoreLetterale(l.codice ?? '', p.chiave);
    const x = v === null ? p.predefinito : normalizzato(p, v);
    return x;
  }

  fissaX(k, x) {
    this.x.set(k, x);
    this.xT.set(k, this.ora());
  }

  // La manopola n ha toccato il livello l: la card si illumina un attimo, lo specchio la mette in evidenza, il proiettore (se acceso) la scritta.
  tocca(l, chiave, testo, n) {
    this.toccata = { n, quando: this.ora(), testo };
    this.azioni.tocca?.(l.id);
    this.azioni.scritta?.(testo);
  }

  // Un messaggio senza un posto suo (cambio pagina, «arriva presto»…): una riga sottile in basso nel LIVE.
  riga(testo) {
    this.azioni.riga?.(testo);
    this.azioni.scritta?.(testo.toUpperCase());
  }

  // Pagina B, push di una manopola: reset di quel parametro. La riga esce dalla coda, così torna il valore scritto nel mio codice o il predefinito;
  // l'anello e lo specchio si aggiornano subito; ⌘Z lo annulla.
  resetParametro(n) {
    const chiave = PAGINA_B[n - 1];
    if (!chiave) return this.riga(`manopola ${n}: arriva presto`);
    if (this.bersaglio === 'globale') {
      if (chiave !== 'eco' && chiave !== 'riverbero') return this.riga('globale: niente da rimettere qui');
      for (const l of this.azioni.livelli()) this.azioni.resetRiga?.(l.id, PARAMETRI[chiave].chiave);
      this.fissaX(`globale|${chiave}`, 0);
      this.toccata = { n, quando: this.ora(), testo: `GLOBALE · ${PARAMETRI[chiave].nome} RESET` };
      this.azioni.scritta?.(this.toccata.testo);
      return;
    }
    const l = this.livello(this.bersaglio);
    if (!l) return this.riga('nessun livello scelto');
    const k = `${l.id}|${chiave}`;
    let nome = chiave.toUpperCase();
    if (chiave === 'volume') this.azioni.volume(l.id, 1);
    else {
      const chiaveCoda = chiave === 'velocita' ? 'fast' : chiave === 'altezza' ? 'transpose' : PARAMETRI[chiave].chiave;
      this.azioni.resetRiga?.(l.id, chiaveCoda);
      this.ultimoDiscreto.delete(k);
      nome = (PARAMETRI[chiave]?.nome ?? (chiave === 'velocita' ? 'VELOCITÀ' : 'ALTEZZA'));
      this.fissaX(k, this.xBase(l, chiave));
    }
    this.toccata = { n, quando: this.ora(), testo: `${l.nome.toUpperCase()} · ${nome} RESET` };
    this.azioni.tocca?.(l.id);
    this.azioni.scritta?.(this.toccata.testo);
  }

  // Il valore di un parametro senza la coda: quello scritto nel mio codice, o il predefinito.
  xBase(l, chiave) {
    if (chiave === 'velocita') return SCATTO_NORMALE;
    if (chiave === 'altezza') return 0;
    const p = PARAMETRI[chiave];
    const v = valoreLetterale(l.codice ?? '', p.chiave);
    return v === null ? p.predefinito : normalizzato(p, v);
  }

  // Velocità (scatti al battito) e altezza (semitoni): valori discreti, scritti in coda come .fast(n) e .transpose(n); al valore neutro la riga sparisce.
  cambiaDiscreto(l, chiave, passi, n) {
    const k = `${l.id}|${chiave}`;
    let testo;
    if (chiave === 'velocita') {
      const indice = Math.max(0, Math.min(SCATTI_VELOCITA.length - 1, this.xDi(l, chiave) + passi / PASSI_PER_SCATTO));
      this.fissaX(k, indice);
      const v = SCATTI_VELOCITA[Math.round(indice)];
      if (this.ultimoDiscreto.get(k) !== v) {
        this.ultimoDiscreto.set(k, v);
        if (Math.round(indice) === SCATTO_NORMALE) this.azioni.togliRiga?.(l.id, 'fast');
        else this.mandaCoda(l.id, `.fast(${v})`);
      }
      testo = `${l.nome.toUpperCase()} · VELOCITÀ ${etichettaVelocita(v)}`;
    } else {
      const semitoni = Math.max(ALTEZZA_MIN, Math.min(ALTEZZA_MAX, Math.round(this.xDi(l, chiave) + passi)));
      this.fissaX(k, semitoni);
      if (this.ultimoDiscreto.get(k) !== semitoni) {
        this.ultimoDiscreto.set(k, semitoni);
        if (semitoni === 0) this.azioni.togliRiga?.(l.id, 'transpose');
        else this.mandaCoda(l.id, `.transpose(${semitoni})`);
      }
      testo = `${l.nome.toUpperCase()} · ALTEZZA ${etichettaAltezza(semitoni)}`;
    }
    this.tocca(l, chiave, testo, n);
  }

  cambiaParametro(l, chiave, passi, n) {
    if (chiave === 'velocita' || chiave === 'altezza') return this.cambiaDiscreto(l, chiave, passi, n);
    const p = PARAMETRI[chiave];
    const x = clamp01(this.xDi(l, chiave) + passi * PASSO_X);
    this.fissaX(`${l.id}|${chiave}`, x);
    this.mandaCoda(l.id, rigaCoda(p, x));
    this.tocca(l, chiave, `${l.nome.toUpperCase()} · ${p.nome} ${valoreTesto(p, x)}`, n);
  }

  giraGlobale(n, passi) {
    if (n === 1) {
      const bpm = Math.max(20, Math.min(300, Math.round((this.bpmVoluto ?? this.azioni.bpm?.() ?? 120) + passi)));
      this.bpmVoluto = bpm;
      this.azioni.tempo?.(bpm);
      this.toccata = { n: 1, quando: this.ora(), testo: `GLOBALE · BPM ${bpm}` };
      this.azioni.scritta?.(`GLOBALE · BPM ${bpm}`);
      return;
    }
    const chiave = PAGINA_B[n - 1];
    if (chiave !== 'eco' && chiave !== 'riverbero') return this.azioni.scritta?.(`GLOBALE · MANOPOLA ${n} ARRIVA PRESTO`);
    const p = PARAMETRI[chiave];
    const k = `globale|${chiave}`;
    const x = clamp01((this.x.get(k) ?? 0) + passi * PASSO_X);
    this.fissaX(k, x);
    for (const l of this.azioni.livelli()) this.mandaCoda(l.id, rigaCoda(p, x));
    this.toccata = { n, quando: this.ora(), testo: `GLOBALE · ${p.nome} ${x.toFixed(2)}` };
    this.azioni.scritta?.(`GLOBALE · ${p.nome} ${x.toFixed(2)}`);
  }

  // Le righe di coda partono al massimo ~30 volte al secondo per livello e funzione: l'ultima vince.
  mandaCoda(id, riga) {
    this.codaDa.set(`${id}|${riga.match(/^\.(\w+)/)[1]}`, { id, riga });
    if (this.codaTimer) return;
    this.codaTimer = this.imposta(() => {
      this.codaTimer = null;
      const da = [...this.codaDa.values()];
      this.codaDa.clear();
      for (const { id: livello, riga: r } of da) this.azioni.coda(livello, r);
    }, CODA_OGNI_MS);
  }

  // --- push delle manopole ---

  premiPush(n, giu) {
    const stato = this.push.get(n) ?? { giu: false, tenuta: false, timer: null };
    this.push.set(n, stato);
    if (giu) {
      stato.giu = true;
      stato.tenuta = false;
      stato.usato = false;
      this.ferma(stato.timer);
      stato.timer = this.imposta(() => {
        stato.tenuta = true;
        // tenuta = scelta del livello (per il filtro e, dopo, per i colpi)
        const l = this.pagina === 'A' ? this.livello(n) : null;
        if (l) this.azioni.seleziona?.(l.id);
      }, TENUTA_MS);
      return;
    }
    this.ferma(stato.timer);
    const eraTenuta = stato.tenuta;
    stato.giu = false;
    stato.tenuta = false;
    if (eraTenuta || stato.usato) {
      stato.usato = false;
      return; // il muto non scatta se tenevo premuto per scegliere o per dare un colpo
    }
    if (this.pagina === 'B') return this.resetParametro(n); // pagina B: premere = rimettere quel parametro com'era
    if (this.pagina !== 'A') return;
    if (n === 8) {
      this.riga('generale: niente muto (usa il volume)');
      return;
    }
    const l = this.livello(n);
    if (!l) return;
    this.azioni.muto(l.id);
    this.toccata = { n, quando: this.ora(), testo: `${l.nome.toUpperCase()} · ${l.muto ? 'SUONA' : 'MUTO'}` };
    this.azioni.tocca?.(l.id);
    this.azioni.scritta?.(`${l.nome.toUpperCase()} · ${l.muto ? 'SUONA' : 'MUTO'}`);
  }

  // --- tasti ---

  premiTasto(n, giu) {
    // pagina B: i tasti 1–7 scelgono il livello; l'8 resta il paracadute (sempre raggiungibile); il «globale» si sceglie premendo di nuovo il tasto layer B
    if (n <= 7 && this.pagina === 'B') {
      if (!giu) return;
      this.bersaglio = n;
      this.ultimoLivello = n;
      this.toccata = null;
      this.ultime.clear();
      const l = this.livello(n);
      this.riga(`bersaglio: ${l ? l.nome : `livello ${n} (vuoto)`}`);
      this.cambiato();
      return;
    }
    if (n > 8) {
      this.colpi.premi(n - 9, giu);
      return;
    }
    const comando = TASTI_A[n - 1];
    // «cuffia»: un tocco la accende o la spegne (al rilascio); tenuto, le manopole scorrono il CUE e ◀ ▶ cambiano brano
    if (comando === 'cuffia') {
      if (giu) this.cuffiaTenuta = { usato: false };
      else if (this.cuffiaTenuta) {
        const usato = this.cuffiaTenuta.usato;
        this.cuffiaTenuta = null;
        this.ferma(this.fermoTimer);
        if (!usato) {
          this.azioni.cuffia?.();
          this.azioni.scritta?.(this.azioni.inCuffia?.() ? 'CUFFIA · STOP' : 'CUFFIA');
        }
      }
      return;
    }
    if (this.cuffiaTenuta && giu && (comando === 'momentoIndietro' || comando === 'momentoAvanti')) {
      this.cambiaBrano(comando === 'momentoAvanti' ? 1 : -1);
      return;
    }
    if (comando === 'paracadute') {
      // tenuto un secondo: niente partenze per sbaglio
      this.ferma(this.paracaduteTimer);
      this.paracaduteTenuto = giu;
      if (giu) {
        this.riga('paracadute: tieni premuto');
        this.paracaduteTimer = this.imposta(() => {
          this.paracaduteTenuto = false;
          this.azioni.paracadute?.();
        }, PARACADUTE_MS);
      }
      return;
    }
    if (!giu) return;
    switch (comando) {
      case 'cuffia':
        this.azioni.cuffia?.();
        this.azioni.scritta?.(this.azioni.inCuffia?.() ? 'CUFFIA · STOP' : 'CUFFIA');
        break;
      case 'momentoIndietro':
      case 'momentoAvanti': {
        // un momento della spina indietro o avanti, a fine frase (come il go live)
        const delta = comando === 'momentoAvanti' ? 1 : -1;
        const simbolo = delta > 0 ? '▶' : '◀';
        this.lampo(this.tab.tasti[n - 1]);
        if (!this.azioni.momento) break;
        Promise.resolve(this.azioni.momento(delta)).then((r) => {
          if (r?.momento) this.azioni.scritta?.(`MOMENTO ${simbolo} ${String(r.momento).toUpperCase()}`);
          else this.azioni.scritta?.(`MOMENTO ${simbolo} NIENTE`);
        });
        break;
      }
      case 'goLive':
        this.lampo(this.tab.tasti[n - 1]);
        this.azioni.goLive?.();
        this.azioni.scritta?.('GO LIVE');
        break;
      case 'togli':
        this.lampo(this.tab.tasti[n - 1]);
        this.azioni.togli?.();
        this.azioni.scritta?.('TOGLI');
        break;
      default:
        this.riga(`${comando.replace(/([A-Z])/g, ' $1').toLowerCase()}: arriva presto`);
    }
  }

  // --- calibrazione dei tasti (nelle impostazioni) ---

  avviaCalibrazione() {
    this.calibrazione = { passo: 0, tasti: Array(16).fill(null), layer: {} };
    this.cambiato();
  }

  annullaCalibrazione() {
    this.calibrazione = null;
    this.cambiato();
  }

  // Il tasto da premere adesso: 1–16 poi layer A e B.
  get passoCalibrazione() {
    const c = this.calibrazione;
    if (!c) return null;
    if (c.passo < 16) return { testo: `tasto ${c.passo + 1} (${c.passo < 8 ? 'alto' : 'basso'}, ${(c.passo % 8) + 1}° da sinistra)`, n: c.passo + 1, di: 18 };
    return { testo: c.passo === 16 ? 'tasto layer A' : 'tasto layer B', n: c.passo + 1, di: 18 };
  }

  // Il tasto premuto durante la calibrazione: la sua nota va al posto che sto chiedendo.
  calibra(e) {
    const c = this.calibrazione;
    if (!c || !e.giu || e.nota === undefined) return;
    if (c.passo < 16) c.tasti[c.passo] = e.nota;
    else c.layer[c.passo === 16 ? 'A' : 'B'] = e.nota;
    c.passo++;
    if (c.passo >= 18) {
      this.azioni.salvaCalibrazione?.({ tasti: c.tasti, layer: c.layer });
      this.tab = tabella({ tasti: c.tasti, layer: c.layer });
      this.calibrazione = null;
      this.ultime.clear();
    }
    this.cambiato();
  }

  ricaricaTabella() {
    this.tab = tabella(this.azioni.calibrazione?.());
  }

  // --- luci ---

  // Un lampo breve su un tasto che ha appena fatto qualcosa (go live, togli).
  lampo(nota) {
    if (nota === null || nota === undefined) return;
    this.lampi.set(nota, this.ora() + 300);
  }

  // Cosa comanda ogni manopola adesso: null = libera (anello spento); altrimenti { stile: 'fan' | 'punto', valore 0..1 | null (muto) }.
  manopole() {
    const livelli = this.azioni.livelli();
    const m = [];
    if (this.pagina === 'A') {
      for (let n = 1; n <= 7; n++) {
        const l = livelli[n - 1];
        m.push(l ? { stile: 'fan', valore: l.muto ? null : l.volume, nome: l.nome, corto: corto(l.nome), testo: l.muto ? 'muto' : l.volume.toFixed(2), muto: l.muto } : null);
      }
      m.push({ stile: 'fan', valore: this.master, nome: 'generale', corto: 'gener', testo: this.master.toFixed(2) });
      return m;
    }
    for (let n = 1; n <= 8; n++) {
      const chiave = PAGINA_B[n - 1];
      if (this.bersaglio === 'globale') {
        if (n === 1) {
          const bpm = this.bpmVoluto ?? this.azioni.bpm?.() ?? 120;
          m.push({ stile: 'punto', valore: clamp01((bpm - 60) / 140), nome: 'bpm', corto: 'bpm', testo: String(Math.round(bpm)) });
        } else if (chiave === 'eco' || chiave === 'riverbero') {
          const x = this.x.get(`globale|${chiave}`) ?? 0;
          m.push({ stile: 'punto', valore: x, nome: PARAMETRI[chiave].nome.toLowerCase(), corto: PARAMETRI[chiave].corto, testo: x.toFixed(2) });
        } else m.push(null);
        continue;
      }
      const l = livelli[this.bersaglio - 1];
      if (!l || !chiave) {
        m.push(null);
      } else if (chiave === 'volume') {
        m.push({ stile: 'fan', valore: l.volume, nome: 'volume', corto: 'volume', testo: l.volume.toFixed(2) });
      } else if (chiave === 'velocita') {
        const i = Math.round(this.xDi(l, chiave));
        m.push({ stile: 'punto', valore: i / (SCATTI_VELOCITA.length - 1), nome: 'velocità', corto: 'veloc', testo: etichettaVelocita(SCATTI_VELOCITA[i]) });
      } else if (chiave === 'altezza') {
        const s = this.xDi(l, chiave);
        m.push({ stile: 'punto', valore: (s - ALTEZZA_MIN) / (ALTEZZA_MAX - ALTEZZA_MIN), nome: 'altezza', corto: 'altezz', testo: etichettaAltezza(s) });
      } else {
        const x = this.xDi(l, chiave);
        const p = PARAMETRI[chiave];
        m.push({ stile: 'punto', valore: x, nome: p.nome.toLowerCase(), corto: p.corto, testo: valoreTesto(p, x) });
      }
    }
    return m;
  }

  // Le luci come dovrebbero essere adesso: anelli solo per le manopole assegnate (col valore vero), tasti solo se hanno qualcosa da dire.
  desiderate() {
    const luci = new Map();
    const manopole = this.manopole();
    manopole.forEach((m, i) => {
      const n = i + 1;
      luci.set(`a${n}`, !m || m.valore === null ? messaggioAnello(n, 0, 'punto') : anelloDa(n, m.valore, m.stile));
    });
    const stati = new Map(); // nota → true | 'lampeggia'
    for (const i of this.colpi.attivi.keys()) stati.set(this.tab.tasti[8 + i], true); // un colpo si vede acceso finché lo tengo
    const livelli = this.azioni.livelli();
    stati.set(this.tab.layer[this.pagina], true); // la pagina
    const nota = (comando) => this.tab.tasti[TASTI_A.indexOf(comando)];
    // il paracadute c'è in tutte e due le pagine (tasto 8, tenuto un secondo)
    if (this.paracaduteTenuto) stati.set(nota('paracadute'), 'lampeggia');
    else if (this.azioni.paracaduteAperto?.()) stati.set(nota('paracadute'), true);
    if (this.pagina === 'A') {
      if (this.azioni.inCuffia?.()) stati.set(nota('cuffia'), true);
      // ◀ ▶ accesi se c'è un momento da raggiungere in quella direzione
      if (this.azioni.momentoNome?.(-1)) stati.set(nota('momentoIndietro'), true);
      if (this.azioni.momentoNome?.(1)) stati.set(nota('momentoAvanti'), true);
      if (this.azioni.inAttesa?.()) stati.set(nota('goLive'), 'lampeggia'); // il go live aspetta il suo ciclo
    } else if (this.bersaglio !== 'globale') {
      // il bersaglio acceso (col «globale» nessun tasto del livello è acceso)
      stati.set(this.tab.tasti[this.bersaglio - 1], true);
    }
    const ora = this.ora();
    for (const [nota, fino] of this.lampi) {
      if (fino > ora) stati.set(nota, true);
      else this.lampi.delete(nota);
    }
    void livelli;
    for (const nota of noteTasti(this.tab)) luci.set(`t${nota}`, messaggioTasto(nota, stati.get(nota) ?? false));
    return luci;
  }

  luci() {
    if (this.modo !== 'MC' || !this.porta.uscita || this.sequenzaLuci) return;
    for (const [k, bytes] of this.desiderate()) {
      const firma = bytes.join(',');
      if (this.ultime.get(k) === firma) continue;
      this.ultime.set(k, firma);
      this.manda(bytes);
    }
  }

  // --- prova luci (nelle impostazioni) ---

  async provaLuci(tipo, avanza = () => {}) {
    const mia = ++this.sequenza;
    this.sequenzaLuci = true;
    const ancora = () => mia === this.sequenza;
    const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));
    const spegni = () => {
      for (let n = 0; n < 104; n++) this.manda([0x90, n, 0]);
      for (let n = 1; n <= 8; n++) this.manda([0xb0, 0x30 + n - 1, 0]);
    };
    try {
      if (tipo === 'spegni') return spegni();
      if (tipo === 'tutti') {
        for (const nota of noteTasti(this.tab)) this.manda([0x90, nota, 127]);
        avanza('tutti i tasti conosciuti');
        await aspetta(3000);
      } else if (tipo === 'uno') {
        // tutte le note, una alla volta: si vede quale tasto si accende con quale numero
        for (let n = 0; n < 104 && ancora(); n++) {
          this.manda([0x90, n, 127]);
          avanza(`nota ${n}`);
          await aspetta(380);
          this.manda([0x90, n, 0]);
        }
      } else if (tipo === 'anelli') {
        for (const modo of ['punto', 'pan', 'fan', 'spread']) {
          for (const p of [1, 4, 7, 11]) {
            if (!ancora()) return;
            for (let n = 1; n <= 8; n++) this.manda(anelloDa(n, (p - 1) / 10, modo));
            avanza(`anelli: ${modo}, posizione ${p}`);
            await aspetta(900);
          }
        }
      }
    } finally {
      if (ancora()) {
        spegni();
        this.sequenzaLuci = false;
        this.ultime.clear();
        avanza('');
      }
    }
  }
}
