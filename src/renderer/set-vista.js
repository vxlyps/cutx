// La scheda SET del browser a sinistra: la serata (i brani in ordine, ● quello che suona, ▸ il prossimo) e sotto il KIT (le clip sempre
// disponibili, da kit.cutx). Il calcolo è in set.js (puro); qui lo stato, il disco e il DOM.
import * as S from './set.js';
import * as B from './brano.js';
import { creaEditor } from './editor.js';

const crea = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};

function tasto(etichetta, titolo, fa, classe = '') {
  const b = crea('button', `key piccolo ${classe}`.trim(), etichetta);
  b.title = titolo;
  b.onclick = (e) => {
    e.stopPropagation();
    fa();
  };
  return b;
}

export class Serata {
  // azioni: { libreria(), branoAttivo() → file | null, branoProssimo() → file | null, scegli(file) (lo apre in «▸ prossimo», o mostra «● attivo»),
  //           provaKit(pezzo), liveKit(pezzo), fermaTutto(), avviso(testo), ridisegna() }
  constructor(azioni) {
    this.azioni = azioni;
    this.set = null; // set.js: { righe, nome } | null (non c'è set.cutx)
    this.kit = null; // { modello (brano.js), testo } | null (non c'è kit.cutx)
    this.aperte = new Set(); // clip del kit con l'editor aperto
    this.editors = [];
    this.live = new Set(); // indici delle clip del kit che suonano
    this.timerKit = null;
  }

  // Rilegge set.cutx e kit.cutx dallo stash (anche dopo una modifica a mano).
  async carica() {
    const [testoSet, testoKit] = await Promise.all([window.cutx.leggiSet().catch(() => null), window.cutx.leggiKit().catch(() => null)]);
    this.set = testoSet === null ? null : S.leggiSet(testoSet);
    this.kit = testoKit === null ? null : { modello: B.leggi(testoKit), testo: testoKit };
  }

  // Il brano da cui si parte (quello che apre), o null.
  primo() {
    return this.set ? S.primo(this.set) : null;
  }

  dopo(file) {
    return this.set ? S.dopo(this.set, file) : null;
  }

  vicino(file, verso) {
    return this.set ? S.vicino(this.set, file, verso) : null;
  }

  async salvaSet(nuovo) {
    this.set = nuovo;
    try {
      await window.cutx.scriviSet(S.scriviSet(nuovo));
    } catch (e) {
      this.azioni.avviso(`non riesco a salvare set.cutx: ${e.message}`);
    }
    this.azioni.ridisegna();
  }

  // --- il kit: una clip del kit come «pezzo» da mandare (cuffia o go live), uguale a quelle del CUE ---

  pezzoKit(i) {
    const m = this.kit.modello;
    return { nome: m.sezioni[i].nome, provenienza: `kit §${i + 1}`, volume: m.sezioni[i].info?.volume, ...B.codice(m, i), bpmBrano: B.bpmDelBrano(m), dove: null };
  }

  salvaKitSoon() {
    clearTimeout(this.timerKit);
    this.timerKit = setTimeout(() => {
      const testo = B.scrivi(this.kit.modello);
      this.kit.testo = testo;
      window.cutx.scriviKit(testo).catch((e) => this.azioni.avviso(`non riesco a salvare kit.cutx: ${e.message}`));
    }, 600);
  }

  // Le clip del kit che suonano adesso (dai livelli live): si segnano senza ridisegnare (un editor aperto non deve perdere il fuoco).
  segnaLive(livelli) {
    const vivi = new Set();
    for (const l of livelli ?? []) {
      const m = /^kit §(\d+)$/.exec(l.provenienza ?? '');
      if (m && l.a === null) vivi.add(Number(m[1]) - 1);
    }
    if ([...vivi].sort().join() === [...this.live].sort().join()) return;
    this.live = vivi;
    for (const r of document.querySelectorAll('#elenco .kit-riga')) r.classList.toggle('live', this.live.has(Number(r.dataset.i)));
  }

  // --- disegno ---

