// La scheda DRUM della vista SYNTH: una griglia a passi per la batteria. Ogni riga è un suono, ogni cella un passo: clic accende e
// spegne, trascinando su e giù cambia la velocity. Quello che si fa diventa codice vero (drum-codice.js) che si legge anche dal
// pannello del codice, nei due versi. Qui non suona niente da sola: la cuffia la comanda app.js, attraverso le funzioni di `opz`.
import { CICLI, PASSI, RIGHE_MAX, VEL_DI_SERIE, VEL_MIN, aggiungiRiga, cambiaSuono, clip, codice, impostaPasso, iniziale, leggiCodice, passiPersi, ridimensiona, slot, togliRiga } from './drum-codice.js';
import { RegistratoreDrum } from './drum-rec.js';
import { inCampoDiTesto } from './synth-tastiera.js';
import it from './testi/it.json';

const T = it.drum;
const formatta = (modello, vars = {}) => String(modello).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const crea = (tag, classe, testo) => {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined) el.textContent = testo;
  return el;
};

// I tasti del Mac: una riga per tasto (la fila centrale per le prime otto, quella sopra per le altre otto)
export const TASTI_RIGHE = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI'];
const LETTERA = (code) => code.replace('Key', '');

// I suoni di Strudel che si trovano sempre (nello stash vanno i WAV: i nomi arrivano da opz.suoniStash)
export const SUONI_STRUDEL = ['bd', 'sd', 'hh', 'oh', 'cp', 'rim', 'lt', 'mt', 'ht', 'cb', 'cr', 'rd'];
const PAUSA_ANTEPRIMA_MS = 90;
const PAUSA_SALVA_MS = 800;
const PAUSA_CODICE_MS = 350;
const PIXEL_PER_VELOCITY = 0.012; // quanta velocity per ogni pixel di trascinamento in verticale
const STORIA_MAX = 100;

// Una batteria di partenza, così la scheda si apre con qualcosa da sentire e da toccare.
export function partenza() {
  let s = iniziale();
  for (const [suono, passi] of [['bd', [0, 4, 8, 12]], ['sd', [4, 12]], ['hh', [2, 6, 10, 14]]]) {
    s = aggiungiRiga(s, suono);
    for (const p of passi) s = impostaPasso(s, s.righe.length - 1, p, VEL_DI_SERIE);
  }
  return s;
}

export class VistaDrum {
  // opz: suona(codice, nome) → errore|null, suonaOra(), ferma(), ciclo(), destinazioni(), mandaCue(dove, nome, testo, info),
  //      suoniStash() → { nome: […] }, salva(contenuto), vaiA(scheda)
  constructor(radice, opz) {
    this.r = radice;
    this.opz = opz;
    this.stato = partenza();
    this.nome = 'drum';
    this.storia = [];
    this.ripeti = [];
    this.inGesto = false;
    this.gesto = null;
    this.scrivendo = false;
    this.erroreCodice = null;
    this.attiva_ = false;
    this.avviata = false;
    this.celle = []; // [riga][passo] → elemento della cella
    this.firma = '';
    this.colonna = -1; // la colonna dove sta la testina
    this.timerAnteprima = null;
    this.timerSalva = null;
    this.timerCodice = null;
    this.timerTestina = null;
    this.firmaDest = '';
    this.rigaScelta = -1; // la riga scelta dal controller (evidenziata)
    this.timerManopola = null; // un giro di manopola è un passo solo di ⌘Z
    this.rec = null; // il REC in corso (drum-rec.js)
    this.timerRec = null;
    this.battitoClick = null;
    this.costruisci();
    this.disegna();
  }

  // --- costruzione ---

