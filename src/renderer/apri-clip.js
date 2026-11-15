// Le card (CUE e LIVE) mostrano il pulsante «synth» / «drum» sulle clip che si riaprono; quali, lo dice `apri-tipo.js`.
import it from './testi/it.json';
import { tipoApribile } from './apri-tipo.js';

export { tipoApribile };
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
