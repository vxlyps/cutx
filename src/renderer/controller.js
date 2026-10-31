// Il controller (X-Touch Mini in MC) dentro CUTX: legge i messaggi MIDI, li traduce in comandi (gli stessi della tastiera e del mouse)
// e accende anelli e tasti con i valori veri. Ogni cosa che tocco diventa codice: le manopole scrivono nella coda del livello.
// Non suona niente da solo e non decide niente: gira quello che giro io. Se il controller sparisce, CUTX va avanti uguale.
import { MESSAGGIO_MC, NOME_PORTA, anelloDa, decodifica, esadecimale, messaggioAnello, messaggioTasto, noteTasti, parole, tabella } from './controller-mc.js';
import { PARAMETRI, PAGINA_B, PASSO_VOLUME, PASSO_X, TASTI_A, clamp01, normalizzato, rigaCoda } from './controller-mappa.js';
import { valoreDi, valoreLetterale } from './coda.js';

const TENUTA_MS = 350; // una manopola tenuta così a lungo è «selezione», non un tocco (il muto non scatta)
const PARACADUTE_MS = 1000;
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
    this.codaDa = new Map(); // id|chiave → riga in attesa di partire
    this.codaTimer = null;
    this.ultime = new Map(); // luci già mandate
    this.calibrazione = null; // { passo, tasti, layer } mentre calibro
    this.suMonitor = null; // (testo, grezzo, evento) => {}
    this.suStato = null; // () => {}
    this.sequenza = 0; // per fermare una prova luci quando ne parte un'altra
    this.paracaduteTimer = null;
    this.tab = tabella(azioni.calibrazione?.());
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
      this.suStato?.();
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
      this.suStato?.();
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
        this.azioni.scritta?.(`FADER ${e.valore.toFixed(2)}`);
        break;
    }
  }

  vaiA(pagina) {
    if (pagina === this.pagina) return;
    this.pagina = pagina;
    this.ultime.clear();
    this.azioni.scritta?.(pagina === 'A' ? 'PAGINA A · SUONA' : 'PAGINA B · SCOLPISCI');
  }

  livello(n) {
    return this.azioni.livelli()[n - 1] ?? null;
  }

  // --- manopole ---

  giraManopola(n, passi) {
    if (!passi) return;
    if (this.pagina === 'A') {
      if (n === 8) return this.giraMaster(passi);
      const l = this.livello(n);
      if (!l) return this.azioni.scritta?.(`MANOPOLA ${n} · NESSUN LIVELLO`);
      // tenuta premuta + giro = il filtro di quel livello
      if (this.push.get(n)?.giu && this.push.get(n).tenuta) return this.cambiaParametro(l, 'filtro', passi);
      const v = clamp01(l.volume + passi * PASSO_VOLUME);
      this.azioni.volume(l.id, Math.round(v * 100) / 100);
      this.azioni.scritta?.(`${l.nome.toUpperCase()} · VOLUME ${v.toFixed(2)}`);
      return;
    }
    // pagina B: i parametri del bersaglio
    const chiave = PAGINA_B[n - 1];
    if (this.bersaglio === 'globale') return this.giraGlobale(n, passi);
    const l = this.livello(this.bersaglio);
    if (!l) return this.azioni.scritta?.('NESSUN LIVELLO');
    if (!chiave) return this.azioni.scritta?.(`MANOPOLA ${n} · ARRIVA PRESTO`);
    if (chiave === 'volume') {
      const v = clamp01(l.volume + passi * PASSO_VOLUME);
      this.azioni.volume(l.id, Math.round(v * 100) / 100);
      this.azioni.scritta?.(`${l.nome.toUpperCase()} · VOLUME ${v.toFixed(2)}`);
      return;
    }
    this.cambiaParametro(l, chiave, passi);
  }

  giraMaster(passi) {
    this.master = clamp01(this.master + passi * PASSO_VOLUME);
    this.azioni.master?.(Math.round(this.master * 100) / 100);
    this.azioni.scritta?.(`GENERALE · VOLUME ${this.master.toFixed(2)}`);
  }

  // Il valore di partenza di un parametro: quello della coda, o letterale nel codice, o il predefinito.
  xDi(l, chiave) {
    const p = PARAMETRI[chiave];
    const k = `${l.id}|${chiave}`;
    if (this.x.has(k)) return this.x.get(k);
    const v = valoreDi(l.coda ?? [], p.chiave) ?? valoreLetterale(l.codice ?? '', p.chiave);
    const x = v === null ? p.predefinito : normalizzato(p, v);
    return x;
  }

  cambiaParametro(l, chiave, passi) {
    const p = PARAMETRI[chiave];
    const x = clamp01(this.xDi(l, chiave) + passi * PASSO_X);
    this.x.set(`${l.id}|${chiave}`, x);
    this.mandaCoda(l.id, rigaCoda(p, x));
    this.azioni.scritta?.(`${l.nome.toUpperCase()} · ${p.nome} ${x.toFixed(2)}`);
  }

  giraGlobale(n, passi) {
    if (n === 1) {
      const bpm = Math.max(20, Math.min(300, Math.round((this.bpmVoluto ?? this.azioni.bpm?.() ?? 120) + passi)));
      this.bpmVoluto = bpm;
      this.azioni.tempo?.(bpm);
      this.azioni.scritta?.(`GLOBALE · BPM ${bpm}`);
      return;
    }
    const chiave = PAGINA_B[n - 1];
    if (chiave !== 'eco' && chiave !== 'riverbero') return this.azioni.scritta?.(`GLOBALE · MANOPOLA ${n} ARRIVA PRESTO`);
    const p = PARAMETRI[chiave];
    const k = `globale|${chiave}`;
    const x = clamp01((this.x.get(k) ?? 0) + passi * PASSO_X);
    this.x.set(k, x);
    for (const l of this.azioni.livelli()) this.mandaCoda(l.id, rigaCoda(p, x));
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
    if (eraTenuta) return; // il muto non scatta se tenevo premuto per scegliere
    if (this.pagina !== 'A') return;
    if (n === 8) {
      this.azioni.scritta?.('GENERALE · NIENTE MUTO (USA IL VOLUME)');
      return;
    }
    const l = this.livello(n);
    if (!l) return;
    this.azioni.muto(l.id);
    this.azioni.scritta?.(`${l.nome.toUpperCase()} · ${l.muto ? 'SUONA' : 'MUTO'}`);
  }

  // --- tasti ---

  premiTasto(n, giu) {
    if (n <= 8 && this.pagina === 'B') {
      if (!giu) return;
      this.bersaglio = n === 8 ? 'globale' : n;
      this.ultime.clear();
      const l = n === 8 ? null : this.livello(n);
      this.azioni.scritta?.(n === 8 ? 'BERSAGLIO · GLOBALE' : `BERSAGLIO · ${l ? l.nome.toUpperCase() : `LIVELLO ${n} (VUOTO)`}`);
      return;
    }
    if (n > 8) {
      if (giu) this.azioni.scritta?.('COLPI · ARRIVANO COL PASSO 4');
      return;
    }
    const comando = TASTI_A[n - 1];
    if (comando === 'paracadute') {
      // tenuto un secondo: niente partenze per sbaglio
      this.ferma(this.paracaduteTimer);
      if (giu) this.paracaduteTimer = this.imposta(() => this.azioni.paracadute?.(), PARACADUTE_MS);
      return;
    }
    if (!giu) return;
    switch (comando) {
      case 'cuffia':
        this.azioni.cuffia?.();
        this.azioni.scritta?.(this.azioni.inCuffia?.() ? 'CUFFIA · STOP' : 'CUFFIA');
        break;
      case 'goLive':
        this.azioni.goLive?.();
        this.azioni.scritta?.('GO LIVE');
        break;
      case 'togli':
        this.azioni.togli?.();
        this.azioni.scritta?.('TOGLI');
        break;
      default:
        this.azioni.scritta?.(`${comando.toUpperCase()} · ARRIVA PRESTO`);
    }
  }

  // --- calibrazione dei tasti (nelle impostazioni) ---

  avviaCalibrazione() {
    this.calibrazione = { passo: 0, tasti: Array(16).fill(null), layer: {} };
    this.suStato?.();
  }

  annullaCalibrazione() {
    this.calibrazione = null;
    this.suStato?.();
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
    this.suStato?.();
  }

  ricaricaTabella() {
    this.tab = tabella(this.azioni.calibrazione?.());
  }

  // --- luci ---

  // Le luci come dovrebbero essere adesso: anelli e tasti con i valori veri.
  desiderate() {
    const luci = new Map();
    const livelli = this.azioni.livelli();
    const anello = (n, valore, modo) => luci.set(`a${n}`, valore === null ? messaggioAnello(n, 0, modo) : anelloDa(n, valore, modo));
    if (this.pagina === 'A') {
      for (let n = 1; n <= 7; n++) {
        const l = livelli[n - 1];
        anello(n, !l || l.muto ? null : l.volume, 'punto');
      }
      anello(8, this.master, 'punto');
    } else {
      for (let n = 1; n <= 8; n++) {
        const chiave = PAGINA_B[n - 1];
        const l = this.bersaglio === 'globale' ? null : livelli[this.bersaglio - 1];
        let x = null;
        if (this.bersaglio === 'globale') x = chiave === 'eco' || chiave === 'riverbero' ? this.x.get(`globale|${chiave}`) ?? 0 : null;
        else if (l && chiave === 'volume') x = l.volume;
        else if (l && chiave) x = this.xDi(l, chiave);
        anello(n, x, 'fan');
      }
    }
    // tasti: il layer attivo, la cuffia, il bersaglio della pagina B
    const accesi = new Set([this.tab.layer[this.pagina]]);
    if (this.pagina === 'A') {
      if (this.azioni.inCuffia?.()) accesi.add(this.tab.tasti[TASTI_A.indexOf('cuffia')]);
    } else {
      const i = this.bersaglio === 'globale' ? 7 : this.bersaglio - 1;
      accesi.add(this.tab.tasti[i]);
    }
    for (const nota of noteTasti(this.tab)) luci.set(`t${nota}`, messaggioTasto(nota, accesi.has(nota)));
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
