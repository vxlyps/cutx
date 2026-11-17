// Una clip di un brano o un livello live si riapre nel SYNTH o nella scheda DRUM.
// Con la sua riga (`// @synth`, `// @drum`) sempre. Senza riga (scritta a mano) solo se il pannello la riscrive uguale:
// altrimenti «aggiorna» cambierebbe il suono (es. s("bd*4") diventerebbe un triangle).
// Tipi: 'drum', 'synth' (con la riga), 'mano' (synth, scritta a mano, riscritta uguale), 'libera' (qualsiasi altro codice: si apre per
// lavorarci, ma il pannello lo riscriverebbe diverso, quindi niente «aggiorna», solo → CUE come clip nuova), null (vuota).
// Modulo puro, senza testi: si prova con i test (test/apri-tipo.test.js).
import { clip as clipSynth, haRigaSynth, leggiCodice as leggiSynth } from './synth-codice.js';
import { haMarca, leggiCodice as leggiDrum } from './drum-codice.js';

// i commenti contano: se il pannello li perde, la clip non è «uguale»
const senzaSpazi = (t) => t.replace(/^\s*\/\/ @synth[^\n]*\n?/m, '').replace(/\s+/g, '');

export function tipoApribile(codice) {
  if (typeof codice !== 'string' || !codice.trim()) return null;
  if (haMarca(codice)) return 'drum';
  if (haRigaSynth(codice)) return 'synth';
  const drum = leggiDrum(codice);
  if (!drum.errore && drum.stato.righe.some((r) => r.tipo !== 'testo')) return 'drum'; // una griglia senza riga: almeno una riga si legge
  const letto = leggiSynth(codice);
  if (letto.errore) return 'libera';
  return senzaSpazi(clipSynth({ ...letto.stato, anteprima: 'clip' })) === senzaSpazi(codice) ? 'mano' : 'libera';
}
