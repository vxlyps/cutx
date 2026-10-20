// Editor Strudel (codemirror), solo per scrivere: il codice lo suonano i motori.
import { codemirrorSettings, initEditor } from '@strudel/codemirror';

export function creaEditor({ root, codice, suValuta, suFerma }) {
  // Le righe lunghe vanno a capo: niente scorrimento orizzontale.
  codemirrorSettings.set({ ...codemirrorSettings.get(), theme: 'blackscreen', isLineWrappingEnabled: true });
  const vista = initEditor({ root, initialCode: codice, onChange: () => {}, onEvaluate: () => (suValuta(), true), onStop: () => (suFerma(), true) });
  return {
    get codice() {
      return vista.state.doc.toString();
    },
    set codice(testo) {
      vista.dispatch({ changes: { from: 0, to: vista.state.doc.length, insert: testo } });
    },
  };
}