  costruisci() {
    const barra = crea('div', 'drum-barra');
    this.schede = {};
    const schede = crea('div', 'drum-schede');
    for (const id of ['suono', 'note', 'drum']) {
      const b = crea('button', 'key piccolo', it.synth.schede[id]);
      b.onclick = () => this.opz.vaiA?.(id);
      this.schede[id] = b;
      schede.append(b);
    }
    this.schede.drum.classList.add('on');
    this.nomeEl = crea('input', 'drum-nome');
    this.nomeEl.value = this.nome;
    this.nomeEl.spellcheck = false;
    this.nomeEl.setAttribute('aria-label', T.nome);
    this.nomeEl.oninput = () => {
      this.nome = this.nomeEl.value;
      this.salvaSoon();
    };
    this.playEl = crea('button', 'key drum-play', T.play);
    this.playEl.append(crea('i', '', '⌘↵'));
    this.playEl.dataset.aiuto = 'drum-play';
    this.playEl.onclick = () => this.suonaOFerma();
    this.recEl = crea('button', 'key drum-rec synth-rec', T.rec);
    this.recEl.dataset.aiuto = 'drum-rec';
    this.recEl.onclick = () => this.avviaRec();
    this.passiEl = this.selezione(PASSI.map((n) => [n, `${n} ${T.passi}`]), T.passi, (v) => this.formato(Number(v), this.stato.cicli));
    this.cicliEl = this.selezione(CICLI.map((n) => [n, `${n} ${n === 1 ? T.ciclo : T.cicli}`]), T.cicli, (v) => this.formato(this.stato.passi, Number(v)));
    this.passiEl.dataset.aiuto = this.cicliEl.dataset.aiuto = 'drum-formato';
    this.destinazioneEl = crea('select', 'drum-select');
    this.destinazioneEl.setAttribute('aria-label', T.destinazione);
    this.cueEl = crea('button', 'key acid', T.cue);
    this.cueEl.dataset.aiuto = 'drum-cue';
    this.cueEl.onclick = () => this.mandaCue();
    this.aggiornaEl = crea('button', 'key');
    this.aggiornaEl.dataset.aiuto = 'drum-aggiorna';
    this.aggiornaEl.hidden = true;
    this.aggiornaEl.onclick = () => this.aggiornaClip();
    barra.append(schede, crea('span', 'sep'), this.nomeEl, this.playEl, this.recEl, crea('span', 'sep'), this.passiEl, this.cicliEl, crea('span', 'spazio'), this.aggiornaEl, this.destinazioneEl, this.cueEl);

    this.grigliaEl = crea('div', 'drum-griglia');
    this.grigliaEl.dataset.aiuto = 'drum-griglia';
    this.collega();
    this.aggiungiEl = crea('select', 'drum-select drum-aggiungi');
    this.aggiungiEl.setAttribute('aria-label', T.nuovaRiga);
    this.aggiungiEl.onchange = () => {
      const v = this.aggiungiEl.value;
      this.aggiungiEl.value = '';
      if (!v) return;
      if (this.stato.righe.length >= RIGHE_MAX) return this.avviso(formatta(T.msg.righeMax, { n: RIGHE_MAX }));
      this.passo(() => this.imponi(aggiungiRiga(this.stato, v)));
    };
    const sinistra = crea('div', 'drum-sinistra');
    sinistra.append(this.grigliaEl, this.aggiungiEl);

    const lato = crea('aside', 'drum-lato');
    lato.append(crea('h2', 'lbl', T.codice));
    this.codiceEl = crea('textarea', 'drum-pre');
    this.codiceEl.dataset.aiuto = 'drum-codice';
    this.codiceEl.spellcheck = false;
    this.codiceEl.wrap = 'off';
    this.codiceEl.setAttribute('aria-label', T.codice);
    this.codiceEl.oninput = () => {
      this.scrivendo = true;
      clearTimeout(this.timerCodice);
      this.timerCodice = setTimeout(() => this.daCodice(), PAUSA_CODICE_MS);
    };
    this.codiceEl.onblur = () => {
      clearTimeout(this.timerCodice);
      this.daCodice();
      this.scrivendo = false;
      if (!this.erroreCodice) this.codiceEl.value = codice(this.stato); // il codice come lo scrive la griglia
    };
    this.avvisoEl = crea('p', 'drum-avviso');
    lato.append(this.codiceEl, this.avvisoEl);

    const corpo = crea('div', 'drum-corpo');
    corpo.append(sinistra, lato);
    this.r.replaceChildren(barra, corpo);
  }

  selezione(voci, etichetta, cambia) {
    const s = crea('select', 'drum-select');
    s.setAttribute('aria-label', etichetta);
    for (const [v, nome] of voci) s.append(new Option(nome, v));
    s.onchange = () => cambia(s.value);
    return s;
  }

