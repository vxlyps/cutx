// Il browser a sinistra, tre schede: i suoni dello stash, la libreria dei brani, la guida di Strudel.
// ▶ fa sentire in cuffia, + inserisce nel CUE dove c'è il cursore. Funziona offline: la guida è un file locale.
import help from './testi/help.json';
import it from './testi/it.json';

// I synth di Strudel, sempre disponibili, con una nota di prova.
export const SYNTH = ['sine', 'square', 'sawtooth', 'triangle', 'supersaw'];
const NOTA_PROVA = (s) => `note("c3 e3 g3 c4").s("${s}").decay(.25).sustain(0)`;

export const codiceSuono = (nome, i) => `s("${nome}${i === undefined ? '' : `:${i}`}")`;
export const codiceProva = (nome, i) => (SYNTH.includes(nome) ? NOTA_PROVA(nome) : codiceSuono(nome, i));

const crea = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};

function tasto(etichetta, titolo, fa, classe = '') {
  const b = crea('button', `key piccolo ${classe}`.trim(), etichetta);
  b.dataset.aiuto = titolo;
  b.onclick = (e) => {
    e.stopPropagation();
    fa();
  };
  return b;
}

export class Browser {
  // azioni: { suoni(), haStash(), libreria(), branoAperto(), prova(codice, chiave), ferma(), inAscolto(),
  //           inserisci(testo), apriBrano(file) }
  constructor({ elenco, cerca, schede }, azioni) {
    this.elenco = elenco;
    this.cerca = cerca;
    this.azioni = azioni;
    this.scheda = 'suoni';
    this.aperti = new Set(); // suoni con le varianti aperte
    this.helpAperti = new Set();
    this.ascoltando = null; // chiave di quello che ho mandato in cuffia dal browser
    this.inPartenza = null; // la chiave di quello che sta partendo (si cerca la durata del file)
    this.progetti = null; // progetti Ableton trovati (null = non ancora cercati)
    this.infoProgetti = new Map(); // percorso → { bpm, tracce, … } | { errore }
    this.schede = schede;
    cerca.addEventListener('input', () => this.mostra());
    for (const b of schede) b.onclick = () => this.vai(b.dataset.scheda);
  }

  vai(nome) {
    this.scheda = nome;
    for (const b of this.schede) b.classList.toggle('on', b.dataset.scheda === nome);
    this.cerca.placeholder = { suoni: 'cerca nello stash', libreria: 'cerca un brano', ableton: 'cerca un progetto', help: 'cerca una funzione' }[nome];
    if (nome === 'ableton') this.cercaProgetti();
    this.mostra();
  }

  get filtro() {
    return this.cerca.value.trim().toLowerCase();
  }

  mostra() {
    const scroll = this.elenco.scrollTop;
    this.elenco.replaceChildren();
    ({ suoni: () => this.mostraSuoni(), libreria: () => this.mostraLibreria(), ableton: () => this.mostraAbleton(), help: () => this.mostraHelp() })[this.scheda]();
    this.elenco.scrollTop = scroll;
  }

  gruppo(nome) {
    this.elenco.append(crea('div', 'lbl gruppo', nome));
  }

  vuoto(testo) {
    this.elenco.append(crea('p', 'secondario', testo));
  }

  // --- suoni ---

  // Un suono in ascolto si riconosce dal codice che il browser ha mandato in cuffia.
  suonaOra(chiave) {
    return this.ascoltando === chiave && (this.inPartenza === chiave || this.azioni.inAscolto(chiave));
  }

  riga(nome, nota, { codice, chiave, inserisci, apri, aperto, campione }) {
    const riga = crea('div', 'voce');
    const n = crea('span', apri ? 'nome cliccabile' : 'nome', nome);
    if (apri) {
      n.onclick = apri;
      riga.classList.add('cliccabile');
    }
    riga.append(n, crea('span', 'lbl', nota));
    const suona = this.suonaOra(chiave);
    riga.append(
      tasto(suona ? '■' : '▶', suona ? 'browser-ferma' : 'browser-prova', () => this.suona(codice, chiave, campione), suona ? 'on' : ''),
      tasto('+', 'browser-inserisci', () => this.azioni.inserisci(inserisci)),
    );
    if (apri) riga.dataset.aperto = aperto ? '1' : '0';
    return riga;
  }

