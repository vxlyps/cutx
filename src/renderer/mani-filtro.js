// Le mani (sperimentale): dall'altezza della mano al filtro passa-basso su tutto il live. Modulo puro: lo provano i test.
//
// - altezza della mano → filtro, scala esponenziale 200–16000 Hz: mano in alto = aperto, in basso = chiuso;
// - valore ammorbidito (niente tremolio) e con una piccola zona morta: la riga globale cambia solo se il filtro si è mosso davvero;
// - se la camera perde la mano (dopo un attimo, per non reagire a un fotogramma mancato) il filtro torna aperto in 2 cicli, mai bloccato a metà;
// - ferma() (il tasto M) toglie tutto subito: il chiamante rimette com'era.

export const HZ_MIN = 200;
export const HZ_MAX = 16000;
const TAU_MS = 120; // l'ammorbidimento: in circa mezzo secondo il valore segue la mano
const ZONA_MORTA = 0.012; // quanto deve muoversi (0..1 sulla scala del filtro, ~5% di frequenza) per riscrivere la riga
const OGNI_MS = 66; // al massimo ~15 righe al secondo: ogni riga globale fa rifare i pattern del live
const ATTESA_PERSA_MS = 300; // la mano manca da meno di così: un fotogramma saltato, si tiene il valore
const CICLI_RILASCIO = 2;
const RILASCIO_MIN_MS = 500;

const limita = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// Da altezza (0 = chiuso … 1 = aperto) a Hz, esponenziale: ogni passo uguale è la stessa nota in più.
export const hzDaAltezza = (a) => Math.round(HZ_MIN * (HZ_MAX / HZ_MIN) ** limita(a));

// Da y della camera (0 = bordo alto, 1 = bordo basso) ad altezza 0..1. La sensibilità (0..1) dice quanta strada fa la mano:
// 0 = serve quasi tutta l'inquadratura, 1 = basta meno della metà. Al centro dell'inquadratura il filtro è a metà.
export const altezzaDaY = (y, sensibilita = 0.5) => {
  const ampiezza = 0.9 - 0.5 * limita(sensibilita);
  return limita((0.5 - y) / ampiezza + 0.5);
};

export const rigaMano = (hz) => `all(x => x.lpf(${hz})) // mano`;

export class FiltroMano {
  // sensibilita: 0..1; cicloMs: () => durata di un ciclo in ms (dal BPM del live)
  constructor({ sensibilita = 0.5, cicloMs = () => 2000 } = {}) {
    this.sensibilita = sensibilita;
    this.cicloMs = cicloMs;
    this.azzera();
  }

  azzera() {
    this.controlla = false; // la mano comanda il filtro (anche mentre torna aperto)
    this.a = 1; // altezza ammorbidita 0..1
    this.inviata = null; // l'ultima altezza scritta nella riga
    this.ultimaOra = null;
    this.ultimoInvio = -Infinity;
    this.persaDa = null;
    this.rilascio = null; // { t0, a0 }
  }

  stato(cambia) {
    const hz = hzDaAltezza(this.a);
    return { controlla: this.controlla, hz, altezza: this.a, riga: this.controlla ? rigaMano(hz) : null, testo: `${hz} Hz`, rilascio: !!this.rilascio, cambia };
  }

  // Un passo: { visibile, y, ora (ms) } → { controlla, hz, altezza, riga, testo, rilascio, cambia }.
  // `cambia` dice se la riga globale va riscritta (o tolta, se controlla è tornato falso).
  aggiorna({ visibile, y = 0.5, ora }) {
    const dt = this.ultimaOra === null ? 0 : Math.max(0, ora - this.ultimaOra);
    this.ultimaOra = ora;
    if (visibile) {
      this.persaDa = null;
      this.rilascio = null;
      const bersaglio = altezzaDaY(y, this.sensibilita);
      if (!this.controlla) {
        this.controlla = true;
        this.a = bersaglio; // la prima volta si parte da dov'è la mano
      } else this.a += (bersaglio - this.a) * (1 - Math.exp(-dt / TAU_MS));
    } else if (this.controlla) {
      this.persaDa ??= ora;
      if (ora - this.persaDa >= ATTESA_PERSA_MS) {
        this.rilascio ??= { t0: ora, a0: this.a };
        const durata = Math.max(RILASCIO_MIN_MS, CICLI_RILASCIO * this.cicloMs());
        const p = (ora - this.rilascio.t0) / durata;
        if (p >= 1) {
          // tornato tutto aperto: la mano non comanda più, la riga sparisce (torna il fader)
          this.a = 1;
          this.controlla = false;
          this.rilascio = null;
          this.inviata = null;
          return this.stato(true);
        }
        this.a = this.rilascio.a0 + (1 - this.rilascio.a0) * p;
      }
    }
    if (!this.controlla) return this.stato(false);
    const mosso = this.inviata === null || Math.abs(this.a - this.inviata) >= ZONA_MORTA;
    const cambia = mosso && ora - this.ultimoInvio >= OGNI_MS;
    if (cambia) {
      this.inviata = this.a;
      this.ultimoInvio = ora;
    }
    return this.stato(cambia);
  }

  // Il tasto M (o la camera che si ferma): niente più filtro, subito. Ritorna cambia: true solo se c'era una riga da togliere.
  ferma() {
    const c = this.controlla;
    this.azzera();
    return { ...this.stato(c), controlla: false, riga: null };
  }
}