  // Il mouse sulla griglia: clic accende/spegne, trascinare in verticale dà la velocity. Si spegne solo se il passo era acceso e non l'ho trascinato.
  collega() {
    const g = this.grigliaEl;
    g.addEventListener('pointerdown', (e) => {
      const c = e.target.closest?.('.drum-passo');
      if (!c || e.button !== 0) return;
      this.evidenzia(Number(c.dataset.r)); // la riga che tocco col mouse è anche quella del controller
      const r = Number(c.dataset.r);
      const i = Number(c.dataset.i);
      const riga = this.stato.righe[r];
      if (riga?.tipo !== 'griglia') return;
      e.preventDefault();
      this.registra();
      this.inGesto = true;
      const era = riga.vel[i];
      this.gesto = { r, i, y0: e.clientY, v0: era > 0 ? era : VEL_DI_SERIE, era, mosso: false };
      if (era === 0) this.imponi(impostaPasso(this.stato, r, i, VEL_DI_SERIE));
      try {
        c.setPointerCapture(e.pointerId); // il mouse resta sulla cella anche se esce mentre trascini
      } catch {
        // un puntatore finto (prove) non si può catturare: non serve
      }
    });
    g.addEventListener('pointermove', (e) => {
      const q = this.gesto;
      if (!q) return;
      const dy = q.y0 - e.clientY;
      if (!q.mosso && Math.abs(dy) < 3) return;
      q.mosso = true;
      this.imponi(impostaPasso(this.stato, q.r, q.i, q.v0 + dy * PIXEL_PER_VELOCITY));
    });
    const fine = () => {
      const q = this.gesto;
      this.gesto = null;
      this.inGesto = false;
      if (q && !q.mosso && q.era > 0) {
        this.inGesto = true;
        this.imponi(impostaPasso(this.stato, q.r, q.i, 0));
        this.inGesto = false;
      }
    };
    g.addEventListener('pointerup', fine);
    g.addEventListener('pointercancel', () => {
      this.gesto = null;
      this.inGesto = false;
    });
  }

  // --- lo stato ---

  registra() {
    this.storia.push(this.stato);
    if (this.storia.length > STORIA_MAX) this.storia.shift();
    this.ripeti = [];
  }

  // Un cambiamento unico (non un gesto): registra per l'annulla e applica.
  passo(fa) {
    this.registra();
    this.inGesto = true;
    fa();
    this.inGesto = false;
  }

  imponi(nuovo) {
    if (nuovo === this.stato) return;
    this.stato = nuovo;
    if (!this.scrivendo || document.activeElement !== this.codiceEl) this.erroreCodice = null;
    this.cambiato();
  }

  cambiato() {
    this.disegna();
    this.programmaAnteprima();
    this.salvaSoon();
  }

  annulla() {
    const prima = this.storia.pop();
    if (!prima) return false;
    this.ripeti.push(this.stato);
    this.stato = prima;
    this.avviso('');
    this.cambiato();
    return true;
  }

  rifai() {
    const dopo = this.ripeti.pop();
    if (!dopo) return false;
    this.storia.push(this.stato);
    this.stato = dopo;
    this.avviso('');
    this.cambiato();
    return true;
  }

  // Cambia passi o cicli: i passi che non hanno un posto nel nuovo formato si perdono (si dice quanti, e ⌘Z li ridà).
  formato(passi, cicli) {
    const persi = passiPersi(this.stato, passi, cicli);
    this.passo(() => this.imponi(ridimensiona(this.stato, passi, cicli)));
    this.avviso(persi ? formatta(T.msg.formato, { passi, cicli, n: persi }) : '');
  }

  contenuto() {
    return { codice: codice(this.stato), nome: this.nome };
  }

  // Lo stato di prima (dalle preferenze).
  carica(c) {
    if (!c || typeof c.codice !== 'string') return;
    const letto = leggiCodice(c.codice);
    if (letto.errore) return;
    this.stato = letto.stato;
    if (typeof c.nome === 'string' && c.nome.trim()) this.nome = c.nome.slice(0, 60);
    this.nomeEl.value = this.nome;
    this.storia = [];
    this.ripeti = [];
    this.disegna();
  }

