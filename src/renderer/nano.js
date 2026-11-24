// Il Korg nanoKONTROL2 come mixer dei CANALI. Legge i messaggi della scena di fabbrica (stessi numeri della modalità nativa, su un canale qualsiasi):
// fader 0–7 · manopole 16–23 · S 32–39 · M 48–55 · R 64–71 · PLAY 41. Mai niente in scrittura: il nano non si tocca.
// R = esegue NEXT (GO / OUT / ANNULLA; tenuto 1 s: esce subito) · S = preascolto in CUFFIA · M = MUTE · manopola = scelta di NEXT (a sinistra OUT) ·
// fader = volume del CH (anche dei livelli già live) · PLAY = GO ALL (solo i CH armati, OUT compresi).
// Trasporto: TRACK ◀ ▶ 58/59 = brano prima/dopo in PROSSIMO · SET 60 = il CUE passa tra brano che suona e prossimo · MARKER ◀ ▶ 61/62 = scena del beat ·
// CYCLE 46 = «entra tra» 1→2→4→8 · STOP 42 (breve = annulla le attese, tenuto 1,5 s = paracadute, la carica si vede) · REC 45 · REW 43 e FF 44 liberi.
export const NOME_NANO = /nanokontrol2/i;
export const OUT_TENUTO_MS = 1000;
export const STOP_TENUTO_MS = 1500; // STOP tenuto = paracadute (più lungo di R: più grave)
export const LAMPEGGIO_LENTO_MS = 700; // R: in NEXT c'è altro da lanciare
export const LAMPEGGIO_VELOCE_MS = 200; // R / S: sta per entrare / uscire

// Le luci che il nano deve avere: Map cc → 0 | 127. `vista` = StatoCanali.vista(), t = millisecondi (per il lampeggio fatto qui: le luci del nano sono solo on/off).
// R: spenta = vuoto · fissa = suona · lampeggio lento = ho armato qualcosa (un'altra clip, o OUT) · lampeggio veloce = sta per entrare o per uscire.
// S: accesa = quel CH è in cuffia. M: accesa = muto. PLAY: lampeggia lento se PLAY (GO ALL) ha qualcosa da lanciare.
// `extra`: { cycle (entra tra > 1), rec (registra), stop (paracadute aperto) }.
export function luciNano(vista, t, extra = {}) {
  const fase = (ms) => Math.floor(t / ms) % 2 === 0;
  const come = (luce) => (luce === 'accesa' ? 127 : luce === 'lenta' ? (fase(LAMPEGGIO_LENTO_MS) ? 127 : 0) : luce === 'veloce' ? (fase(LAMPEGGIO_VELOCE_MS) ? 127 : 0) : 0);
  const luci = new Map();
  for (const v of vista.slice(0, 8)) {
    luci.set(64 + v.indice, come(v.luci.r));
    luci.set(32 + v.indice, come(v.luci.s));
    luci.set(48 + v.indice, come(v.luci.m));
  }
  luci.set(41, vista.some((v) => v.luci.r === 'lenta') ? come('lenta') : 0);
  luci.set(46, extra.cycle ? 127 : 0);
  luci.set(45, extra.rec ? 127 : 0);
  luci.set(42, extra.stop ? 127 : 0);
  return luci;
}

// Un messaggio MIDI grezzo → cosa vuol dire, o null. Puro: si prova con test/nano.test.js.
export function leggiNano(dati) {
  const [stato, cc, valore] = dati;
  if ((stato & 0xf0) !== 0xb0 || dati.length < 3) return null;
  const v = valore / 127;
  if (cc >= 0 && cc <= 7) return { tipo: 'fader', ch: cc, v };
  if (cc >= 16 && cc <= 23) return { tipo: 'manopola', ch: cc - 16, pos: v };
  if (cc >= 32 && cc <= 39) return { tipo: 'out', ch: cc - 32, giu: valore >= 64 };
  if (cc >= 48 && cc <= 55) return { tipo: 'mute', ch: cc - 48, giu: valore >= 64 };
  if (cc >= 64 && cc <= 71) return { tipo: 'go', ch: cc - 64, giu: valore >= 64 };
  if (cc === 41) return { tipo: 'goAll', giu: valore >= 64 };
  const trasporto = { 42: 'stop', 45: 'rec', 46: 'cycle', 58: 'trackSu', 59: 'trackGiu', 60: 'set', 61: 'markerSu', 62: 'markerGiu' }[cc];
  if (trasporto) return { tipo: trasporto, giu: valore >= 64 };
  if (cc === 43 || cc === 44) return { tipo: 'libero', giu: valore >= 64 }; // REW e FF: capiti, ma non fanno niente
  return null;
}

export class Nano {
  // azioni: { fader(ch, v), manopola(ch, pos), premiR(ch), tieniR(ch), cuffia(ch), cuffiaSu(ch), mute(ch), goAll(), collegato(si),
  //   track(verso), set(), marker(verso), cycle(), stop(), tieniStop(), rec() }
  constructor(azioni) {
    this.azioni = azioni;
    this.timer = new Map();
    this.collegato = false;
    this.stato = 0xb0; // il canale MIDI su cui parla il nano: lo si impara dai suoi messaggi
    this.inviate = new Map(); // cc → ultimo valore mandato: si manda solo quello che cambia
    this.vista = null;
  }

