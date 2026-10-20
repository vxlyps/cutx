// Misuratore di sfasamento tra live e cuffia, a due livelli:
// - stima: ogni motore dice quando ha suonato lo stesso click, secondo il proprio orologio;
// - anello: il click della cuffia (o del live, per il riferimento) rientra col cavo
//   nell'ingresso della MiniFuse e il motore live lo misura davvero.

export const SOGLIA_MS = 5; // sfasamento massimo accettato
export const SOGLIA_DERIVA_MS = 2; // quanto può muoversi in 10 minuti
const FINESTRA_MS = 10_000;
const MINUTO = 60_000;
const MAX_DATI = 50_000;
const LOG_OGNI_MS = 10_000;

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

class Serie {
  constructor() {
    this.dati = [];
  }
  aggiungi(ms) {
    this.dati.push({ quando: performance.now(), ms });
    if (this.dati.length > MAX_DATI) this.dati.splice(1, 1); // il primo resta: serve per la deriva
  }
  tra(da, a) {
    return this.dati.filter((d) => d.quando >= da && d.quando < a).map((d) => d.ms);
  }
  riepilogo() {
    if (!this.dati.length) return null;
    const ora = performance.now();
    const t0 = this.dati[0].quando;
    const recenti = this.tra(ora - FINESTRA_MS, ora);
    return {
      n: this.dati.length,
      ultimo: this.dati.at(-1).ms,
      media: media(recenti),
      min: recenti.length ? Math.min(...recenti) : null,
      max: recenti.length ? Math.max(...recenti) : null,
      // deriva: media dell'ultimo minuto meno media del primo minuto
      deriva: ora - t0 > 2 * MINUTO ? media(this.tra(ora - MINUTO, ora)) - media(this.tra(t0, t0 + MINUTO)) : null,
      durata: ora - t0,
    };
  }
}

// Qui non si ascolta niente: i motori dicono quando hanno suonato ogni click (stima)
// e il live misura l'anello col cavo. Qui si confronta e si scrive il log.
export class Misuratore {
  constructor() {
    this.riferimento = null; // ms dell'anello misurato col cavo dal live
    this.azzera();
  }

  azzera() {
    this.stima = new Serie();
    this.anello = new Serie();
    this.echi = new Map(); // posizione nel ciclo → { live, cuffia }
    this.fileLog = `sfasamento-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.log`;
  }

  avvia() {
    this.azzera();
    clearInterval(this.timerLog);
    this.timerLog = setInterval(() => this.scriviLog(), LOG_OGNI_MS);
  }

  ferma() {
    clearInterval(this.timerLog);
    this.timerLog = null;
  }

  // Un motore ha suonato il click della posizione ciclo all'epoca data.
  eco(ciclo, chi, epoca) {
    const e = this.echi.get(ciclo) ?? {};
    e[chi] = epoca;
    if (e.live !== undefined && e.cuffia !== undefined) {
      this.echi.delete(ciclo);
      this.stima.aggiungi(e.cuffia - e.live);
    } else {
      this.echi.set(ciclo, e);
    }
    if (this.echi.size > 200) this.echi.delete(this.echi.keys().next().value);
  }

  // Un click è rientrato col cavo, ms dopo essere partito dal live.
  misuraAnello(ms) {
    this.anello.aggiungi(ms);
  }

  salvaRiferimento() {
    this.riferimento = this.anello.riepilogo()?.media ?? null;
    this.anello = new Serie();
    return this.riferimento;
  }

  verdetto() {
    const s = this.anello.riepilogo() && this.riferimento !== null ? this.vero() : this.stima.riepilogo();
    if (!s || s.media === null) return null;
    const dentro = Math.abs(s.media) < SOGLIA_MS && (s.deriva === null || Math.abs(s.deriva) <= SOGLIA_DERIVA_MS);
    return { ...s, dentro };
  }

  // L'anello meno il riferimento: lo sfasamento vero della cuffia rispetto al live.
  vero() {
    const r = this.anello.riepilogo();
    if (!r || this.riferimento === null) return null;
    const meno = (x) => (x === null ? null : x - this.riferimento);
    return { ...r, ultimo: meno(r.ultimo), media: meno(r.media), min: meno(r.min), max: meno(r.max) };
  }

  scriviLog(extra = '') {
    const f = (x) => (x === null || x === undefined ? '-' : x.toFixed(2));
    const s = this.stima.riepilogo();
    const a = this.anello.riepilogo();
    const v = this.vero();
    const riga = [
      new Date().toISOString(),
      s ? `stima media=${f(s.media)} min=${f(s.min)} max=${f(s.max)} deriva=${f(s.deriva)}` : 'stima -',
      a ? `anello media=${f(a.media)} deriva=${f(a.deriva)} rif=${f(this.riferimento)} vero=${f(v?.media)}` : 'anello -',
      extra,
    ].join(' | ');
    console.log('[sfasamento]', riga);
    window.cutx.log(this.fileLog, riga);
  }
}