  // Una clip DRUM aperta dal CUE o dal kit: la griglia riparte da lì. Ritorna l'errore, o null.
  // origine: da dove viene la clip (per «aggiorna»), o null.
  apri(testo, nome, origine = null) {
    const letto = leggiCodice(testo);
    if (letto.errore) return T.msg.apriNonDrum;
    this.registra();
    this.origine = origine;
    this.aggiornaEl.hidden = !origine;
    if (origine) {
      this.aggiornaEl.textContent = formatta(T.aggiorna, { nome: origine.nome });
      this.aggiornaEl.title = formatta(T.aggiornaTitolo, { nome: origine.nome });
    }
    this.stato = letto.stato;
    if (nome) {
      this.nome = nome;
      this.nomeEl.value = nome;
    }
    this.erroreCodice = null;
    this.avviso(letto.avvisi.length ? letto.avvisi.join(' · ') : formatta(T.msg.aperta, { nome: this.nome }));
    this.cambiato();
    return null;
  }

  // Il codice scritto a mano: quello che si legge muove la griglia, il resto resta com'è (righe «testo»). Un errore non cambia niente.
  daCodice() {
    const letto = leggiCodice(this.codiceEl.value);
    if (letto.errore) {
      this.erroreCodice = letto.errore;
      this.codiceEl.classList.add('errore');
      return this.avviso(formatta(T.msg.errore, { errore: letto.errore }));
    }
    this.erroreCodice = null;
    this.codiceEl.classList.remove('errore');
    this.avviso(letto.avvisi.join(' · '));
    if (codice(letto.stato) === codice(this.stato)) return;
    this.registra();
    this.stato = letto.stato;
    this.cambiato();
  }

  // --- suono ---

  programmaAnteprima() {
    if (!this.opz.suonaOra()) return;
    clearTimeout(this.timerAnteprima);
    this.timerAnteprima = setTimeout(() => this.suona(), PAUSA_ANTEPRIMA_MS);
  }

  // Quello che suona: lo stack (una griglia senza righe è silenzio).
  codiceDaSuonare() {
    return this.stato.righe.length ? codice(this.stato) : 'silence';
  }

  async suona() {
    const errore = await this.opz.suona(this.codiceDaSuonare(), this.nome);
    if (errore) this.avviso(formatta(T.msg.codiceNonParte, { errore: String(errore).split('\n')[0] }));
    else if (this.avvisoEl.textContent.startsWith('errore:')) this.avviso('');
  }

  suonaOFerma() {
    if (this.opz.suonaOra()) this.opz.ferma();
    else this.suona();
    this.aggiorna();
  }

  provaInCuffia() {
    return this.suonaOFerma();
  }

  fermaAnteprima() {
    clearTimeout(this.timerAnteprima);
    if (this.opz.suonaOra()) this.opz.ferma();
  }

  mandaCue() {
    const dest = this.destinazioneEl.value;
    const beat = dest.startsWith('beat-');
    const errore = beat ? this.opz.mandaBeat(dest.slice(5), this.nome, clip(this.stato)) : this.opz.mandaCue(dest, this.nome, clip(this.stato), { drum: true });
    this.avviso(errore ?? formatta(beat ? it.drum.msg.mandataBeat : it.drum.msg.mandata, { nome: this.nome, dove: beat ? it.drum.destinazioniBeat[dest.slice(5)] : it.synth.destinazioni[dest] }));
  }

  // Riscrive la clip da cui viene la griglia, dov'è (CUE o kit). Il live non cambia.
  aggiornaClip() {
    if (!this.origine) return;
    const errore = this.opz.aggiorna(this.origine, clip(this.stato));
    this.avviso(errore ?? formatta(this.origine.kit ? T.msg.aggiornataKit : T.msg.aggiornata, { nome: this.origine.nome }));
  }

  avviso(testo) {
    this.avvisoEl.textContent = testo;
  }

  salvaSoon() {
    clearTimeout(this.timerSalva);
    this.timerSalva = setTimeout(() => this.opz.salvaDrum?.(this.contenuto()), PAUSA_SALVA_MS);
  }

  // --- disegno ---