  // campione: { file } se è un file dello stash: la sua durata dice quando finisce da solo.
  // Un campione parte subito, suona una volta e il ■ torna ▶ alla fine; un synth si ferma col ■.
  async suona(codice, chiave, campione = null) {
    if (this.suonaOra(chiave)) {
      this.inPartenza = null;
      this.ascoltando = null;
      this.azioni.ferma();
    } else {
      // "in partenza": il tasto è già ■ mentre si cerca la durata del file, e nessun controllo lo rimette ▶ prima che parta
      this.ascoltando = chiave;
      this.inPartenza = chiave;
      this.mostra();
      const anteprima = campione ? { cicli: 1, audioS: (await this.azioni.durataSuono(campione.file).catch(() => null)) ?? 0 } : undefined;
      const ancora = this.inPartenza === chiave; // nel frattempo non l'ho fermato con un secondo clic
      if (this.inPartenza === chiave) this.inPartenza = null;
      if (ancora && this.ascoltando === chiave) this.azioni.prova(codice, chiave, anteprima);
    }
    this.mostra();
  }

  // Chiamato quando la cuffia smette di suonare quello che avevo mandato.
  aggiornaAscolto() {
    if (this.ascoltando && !this.inPartenza && !this.azioni.inAscolto(this.ascoltando)) {
      this.ascoltando = null;
      this.mostra();
    }
  }

  mostraSuoni() {
    const suoni = this.azioni.suoni();
    const passa = (n) => !this.filtro || n.toLowerCase().includes(this.filtro);
    const nomi = Object.keys(suoni).filter((k) => k !== '_base' && passa(k)).sort((a, b) => a.localeCompare(b));
    this.gruppo('stash');
    if (!nomi.length) this.vuoto(!this.azioni.haStash() ? 'nessuno stash: sceglilo in alto' : this.filtro ? 'nessun suono con questo nome' : 'nessun suono: metti dei WAV in suoni/<nome>/');
    for (const nome of nomi) {
      const file = suoni[nome];
      const aperto = this.aperti.has(nome) && file.length > 1;
      this.elenco.append(
        this.riga(nome, String(file.length), {
          codice: codiceProva(nome),
          chiave: nome,
          campione: SYNTH.includes(nome) ? null : { file: file[0] },
          inserisci: codiceSuono(nome),
          apri: file.length > 1 ? () => (this.aperti.has(nome) ? this.aperti.delete(nome) : this.aperti.add(nome), this.mostra()) : null,
          aperto,
        }),
      );
      if (aperto) {
        file.forEach((f, i) => {
          const r = this.riga(decodeURIComponent(f.split('/').pop()).replace(/\.[^.]+$/, ''), String(i), {
            codice: codiceProva(nome, i),
            chiave: `${nome}:${i}`,
            campione: { file: f },
            inserisci: codiceSuono(nome, i),
          });
          r.classList.add('variante');
          this.elenco.append(r);
        });
      }
    }
    const synth = SYNTH.filter(passa);
    if (synth.length) {
      this.gruppo('synth');
      for (const nome of synth) this.elenco.append(this.riga(nome, '', { codice: codiceProva(nome), chiave: nome, inserisci: `s("${nome}")` }));
    }
  }

  // --- libreria ---

  mostraLibreria() {
    this.gruppo('brani');
    const brani = this.azioni.libreria().filter((b) => !this.filtro || `${b.nome} ${b.file}`.toLowerCase().includes(this.filtro));
    if (!brani.length) return this.vuoto(!this.azioni.haStash() ? 'nessuno stash: sceglilo in alto' : this.filtro ? 'nessun brano con questo nome' : 'nessun brano: ⌘S salva il CUE');
    const aperto = this.azioni.branoAperto();
    for (const b of brani) {
      const riga = crea('div', 'voce cliccabile brano');
      riga.classList.toggle('aperto', b.file === aperto);
      riga.title = `${b.file} · ${b.sezioni} ${b.sezioni === 1 ? 'sezione' : 'sezioni'}${b.data ? ` · ${b.data}` : ''}`;
      riga.append(crea('span', 'nome', b.nome), crea('span', 'lbl', `${b.sezioni}§${b.bpm ? ` · ${b.bpm}` : ''}`));
      riga.onclick = () => this.azioni.apriBrano(b.file);
      this.elenco.append(riga);
    }
  }

  // --- ableton: i progetti delle cartelle scelte ---