  // Lo stato dei canali, da mostrare con le luci (a nano collegato e con i LED in «External»: dall'Editor Korg). Si può chiamare a ogni giro.
  mostra(vista, extra = {}) {
    this.vista = vista;
    this.extra = extra;
    this.luci();
  }

  luci(t = Date.now()) {
    if (!this.uscita || !this.vista) return;
    for (const [cc, v] of luciNano(this.vista, t, this.extra)) {
      if (this.inviate.get(cc) === v) continue;
      this.inviate.set(cc, v);
      try {
        this.uscita.send([this.stato, cc, v]);
      } catch {
        return; // il cavo è stato staccato proprio ora: ci pensa statechange
      }
    }
  }

  // R e STOP tenuti a metà: con il cavo staccato non succede niente (né OUT né paracadute) e la carica del gatto si spegne.
  annullaPendenti() {
    for (const [ch, t] of this.timer) if (t) (clearTimeout(t), this.timer.set(ch, null));
    if (this.timerStop) {
      clearTimeout(this.timerStop);
      this.timerStop = null;
      this.azioni.stopCarica?.(false);
    }
  }

  async avvia() {
    if (!navigator.requestMIDIAccess) return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      return;
    }
    const cerca = () => {
      const porta = [...this.access.inputs.values()].find((p) => NOME_NANO.test(p.name));
      const uscita = [...this.access.outputs.values()].find((p) => NOME_NANO.test(p.name));
      if (uscita !== this.uscita) this.inviate.clear(); // un nano appena collegato non ha le luci di prima
      this.uscita = uscita ?? null;
      if (this.porta && this.porta !== porta) this.porta.onmidimessage = null;
      this.porta = porta ?? null;
      if (porta) porta.onmidimessage = (e) => this.riceve([...e.data]);
      if (!porta) this.annullaPendenti(); // cavo staccato: R e STOP tenuti a metà non scattano da soli
      if (!!porta !== this.collegato) this.azioni.collegato?.((this.collegato = !!porta));
    };
    cerca();
    this.access.onstatechange = cerca;
  }

  riceve(dati) {
    const m = leggiNano(dati);
    this.azioni.ultimo?.(dati.map((b) => b.toString(16).padStart(2, '0')).join(' '), !!m); // per vedere cosa manda davvero (e cosa non capisco)
    if (!m) return;
    this.stato = 0xb0 | (dati[0] & 0x0f);
    const a = this.azioni;
    if (m.tipo === 'fader') a.fader(m.ch, m.v);
    else if (m.tipo === 'manopola') a.manopola(m.ch, m.pos);
    else if (m.tipo === 'out') (m.giu ? a.cuffia(m.ch) : a.cuffiaSu?.(m.ch)); // S: tenuto = cuffia, rilasciato = smette
    else if (m.tipo === 'mute' && m.giu) a.mute(m.ch);
    else if (m.tipo === 'goAll' && m.giu) a.goAll();
    else if (m.tipo === 'trackSu' && m.giu) a.track?.(-1);
    else if (m.tipo === 'trackGiu' && m.giu) a.track?.(1);
    else if (m.tipo === 'set' && m.giu) a.set?.();
    else if (m.tipo === 'markerSu' && m.giu) a.marker?.(-1);
    else if (m.tipo === 'markerGiu' && m.giu) a.marker?.(1);
    else if (m.tipo === 'cycle' && m.giu) a.cycle?.();
    else if (m.tipo === 'rec' && m.giu) a.rec?.();
    else if (m.tipo === 'stop') {
      // STOP: breve = annulla le attese (al rilascio); tenuto 1,5 s = paracadute (subito, il rilascio non fa altro); intanto la carica si vede
      if (m.giu) {
        clearTimeout(this.timerStop);
        a.stopCarica?.(true, STOP_TENUTO_MS);
        this.timerStop = setTimeout(() => ((this.timerStop = null), a.stopCarica?.(false), a.tieniStop?.()), STOP_TENUTO_MS);
      } else if (this.timerStop) {
        clearTimeout(this.timerStop);
        this.timerStop = null;
        a.stopCarica?.(false);
        a.stop?.();
      }
    }
    else if (m.tipo === 'go') {
      // R: si decide al rilascio (breve = premiR), oppure dopo 1 s tenuto (tieniR, esce subito)
      if (m.giu) {
        this.timer.set(m.ch, setTimeout(() => (this.timer.set(m.ch, null), a.tieniR(m.ch)), OUT_TENUTO_MS));
      } else if (this.timer.get(m.ch)) {
        clearTimeout(this.timer.get(m.ch));
        this.timer.set(m.ch, null);
        a.premiR(m.ch);
      }
    }
  }
}
