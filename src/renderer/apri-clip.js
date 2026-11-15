// Una clip di un brano o un livello live si riapre nel SYNTH (riga `// @synth`) o nella scheda DRUM (riga `// @drum`), altrimenti non si riapre.
// Modulo puro: lo usano le card (CUE e LIVE) per sapere se mostrare il pulsante e con che scritta.
import it from './testi/it.json';
import { haRigaSynth } from './synth-codice.js';
import { haMarca } from './drum-codice.js';

export const tipoApribile = (codice) => (haMarca(codice) ? 'drum' : haRigaSynth(codice) ? 'synth' : null);
export const scrittaApri = (tipo) => (tipo === 'drum' ? it.drum.apri : it.synth.msg.apri);
export const titoloApri = (tipo) => (tipo === 'drum' ? it.drum.apriTitolo : it.synth.msg.apriTitolo);

// Aggiorna il pulsante: nascosto se non si può riaprire, altrimenti con la scritta giusta.
export function mostraApri(bottone, codice) {
  const tipo = tipoApribile(codice);
  bottone.hidden = !tipo;
  if (tipo) {
    bottone.textContent = scrittaApri(tipo);
    bottone.title = titoloApri(tipo);
  }
}