  // Ogni volta che si apre la scheda si guarda di nuovo (un progetto nuovo compare da solo); BPM e tracce
  // arrivano uno alla volta, perché la lettura di un progetto richiede un momento.
  async cercaProgetti() {
    this.progetti = await this.azioni.progettiAbleton();
    this.mostra();
    for (const p of this.progetti) {
      if (this.infoProgetti.get(p.percorso)?.modificato === p.modificato) continue;
      const info = await this.azioni.infoProgetto(p.percorso);
      this.infoProgetti.set(p.percorso, { ...info, modificato: p.modificato });
      if (this.scheda === 'ableton') this.mostra();
    }
  }

  mostraAbleton() {
    if (!this.azioni.cartelleAbleton().length) {
      // la prima volta: cosa fa, e il pulsante lì dentro (senza passare dalle impostazioni)
      this.gruppo('ableton');
      this.elenco.append(crea('p', 'ableton-vuota', it.ableton.vuota));
      const b = crea('button', 'key acid', 'scegli cartella');
      b.dataset.aiuto = 'ableton-scegli';
      b.onclick = () => this.azioni.aggiungiCartellaAbleton();
      this.elenco.append(b);
      return;
    }
    this.gruppo('progetti');
    if (this.progetti === null) return this.vuoto('cerco i progetti…');
    const filtro = this.filtro;
    const visti = this.progetti.filter((p) => !filtro || p.nome.toLowerCase().includes(filtro));
    if (!visti.length) {
      this.vuoto(filtro ? 'nessun progetto con questo nome' : 'nessun progetto .als nelle cartelle scelte');
      if (!filtro) {
        const b = crea('button', 'key', 'scegli un\'altra cartella');
        b.onclick = () => this.azioni.aggiungiCartellaAbleton();
        this.elenco.append(b);
      }
      return;
    }
    for (const p of visti) {
      const info = this.infoProgetti.get(p.percorso);
      const nota = !info ? '…' : info.errore ? 'illeggibile' : `${Math.round(info.bpm * 10) / 10} bpm · ${info.tracce} ${info.tracce === 1 ? 'traccia' : 'tracce'}`;
      const riga = crea('div', 'voce cliccabile progetto');
      riga.title = `${p.percorso}${info?.errore ? `\n${info.errore}` : ''}`;
      riga.classList.toggle('illeggibile', !!info?.errore);
      riga.append(crea('span', 'nome', p.nome), crea('span', 'lbl', nota));
      riga.onclick = () => !info?.errore && this.azioni.apriProgetto(p);
      this.elenco.append(riga);
    }
  }

  // --- help? ---

  mostraHelp() {
    let n = 0;
    for (const g of help) {
      const voci = g.voci.filter((v) => !this.filtro || `${v.nome} ${v.testo}`.toLowerCase().includes(this.filtro));
      if (!voci.length) continue;
      this.gruppo(g.gruppo);
      for (const v of voci) {
        n++;
        const aperta = this.helpAperti.has(v.nome) || (!!this.filtro && voci.length === 1);
        const scheda = crea('div', `funzione${aperta ? ' aperta' : ''}`);
        const testa = crea('div', 'voce cliccabile');
        testa.append(crea('span', 'nome codice-help', v.nome));
        testa.onclick = () => (this.helpAperti.has(v.nome) ? this.helpAperti.delete(v.nome) : this.helpAperti.add(v.nome), this.mostra());
        scheda.append(testa, crea('p', 'spiega', v.testo));
        if (aperta) {
          const esempio = crea('pre', 'esempio', v.esempio);
          const tasti = crea('div', 'esempio-tasti');
          const chiave = `help:${v.nome}`;
          const suona = this.suonaOra(chiave);
          tasti.append(
            tasto(suona ? '■ ferma' : '▶ cuffia', suona ? 'browser-ferma' : 'browser-prova', () => this.suona(v.esempio, chiave), suona ? 'on' : ''),
            tasto('+ inserisci', 'browser-inserisci', () => this.azioni.inserisci(v.esempio)),
          );
          scheda.append(esempio, tasti);
        }
        this.elenco.append(scheda);
      }
    }
    if (!n) this.vuoto('nessuna funzione con questo nome');
  }
}

// Gli esempi dell'help, per la prova automatica: ognuno deve valutarsi.
export const esempiHelp = () => help.flatMap((g) => g.voci.map((v) => ({ nome: v.nome, esempio: v.esempio })));
