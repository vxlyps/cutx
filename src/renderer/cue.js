// Il CUE: dove preparo quello che va live, sentendolo in cuffia. Due modi, stessa sostanza:
// - libero: un editor solo; le righe // @sezione dividono il testo in sezioni;
// - brano: un file .cutx della libreria, con la mappa in alto e una card per sezione.
// Il codice che parte è sempre preambolo + sezione (o solo le righe selezionate).
import * as B from './brano.js';
import { creaEditor } from './editor.js';
import { chiediNome, conferma } from './dialogo.js';
import { analizza } from './analisi.js';

const $ = (id) => document.getElementById(id);
const oggi = () => {
  const d = new Date();
  const due = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
};

function el(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
}

function tasto(etichetta, scorciatoia, titolo) {
  const b = el('button', 'key piccolo');
  b.textContent = etichetta;
  if (scorciatoia) b.append(el('i', '', scorciatoia));
  if (titolo) b.title = titolo;
  return b;
}

export class Cue {
  // azioni: { provaInCuffia, goLive, fermaTutto, suoniStash(), haStash(), bpm(), libreriaCambiata(), mostraLibreria() }
  constructor(codiceIniziale, azioni) {
    this.azioni = azioni;
    this.modo = 'libero';
    this.stati = { live: [], cuffia: null }; // cosa suona: [{ nome, provenienza }]
    this.fileLibero = null; // il brano in cui è stato salvato il testo libero
    this.brano = null; // { file, modello, sporco }
    this.versione = 0; // cresce a ogni modifica del brano: una voce di ⌘Z vale solo se il brano non è cambiato dopo di lei
    this.registra = null; // (voce) => {}: la cronologia di ⌘Z (app.js)
    this.carte = []; // { i, editor, el } (i = -1 per il preambolo)
    this.cartaAttiva = null;
    this.mostraLive = false; // le sezioni già live, aperte o richiuse in una riga

    this.libero = creaEditor({
      root: $('editor'),
      codice: codiceIniziale,
      suValuta: azioni.provaInCuffia,
      suFerma: azioni.fermaTutto,
      suCambio: () => azioni.bozza?.(),
      statoSezione: (nome, tipo, k) => (tipo === 'scena' ? this.statoScena('scratch', k) : this.statoSezione('scratch', nome)),
    });
    $('modo-libero').onclick = () => this.cambiaModo('libero');
    $('modo-brano').onclick = () => this.cambiaModo('brano');
    $('aggiungi-sezione').onclick = () => this.aggiungiSezione();
    $('cue-porta').onclick = () => this.portaA && this.azioni.portaIlSet(this.portaA);
    this.mostraModo();
  }

  // --- cosa suona, per i colori ---

  aggiornaStati(stati) {
    const prima = JSON.stringify(this.stati);
    this.stati = stati;
    if (JSON.stringify(stati) === prima) return;
    this.libero.ridisegnaSezioni();
    if (this.brano) this.mostraBrano(false);
    this.mostraModo();
  }

  // Il tempo del brano che ho davanti (aperto in modalità brano, o scritto a sezioni nell'editor libero), o null.
  tempoBrano() {
    if (this.modo === 'brano') return this.brano ? B.bpmDelBrano(this.brano.modello) : null;
    const b = B.leggi(this.libero.codice);
    return b.sezioni.length ? B.bpmDelBrano(b) : null;
  }

  // Il brano è a un altro tempo e il live sta suonando: il set non cambia da solo. In cima al CUE, accanto al nome del brano,
  // "brano a X · set a Y" e il pulsante per portare il set a X; sulle sezioni audio, che non seguono il tempo, un avviso.
  aggiornaTempo({ set, occupato }) {
    const brano = this.tempoBrano();
    const diverso = brano !== null && set !== null && occupato && Math.abs(brano - set) > 0.05;
    const zona = $('cue-tempo');
    zona.hidden = !diverso;
    if (diverso) {
      const n = (x) => String(Math.round(x * 10) / 10);
      $('cue-tempo-testo').textContent = `brano a ${n(brano)} · set a ${n(set)}`;
      $('cue-porta').textContent = `porta il set a ${n(brano)}`;
      this.portaA = brano;
    }
    for (const c of this.carte) {
      if (!c.avvisoTempo) continue;
      const audio = diverso && c.i >= 0 && B.eSezioneAudio(c.editor.codice);
      c.avvisoTempo.hidden = !audio;
      if (audio) c.avvisoTempo.textContent = `audio: suona al suo tempo originale (${Math.round(brano * 10) / 10} bpm), il set è a ${Math.round(set * 10) / 10}`;
    }
  }

  // Lo stato di una scena del beat: live (il beat suona proprio quella scena), in arrivo (è il prossimo, a fine frase) o in cuffia.
  // Il livello del beat si chiama «beat» e la sua provenienza è «brano ◆n» (n = il numero della scena).
  statoScena(base, k) {
    const sp = this.beat;
    if (sp && sp.base === base) {
      if (sp.pendente === k) return 'in-arrivo'; // prima del live: nell'elenco dei livelli il cambio in attesa risulta già live
      if (sp.indice === k) return 'live';
    }
    const prov = `${base} ◆${k + 1}`;
    return this.stati.cuffia?.nome === 'beat' && this.stati.cuffia.provenienza === prov ? 'cuffia' : '';
  }

