// Il riproduttore di un motore: legge i pattern a tempo seguendo la mappa del tempo.
// Uguale per live e cuffia; cambia solo chi decide la mappa (il live) e chi la segue (la cuffia).
//
// Suona delle sorgenti: ognuna ha un pattern e una finestra di cicli [da, a) in cui suona.
// Così un livello entra ed esce esattamente al confine di un ciclo.
// Un pattern che non suona niente (senza importare Strudel: così questo modulo si prova anche fuori dal browser).
const SILENZIO = { queryArc: () => [] };

export const TICK_S = 0.05; // ogni quanto si guarda avanti
export const ANTICIPO_S = 0.1; // quanto prima si programma un suono
const MARGINE_MIN_S = 0.005; // con meno margine di così un suono è perso: meglio saltarlo

export class Riproduttore {
  // uscita(hap, deadline, durata, cps, t): chi suona davvero (superdough, via getTrigger)
  constructor(ac, uscita) {
    this.ac = ac;
    this.uscita = uscita;
    // { pattern, da, a, orbita }: da/a in cicli (a = Infinity: finché non lo tolgo)
    this.sorgenti = [];
    this.mappa = null; // { ciclo0, t0, cps }: al tempo t0 del contesto siamo al ciclo ciclo0
    this.fine = null; // fin dove i pattern sono già stati programmati, in cicli
    this.cambiTempo = []; // [{ ciclo, cps }]: il tempo cambia esattamente a quel ciclo
    this.precedente = null; // { mappa, fino }: la mappa di prima dell'ultimo cambio, valida fino al tempo `fino` (il cambio si programma in anticipo)
    this.tardi = 0;
    this.eventi = 0; // quanti suoni ha programmato, per le prove
    this.errore = null;
    this.suEvento = null; // (hap, t, sorgente) => {}, per misuratore, sentinella e prove
    this.suCps = null; // (cps) => {}, quando un evento chiede un tempo nuovo (cps nel valore)
    this.suMappa = null; // () => {}, quando la mappa cambia
  }

  // Una sorgente sola che suona sempre: la cuffia, la prova.
  set pattern(p) {
    this.sorgenti = [{ pattern: p ?? SILENZIO, da: -Infinity, a: Infinity }];
  }

  ciclo(t) {
    const m = this.mappa;
    return m.ciclo0 + (t - m.t0) * m.cps;
  }

  tempo(ciclo) {
    const m = this.mappa;
    return m.t0 + (ciclo - m.ciclo0) / m.cps;
  }

  // Il cambio di tempo si programma ~150 ms prima che entri: per sapere dov'è il tempo *adesso* (e pubblicarlo giusto)
  // serve la mappa di prima, finché quel momento non è arrivato.
  mappaAl(t) {
    return this.precedente && t < this.precedente.fino ? this.precedente.mappa : this.mappa;
  }

  cicloAl(t) {
    const m = this.mappaAl(t);
    return m.ciclo0 + (t - m.t0) * m.cps;
  }

  cpsAl(t) {
    return this.mappaAl(t).cps;
  }

  // I cambi di tempo che non sono ancora entrati al tempo t: [{ ciclo, cps }].
  cambiProssimi(t) {
    const ancora = this.precedente && t < this.precedente.fino ? [{ ciclo: this.mappa.ciclo0, cps: this.mappa.cps }] : [];
    return [...ancora, ...this.cambiTempo.map((c) => ({ ciclo: c.ciclo, cps: c.cps }))];
  }

  // Il primo ciclo intero non ancora programmato: il primo confine a cui si può ancora entrare.
  prossimoConfine() {
    return Math.ceil(this.fine ?? this.ciclo(this.ac.currentTime));
  }

  // Cambio di tempo senza salti: la mappa nuova parte da dove è arrivata la programmazione.
  cambiaCps(cps) {
    if (!(cps > 0) || cps === this.mappa.cps) return;
    const ciclo0 = this.fine ?? this.ciclo(this.ac.currentTime);
    this.precedente = { mappa: this.mappa, fino: this.tempo(ciclo0) };
    this.mappa = { ciclo0, t0: this.tempo(ciclo0), cps };
    this.suMappa?.();
  }

  // Chi cambia il tempo a mano decide l'ultima parola: i cambi che dovevano entrare più tardi (un livello con setcpm, ancora in arrivo) si annullano.
  annullaCambiDopo(ciclo) {
    this.cambiTempo = this.cambiTempo.filter((c) => c.ciclo <= ciclo);
  }

  // Il tempo cambierà esattamente al ciclo dato (quando entra un livello con setcpm).
  cambiaCpsA(ciclo, cps) {
    if (!(cps > 0)) return;
    if (this.fine !== null && ciclo <= this.fine) return this.cambiaCps(cps);
    this.cambiTempo = [...this.cambiTempo.filter((c) => c.ciclo !== ciclo), { ciclo, cps }].sort((a, b) => a.ciclo - b.ciclo);
  }

  tick() {
    if (!this.mappa) return;
    const ora = this.ac.currentTime;
    const orizzonte = ora + ANTICIPO_S + TICK_S;
    // Prima volta, o dopo un salto all'indietro: si riparte da adesso.
    if (this.fine === null || this.fine > this.ciclo(orizzonte) + 1) this.fine = this.ciclo(ora + ANTICIPO_S);
    // Fino a un cambio di tempo si va con la mappa vecchia, poi con quella nuova.
    while (this.cambiTempo.length && this.cambiTempo[0].ciclo < this.ciclo(orizzonte)) {
      const { ciclo, cps } = this.cambiTempo.shift();
      if (ciclo > this.fine) this.programma(this.fine, ciclo, ora);
      this.fine = Math.max(this.fine, ciclo);
      if (cps !== this.mappa.cps) {
        this.precedente = { mappa: this.mappa, fino: this.tempo(ciclo) };
        this.mappa = { ciclo0: ciclo, t0: this.tempo(ciclo), cps };
        this.suMappa?.();
      }
    }
    const fino = this.ciclo(orizzonte);
    if (fino <= this.fine) return;
    this.programma(this.fine, fino, ora);
    this.fine = fino;
  }

  programma(da, fino, ora) {
    const cps = this.mappa.cps;
    this.errore = null;
    for (const s of this.sorgenti) {
      const inizio = Math.max(da, s.da);
      const fine = Math.min(fino, s.a);
      if (fine <= inizio) continue;
      let haps;
      try {
        haps = s.pattern.queryArc(inizio, fine, { _cps: cps, cyclist: 'cyclist' });
      } catch (e) {
        this.errore = String(e.message ?? e);
        continue;
      }
      for (const hap of haps) {
        if (!hap.hasOnset()) continue;
        const t = this.tempo(hap.whole.begin.valueOf());
        if (!(t > ora + MARGINE_MIN_S)) {
          this.tardi++;
          continue;
        }
        // Volume e muto stanno nel guadagno del livello (motore.js): qui suona tutto, anche da muto,
        // così le note lunghe restano a tempo e al ritorno del volume si risente il punto giusto.
        // Il livello ha una sua orbita, così il suo guadagno agisce anche sui suoni già partiti.
        const h = s.orbita === undefined ? hap : hap.withValue((v) => ({ ...v, orbit: s.orbita }));
        this.eventi++;
        this.uscita(h, t - ora, hap.duration / cps, cps, t);
        this.suEvento?.(h, t, s);
        if (hap.value?.cps !== undefined && hap.value.cps !== cps) this.suCps?.(hap.value.cps);
      }
    }
  }
}
