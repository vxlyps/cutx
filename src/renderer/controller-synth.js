// L'X-Touch Mini dentro il SYNTH: cosa comanda ogni manopola e ogni tasto quando la vista è il SYNTH. Parte pura (i test la provano):
// le pagine di parametri per gruppo, il passo di una manopola, l'anello. Il Controller (controller.js) la usa, il synth (synth-vista.js)
// applica i valori. Il volume generale (manopola 8), il fader e il paracadute (tasto 8) restano sempre del LIVE.
import { aPosizione, attivo, daPosizione, limiti } from './synth-modello.js';

// I tasti in alto 1–5 scelgono il gruppo (il 6 e il 7 sono liberi: mod, arpeggio…). Premere di nuovo lo stesso gruppo passa alla sua pagina 2.
export const GRUPPI_TASTI = ['osc', 'filtro', 'amp', 'drive', 'space'];

// Le manopole 1–7 per pagina. Ogni parametro ha un posto fisso (la mano impara dove sono): un parametro che in quel momento non conta
// resta al suo posto con l'anello spento. I più importanti vanno sulle prime manopole.
export const PAGINE_SYNTH = {
  osc: [['forma', 'ottava', 'voci', 'detune', 'spread', 'fm', 'fmh'], ['pw', 'sub', 'pan']],
  filtro: [['cutoff', 'q', 'fenv', 'tipo', 'ftype', 'vowel'], ['fattacco', 'fdecay', 'fsustain', 'frelease']],
  amp: [['attack', 'decay', 'sustain', 'release', 'gain', 'penv', 'pdecay']],
  drive: [['shape', 'distort', 'crush', 'coarse']],
  space: [['delay', 'delaysync', 'delayfeedback', 'room', 'roomsize', 'phaser', 'phaserdepth'], ['tremolo', 'tremolodepth']],
};

// I tasti in basso (nome Mackie → comando del synth). Nel LIVE sono i colpi: qui sono del synth.
export const COMANDI_BASSO = ['cue', 'mutate', 'annulla', 'ripeti', 'ab', 'stop', 'play', 'rec']; // DROP REPLACE REWIND FORWARD CYCLE STOP PLAY REC

export const PASSO_SYNTH = 1 / 64; // un giro di manopola sposta di 1/64 della corsa (come nel LIVE); premuta, di un decimo
export const FINE_SYNTH = 0.1;

// Anello a metà (parte dal centro) per i parametri con il segno.
const BIPOLARI = new Set(['penv', 'ottava', 'pan']);

// Il gruppo e la pagina dopo il tasto n (1–5): lo stesso gruppo gira le sue pagine, un altro gruppo parte dalla prima.
export function dopoTasto(gruppo, pagina, n) {
  const nuovo = GRUPPI_TASTI[n - 1];
  if (!nuovo) return { gruppo, pagina };
  if (nuovo !== gruppo) return { gruppo: nuovo, pagina: 0 };
  return { gruppo, pagina: (pagina + 1) % PAGINE_SYNTH[gruppo].length };
}

// Quante pagine ha il gruppo.
export const paginePerGruppo = (gruppo) => PAGINE_SYNTH[gruppo]?.length ?? 1;

// Il nuovo valore di un parametro dopo `passi` scatti di manopola (positivo = su). Numeri e interi si muovono sulla corsa (logaritmica dove lo è la
// manopola del pannello); una scelta cambia di un posto per giro (senza ricominciare); un interruttore va su o giù.
export function nuovoValore(p, s, passi, fine = false) {
  const v = s[p.k];
  const verso = Math.sign(passi);
  if (!verso) return v;
  if (p.tipo === 'bool') return verso > 0 ? 1 : 0;
  if (p.tipo === 'scelta') {
    const i = p.scelte.indexOf(v);
    return p.scelte[Math.max(0, Math.min(p.scelte.length - 1, (i < 0 ? 0 : i) + verso))];
  }
  const { min, max } = limiti(p, s);
  if (p.tipo === 'int') {
    const passo = fine ? 1 : Math.max(1, Math.round((Math.abs(passi) * (max - min)) / 64));
    return Math.max(min, Math.min(max, v + verso * passo));
  }
  const t = aPosizione(p, s, v) + passi * PASSO_SYNTH * (fine ? FINE_SYNTH : 1);
  return daPosizione(p, s, t);
}

// Dove sta l'anello (0..1) e come si disegna.
export function anelloDi(p, s) {
  const v = s[p.k];
  if (p.tipo === 'bool') return { valore: v ? 1 : 0, stile: 'punto' };
  if (p.tipo === 'scelta') return { valore: p.scelte.length > 1 ? Math.max(0, p.scelte.indexOf(v)) / (p.scelte.length - 1) : 0, stile: 'punto' };
  return { valore: aPosizione(p, s, v), stile: BIPOLARI.has(p.k) ? 'pan' : 'fan' };
}

// Le sette manopole del gruppo e della pagina: null = posto vuoto; altrimenti { k, p, conta (false = spento, l'anello si spegne), valore, stile, nome, testo }.
// nomi(k) dà il nome del parametro, testo(p, v) il valore come si legge; corto() lo accorcia per lo specchio.
export function manopoleSynth(s, gruppo, pagina, parametri, { nome = (k) => k, corto = (k) => String(nome(k)).replace(/\s+/g, '').slice(0, 8), testo = (p, v) => String(v) } = {}) {
  const lista = PAGINE_SYNTH[gruppo]?.[pagina] ?? [];
  return Array.from({ length: 7 }, (_, i) => {
    const k = lista[i];
    const p = k && parametri.find((x) => x.k === k);
    if (!p) return null;
    const conta = attivo(p, s);
    const { valore, stile } = anelloDi(p, s);
    return { k, p, conta, valore: conta ? valore : null, stile, nome: nome(k), corto: corto(k), testo: conta ? testo(p, s[k]) : '' };
  });
}