  // L'app dice com'è il beat live: { base: nome del brano, indice: la scena che suona, pendente: la scena armato (o null) }.
  aggiornaBeat(beat) {
    const prima = JSON.stringify(this.beat ?? null);
    this.beat = beat;
    if (JSON.stringify(beat ?? null) === prima) return;
    this.libero.ridisegnaSezioni();
    if (this.brano) this.mostraBrano(false);
  }

  statoSezione(provenienza, nome) {
    const di = (x) => x && x.nome === nome && (x.provenienza === provenienza || x.provenienza.startsWith(`${provenienza} §`));
    if (this.stati.live.some(di)) return 'live';
    if (di(this.stati.cuffia)) return 'cuffia';
    return '';
  }

  get nomeBrano() {
    return this.brano ? B.testa(this.brano.modello).brano || this.brano.file.replace(/\.cutx$/, '') : null;
  }

  // --- il pezzo da mandare in cuffia o live ---

  // { nome, provenienza, codice, inizio } oppure { errore }
  pezzo() {
    return this.modo === 'libero' ? this.pezzoLibero() : this.pezzoBrano();
  }

  pezzoLibero() {
    const testo = this.libero.codice;
    const { da, a, vuota } = this.libero.righeScelte();
    const b = B.leggi(testo);
    if (!b.sezioni.length && !B.haBeat(b)) {
      const righe = testo.split('\n');
      const codice = vuota ? testo : righe.slice(da, a + 1).join('\n');
      const base = vuota ? 0 : this.libero.vista.state.doc.line(da + 1).from;
      return { nome: 'scratch', provenienza: 'scratch', codice, inizio: 0, bpmBrano: null, dove: { editor: this.libero, base } };
    }
    const blocco = B.bloccoDellaRiga(testo, da);
    if (blocco.sezione === -2) {
      // una scena del beat: va live come «beat», al momento giusto
      const prima = vuota ? blocco.da : Math.max(da, blocco.da);
      const righe = vuota ? null : testo.split('\n').slice(prima, Math.min(a + 1, blocco.a));
      const base = prima < this.libero.vista.state.doc.lines ? this.libero.vista.state.doc.line(prima + 1).from : 0;
      return { ...this.pezzoScena(b, blocco.scena, 'scratch', righe), bpmBrano: B.bpmDelBrano(b), dove: { editor: this.libero, base } };
    }
    if (blocco.sezione === -3) return { errore: 'il cursore è sull\'intestazione del beat: mettilo in una scena' };
    if (blocco.sezione < 0) return { errore: 'il cursore è nel preambolo: mettilo in una clip' };
    const prima = vuota ? blocco.da : Math.max(da, blocco.da);
    const righe = vuota ? null : testo.split('\n').slice(prima, Math.min(a + 1, blocco.a));
    const base = prima < this.libero.vista.state.doc.lines ? this.libero.vista.state.doc.line(prima + 1).from : 0;
    return { nome: blocco.nome, provenienza: 'scratch', volume: blocco.info?.volume, ...B.codice(b, blocco.sezione, righe), bpmBrano: B.bpmDelBrano(b), dove: { editor: this.libero, base } };
  }

  // Una scena del beat come clip da mandare: si chiama «beat», porta con sé tutte le scene (per ◀ ▶) e quello da cui parte.
  pezzoScena(modello, k, base, righe = null) {
    const scene = modello.beat.scene;
    return {
      nome: 'beat',
      provenienza: `${base === 'scratch' ? 'scratch' : this.nomeBrano} ◆${k + 1}`,
      beat: {
        base: base === 'scratch' ? 'scratch' : this.nomeBrano,
        indice: k,
        scene: scene.map((m, j) => ({ nome: m.nome, codice: B.codiceScena(modello, j).codice, inizio: B.codiceScena(modello, j).inizio })),
      },
      scena: { nome: scene[k].nome, i: k, n: scene.length },
      ...B.codiceScena(modello, k, righe),
    };
  }

  pezzoBrano() {
    const carta = this.cartaAttiva;
    if (!this.brano || !carta) return { errore: 'scegli una clip: clic nella sua card' };
    if (carta.scena !== undefined) {
      const { da, a, vuota } = carta.editor.righeScelte();
      const righe = vuota ? null : this.brano.modello.beat.scene[carta.scena].corpo.slice(da, a + 1);
      return { ...this.pezzoScena(this.brano.modello, carta.scena, 'brano', righe), bpmBrano: B.bpmDelBrano(this.brano.modello), dove: { editor: carta.editor, base: vuota ? 0 : carta.editor.vista.state.doc.line(da + 1).from } };
    }
    if (carta.i < 0) return { errore: 'il preambolo suona con ogni clip: scegline una' };
    const m = this.brano.modello;
    const { da, a, vuota } = carta.editor.righeScelte();
    const righe = vuota ? null : m.sezioni[carta.i].corpo.slice(da, a + 1);
    return {
      nome: m.sezioni[carta.i].nome,
      provenienza: `${this.nomeBrano} §${carta.i + 1}`,
      volume: m.sezioni[carta.i].info?.volume,
      ...B.codice(m, carta.i, righe),
      bpmBrano: B.bpmDelBrano(m),
      dove: { editor: carta.editor, base: vuota ? 0 : carta.editor.vista.state.doc.line(da + 1).from },
    };
  }