  attiva(on) {
    this.attiva_ = on;
    clearInterval(this.timerTestina);
    this.timerTestina = null;
    if (on) {
      this.avviata = true;
      this.timerTestina = setInterval(() => this.testina(), 40);
      this.aggiorna();
    } else {
      this.mettiTestina(-1);
      this.fermaRec(true); // lasciando la batteria il REC si annulla
    }
  }

  aggiorna() {
    this.playEl.classList.toggle('on', !!this.opz.suonaOra());
    this.aggiornaDestinazioni();
    this.codiceDaStato();
  }

  aggiornaDestinazioni() {
    if (!this.avviata) return;
    const dest = [...this.opz.destinazioni(), ...this.opz.destinazioniBeat()];
    const firma = JSON.stringify(dest);
    if (firma === this.firmaDest) return;
    this.firmaDest = firma;
    const scelta = this.destinazioneEl.value;
    this.destinazioneEl.replaceChildren(...dest.map((d) => Object.assign(new Option(d.nome, d.id), { disabled: !d.ok })));
    const ok = dest.find((d) => d.id === scelta && d.ok) ?? dest.find((d) => d.ok);
    if (ok) this.destinazioneEl.value = ok.id;
    this.cueEl.disabled = !ok;
  }

  codiceDaStato() {
    // il pannello del codice non si riscrive sotto le dita (solo se ha davvero il fuoco) né mentre c'è un errore da correggere
    if ((this.scrivendo && document.activeElement === this.codiceEl) || this.erroreCodice) return;
    const c = codice(this.stato);
    if (this.codiceEl.value !== c) this.codiceEl.value = c;
  }

  // La testina: la colonna che suona adesso nella cuffia (si muove solo se la prova suona).
  testina() {
    this.mettiTestina(this.colonnaOra());
  }

  // La colonna che suona in questo momento (-1 se la prova non suona): la leggono anche le luci del controller.
  colonnaOra() {
    const ciclo = this.opz.suonaOra() ? this.opz.ciclo() : null;
    if (ciclo === null || ciclo === undefined) return -1;
    const n = slot(this.stato);
    return Math.floor((((ciclo % this.stato.cicli) + this.stato.cicli) % this.stato.cicli) / this.stato.cicli * n);
  }

  mettiTestina(colonna) {
    if (colonna === this.colonna) return;
    for (const riga of this.celle) {
      riga?.[this.colonna]?.classList.remove('ora');
      riga?.[colonna]?.classList.add('ora');
    }
    this.colonna = colonna;
  }

  // --- l'X-Touch (controller-ruoli.js): cosa deve sapere e fare sulla griglia ---

  perControllo() {
    return {
      stato: () => this.stato,
      testina: () => this.colonnaOra(),
      rigaScelta: () => this.rigaScelta,
      evidenzia: (r) => this.evidenzia(r),
      passo: (r, i, vel) => this.passo(() => this.imponi(impostaPasso(this.stato, r, i, vel))),
      velocita: (r, i, vel) => this.gestoControllo(() => this.imponi(impostaPasso(this.stato, r, i, vel))),
      suono: (r, verso) => this.suonoControllo(r, verso),
      colpo: (r, vel) => this.colpo(r, vel),
    };
  }

  // Un giro di manopola: il primo registra l'annulla, i successivi (a meno di mezzo secondo) si uniscono.
  gestoControllo(fa) {
    if (!this.timerManopola) this.registra();
    clearTimeout(this.timerManopola);
    this.timerManopola = setTimeout(() => (this.timerManopola = null), 600);
    this.inGesto = true;
    fa();
    this.inGesto = false;
  }

  evidenzia(r) {
    if (r === this.rigaScelta) return;
    this.rigaScelta = r;
    this.segnaRigaScelta();
  }

  segnaRigaScelta() {
    [...this.grigliaEl.querySelectorAll('.drum-riga')].forEach((el, i) => el.classList.toggle('scelta', i === this.rigaScelta));
  }

  suonoControllo(r, verso) {
    const riga = this.stato.righe[r];
    if (riga?.tipo !== 'griglia' || !verso) return;
    const stash = Object.keys(this.opz.suoniStash?.() ?? {}).filter((k) => k !== '_base').sort((a, b) => a.localeCompare(b));
    const elenco = [...new Set([...stash, ...SUONI_STRUDEL])];
    const i = elenco.indexOf(riga.suono);
    const dopo = elenco[Math.max(0, Math.min(elenco.length - 1, (i < 0 ? 0 : i + Math.sign(verso))))];
    if (!dopo || dopo === riga.suono) return;
    this.gestoControllo(() => this.imponi(cambiaSuono(this.stato, r, dopo, '')));
    this.colpo(r, VEL_DI_SERIE, false); // si sente il suono nuovo (e non si registra)
  }

