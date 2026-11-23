// Il Korg nanoKONTROL2 come mixer dei CANALI. Legge i messaggi della scena di fabbrica (stessi numeri della modalità nativa, su un canale qualsiasi):
// fader 0–7 · manopole 16–23 · S 32–39 · M 48–55 · R 64–71 · PLAY 41. Mai niente in scrittura: il nano non si tocca.
// R = esegue NEXT (GO / OUT / ANNULLA; tenuto 1 s: esce subito) · S = preascolto in CUFFIA · M = MUTE · manopola = scelta di NEXT (a sinistra OUT) ·
// fader = volume del CH (anche dei livelli già live) · PLAY = GO ALL (solo i CH armati, OUT compresi).
export const NOME_NANO = /nanokontrol2/i;
export const OUT_TENUTO_MS = 1000;
export const LAMPEGGIO_LENTO_MS = 700; // R: in NEXT c'è altro da lanciare
export const LAMPEGGIO_VELOCE_MS = 200; // R / S: sta per entrare / uscire

// Le luci che il nano deve avere: Map cc → 0 | 127. `vista` = StatoCanali.vista(), t = millisecondi (per il lampeggio fatto qui: le luci del nano sono solo on/off).
// R: spenta = vuoto · fissa = suona · lampeggio lento = ho armato qualcosa (un'altra clip, o OUT) · lampeggio veloce = sta per entrare o per uscire.
// S: accesa = quel CH è in cuffia. M: accesa = muto. PLAY: lampeggia lento se PLAY (GO ALL) ha qualcosa da lanciare.
export function luciNano(vista, t) {
  const fase = (ms) => Math.floor(t / ms) % 2 === 0;
  const come = (luce) => (luce === 'accesa' ? 127 : luce === 'lenta' ? (fase(LAMPEGGIO_LENTO_MS) ? 127 : 0) : luce === 'veloce' ? (fase(LAMPEGGIO_VELOCE_MS) ? 127 : 0) : 0);
  const luci = new Map();
  for (const v of vista.slice(0, 8)) {
    luci.set(64 + v.indice, come(v.luci.r));
    luci.set(32 + v.indice, come(v.luci.s));
    luci.set(48 + v.indice, come(v.luci.m));
  }
  luci.set(41, vista.some((v) => v.luci.r === 'lenta') ? come('lenta') : 0);
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
  return null;
}

export class Nano {
  // azioni: { fader(ch, v), manopola(ch, pos), premiR(ch), tieniR(ch), cuffia(ch), mute(ch), goAll(), collegato(si) }
  constructor(azioni) {
    this.azioni = azioni;
    this.timer = new Map();
    this.collegato = false;
    this.stato = 0xb0; // il canale MIDI su cui parla il nano: lo si impara dai suoi messaggi
    this.inviate = new Map(); // cc → ultimo valore mandato: si manda solo quello che cambia
    this.vista = null;
  }

  // Lo stato dei canali, da mostrare con le luci (a nano collegato e con i LED in «External»: dall'Editor Korg). Si può chiamare a ogni giro.
  mostra(vista) {
    this.vista = vista;
    this.luci();
  }

  luci(t = Date.now()) {
    if (!this.uscita || !this.vista) return;
    for (const [cc, v] of luciNano(this.vista, t)) {
      if (this.inviate.get(cc) === v) continue;
      this.inviate.set(cc, v);
      try {
        this.uscita.send([this.stato, cc, v]);
      } catch {
        return; // il cavo è stato staccato proprio ora: ci pensa statechange
      }
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
    else if (m.tipo === 'out' && m.giu) a.cuffia(m.ch); // S
    else if (m.tipo === 'mute' && m.giu) a.mute(m.ch);
    else if (m.tipo === 'goAll' && m.giu) a.goAll();
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
