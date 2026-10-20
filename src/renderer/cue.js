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
    this.carte = []; // { i, editor, el } (i = -1 per il preambolo)
    this.cartaAttiva = null;
    this.mostraLive = false; // le sezioni già live, aperte o richiuse in una riga

    this.libero = creaEditor({
      root: $('editor'),
      codice: codiceIniziale,
      suValuta: azioni.provaInCuffia,
      suFerma: azioni.fermaTutto,
      suCambio: () => azioni.bozza?.(),
      statoSezione: (nome) => this.statoSezione('libero', nome),
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
    if (!b.sezioni.length) {
      const righe = testo.split('\n');
      const codice = vuota ? testo : righe.slice(da, a + 1).join('\n');
      const base = vuota ? 0 : this.libero.vista.state.doc.line(da + 1).from;
      return { nome: 'libero', provenienza: 'libero', codice, inizio: 0, bpmBrano: null, dove: { editor: this.libero, base } };
    }
    const blocco = B.bloccoDellaRiga(testo, da);
    if (blocco.sezione < 0) return { errore: 'il cursore è nel preambolo: mettilo in una sezione' };
    const prima = vuota ? blocco.da : Math.max(da, blocco.da);
    const righe = vuota ? null : testo.split('\n').slice(prima, Math.min(a + 1, blocco.a));
    const base = prima < this.libero.vista.state.doc.lines ? this.libero.vista.state.doc.line(prima + 1).from : 0;
    return { nome: blocco.nome, provenienza: 'libero', ...B.codice(b, blocco.sezione, righe), bpmBrano: B.bpmDelBrano(b), dove: { editor: this.libero, base } };
  }

  pezzoBrano() {
    const carta = this.cartaAttiva;
    if (!this.brano || !carta) return { errore: 'scegli una sezione: clic nella sua card' };
    if (carta.i < 0) return { errore: 'il preambolo suona con ogni sezione: scegline una' };
    const m = this.brano.modello;
    const { da, a, vuota } = carta.editor.righeScelte();
    const righe = vuota ? null : m.sezioni[carta.i].corpo.slice(da, a + 1);
    return {
      nome: m.sezioni[carta.i].nome,
      provenienza: `${this.nomeBrano} §${carta.i + 1}`,
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
    if (!editor) return this.avviso('scegli una sezione: clic nella sua card');
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
      const stato = p.errore ? '' : this.statoSezione('libero', p.nome);
      $('card-libero').classList.toggle('in-cuffia', stato === 'cuffia');
      $('libero-stato').textContent = stato === 'cuffia' ? '◖◗ lo stai sentendo' : stato === 'live' ? '● è live' : '';
      $('libero-nome').textContent = this.fileLibero ? `libero · ${this.fileLibero}` : 'libero';
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
    this.brano = { file, modello: B.leggi(testo), sporco: false };
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
      this.avviso(`attenzione: nello stash mancano ${mancano.join(', ')} · i pezzi che li usano non suoneranno`, {
        persistente: true,
      });
    } else this.avviso('');
  }

  modifica(modello, ridisegna = true) {
    this.brano.modello = modello;
    this.brano.sporco = true;
    if (ridisegna) this.mostraBrano(true);
    this.mostraModo();
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
    for (const c of this.carte) {
      if (c.i < 0) continue;
      const stato = stati[c.i];
      c.el.hidden = stato === 'live' && !this.mostraLive;
      c.el.classList.toggle('in-cuffia', stato === 'cuffia');
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
    if (!m.sezioni.length) mappa.append(el('span', 'lbl', 'nessuna sezione: selezioni delle righe e premi + sezione ⌘E'));
  }

  creaCarte() {
    for (const c of this.carte) c.editor.distruggi();
    this.carte = [];
    const contenitore = $('carte');
    contenitore.replaceChildren();
    const m = this.brano.modello;
    const indiceAttivo = this.cartaAttiva?.i;
    if (m.preambolo.some((r) => r.trim())) contenitore.append(this.carta(-1));
    m.sezioni.forEach((_, i) => contenitore.append(this.carta(i)));
    this.cartaAttiva = this.carte.find((c) => c.i === indiceAttivo) ?? null;
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
    const stato = el('span', 'lbl', preambolo ? 'suona con ogni sezione' : 'pronta');
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
      const unisci = tasto('unisci', '', 'Unisci con la sezione successiva');
      unisci.disabled = i >= m.sezioni.length - 1;
      unisci.onclick = () => this.modifica(B.unisci(this.brano.modello, i));
      const dividi = tasto('dividi', '', 'Dividi dalla riga del cursore in giù');
      dividi.onclick = () => this.dividi(carta);
      const cuffia = tasto('cuffia', '⌘↵');
      cuffia.onclick = () => {
        this.attiva(carta);
        this.azioni.provaInCuffia();
      };
      const live = tasto('go live', '⇧⌘↵');
      live.onclick = () => {
        this.attiva(carta);
        this.azioni.goLive();
      };
      testa.append(unisci, dividi, cuffia, live);
    }
    this.carte.push(carta);
    return art;
  }

  attiva(carta) {
    this.cartaAttiva = carta;
    for (const c of this.carte) c.el.classList.toggle('attiva', c === carta);
  }

  async rinomina(i) {
    const m = this.brano.modello;
    const nome = await chiediNome({ titolo: 'rinomina la sezione', valore: m.sezioni[i].nome, suggerimenti: B.NOMI_SEZIONE });
    if (nome && nome !== m.sezioni[i].nome) this.modifica(B.rinomina(m, i, nome));
  }

  async dividi(carta) {
    const { da } = carta.editor.righeScelte();
    const m = this.brano.modello;
    if (da === 0) return this.avviso('metti il cursore sulla prima riga della nuova sezione');
    const nome = await chiediNome({ titolo: 'nome della nuova sezione', suggerimenti: B.NOMI_SEZIONE });
    if (nome) this.modifica(B.dividi(m, carta.i, da, nome));
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
      testo = B.scrivi(this.brano.modello);
      const { blocchi } = B.blocchi(testo);
      const inizio = blocchi[carta.i + 1].da;
      const scelte = carta.editor.righeScelte();
      da = inizio + scelte.da;
      a = inizio + scelte.a;
    }
    const nome = await chiediNome({ titolo: '+ sezione dalle righe selezionate', suggerimenti: B.NOMI_SEZIONE });
    if (!nome) return;
    const r = B.aggiungiSezione(testo, da, a, nome);
    if (r.errore) return this.avviso(r.errore);
    if (this.modo === 'libero') {
      this.libero.codice = r.testo;
      this.libero.vaiAllaRiga(r.riga + 1);
    } else {
      this.modifica(B.leggi(r.testo));
      const nuova = B.leggi(r.testo).sezioni.findIndex((s) => s.riga === B.rigaSezione(nome) || s.nome === nome);
      this.carte.find((c) => c.i === nuova)?.editor.focus();
    }
    this.avviso(`sezione ${nome}`);
  }

  // --- salvare e aprire ---

  async salva() {
    if (!this.azioni.haStash()) return this.avviso('nessuno stash: sceglilo nella barra in alto');
    const libero = this.modo === 'libero';
    const testo = libero ? this.libero.codice : B.scrivi(this.brano.modello);
    const modello = B.leggi(testo);
    const t = B.testa(modello);
    let file = libero ? this.fileLibero : this.brano.file;
    let nome = t.brano;
    if (!file) {
      nome = await chiediNome({ titolo: 'salva come brano', valore: nome ?? '', conferma: 'salva' });
      if (!nome) return;
      file = B.nomeFile(nome);
    }
    const finale = B.scrivi(B.conTesta(modello, await this.testaNuova(modello, nome)));
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
