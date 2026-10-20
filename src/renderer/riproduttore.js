// Il riproduttore di un motore: legge il pattern a tempo seguendo la mappa del tempo.
// Uguale per live e cuffia; cambia solo chi decide la mappa (il live) e chi la segue (la cuffia).
import { silence } from '@strudel/core';

export const TICK_S = 0.05; // ogni quanto si guarda avanti
export const ANTICIPO_S = 0.1; // quanto prima si programma un suono
const MARGINE_MIN_S = 0.005; // con meno margine di così un suono è perso: meglio saltarlo

export class Riproduttore {
  // uscita(hap, deadline, durata, cps, t): chi suona davvero (superdough, via getTrigger)
  constructor(ac, uscita) {
    this.ac = ac;
    this.uscita = uscita;
    this.pattern = silence;
    this.mappa = null; // { ciclo0, t0, cps }: al tempo t0 del contesto siamo al ciclo ciclo0
    this.fine = null; // fin dove il pattern è già stato programmato, in cicli
    this.tardi = 0;
    this.errore = null;
    this.suEvento = null; // (hap, t) => {}, per misuratore e sentinella
    this.suCps = null; // (cps) => {}, quando il codice chiede un tempo nuovo
  }

  ciclo(t) {
    const m = this.mappa;
    return m.ciclo0 + (t - m.t0) * m.cps;
  }

  tempo(ciclo) {
    const m = this.mappa;
    return m.t0 + (ciclo - m.ciclo0) / m.cps;
  }

  // Cambio di tempo senza salti: la mappa nuova parte da dove è arrivata la programmazione.
  cambiaCps(cps) {
    if (!(cps > 0) || cps === this.mappa.cps) return;
    const ciclo0 = this.fine ?? this.ciclo(this.ac.currentTime);
    this.mappa = { ciclo0, t0: this.tempo(ciclo0), cps };
  }

  tick() {
    if (!this.mappa) return;
    const ora = this.ac.currentTime;
    const fino = this.ciclo(ora + ANTICIPO_S + TICK_S);
    // Prima volta, o dopo un salto all'indietro: si riparte da adesso.
    if (this.fine === null || this.fine > fino + 1) this.fine = this.ciclo(ora + ANTICIPO_S);
    if (fino <= this.fine) return;
    const da = this.fine;
    this.fine = fino;
    const cps = this.mappa.cps;
    let haps;
    try {
      haps = this.pattern.queryArc(da, fino, { _cps: cps, cyclist: 'cyclist' });
      this.errore = null;
    } catch (e) {
      this.errore = String(e.message ?? e);
      return;
    }
    for (const hap of haps) {
      if (!hap.hasOnset()) continue;
      const t = this.tempo(hap.whole.begin.valueOf());
      if (!(t > ora + MARGINE_MIN_S)) {
        this.tardi++;
        continue;
      }
      this.uscita(hap, t - ora, hap.duration / cps, cps, t);
      this.suEvento?.(hap, t);
      if (hap.value?.cps !== undefined && hap.value.cps !== cps) this.suCps?.(hap.value.cps);
    }
  }
}
