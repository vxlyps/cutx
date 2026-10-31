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