  disegna(contenitore, filtro = '') {
    for (const e of this.editors) e.distruggi();
    this.editors = [];
    const libreria = this.azioni.libreria();
    const nomeDi = (file) => libreria.find((b) => b.file === file)?.nome ?? file.replace(/\.cutx$/, '');
    const attivo = this.azioni.branoAttivo();
    const prossimo = this.azioni.branoProssimo();

    contenitore.append(crea('div', 'lbl gruppo', this.set?.nome ? `set · ${this.set.nome}` : 'set'));
    const brani = this.set ? S.brani(this.set) : [];
    if (!brani.length) {
      contenitore.append(crea('p', 'secondario', this.set ? 'il set è vuoto: aggiungi i brani della serata' : 'nessun set.cutx nello stash: aggiungi i brani della serata e lo creo'));
    }
    brani.forEach((b, i) => {
      if (filtro && !`${nomeDi(b.file)} ${b.file}`.toLowerCase().includes(filtro)) return;
      const manca = !libreria.some((x) => x.file === b.file);
      const riga = crea('div', `voce cliccabile set-riga${b.file === attivo ? ' attivo' : ''}${b.file === prossimo ? ' prossimo' : ''}${manca ? ' manca' : ''}`);
      riga.dataset.file = b.file;
      riga.title = manca ? `${b.file}: non c'è nella libreria` : `${b.file} · clic: lo apro come prossimo brano`;
      riga.append(crea('span', 'segno', b.file === attivo ? '●' : b.file === prossimo ? '▸' : ''), crea('span', 'nome', nomeDi(b.file)));
      if (manca) riga.append(crea('span', 'lbl manca-testo', 'manca'));
      if (b.apre) riga.append(crea('span', 'lbl etichetta-set', 'apre'));
      if (b.chiude) riga.append(crea('span', 'lbl etichetta-set', 'chiude'));
      const strumenti = crea('span', 'strumenti-set');
      strumenti.append(
        tasto('apre', 'Segna come il brano che apre la serata', () => this.salvaSet(S.segna(this.set, i, 'apre'))),
        tasto('chiude', 'Segna come il brano che chiude la serata', () => this.salvaSet(S.segna(this.set, i, 'chiude'))),
        tasto('↑', 'Sposta su', () => this.salvaSet(S.sposta(this.set, i, i - 1))),
        tasto('↓', 'Sposta giù', () => this.salvaSet(S.sposta(this.set, i, i + 1))),
        tasto('×', 'Togli dal set (il brano resta in libreria)', () => this.salvaSet(S.togli(this.set, i))),
      );
      riga.append(strumenti);
      riga.onclick = () => !manca && this.azioni.scegli(b.file);
      contenitore.append(riga);
    });

    // aggiungere un brano della libreria
    const fuori = libreria.filter((b) => !brani.some((x) => x.file === b.file));
    if (fuori.length) {
      const scelta = crea('select', 'aggiungi-al-set');
      scelta.append(new Option('+ aggiungi un brano al set…', ''));
      for (const b of fuori) scelta.append(new Option(b.nome, b.file));
      scelta.onchange = () => scelta.value && this.salvaSet(S.aggiungi(this.set ?? S.setVuoto(), scelta.value));
      contenitore.append(scelta);
    }

    this.disegnaKit(contenitore, filtro);
  }

  disegnaKit(contenitore, filtro) {
    contenitore.append(crea('div', 'lbl gruppo', 'kit · clip sempre disponibili'));
    if (!this.kit) {
      contenitore.append(crea('p', 'secondario', 'nessun kit.cutx nello stash: scrivilo come un brano, con solo righe // @clip'));
      return;
    }
    const m = this.kit.modello;
    if (!m.sezioni.length) contenitore.append(crea('p', 'secondario', 'kit.cutx non ha ancora clip (// @clip nome)'));
    m.sezioni.forEach((s, i) => {
      if (filtro && !s.nome.toLowerCase().includes(filtro)) return;
      const aperta = this.aperte.has(i);
      const blocco = crea('div', `kit-blocco${aperta ? ' aperto' : ''}`);
      const riga = crea('div', `voce cliccabile kit-riga${this.live.has(i) ? ' live' : ''}`);
      riga.dataset.i = String(i);
      riga.append(crea('span', 'segno', '●'), crea('span', 'nome', s.nome));
      riga.append(
        tasto('▶', 'Ascolta questa clip in cuffia', () => this.azioni.provaKit(this.pezzoKit(i))),
        tasto('live', 'Manda questa clip live (a fine ciclo, come ogni go live)', () => this.azioni.liveKit(this.pezzoKit(i)), 'acid'),
      );
      riga.onclick = () => {
        if (this.aperte.has(i)) this.aperte.delete(i);
        else this.aperte.add(i);
        this.azioni.ridisegna();
      };
      blocco.append(riga);
      if (aperta) {
        const corpo = crea('div', 'editor editor-carta kit-codice');
        blocco.append(corpo);
        const editor = creaEditor({
          root: corpo,
          codice: s.corpo.join('\n'),
          suValuta: () => this.azioni.provaKit(this.pezzoKit(i)),
          suFerma: () => this.azioni.fermaTutto(),
          suCambio: () => {
            this.kit.modello = B.conCorpo(this.kit.modello, i, editor.codice.split('\n'));
            this.salvaKitSoon();
          },
        });
        this.editors.push(editor);
      }
      contenitore.append(blocco);
    });
  }
}