  focus() {
    if (this.modo === 'libero') return this.libero.focus();
    (this.cartaAttiva ?? this.carte.find((c) => c.i >= 0))?.editor.focus();
  }

  // Il testo nel punto dove sta il cursore (o al posto della selezione), nell'editor in uso.
  inserisci(testo) {
    const editor = this.modo === 'libero' ? this.libero : this.cartaAttiva?.editor;
    if (!editor) return this.avviso('scegli una clip: clic nella sua card');
    const v = editor.vista;
    v.dispatch(v.state.replaceSelection(testo), { scrollIntoView: true });
    v.focus();
  }

  // --- modi ---

  cambiaModo(modo) {
    if (modo === 'brano' && !this.brano) {
      this.avviso('apri un brano dalla libreria');
      this.azioni.mostraLibreria();
      return;
    }
    this.modo = modo;
    this.mostraModo();
    if (modo === 'libero') this.libero.focus();
    else (this.cartaAttiva ?? this.carte.find((c) => c.i >= 0))?.editor.focus();
  }

  mostraModo() {
    const libero = this.modo === 'libero';
    $('vista-libero').hidden = !libero;
    $('vista-brano').hidden = libero;
    $('modo-libero').classList.toggle('on', libero);
    $('modo-brano').classList.toggle('on', !libero);
    const nome = this.nomeBrano;
    $('modo-brano').querySelector('i').textContent = nome ? `${nome}${this.brano.sporco ? ' •' : ''}` : '–';
    if (libero) {
      const p = this.pezzoLibero();
      const stato = p.errore ? '' : this.statoSezione('scratch', p.nome);
      $('card-libero').classList.toggle('in-cuffia', stato === 'cuffia');
      $('libero-stato').textContent = stato === 'cuffia' ? '◖◗ lo stai sentendo' : stato === 'live' ? '● è live' : '';
      $('libero-nome').textContent = this.fileLibero ? `scratch · ${this.fileLibero}` : 'scratch';
    }
  }

  // Un messaggio sotto la testa del CUE. persistente = resta finché non se ne mette un altro.
  avviso(testo, { persistente = false } = {}) {
    const a = $('cue-avviso');
    a.textContent = testo ?? '';
    clearTimeout(this.timerAvviso);
    if (testo && !persistente) this.timerAvviso = setTimeout(() => (a.textContent = ''), 4000);
  }

  // --- brano: mappa e card ---

  apriModello(file, testo) {
    const prima = this.brano;
    const modoPrima = this.modo;
    this.brano = { file, modello: B.leggi(testo), sporco: false };
    this.versione++;
    // aprire un altro brano chiude quello di prima, con le sue modifiche: ⌘Z lo riporta com'era
    if (prima) {
      const nuovo = this.brano;
      this.registra?.({
        etichetta: `brano «${prima.file ?? 'senza nome'}» chiuso`,
        annulla: () => {
          if (this.brano !== nuovo) return false;
          this.brano = prima;
          this.versione++;
          this.cartaAttiva = null;
          this.modo = modoPrima;
          this.mostraBrano(true);
          this.mostraModo();
          return `riapro ${prima.file ?? 'il brano'}`;
        },
        rifai: () => false,
      });
    }
    this.cartaAttiva = null;
    this.modo = 'brano';
    this.mostraBrano(true);
    this.mostraModo();
    this.controllaSuoni();
    this.carte.find((c) => c.i >= 0)?.editor.focus();
  }

  controllaSuoni() {
    const t = B.testa(this.brano.modello);
    const stash = this.azioni.suoniStash();
    const mancano = (t.suoni ?? []).filter((n) => !(n in stash));
    if (mancano.length) {
      this.avviso(`attenzione: nello stash mancano ${mancano.join(', ')} · le clip che li usano non suoneranno`, {
        persistente: true,
      });
    } else this.avviso('');
  }