  // Un tasto del Mac giù nella batteria: una riga per tasto. Ritorna true se era uno dei nostri (da non lasciare al resto dell'app).
  tastoGiu(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || inCampoDiTesto(e.target)) return false;
    const r = TASTI_RIGHE.indexOf(e.code);
    if (r < 0) return false;
    if (!e.repeat) this.colpo(r, VEL_DI_SERIE);
    return true;
  }

  tastoSu(e) {
    return !(e.metaKey || e.ctrlKey || e.altKey || inCampoDiTesto(e.target)) && TASTI_RIGHE.includes(e.code);
  }

  // REC: un ciclo di conteggio (con il click), poi i colpi diventano passi. Un altro clic: durante il conteggio annulla, durante la registrazione ferma e tiene.
  avviaRec() {
    if (this.rec) return this.fermaRec(this.rec.fase() !== 'registra');
    if (this.opz.ciclo?.() == null) return this.avviso(T.msg.nessunTempo);
    if (!this.stato.righe.some((r) => r.tipo === 'griglia')) return this.avviso(T.msg.vuota);
    this.rec = new RegistratoreDrum({ ciclo: () => this.opz.ciclo(), cicli: this.stato.cicli, passi: slot(this.stato) });
    this.battitoClick = null;
    this.timerRec = setInterval(() => this.tickRec(), 20);
    this.avviso('');
    this.tickRec();
  }

  tickRec() {
    const r = this.rec;
    if (!r) return;
    const c = this.opz.ciclo?.();
    if (c == null) return this.fermaRec(true);
    const fase = r.fase(c);
    if (fase === 'fine') return this.fermaRec(false);
    if (fase === 'conta') {
      const b = Math.floor(c * 4);
      if (b !== this.battitoClick) {
        this.battitoClick = b;
        this.opz.click?.(b % 4 === 0);
      }
    }
    this.recEl.classList.toggle('conta', fase !== 'registra');
    this.recEl.classList.toggle('registra', fase === 'registra');
    this.recEl.firstChild.textContent = fase === 'registra' ? '● REC' : String(r.conto(c) ?? '');
  }

  fermaRec(annulla) {
    const r = this.rec;
    if (!r) return;
    clearInterval(this.timerRec);
    this.rec = null;
    this.recEl.classList.remove('conta', 'registra');
    this.recEl.firstChild.textContent = T.rec;
    if (annulla) return this.avviso(T.msg.recAnnullato);
    const passi = r.passiDaAccendere();
    if (r.passi !== slot(this.stato)) return this.avviso(T.msg.recAnnullato); // il formato è cambiato mentre registravo
    // i colpi si sommano ai passi che ci sono già (mai si spegne niente); un passo solo di ⌘Z
    this.passo(() => {
      let s = this.stato;
      for (const p of passi) {
        const riga = s.righe[p.riga];
        if (riga?.tipo === 'griglia') s = impostaPasso(s, p.riga, p.passo, Math.max(riga.vel[p.passo] || 0, p.vel));
      }
      this.imponi(s);
    });
    this.avviso(formatta(T.msg.registrati, { n: passi.length }));
  }

  // Un colpo in cuffia con il suono della riga (i pad e i tasti del Mac); durante il REC diventa anche un passo.
  colpo(r, vel, registra = true) {
    const riga = this.stato.righe[r];
    if (riga?.tipo !== 'griglia') return;
    if (registra) this.rec?.colpo(r, vel);
    this.opz.colpo?.(`s("${riga.suono}")${riga.banco ? `.bank("${riga.banco}")` : ''}`, vel);
  }

  // Le opzioni dei suoni: quelli dello stash, quelli di Strudel, e (se serve) quello già scelto che non sta in nessuna lista.
  opzioniSuoni(corrente = '') {
    const stash = Object.keys(this.opz.suoniStash?.() ?? {}).filter((k) => k !== '_base').sort((a, b) => a.localeCompare(b));
    const gruppo = (nome, voci) => {
      const g = document.createElement('optgroup');
      g.label = nome;
      for (const v of voci) g.append(new Option(v, v));
      return g;
    };
    const fuori = corrente && !stash.includes(corrente) && !SUONI_STRUDEL.includes(corrente) ? [corrente] : [];
    return [fuori.length ? gruppo(T.gruppoAltro, fuori) : null, stash.length ? gruppo(T.gruppoStash, stash) : null, gruppo(T.gruppoStrudel, SUONI_STRUDEL)].filter(Boolean);
  }

  disegna() {
    const s = this.stato;
    const n = slot(s);
    const firma = JSON.stringify([s.passi, s.cicli, s.righe.map((r) => (r.tipo === 'griglia' ? [r.suono, r.banco] : r.testo))]);
    if (firma !== this.firma) {
      this.firma = firma;
      this.ricostruisci();
    }
    s.righe.forEach((riga, r) => {
      if (riga.tipo !== 'griglia') return;
      for (let i = 0; i < n; i++) this.coloraCella(this.celle[r][i], riga.vel[i]);
    });
    this.passiEl.value = String(s.passi);
    this.cicliEl.value = String(s.cicli);
    this.aggiungiEl.disabled = s.righe.length >= RIGHE_MAX;
    this.codiceDaStato();
    if (this.attiva_) this.testina();
  }

  coloraCella(el, vel) {
    const acceso = vel > 0;
    el.classList.toggle('acceso', acceso);
    el.firstChild.style.height = acceso ? `${Math.round(vel * 100)}%` : '0%';
    el.title = acceso ? `${vel.toFixed(2)} · ${T.titoloPasso}` : T.titoloPasso;
  }

  ricostruisci() {
    const s = this.stato;
    const n = slot(s);
    this.celle = [];
    this.colonna = -1; // le celle sono nuove: la testina riparte
    const quarto = s.passi / 4;
    const righe = s.righe.map((riga, r) => {
      const el = crea('div', 'drum-riga');
      if (riga.tipo === 'testo') {
        el.classList.add('testo');
        el.append(crea('span', 'drum-capo drum-testo-capo', T.testoRiga), crea('code', 'drum-testo', riga.testo));
        this.celle.push(null);
        return el;
      }
      const capo = crea('div', 'drum-capo');
      const sel = crea('select', 'drum-select drum-suono');
      sel.setAttribute('aria-label', T.sceltaSuono);
      sel.append(...this.opzioniSuoni(riga.suono));
      sel.value = riga.suono;
      sel.onchange = () => this.passo(() => this.imponi(cambiaSuono(this.stato, r, sel.value, riga.banco)));
      const togli = crea('button', 'drum-togli', '×');
      togli.title = T.togli;
      togli.setAttribute('aria-label', T.togli);
      togli.onclick = () => this.passo(() => this.imponi(togliRiga(this.stato, r)));
      const lettera = TASTI_RIGHE[r] ? crea('span', 'drum-tasto', LETTERA(TASTI_RIGHE[r])) : null;
      if (lettera) lettera.title = T.tastoRiga;
      capo.append(...(lettera ? [lettera] : []), sel, togli);
      const passi = crea('div', 'drum-passi');
      passi.style.setProperty('--n', String(n));
      const celle = [];
      for (let i = 0; i < n; i++) {
        const c = crea('button', 'drum-passo');
        c.dataset.r = String(r);
        c.dataset.i = String(i);
        c.tabIndex = -1;
        c.append(crea('i'));
        if (i % quarto === 0) c.classList.add('quarto');
        if (i % s.passi === 0) c.classList.add('ciclo');
        celle.push(c);
        passi.append(c);
      }
      this.celle.push(celle);
      el.append(capo, passi);
      return el;
    });
    if (!righe.length) righe.push(crea('p', 'drum-vuoto', T.msg.vuota));
    this.grigliaEl.replaceChildren(...righe);
    this.segnaRigaScelta();
    // le opzioni del menu «+ suono»
    this.aggiungiEl.replaceChildren(new Option(T.nuovaRiga, ''), ...this.opzioniSuoni());
    this.aggiungiEl.value = '';
  }
}
