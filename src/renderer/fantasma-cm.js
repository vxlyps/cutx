// L'apertura fantasma dentro un editor CodeMirror: il testo grigio dopo il cursore, Tab (una parola) e Tab tenuto (la riga).
import { EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { allinea, parolaSuccessiva, resto, rigaSuccessiva } from './fantasma.js';

export const impostaFantasma = StateEffect.define(); // { testo, acceso }

const campo = StateField.define({
  create: () => ({ testo: '', acceso: false }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(impostaFantasma)) return e.value;
    return v;
  },
});

class Grigio extends WidgetType {
  constructor(testo) {
    super();
    this.testo = testo;
  }

  eq(altro) {
    return altro.testo === this.testo;
  }

  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-fantasma';
    s.textContent = this.testo;
    return s;
  }

  ignoreEvent() {
    return true;
  }
}

const rimasto = (state) => {
  const { testo, acceso } = state.field(campo);
  if (!acceso || !testo) return '';
  return resto(state.doc.sliceString(0, state.selection.main.head), testo);
};

const disegno = EditorView.decorations.compute([campo, 'doc', 'selection'], (state) => {
  const r = rimasto(state);
  if (!r) return Decoration.none;
  return Decoration.set([Decoration.widget({ widget: new Grigio(r), side: 1 }).range(state.selection.main.head)]);
});

function inserisci(view, testo) {
  if (!testo) return false;
  const p = view.state.selection.main.head;
  view.dispatch({ changes: { from: p, insert: testo }, selection: { anchor: p + testo.length }, scrollIntoView: true, userEvent: 'input.complete' });
  return true;
}

let tenutoFatto = false; // il Tab tenuto ha già completato la riga (le ripetizioni successive non fanno niente)

const tasti = EditorView.domEventHandlers({
  keydown(e, view) {
    if (e.key !== 'Tab' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false;
    const r = rimasto(view.state);
    if (!r) return false;
    e.preventDefault();
    if (!e.repeat) {
      tenutoFatto = false;
      return inserisci(view, parolaSuccessiva(r));
    }
    if (!tenutoFatto) {
      tenutoFatto = true;
      inserisci(view, rigaSuccessiva(r));
    }
    return true;
  },
  keyup(e) {
    if (e.key === 'Tab') tenutoFatto = false;
    return false;
  },
});

// Senza le parentesi che si chiudono da sole: dentro l'apertura quello che scrivo deve combaciare, carattere per carattere, col fantasma.
const senzaChiusura = Prec.highest(EditorState.languageData.of(() => [{ closeBrackets: { brackets: [] } }]));

export const estensioneFantasma = [campo, disegno, Prec.highest(tasti), senzaChiusura];