  // etichetta: se c'è, l'azione si può annullare con ⌘Z (unisci, dividi, rinomina, sezione nuova…); le modifiche al testo no: sono dell'editor.
  modifica(modello, ridisegna = true, etichetta = null) {
    const prima = this.brano.modello;
    const sporcoPrima = this.brano.sporco;
    this.brano.modello = modello;
    this.brano.sporco = true;
    this.versione++;
    const versione = this.versione;
    if (etichetta) {
      const torna = (m, sporco, v) => () => {
        if (this.versione !== v) return false; // dopo è stato scritto altro: tornare indietro lo perderebbe
        this.brano.modello = m;
        this.brano.sporco = sporco;
        this.versione++;
        this.mostraBrano(true);
        this.mostraModo();
        return `${etichetta}: annullato`;
      };
      const vDopo = versione;
      this.registra?.({
        etichetta,
        annulla: torna(prima, sporcoPrima, vDopo),
        rifai: () => {
          if (this.brano.modello !== prima) return false;
          this.brano.modello = modello;
          this.brano.sporco = true;
          this.versione++;
          this.mostraBrano(true);
          this.mostraModo();
        },
      });
    }
    if (ridisegna) this.mostraBrano(true);
    this.mostraModo();
  }

  // Un livello tolto dal live torna nel CUE, pronto: in fondo al testo libero o al brano aperto. Non tocca il live.
  reinserisci({ nome, codice, volume, muto }) {
    const info = {};
    if (volume !== undefined && volume !== 1) info.volume = volume;
    if (muto) info.muto = true;
    if (this.modo === 'brano' && this.brano) {
      const m = this.brano.modello;
      const preambolo = m.preambolo.join('\n');
      const pulito = preambolo.trim() && codice.startsWith(preambolo) ? codice.slice(preambolo.length) : codice;
      this.brano.modello = B.conSezioneInFondo(m, nome, info, pulito.replace(/^\n+/, ''));
      this.brano.sporco = true;
      this.versione++;
      this.mostraBrano(true);
      this.mostraModo();
    } else {
      const testo = this.libero.codice.replace(/\s+$/, '');
      this.libero.codice = `${testo}${testo ? '\n\n' : ''}${B.rigaSezione(nome, info)}\n${codice.replace(/\s+$/, '')}\n`;
    }
    return `«${nome}» è tornato nel CUE: lo rimandi tu col go live`;
  }

  // ricrea = rifà anche le card (cambiata la struttura); altrimenti solo mappa e stati.
  mostraBrano(ricrea) {
    const m = this.brano.modello;
    const stati = m.sezioni.map((s) => this.statoSezione(this.nomeBrano, s.nome));
    this.mostraMappa(stati);
    if (ricrea) this.creaCarte();
    // le sezioni già live si richiudono in una riga in alto
    const live = m.sezioni.filter((_, i) => stati[i] === 'live');
    const riga = $('riga-live');
    riga.hidden = !live.length;
    riga.replaceChildren(
      el('span', 'punto-live', '●'),
      el('span', 'spazio', live.map((s) => s.nome).join(' · ')),
      el('span', '', this.mostraLive ? 'live · richiudi' : 'live · apri'),
    );
    // le scene del beat: mai richiusi, il live si vede dal colore
    for (const c of this.carte) {
      if (c.scena === undefined) continue;
      const stato = this.statoScena(this.nomeBrano, c.scena);
      c.el.classList.toggle('in-cuffia', stato === 'cuffia');
      c.cuffia?.classList.toggle('on', stato === 'cuffia');
      c.el.classList.toggle('e-live', stato === 'live');
      c.el.classList.toggle('in-arrivo', stato === 'in-arrivo');
      c.stato.textContent = stato === 'cuffia' ? '◖◗ in cuffia' : stato === 'live' ? '● il beat suona qui' : stato === 'in-arrivo' ? '→ entra a fine frase' : 'pronto';
    }
    for (const c of this.carte) {
      if (c.i < 0) continue;
      const stato = stati[c.i];
      c.el.hidden = stato === 'live' && !this.mostraLive;
      c.el.classList.toggle('in-cuffia', stato === 'cuffia');
      c.cuffia?.classList.toggle('on', stato === 'cuffia');
      c.el.classList.toggle('e-live', stato === 'live');
      c.stato.textContent = stato === 'cuffia' ? '◖◗ in cuffia' : stato === 'live' ? '● live' : 'pronta';
    }
  }

  mostraMappa(stati) {
    const m = this.brano.modello;
    const mappa = $('mappa');
    mappa.replaceChildren(
      ...m.sezioni.map((s, i) => {
        const b = el('button', `blocco-mappa ${stati[i] ?? ''}`);
        b.style.flex = String(Math.min(Math.max(s.corpo.filter((r) => r.trim()).length, 1), 8));
        b.textContent = `${i + 1} ${s.nome}${stati[i] === 'cuffia' ? ' ◖◗' : ''}`;
        b.dataset.aiuto = 'mappa-sezione';
        b.draggable = true;
        b.ondragstart = (e) => e.dataTransfer.setData('text/x-sezione', String(i));
        b.ondragover = (e) => {
          e.preventDefault();
          b.classList.add('sopra');
        };
        b.ondragleave = () => b.classList.remove('sopra');
        b.ondrop = (e) => {
          e.preventDefault();
          const da = Number(e.dataTransfer.getData('text/x-sezione'));
          if (Number.isInteger(da)) this.modifica(B.sposta(m, da, i));
        };
        b.onclick = () => {
          const c = this.carte.find((x) => x.i === i);
          if (c?.el.hidden) {
            this.mostraLive = true;
            this.mostraBrano(false);
          }
          c?.el.scrollIntoView({ block: 'nearest' });
          c?.editor.focus();
        };
        b.ondblclick = () => this.rinomina(i);
        return b;
      }),
    );
    if (!m.sezioni.length) mappa.append(el('span', 'lbl', 'nessuna clip: seleziona delle righe e premi + clip ⌘E'));
  }

