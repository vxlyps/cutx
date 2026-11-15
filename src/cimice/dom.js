// Legge dalla pagina le parole del codice (e quali stanno suonando) SENZA toccare niente: solo misure.
// Coordinate della finestra (il canvas della cimice è fixed su tutta la finestra).

const MASSIMO_PAROLE = 1500;
const PAROLA = /[\p{L}\p{N}_#$]+/gu;

// radici: elementi con il testo del codice (contenuto di un editor CodeMirror, riquadro di una card live).
// note: selettore degli elementi che il programma ha già segnato come "suona adesso".
export function creaLettore({ radici, note }) {
  const elenco = () => [...document.querySelectorAll(radici)].filter((r) => r.getClientRects().length > 0);

  function parole() {
    const fuori = [];
    const lar = window.innerWidth;
    const alt = window.innerHeight;
    const range = document.createRange();
    for (const radice of elenco()) {
      const font = getComputedStyle(radice).font;
      const camminatore = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT);
      for (let nodo = camminatore.nextNode(); nodo; nodo = camminatore.nextNode()) {
        const testo = nodo.nodeValue;
        if (!testo || !testo.trim()) continue;
        PAROLA.lastIndex = 0;
        let m;
        while ((m = PAROLA.exec(testo))) {
          range.setStart(nodo, m.index);
          range.setEnd(nodo, m.index + m[0].length);
          const r = range.getClientRects()[0];
          if (!r || r.width < 1 || r.right < 0 || r.left > lar || r.bottom < 0 || r.top > alt) continue;
          fuori.push({ x: r.left, y: r.top, w: r.width, h: r.height, testo: m[0], font, salta: false });
          if (fuori.length >= MASSIMO_PAROLE) return fuori;
        }
      }
    }
    return fuori;
  }

  // I rettangoli delle note che suonano adesso, come li ha già evidenziati il programma.
  function rettangoliNote() {
    const out = [];
    for (const el of document.querySelectorAll(note)) for (const r of el.getClientRects()) if (r.width > 0) out.push(r);
    return out;
  }

  // Una "impronta" di dove sta il codice: cambia se scorre, cambia testo, cambia schermata o la finestra si ridimensiona.
  function impronta() {
    let s = `${window.innerWidth}x${window.innerHeight}`;
    for (const r of elenco()) {
      const b = r.getBoundingClientRect();
      s += `|${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)},${Math.round(b.height)},${r.textContent.length}`;
    }
    return s;
  }

  return { parole, rettangoliNote, impronta };
}
