// Il codice valutato nell'interfaccia, senza suonarlo: per sapere quali suoni usa un brano,
// e (passo 6) quali note evidenziare. Strudel è deterministico: qui si vede quello che suona.
import { evalScope, repl, silence } from '@strudel/core';
import { transpiler } from '@strudel/transpiler';

const pronto = (async () => {
  await evalScope(
    import('@strudel/core'),
    import('@strudel/mini'),
    import('@strudel/tonal'),
    import('@strudel/webaudio'),
    import('@strudel/draw'),
  );
  // Qui niente si carica e niente suona: samples() non serve, e non deve andare in rete.
  await evalScope({ samples: async () => {}, initAudio: async () => {} });
})();

const CPS_SPIA = 0.5000001;
let errore = null;
const compilatore = repl({
  transpiler,
  defaultOutput: async () => {},
  getTime: () => 0,
  onEvalError: (e) => (errore = String(e.message ?? e)),
});

// Una valutazione alla volta: il repl di Strudel non è rientrante.
let coda = Promise.resolve();

export function valuta(codice) {
  const lavoro = coda.then(async () => {
    await pronto;
    errore = null;
    if (!codice.trim()) return { pattern: silence };
    // Un valore che nessuno sceglie: se dopo è cambiato, il codice ha detto il suo tempo (setcpm).
    compilatore.scheduler.cps = CPS_SPIA;
    const pattern = await compilatore.evaluate(codice, false);
    const cps = compilatore.scheduler.cps !== CPS_SPIA ? compilatore.scheduler.cps : null;
    return errore || !pattern ? { errore: errore ?? 'valutazione fallita' } : { pattern, cps };
  });
  coda = lavoro.catch(() => {});
  return lavoro;
}

// I nomi dei suoni (con la banca, come li cerca superdough) usati nei primi cicli.
export function suoniUsati(pattern, cicli = 16) {
  const nomi = new Set();
  try {
    for (const hap of pattern.queryArc(0, cicli)) {
      const v = hap.value;
      if (!v || typeof v !== 'object' || typeof v.s !== 'string') continue;
      nomi.add(v.bank ? `${v.bank}_${v.s}` : v.s);
      nomi.add(v.s);
    }
  } catch {
    // un pattern che non si lascia interrogare non usa suoni che sappiamo
  }
  return nomi;
}

// I suoni dello stash usati da un pezzo di codice, in ordine, e il BPM se il codice lo dice.
export async function analizza(codice, stash) {
  const { pattern, cps } = await valuta(codice);
  if (!pattern) return { suoni: [], bpm: null };
  const usati = suoniUsati(pattern);
  const suoni = Object.keys(stash)
    .filter((n) => n !== '_base' && usati.has(n))
    .sort();
  return { suoni, bpm: cps ? Math.round(cps * 240 * 10) / 10 : null };
}
