// Editor Strudel (codemirror), solo per scrivere: il codice lo suonano i motori.
// Le sezioni si vedono anche qui: etichetta col nome a inizio blocco e fascia sul margine sinistro.
import { codemirrorSettings, initEditor } from '@strudel/codemirror';
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import { eSezione, leggiRigaSezione } from './brano.js';

const ridisegna = StateEffect.define();

// Le note che suonano in cuffia, in bianco: intervalli [da, a) del documento.
const segnaNote = StateEffect.define();
const noteInCuffia = StateField.define({
  create: () => Decoration.none,
  update(note, tr) {
    note = note.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(segnaNote)) continue;
      note = Decoration.set(
        e.value.map(([a, b]) => Decoration.mark({ class: 'cm-nota-cuffia' }).range(a, b)),
        true,
      );
    }
    return note;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const TESTA_BRANO = /^\/\/ @(brano|bpm|data|suoni)\b/;

// statoSezione(nome) → 'live' | 'cuffia' | '' per il colore della fascia.
function fasceSezioni(statoSezione) {
  const costruisci = (view) => {
    const doc = view.state.doc;
    const b = new RangeSetBuilder();
    let classe = null; // null = preambolo o testa: niente fascia
    let inTesta = true;
    for (let n = 1; n <= doc.lines; n++) {
      const riga = doc.line(n);
      if (inTesta && TESTA_BRANO.test(riga.text)) {
        b.add(riga.from, riga.from, Decoration.line({ class: 'cm-testa-brano' }));
        continue;
      }
      inTesta = false;
      if (eSezione(riga.text)) {
        const { nome } = leggiRigaSezione(riga.text);
        const stato = statoSezione(nome);
        classe = `cm-sez${stato ? ` cm-sez-${stato}` : ''}`;
        b.add(riga.from, riga.from, Decoration.line({ class: `${classe} cm-sez-testa` }));
        const i = riga.text.indexOf(nome, riga.text.indexOf('@sezione') + 8);
        if (nome && i >= 0) b.add(riga.from + i, riga.from + i + nome.length, Decoration.mark({ class: 'cm-sez-nome' }));
      } else if (classe) {
        b.add(riga.from, riga.from, Decoration.line({ class: classe }));
      }
    }
    return b.finish();
  };
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = costruisci(view);
      }
      update(u) {
        if (u.docChanged || u.transactions.some((t) => t.effects.some((e) => e.is(ridisegna)))) {
          this.decorations = costruisci(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function creaEditor({ root, codice, suValuta, suFerma, suCambio, suFuoco, statoSezione = () => '' }) {
  // Le righe lunghe vanno a capo: niente scorrimento orizzontale.
  codemirrorSettings.set({ ...codemirrorSettings.get(), theme: 'blackscreen', isLineWrappingEnabled: true });
  const vista = initEditor({
    root,
    initialCode: codice,
    onChange: (u) => u.docChanged && suCambio?.(),
    onEvaluate: () => (suValuta?.(), true),
    onStop: () => (suFerma?.(), true),
  });
  vista.dispatch({ effects: StateEffect.appendConfig.of([fasceSezioni(statoSezione), noteInCuffia]) });
  let noteSegnate = '';
  vista.contentDOM.addEventListener('focus', () => suFuoco?.());
  return {
    vista,
    get codice() {
      return vista.state.doc.toString();
    },
    set codice(testo) {
      vista.dispatch({ changes: { from: 0, to: vista.state.doc.length, insert: testo } });
    },
    // Le righe scelte (contate da 0): la selezione, o la riga del cursore.
    righeScelte() {
      const { from, to, empty } = vista.state.selection.main;
      const doc = vista.state.doc;
      const da = doc.lineAt(from).number - 1;
      // una selezione che finisce a inizio riga non prende quella riga
      const fine = doc.lineAt(to);
      const a = !empty && to === fine.from && fine.number - 1 > da ? fine.number - 2 : fine.number - 1;
      return { da, a, vuota: empty };
    },
    vaiAllaRiga(n) {
      const riga = vista.state.doc.line(Math.min(n + 1, vista.state.doc.lines));
      vista.dispatch({ selection: { anchor: riga.to }, scrollIntoView: true });
      vista.focus();
    },
    ridisegnaSezioni() {
      vista.dispatch({ effects: ridisegna.of(null) });
    },
    // Evidenzia le note che suonano in cuffia (vuoto = nessuna).
    evidenzia(intervalli) {
      const lungo = vista.state.doc.length;
      const validi = intervalli.filter(([a, b]) => a >= 0 && a < b && b <= lungo);
      const chiave = validi.map((x) => x.join('-')).join(',');
      if (chiave === noteSegnate) return;
      noteSegnate = chiave;
      vista.dispatch({ effects: segnaNote.of(validi) });
    },
    focus: () => vista.focus(),
    // dove sta il cursore della pagina, anche se la finestra non è quella attiva
    haFuoco: () => vista.dom.contains(document.activeElement),
    distruggi: () => vista.destroy(),
  };
}
