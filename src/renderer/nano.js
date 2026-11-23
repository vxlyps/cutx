// Il Korg nanoKONTROL2 come mixer dei CANALI. Legge i messaggi della scena di fabbrica (stessi numeri della modalità nativa, su un canale qualsiasi):
// fader 0–7 · manopole 16–23 · S 32–39 · M 48–55 · R 64–71 · PLAY 41. Mai niente in scrittura: il nano non si tocca.
// R = GO · S = OUT (tenuto 1 s: esce subito) · M = MUTE · manopola = scelta di NEXT · fader = volume del CH · PLAY = GO ALL.
export const NOME_NANO = /nanokontrol2/i;
export const OUT_TENUTO_MS = 1000;

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
  // azioni: { fader(ch, v), manopola(ch, pos), go(ch), out(ch), outSubito(ch), mute(ch), goAll(), collegato(si) }
  constructor(azioni) {
    this.azioni = azioni;
    this.timer = new Map();
    this.collegato = false;
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
    if (!m) return;
    const a = this.azioni;
    if (m.tipo === 'fader') a.fader(m.ch, m.v);
    else if (m.tipo === 'manopola') a.manopola(m.ch, m.pos);
    else if (m.tipo === 'go' && m.giu) a.go(m.ch);
    else if (m.tipo === 'mute' && m.giu) a.mute(m.ch);
    else if (m.tipo === 'goAll' && m.giu) a.goAll();
    else if (m.tipo === 'out') {
      if (m.giu) {
        this.timer.set(m.ch, setTimeout(() => (this.timer.set(m.ch, null), a.outSubito(m.ch)), OUT_TENUTO_MS));
      } else if (this.timer.get(m.ch)) {
        clearTimeout(this.timer.get(m.ch)); // rilasciato prima di 1 s: OUT normale
        this.timer.set(m.ch, null);
        a.out(m.ch);
      }
    }
  }
}
