// Nei motori (live e cuffia): i suoni di strudel.cc letti dalla cartella locale, senza rete.
// Mappe e indirizzi li prepara il processo principale (suoni-strudel.js): qui si registrano in Strudel.
import { Pattern, noteToMidi, valueToMidi } from '@strudel/core';
import { aliasBank, registerZZFXSounds, samples } from '@strudel/webaudio';

// .piano() come sul sito di Strudel (website/src/repl/piano.mjs): sample del piano, rilascio breve, pan secondo l'altezza.
const maxPan = noteToMidi('C8');
const panwidth = (pan, width) => pan * width + (1 - width) / 2;
if (!Pattern.prototype.piano) {
  Pattern.prototype.piano = function () {
    return this.clip(1)
      .s('piano')
      .release(0.1)
      .fmap((value) => {
        const midi = valueToMidi(value);
        const pan = panwidth(Math.min(Math.round(midi) / maxPan, 1), 0.5);
        return { ...value, pan: (value.pan || 1) * pan };
      });
  };
}

let firmaCaricata = null;

// Carica (o ricarica, se la cartella o il suo stato sono cambiati). Non lancia: ritorna una riga di errore o null.
export async function caricaSuoniStrudel() {
  try {
    const { firma, mappe, alias } = await window.cutx.suoniMappe();
    if (firma === firmaCaricata) return null;
    if (!firmaCaricata) registerZZFXSounds();
    await Promise.all(mappe.map((m) => samples(m)));
    if (alias) await aliasBank(alias);
    firmaCaricata = firma;
    return null;
  } catch (e) {
    return `suoni di Strudel: ${e.message ?? e}`;
  }
}
