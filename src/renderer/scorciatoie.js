// Le scorciatoie: azioni con un tasto predefinito e uno personale (preferenze.scorciatoie).
// Un tasto è una stringa "Ctrl+Alt+Shift+Meta+Codice", col codice fisico del tasto (KeyK, Digit1, Period…),
// così non cambia con la tastiera. Modulo puro: niente DOM, lo provano i test.

// cifre: il tasto vale per 1–9 (il muto del livello n). Nella stringa la cifra è "#".
export const AZIONI = [
  { id: 'provaCuffia', nome: 'prova in cuffia', predefinita: 'Meta+Enter' },
  { id: 'goLive', nome: 'go live', predefinita: 'Shift+Meta+Enter' },
  { id: 'togli', nome: 'togli livello a fine ciclo', predefinita: 'Shift+Meta+Backspace' },
  { id: 'entra1', nome: 'entra tra 1 ciclo', predefinita: 'Digit1' },
  { id: 'entra2', nome: 'entra tra 2 cicli', predefinita: 'Digit2' },
  { id: 'entra4', nome: 'entra tra 4 cicli', predefinita: 'Digit4' },
  { id: 'entra8', nome: 'entra tra 8 cicli', predefinita: 'Digit8' },
  { id: 'muto', nome: 'muto livello (1–9)', predefinita: 'Alt+Digit#', cifre: true },
  { id: 'fermaTutto', nome: 'ferma tutto', predefinita: 'Meta+Period' },
  { id: 'cuffiaOnOff', nome: 'cuffia on / off', predefinita: 'Meta+KeyK' },
  { id: 'passaCueLive', nome: 'passa da CUE a LIVE', predefinita: 'Tab', soloFuori: true },
  { id: 'help', nome: 'help on / off', predefinita: 'Meta+KeyI' },
  { id: 'esci', nome: 'esci dall\'editor', predefinita: 'Escape' },
  { id: 'impostazioni', nome: 'impostazioni', predefinita: 'Meta+Comma' },
  { id: 'salva', nome: 'salva il brano', predefinita: 'Meta+KeyS' },
  { id: 'salvaLive', nome: 'salva il live come brano', predefinita: 'Shift+Meta+KeyS' },
  { id: 'aggiungiSezione', nome: '+ sezione dalle righe selezionate', predefinita: 'Meta+KeyE' },
  { id: 'fraseDaCapo', nome: 'frase da capo al prossimo ciclo', predefinita: 'Meta+Digit0' },
  { id: 'paracadute', nome: 'paracadute (due volte di fila)', predefinita: 'Meta+KeyP' },
  { id: 'uscitaIntera', nome: 'uscita a schermo intero', predefinita: 'Ctrl+Meta+KeyF' },
  { id: 'sfondo', nome: 'sfondo del proiettore (niente, note, oscilloscopio)', predefinita: 'Ctrl+Meta+KeyB' },
];

// Quelle di macOS e dell'editor che non si toccano.
const RISERVATE = new Set(['Meta+KeyQ', 'Meta+KeyW', 'Meta+KeyC', 'Meta+KeyV', 'Meta+KeyX', 'Meta+KeyZ', 'Shift+Meta+KeyZ', 'Meta+KeyA', 'Meta+KeyH', 'Meta+KeyM', 'Meta+Tab']);

const SOLO_MODIFICATORI = /^(Control|Alt|Shift|Meta)(Left|Right)$/;
const ORDINE = ['Ctrl', 'Alt', 'Shift', 'Meta'];

// La combinazione premuta, o null se è solo un modificatore.
export function comboDa(e) {
  if (!e.code || SOLO_MODIFICATORI.test(e.code)) return null;
  const mod = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean);
  return [...mod, e.code].join('+');
}

// Per le azioni a cifre la cifra premuta diventa "#".
export function comboCifra(combo) {
  return combo?.replace(/Digit[1-9]$/, 'Digit#') ?? combo;
}

// Il tasto premuto fa quest'azione? Per quelle a cifre ritorna la cifra (1–9), altrimenti true.
export function corrisponde(e, azione, combo) {
  const premuta = comboDa(e);
  if (!premuta || !combo) return false;
  if (azione.cifre) {
    const m = /Digit([1-9])$/.exec(premuta);
    return m && comboCifra(premuta) === combo ? Number(m[1]) : false;
  }
  return premuta === combo;
}

export const effettive = (personali = {}) => Object.fromEntries(AZIONI.map((a) => [a.id, personali[a.id] ?? a.predefinita]));

// Un tasto che scrive un carattere (senza ⌘ né ⌃) non può valere dentro un editor.
// Escape, Tab e i tasti funzione non scrivono.
export function scriveTesto(combo) {
  if (!combo) return false;
  const parti = combo.split('+');
  const tasto = parti.at(-1);
  if (parti.includes('Meta') || parti.includes('Ctrl')) return false;
  return !/^(Escape|Tab|F\d+)$/.test(tasto);
}

export const eRiservata = (combo) => RISERVATE.has(combo);

// L'id dell'azione che usa già quella combinazione (diversa da `id`), o null.
export function conflitto(mappa, id, combo) {
  for (const a of AZIONI) {
    if (a.id === id) continue;
    const altra = mappa[a.id];
    // la cifra del muto copre tutte le cifre: va in conflitto con ogni tasto numerico con gli stessi modificatori
    if (altra === combo) return a.id;
    if (a.cifre && comboCifra(combo) === altra) return a.id;
    if (AZIONI.find((x) => x.id === id)?.cifre && comboCifra(altra) === combo) return a.id;
  }
  return null;
}

const NOMI_TASTO = {
  Enter: '↵',
  Backspace: '⌫',
  Escape: 'esc',
  Tab: 'tab',
  Space: 'spazio',
  Period: '.',
  Comma: ',',
  Slash: '/',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};
const NOMI_MOD = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };

function tasto(codice) {
  if (codice in NOMI_TASTO) return NOMI_TASTO[codice];
  if (codice === 'Digit#') return '1–9';
  return codice.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'n');
}

// I tasti da disegnare come keycap: ["⌘", "↵"].
export function caps(combo) {
  if (!combo) return [];
  const parti = combo.split('+');
  return [...ORDINE.filter((m) => parti.includes(m)).map((m) => NOMI_MOD[m]), tasto(parti.at(-1))];
}

export const etichetta = (combo) => caps(combo).join('');