  creaCarte() {
    for (const c of this.carte) c.editor.distruggi();
    this.carte = [];
    const contenitore = $('carte');
    contenitore.replaceChildren();
    const m = this.brano.modello;
    const indiceAttivo = this.cartaAttiva?.i;
    const scenaAttivo = this.cartaAttiva?.scena;
    if (m.preambolo.some((r) => r.trim())) contenitore.append(this.carta(-1));
    contenitore.append(this.testataBeat());
    (m.beat?.scene ?? []).forEach((_, k) => contenitore.append(this.cartaScena(k)));
    m.sezioni.forEach((_, i) => contenitore.append(this.carta(i)));
    this.cartaAttiva = scenaAttivo !== undefined ? this.carte.find((c) => c.scena === scenaAttivo) ?? null : this.carte.find((c) => c.i === indiceAttivo && c.scena === undefined) ?? null;
    $('riga-live').onclick = () => {
      this.mostraLive = !this.mostraLive;
      this.mostraBrano(false);
    };
  }

  carta(i) {
    const m = this.brano.modello;
    const preambolo = i < 0;
    const art = el('article', `card sezione${preambolo ? ' preambolo' : ''}`);
    const testa = el('div', 'card-testa');
    const nome = el('button', 'nome nome-sezione', preambolo ? 'preambolo' : `${i + 1} ${m.sezioni[i].nome}`);
    const stato = el('span', 'lbl', preambolo ? 'suona con ogni clip' : 'pronta');
    testa.append(nome, stato, el('div', 'spazio'));
    const corpo = el('div', 'editor editor-carta');
    const piede = el('div', 'lbl piede-carta');
    const avvisoTempo = el('p', 'avviso-audio');
    avvisoTempo.hidden = true;
    art.append(testa, avvisoTempo, corpo, piede);

    const carta = { i, el: art, stato, avvisoTempo };
    const righe = preambolo ? m.preambolo : m.sezioni[i].corpo;
    carta.editor = creaEditor({
      root: corpo,
      codice: righe.join('\n'),
      suValuta: this.azioni.provaInCuffia,
      suFerma: this.azioni.fermaTutto,
      suFuoco: () => this.attiva(carta),
      suCambio: () => {
        const nuove = carta.editor.codice.split('\n');
        const mm = this.brano.modello;
        this.modifica(preambolo ? { ...mm, preambolo: nuove } : B.conCorpo(mm, i, nuove), false);
        this.mostraMappa(mm.sezioni.map((s) => this.statoSezione(this.nomeBrano, s.nome)));
      },
    });
    // Quante righe sono selezionate: go live manda solo quelle.
    const selezione = () => {
      const { da, a, vuota } = carta.editor.righeScelte();
      piede.textContent = vuota ? '' : `${a - da + 1} ${a > da ? 'righe selezionate' : 'riga selezionata'} · cuffia e go live mandano solo quelle`;
    };
    corpo.addEventListener('keyup', selezione);
    corpo.addEventListener('mouseup', selezione);

    if (!preambolo) {
      nome.dataset.aiuto = 'rinomina';
      nome.onclick = () => this.rinomina(i);
      const unisci = tasto('unisci', '', 'Unisci con la clip successiva');
      unisci.disabled = i >= m.sezioni.length - 1;
      unisci.onclick = () => this.modifica(B.unisci(this.brano.modello, i), true, `clip «${m.sezioni[i].nome}» e «${m.sezioni[i + 1]?.nome}» unite`);
      const dividi = tasto('dividi', '', 'Dividi dalla riga del cursore in giù');
      dividi.onclick = () => this.dividi(carta);
      const cuffia = tasto('cuffia', '⌘↵');
      carta.cuffia = cuffia;
      cuffia.onclick = () => {
        // già in cuffia: il tasto è acceso e lo spegne
        if (carta.el.classList.contains('in-cuffia')) return this.azioni.fermaCuffia();
        this.attiva(carta);
        this.azioni.provaInCuffia();
      };
      const live = tasto('go live', '⇧⌘↵');
      live.onclick = () => {
        this.attiva(carta);
        this.azioni.goLive();
      };
      // il volume con cui la sezione entra: lo stesso controllo delle card del LIVE, scritto nell'intestazione @sezione
      const volume = el('div', 'volume');
      volume.dataset.aiuto = 'sezione-volume';
      const pieno = el('div');
      volume.append(pieno);
      const mostraVolume = () => (pieno.style.width = `${Math.min(1, this.brano.modello.sezioni[i]?.info?.volume ?? 1) * 100}%`);
      const imposta = (e) => {
        const r = volume.getBoundingClientRect();
        const v = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 100) / 100;
        const m2 = this.brano.modello;
        const { volume: _vecchio, ...resto } = m2.sezioni[i].info ?? {};
        this.modifica(B.conInfo(m2, i, v === 1 ? resto : { ...resto, volume: v }), false);
        mostraVolume();
      };
      let prima = null; // il modello com'era all'inizio del trascinamento: un trascinamento è un passo solo di ⌘Z
      volume.onpointerdown = (e) => {
        volume.setPointerCapture(e.pointerId);
        prima = { modello: this.brano.modello, sporco: this.brano.sporco, versione: this.versione };
        imposta(e);
        volume.onpointermove = imposta;
      };
      volume.onpointerup = () => {
        volume.onpointermove = null;
        if (!prima || prima.modello === this.brano.modello) return;
        const { modello, sporco } = prima;
        const dopo = this.brano.modello;
        const v = this.versione;
        prima = null;
        this.registra?.({
          etichetta: `volume della clip «${dopo.sezioni[i]?.nome ?? i + 1}»`,
          annulla: () => {
            if (this.versione !== v) return false;
            this.brano.modello = modello;
            this.brano.sporco = sporco;
            this.versione++;
            this.mostraBrano(true);
            this.mostraModo();
          },
        });
      };
      mostraVolume();
      testa.append(unisci, dividi, volume, cuffia, live);
    }
    this.carte.push(carta);
    return art;
  }

  // L'intestazione del beat: una riga sottile con «+ scena» (anche per creare il beat in un brano che non ce l'ha).
  testataBeat() {
    const m = this.brano.modello;
    const riga = el('div', `testata-beat${B.haBeat(m) ? '' : ' vuota'}`);
    riga.dataset.aiuto = 'beat';
    const aggiungi = tasto('+ scena', '', 'Aggiungi una scena al beat (la base ritmica del brano)');
    aggiungi.onclick = async () => {
      const nome = await chiediNome({ titolo: 'nome della scena', suggerimenti: ['intro', 'sviluppo', 'drop', 'break', 'outro'] });
      if (!nome) return;
      this.modifica(B.aggiungiScena(this.brano.modello, nome, []), true, `scena «${nome}» aggiunto`);
      this.carte.find((c) => c.scena === (this.brano.modello.beat.scene.length - 1))?.editor.focus();
    };
    riga.append(el('span', 'lbl', B.haBeat(m) ? 'beat · le scene della base ritmica' : 'niente beat in questo brano'), el('div', 'spazio'), aggiungi);
    return riga;
  }

  // Una scena del beat: una card come quella di un pezzo, ma col suo codice, la sua cuffia e «go live» che fa partire il beat da lì.
  cartaScena(k) {
    const m = this.brano.modello;
    const mom = m.beat.scene[k];
    const art = el('article', 'card sezione scena');
    const testa = el('div', 'card-testa');
    const nome = el('button', 'nome nome-sezione nome-scena', `◆ ${k + 1} ${mom.nome}`);
    const stato = el('span', 'lbl', 'pronto');
    testa.append(nome, stato, el('div', 'spazio'));
    const corpo = el('div', 'editor editor-carta');
    const avvisoTempo = el('p', 'avviso-audio');
    avvisoTempo.hidden = true;
    const piede = el('div', 'lbl piede-carta');
    art.append(testa, avvisoTempo, corpo, piede);
    const carta = { i: -2, scena: k, el: art, stato, avvisoTempo };
    carta.editor = creaEditor({
      root: corpo,
      codice: mom.corpo.join('\n'),
      suValuta: this.azioni.provaInCuffia,
      suFerma: this.azioni.fermaTutto,
      suFuoco: () => this.attiva(carta),
      suCambio: () => this.modifica(B.conCorpoScena(this.brano.modello, k, carta.editor.codice.split('\n')), false),
    });
    nome.dataset.aiuto = 'rinomina';
    nome.onclick = async () => {
      const nuovo = await chiediNome({ titolo: 'rinomina la scena', valore: mom.nome, suggerimenti: ['intro', 'sviluppo', 'drop', 'break', 'outro'] });
      if (nuovo && nuovo !== mom.nome) this.modifica(B.rinominaScena(this.brano.modello, k, nuovo), true, `scena «${mom.nome}» rinominato`);
    };
    const toglie = tasto('×', '', 'Togli questa scena');
    toglie.onclick = () => this.modifica(B.togliScena(this.brano.modello, k), true, `scena «${mom.nome}» tolto`);
    const cuffia = tasto('cuffia', '⌘↵');
    carta.cuffia = cuffia;
    cuffia.onclick = () => {
      if (carta.el.classList.contains('in-cuffia')) return this.azioni.fermaCuffia();
      this.attiva(carta);
      this.azioni.provaInCuffia();
    };
    const live = tasto('go live', '⇧⌘↵', 'Fa partire il beat da questa scena (a fine frase, se il beat suona già)');
    live.onclick = () => {
      this.attiva(carta);
      this.azioni.goLive();
    };
    testa.append(toglie, cuffia, live);
    this.carte.push(carta);
    return art;
  }

  attiva(carta) {
    this.cartaAttiva = carta;
    for (const c of this.carte) c.el.classList.toggle('attiva', c === carta);
  }

  // --- muoversi nel CUE senza mouse (controller): le sezioni di quello che ho davanti, e quella scelta ---

  // I nomi delle sezioni (in modalità brano quelle del brano aperto, in scratch quelle scritte con // @sezione).
  // Le voci in cui ci si muove: prima le scene del beat, poi i pezzi: [{ nome, scena? }].
  vociNav() {
    if (this.modo === 'brano') {
      const m = this.brano?.modello;
      return m ? [...(m.beat?.scene ?? []).map((x, k) => ({ nome: x.nome, scena: k })), ...m.sezioni.map((s, i) => ({ nome: s.nome, sezione: i }))] : [];
    }
    return B.blocchi(this.libero.codice).blocchi.filter((b) => b.sezione >= 0 || b.sezione === -2).map((b) => (b.sezione === -2 ? { nome: b.nome, scena: b.scena } : { nome: b.nome, sezione: b.sezione }));
  }

  sezioniNav() {
    return this.vociNav().map((v) => v.nome);
  }

  // L'indice della sezione scelta, o -1.
  indiceScelto() {
    const voci = this.vociNav();
    if (this.modo === 'brano') {
      const c = this.cartaAttiva;
      if (!c) return -1;
      return voci.findIndex((v) => (c.scena !== undefined ? v.scena === c.scena : v.sezione === c.i && c.i >= 0));
    }
    const testo = this.libero.codice;
    if (!voci.length) return -1;
    const { da } = this.libero.righeScelte();
    const b = B.bloccoDellaRiga(testo, da);
    return voci.findIndex((v) => (b.sezione === -2 ? v.scena === b.scena : v.sezione === b.sezione && b.sezione >= 0));
  }

  // Sceglie la sezione k (senza prendersi il fuoco della tastiera): in brano la card si evidenzia e si porta in vista, in scratch il cursore va al suo inizio.
  scegliSezione(k) {
    const voci = this.vociNav();
    const nomi = voci.map((v) => v.nome);
    if (k < 0 || k >= nomi.length) return null;
    const voce = voci[k];
    if (this.modo === 'brano') {
      const carta = this.carte.find((c) => (voce.scena !== undefined ? c.scena === voce.scena : c.scena === undefined && c.i === voce.sezione));
      if (!carta) return null;
      this.attiva(carta);
      carta.el.hidden = false;
      carta.el.scrollIntoView({ block: 'nearest' });
    } else {
      const { blocchi } = B.blocchi(this.libero.codice);
      const b = blocchi.find((x) => (voce.scena !== undefined ? x.sezione === -2 && x.scena === voce.scena : x.sezione === voce.sezione));
      const vista = this.libero.vista;
      const riga = vista.state.doc.line(Math.min(b.testa + 1, vista.state.doc.lines));
      vista.dispatch({ selection: { anchor: riga.to }, scrollIntoView: true });
    }
    this.mostraModo();
    return nomi[k];
  }

  // Un passo avanti o indietro fra le sezioni (senza girare intorno); ritorna il nome della sezione scelta, o null.
  spostaSezione(delta) {
    const n = this.sezioniNav().length;
    if (!n) return null;
    const ora = this.indiceScelto();
    const k = Math.max(0, Math.min(n - 1, (ora < 0 ? (delta > 0 ? -1 : n) : ora) + delta));
    return this.scegliSezione(k);
  }

  nomeSezioneScelta() {
    const k = this.indiceScelto();
    return k >= 0 ? this.sezioniNav()[k] : null;
  }

  async rinomina(i) {
    const m = this.brano.modello;
    const nome = await chiediNome({ titolo: 'rinomina la clip', valore: m.sezioni[i].nome, suggerimenti: B.NOMI_SEZIONE });
    if (nome && nome !== m.sezioni[i].nome) this.modifica(B.rinomina(m, i, nome), true, `clip «${m.sezioni[i].nome}» rinominata`);
  }

  async dividi(carta) {
    const { da } = carta.editor.righeScelte();
    const m = this.brano.modello;
    if (da === 0) return this.avviso('metti il cursore sulla prima riga della nuova clip');
    const nome = await chiediNome({ titolo: 'nome della nuova clip', suggerimenti: B.NOMI_SEZIONE });
    if (nome) this.modifica(B.dividi(m, carta.i, da, nome), true, `clip «${m.sezioni[carta.i].nome}» divisa`);
  }

  // --- + sezione dalle righe selezionate ---

  async aggiungiSezione() {
    let testo;
    let da;
    let a;
    if (this.modo === 'libero') {
      testo = this.libero.codice;
      ({ da, a } = this.libero.righeScelte());
    } else {
      const carta = this.cartaAttiva;
      if (!carta) return this.avviso('seleziona delle righe in una card');
      if (carta.scena !== undefined) return this.avviso('il beat non si divide in clip: le scene si scrivono con + scena');
      testo = B.scrivi(this.brano.modello);
      const { blocchi } = B.blocchi(testo);
      const inizio = blocchi.find((x) => x.sezione === carta.i).da;
      const scelte = carta.editor.righeScelte();
      da = inizio + scelte.da;
      a = inizio + scelte.a;
    }
    const nome = await chiediNome({ titolo: '+ clip dalle righe selezionate', suggerimenti: B.NOMI_SEZIONE });
    if (!nome) return;
    const r = B.aggiungiSezione(testo, da, a, nome);
    if (r.errore) return this.avviso(r.errore);
    if (this.modo === 'libero') {
      this.libero.codice = r.testo;
      this.libero.vaiAllaRiga(r.riga + 1);
    } else {
      this.modifica(B.leggi(r.testo), true, `clip «${nome}» aggiunta`);
      const nuova = B.leggi(r.testo).sezioni.findIndex((s) => s.riga === B.rigaSezione(nome) || s.nome === nome);
      this.carte.find((c) => c.i === nuova)?.editor.focus();
    }
    this.avviso(`clip ${nome}`);
  }

  // --- salvare e aprire ---

  async salva() {
    if (!this.azioni.haStash()) return this.avviso('nessuno stash: sceglilo nella barra in alto');
    const libero = this.modo === 'libero';
    const testo = B.aggiornaTag(libero ? this.libero.codice : B.scrivi(this.brano.modello));
    const modello = B.leggi(testo);
    const t = B.testa(modello);
    let file = libero ? this.fileLibero : this.brano.file;
    let nome = t.brano;
    if (!file) {
      nome = await chiediNome({ titolo: 'salva come brano', valore: nome ?? '', conferma: 'salva' });
      if (!nome) return;
      file = B.nomeFile(nome);
    }
    const finale = B.aggiornaTag(B.scrivi(B.conTesta(modello, await this.testaNuova(modello, nome))));
    let r = await window.cutx.scriviBrano(file, finale, { sovrascrivi: file === (libero ? this.fileLibero : this.brano.file) });
    if (r.esiste) {
      if (!(await conferma({ titolo: 'salva come brano', testo: `${file} esiste già nella libreria. Lo sovrascrivo?`, si: 'sovrascrivi' }))) return;
      r = await window.cutx.scriviBrano(file, finale, { sovrascrivi: true });
    }
    if (libero) {
      this.fileLibero = r.file;
      this.sostituisciTestaLibero(testo, finale);
    } else {
      this.brano.file = r.file;
      this.brano.modello = B.leggi(finale);
      this.brano.sporco = false;
    }
    this.mostraModo();
    this.avviso(`salvato ${r.file} nella libreria`);
    this.azioni.libreriaCambiata();
    return r.file;
  }

  async testaNuova(modello, nome) {
    const t = B.testa(modello);
    const stash = this.azioni.suoniStash();
    const usati = new Set();
    let bpmCodice = null;
    const pezzi = modello.sezioni.length ? modello.sezioni.map((_, i) => B.codice(modello, i).codice) : [modello.preambolo.join('\n')];
    for (const codice of pezzi) {
      const a = await analizza(codice, stash);
      for (const n of a.suoni) usati.add(n);
      bpmCodice ??= a.bpm;
    }
    const valori = { brano: nome, data: oggi(), suoni: [...usati].sort() };
    // il BPM scritto nella testa vince; poi quello del codice (setcpm); poi quello che suona
    const bpm = t.bpm || bpmCodice || this.azioni.bpm();
    if (bpm) valori.bpm = bpm;
    return valori;
  }

  // Dopo il salvataggio in modalità libero cambia solo la testa: il cursore resta dov'era.
  sostituisciTestaLibero(prima, dopo) {
    const vista = this.libero.vista;
    if (vista.state.doc.toString() !== prima) return;
    const lungo = (t) => B.leggi(t).testa.reduce((n, r) => n + r.length + 1, 0);
    const daPrima = lungo(prima);
    const daDopo = lungo(dopo);
    vista.dispatch({ changes: { from: 0, to: daPrima, insert: dopo.slice(0, daDopo) } });
  }

  async apri(file) {
    if (this.brano?.sporco) {
      const ok = await conferma({
        titolo: 'apri brano',
        testo: `${this.nomeBrano} ha modifiche non salvate. Le perdo?`,
        si: 'apri lo stesso',
        no: 'annulla',
      });
      if (!ok) return;
    }
    try {
      this.apriModello(file, await window.cutx.leggiBrano(file));
      if (this.sceltaIniziale !== false) this.scegliSezione(0);
    } catch (e) {
      this.avviso(`non riesco ad aprire ${file}: ${e.message}`);
    }
  }

  editors() {
    return [this.libero, ...this.carte.map((c) => c.editor)];
  }

  // Per i test: il testo del brano aperto, com'è adesso.
  testoBrano() {
    return this.brano ? B.scrivi(this.brano.modello) : null;
  }
}
