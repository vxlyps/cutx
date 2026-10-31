// Il limiter del guardiano: sull'uscita del live, niente esplode in cassa.
//   volume generale → compressore (soglia −2 dB, rapporto 20, attacco 1 ms, rilascio 100 ms, con il suo anticipo di ~6 ms)
//   → compensazione (il compressore di Chromium alza da solo di 1,14 dB sotto la soglia: qui si toglie, così sotto la soglia è trasparente)
//   → ammorbidimento (lineare fino a 0,9; sopra si piega e non supera CEILING, circa −0,25 dBFS: nessun fuori scala digitale).
// Sta in un file a parte perché lo si può provare fuori linea (misuraLimiter) e lo usano motore e prove.

export const CEILING = 0.972;
const SOGLIA_DB = -2;
export const COMPENSAZIONE = 0.877;

export function curvaMorbida() {
  const n = 4097;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    c[i] = Math.sign(x) * (a <= 0.9 ? a : 0.9 + 0.09 * Math.tanh((a - 0.9) / 0.09));
  }
  return c;
}

// I nodi, già collegati fra loro: si entra da `ingresso`, si esce da `uscita`.
export function creaLimiter(ctx) {
  const ingresso = new DynamicsCompressorNode(ctx, { threshold: SOGLIA_DB, knee: 0, ratio: 20, attack: 0.001, release: 0.1 });
  const compensa = new GainNode(ctx, { gain: COMPENSAZIONE });
  const uscita = new WaveShaperNode(ctx, { curve: curvaMorbida(), oversample: '2x' });
  ingresso.connect(compensa);
  compensa.connect(uscita);
  return { ingresso, uscita, compressore: ingresso };
}

// Una sinusoide a questa ampiezza (lineare) attraverso il limiter, fuori linea: { picco, guadagnoDb } dopo il transitorio.
export async function misuraLimiter(ampiezza, frequenza = 220) {
  const sr = 48000;
  const ctx = new OfflineAudioContext(1, sr * 2, sr);
  const osc = new OscillatorNode(ctx, { frequency: frequenza });
  const g = new GainNode(ctx, { gain: ampiezza });
  const l = creaLimiter(ctx);
  osc.connect(g).connect(l.ingresso);
  l.uscita.connect(ctx.destination);
  osc.start();
  const d = (await ctx.startRendering()).getChannelData(0).slice(sr);
  const picco = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  return { ampiezza, picco, guadagnoDb: 20 * Math.log10(picco / ampiezza) };
}

// La micro-dissolvenza dell'entrata di un livello (guardiano): il guadagno `param` scende a zero 1,5 ms prima del primo suono (al tempo `t`)
// e risale in 4,5 ms, così nessun attacco parte a metà onda. Un attacco vero (una cassa) si sente intatto.
export function microEntrata(param, t) {
  param.setValueAtTime(0, t - 0.0015);
  param.linearRampToValueAtTime(1, t + 0.003);
}

// Fuori linea: un segnale costante che comincia a t = 0,5 s passa dalla micro-dissolvenza; si leggono i campioni intorno all'attacco.
export async function misuraMicroEntrata() {
  const sr = 48000;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const sorgente = new ConstantSourceNode(ctx, { offset: 1 });
  const g = new GainNode(ctx, { gain: 1 });
  sorgente.connect(g).connect(ctx.destination);
  microEntrata(g.gain, 0.5);
  sorgente.start(0.5);
  const d = (await ctx.startRendering()).getChannelData(0);
  const a = Math.round(0.5 * sr);
  return {
    primo: d[a], // il primo campione dell'attacco: quasi zero
    aMetà: d[a + Math.round(0.0015 * sr)],
    dopo: d[a + Math.round(0.006 * sr)], // a regime: 1
    salto: Math.max(...Array.from({ length: Math.round(0.006 * sr) }, (_, i) => Math.abs(d[a + i + 1] - d[a + i]))), // il più grande scalino fra due campioni
  };
}
