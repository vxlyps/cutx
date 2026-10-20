// Il pannello di importazione da Ableton, in tre passi: 1 progetto, 2 tracce, 3 importa.
// La conversione è in ../ableton/converti.js (pura): qui si sceglie, si ascolta in cuffia e si mostrano
// i limiti. Un progetto non si modifica mai; i file audio si copiano nello stash.
import it from './testi/it.json';
import { NOMI_SYNTH, converti, costruisci, fileDellaTraccia, nomeTraccia, sceltePredefinite } from '../ableton/converti.js';

const T = it.importa;
const $ = (id) => document.getElementById(id);
const oggi = () => new Date().toLocaleDateString('sv-SE');
const compila = (testo, valori) => testo.replace(/\{(\w+)\}/g, (_, k) => valori[k] ?? '');
const mb = (n) => `${Math.round(n / 1e5) / 10} MB`;
const nomeFile = (f) => (f.relativo || f.assoluto).split('/').pop();

function crea(tag, classe, testo) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
}

function casella(acceso, cambia, aiuto = 'importa-casella') {
  const b = crea('button', `casella${acceso ? ' on' : ''}`, acceso ? '✓' : '');
  b.dataset.aiuto = aiuto;
  b.setAttribute('role', 'checkbox');
  b.setAttribute('aria-checked', String(acceso));
  b.onclick = () => cambia(!acceso);
  return b;
}

const battuteTesto = (n) => `${n} ${n === 1 ? 'battuta' : 'battute'}`;

export class Importa {
  // azioni: { provaInCuffia(codice, chiave, anteprima), ferma(), inAscolto(chiave), registraSuoni(mappa), importa(risultato), avviso(testo) }
  constructor(azioni) {
    this.azioni = azioni;
    this.progetto = null;
    this.modello = null;
    this.ascoltando = null;
    this.passo = 1;
    this.aperte = new Set(); // sezioni con il codice aperto (passo 3)
    $('importa-chiudi').onclick = () => this.chiudi();
    $('importa-annulla').onclick = () => this.chiudi();
    $('importa-indietro').onclick = () => this.vai(this.passo - 1);
    $('importa-avanti').onclick = () => this.vai(this.passo + 1);
    $('importa-vai').onclick = () => this.importa();
    for (const b of document.querySelectorAll('#importa-passi .passo')) {
      b.dataset.aiuto = 'importa-passo';
      b.onclick = () => this.modello && this.vai(Number(b.dataset.passo));
    }
    $('importa-titolo').onchange = (e) => {
      this.titolo = e.target.value.trim() || this.titolo;
      this.disegna();
    };
    $('importa-limiti').textContent = T.limiti;
  }

  get aperto() {
    return !$('importa').hidden;
  }

  async apri(progetto) {
    this.progetto = progetto;
    this.modello = null;
    this.passo = 1;
    this.aperte.clear();
    $('importa').hidden = false;
    $('importa-nome').textContent = progetto.nome;
    this.mostraPasso();
    $('importa-progetto').replaceChildren(crea('p', 'secondario', 'leggo il progetto…'));
    $('importa-tracce').replaceChildren();
    $('importa-sezioni').replaceChildren();
    $('importa-mancanti').hidden = true;
    const r = await window.cutx.modelloAbleton(progetto.percorso);
    if (r.errore) {
      $('importa-progetto').replaceChildren(crea('p', 'avviso-sezione', `non riesco a leggerlo: ${r.errore}`));
      return;
    }
    this.modello = r.modello;
    this.scelte = sceltePredefinite(this.modello);
    this.titolo = progetto.nome.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[^a-z0-9àèéìòù ]+/g, '').trim() || 'brano';
    this.files = new Map(); // chiave del file → { percorso | null, id | null, dimensione, wav }
    await this.trovaFile();
    this.disegna();
  }

  chiudi() {
    if (this.ascoltando) this.azioni.ferma();
    this.ascoltando = null;
    $('importa').hidden = true;
  }

  vai(n) {
    this.passo = Math.max(1, Math.min(3, n));
    if (this.ascoltando && this.passo !== 2) {
      this.azioni.ferma();
      this.ascoltando = null;
    }
    this.mostraPasso();
    this.disegna();
  }

  // Quale pagina si vede, e i pulsanti del piede.
  mostraPasso() {
    for (const pag of document.querySelectorAll('.importa-pagina')) pag.hidden = Number(pag.dataset.passo) !== this.passo;
    for (const b of document.querySelectorAll('#importa-passi .passo')) {
      const n = Number(b.dataset.passo);
      b.classList.toggle('on', n === this.passo);
      b.classList.toggle('fatto', n < this.passo);
    }
    $('importa-annulla').hidden = this.passo !== 1;
    $('importa-indietro').hidden = this.passo === 1;
    $('importa-avanti').hidden = this.passo === 3;
    $('importa-vai').hidden = this.passo !== 3;
  }

  // Dove stanno davvero i file audio del progetto (e quindi quali mancano).
  async trovaFile() {
    const visti = new Map();
    for (const t of this.modello.tracce) for (const c of t.clip) if (c.tipo === 'audio') visti.set(c.file.relativo || c.file.assoluto, { relativo: c.file.relativo, assoluto: c.file.assoluto });
    const r = await window.cutx.fileAbleton(this.progetto.percorso, [...visti.values()]);
    for (const f of r.file ?? []) this.files.set(f.chiave, { percorso: f.percorso, id: f.id, dimensione: f.dimensione, wav: f.wav });
  }

  // I file che servono a qualcosa e non ci sono.
  fileMancanti(sezioni) {
    const mancanti = new Map();
    for (const s of sezioni) {
      for (const suono of s.suoniInfo ?? []) {
        const chiave = suono.relativo || suono.assoluto;
        if (!this.files.get(chiave)?.percorso) mancanti.set(chiave, suono);
      }
    }
    return [...mancanti.values()];
  }

  // Di ogni file: quanto pesa e se si può ritagliare (solo i WAV che ci sono).
  infoFile() {
    const info = {};
    for (const [chiave, f] of this.files) if (f.percorso && f.dimensione) info[chiave] = { dimensione: f.dimensione, taglia: !!f.wav };
    return info;
  }

  conversione() {
    const c = converti(this.modello, this.scelte, { titolo: this.titolo, data: oggi(), origine: this.progetto.percorso, file: this.infoFile() });
    // ogni sezione sa quali file usa (per i mancanti)
    const perNome = new Map(c.suoni.map((s) => [s.nome, s]));
    for (const s of c.sezioni) s.suoniInfo = s.suoni.map((n) => perNome.get(n)).filter(Boolean);
    return c;
  }

  // --- disegno ---

  disegna() {
    if (!this.modello) return;
    const c = this.conversione();
    const scroll = Object.fromEntries([...document.querySelectorAll('.importa-pagina')].map((p) => [p.id, p.scrollTop]));
    this.disegnaProgetto(c);
    this.disegnaTracce();
    this.disegnaSezioni(c);
    this.disegnaMancanti(c);
    for (const p of document.querySelectorAll('.importa-pagina')) p.scrollTop = scroll[p.id] ?? 0;
    $('importa-titolo').value = this.titolo;
    $('importa-vai').disabled = !c.sezioni.length;
    $('importa-avanti').disabled = false;
    this.ultima = c;
  }

  // Passo 1: che progetto è e cosa succederà.
  disegnaProgetto(c) {
    const m = this.modello;
    const box = $('importa-progetto');
    box.replaceChildren();
    const dati = crea('div', 'progetto-dati');
    const voce = (etichetta, valore) => {
      const r = crea('div', 'progetto-voce');
      r.append(crea('span', 'lbl', etichetta), crea('span', 'progetto-valore', valore));
      dati.append(r);
    };
    const batterie = m.tracce.filter((t) => t.drum).length;
    const midi = m.tracce.filter((t) => t.tipo === 'midi' && !t.drum).length;
    const audio = m.tracce.filter((t) => t.tipo === 'audio').length;
    voce('tempo', `${Math.round(m.bpm * 10) / 10} bpm`);
    voce('lunghezza', battuteTesto(m.battute));
    voce('tracce', [`${m.tracce.length} in tutto`, midi && `${midi} midi`, batterie && `${batterie} batteria`, audio && `${audio} audio`].filter(Boolean).join(' · '));
    const trovati = [...this.files.values()].filter((f) => f.percorso).length;
    const totale = this.files.size;
    voce('file audio', totale ? `${totale} · ${trovati} trovati${trovati < totale ? ` · ${totale - trovati} mancanti` : ''}` : 'nessuno');
    voce('creato con', m.versione || '—');
    box.append(dati);
    box.append(crea('p', 'importa-cosa', T.cosaSuccede));
    const avanti = crea('p', 'secondario importa-intro', 'Nel prossimo passo scegli le tracce da portare.');
    box.append(avanti);
  }

  sceltaTraccia(t) {
    return this.scelte.tracce[t.ordine];
  }

  // Una riga che dice cosa succede con la scelta fatta.
  effetto(t, sc) {
    if (t.tipo === 'audio') return T.effettoAudio;
    if (sc.modalita === 'audio') return sc.stem ? compila(T.effettoStem, { stem: sc.stem.file.assoluto.split('/').pop(), battuta: sc.stem.battuta ?? 1 }) : T.effettoSenzaStem;
    return t.drum ? T.effettoBatteria : compila(T.effettoCodice, { synth: sc.synth });
  }

  // Passo 2: le tracce.
  disegnaTracce() {
    const lista = $('importa-tracce');
    lista.replaceChildren();
    const ant = costruisci(this.modello, this.scelte, { titolo: this.titolo, anteprima: true });
    this.provvisoriRecenti = ant.provvisori;
    for (const t of this.modello.tracce) {
      const sc = this.sceltaTraccia(t);
      const varianti = ant.sezioni.filter((s) => s.traccia === t.ordine);
      if (!varianti.length) continue; // una traccia senza clip con qualcosa dentro non c'è da scegliere
      const riga = crea('article', `traccia${sc.includi ? '' : ' spenta'}`);
      const testa = crea('div', 'traccia-testa');
      testa.append(casella(sc.includi, (v) => ((sc.includi = v), this.disegna())));
      testa.append(crea('span', 'traccia-nome', nomeTraccia(t)));
      if (t.numero !== null) testa.append(crea('span', 'lbl', `traccia ${t.numero}`));
      testa.append(crea('span', 'etichetta', t.drum ? 'batteria' : t.tipo === 'midi' ? 'midi' : 'audio'));
      const strumento = t.strumento ? `${t.strumento.tipo}${t.strumento.nome ? ` · ${t.strumento.nome}` : ''}` : '';
      if (strumento) testa.append(crea('span', 'lbl strumento', strumento));
      riga.append(testa);

      // come entra in CUTX: due scelte con parole normali (per l'audio ce n'è una sola)
      const modi = crea('div', 'traccia-modi');
      if (t.tipo === 'midi') {
        for (const [valore, testo] of [['codice', T.modoCodice], ['audio', T.modoAudio]]) {
          const b = crea('button', `modo${sc.modalita === valore ? ' on' : ''}`, testo);
          b.dataset.modo = valore;
          b.setAttribute('aria-pressed', String(sc.modalita === valore));
          b.onclick = () => ((sc.modalita = valore), this.disegna());
          modi.append(b);
        }
        if (sc.modalita === 'codice' && !t.drum) {
          const sel = crea('select', 'synth');
          for (const n of NOMI_SYNTH) sel.add(new Option(n, n));
          sel.value = sc.synth;
          sel.dataset.aiuto = 'importa-synth';
          sel.onchange = () => ((sc.synth = sel.value), this.disegna());
          modi.append(sel);
        }
      } else modi.append(crea('span', 'modo-testo', T.modoAudio)); // una sola possibilità: non è un pulsante
      riga.append(modi, crea('p', 'traccia-effetto', this.effetto(t, sc)));
      if (t.tipo === 'audio') {
        // il nome dei file che usa: a volte è l'unica cosa che dice cos'è
        const file = fileDellaTraccia(t);
        const mostra = file.slice(0, 3).join(' · ') + (file.length > 3 ? ` · +${file.length - 3}` : '');
        const f = crea('p', 'traccia-file', `file: ${mostra}`);
        f.title = file.join('\n');
        riga.append(f);
      }
      if (t.tipo === 'midi' && sc.modalita === 'audio') riga.append(this.rigaStem(t, sc));
      for (const v of varianti) riga.append(this.rigaVariante(t, sc, v));
      lista.append(riga);
    }
  }

  // Uno stem esportato da Ableton per una traccia MIDI.
  rigaStem(t, sc) {
    const r = crea('div', 'stem-riga');
    const stem = sc.stem;
    const nome = stem ? stem.file.assoluto.split('/').pop() : 'nessuno stem';
    r.append(crea('span', 'lbl', 'stem'), crea('span', stem ? 'stem-nome' : 'stem-nome vuoto', nome));
    const scegli = crea('button', 'key piccolo', stem ? 'cambia' : 'scegli…');
    scegli.onclick = async () => {
      const f = await window.cutx.scegliFileAbleton(`Lo stem di ${t.nome.replace(/^\d+-/, '')}, esportato da Ableton`);
      if (!f) return;
      if (f.errore) return this.azioni.avviso(f.errore);
      this.files.set(f.percorso, { percorso: f.percorso, id: f.id, dimensione: f.dimensione, wav: f.wav });
      sc.stem = { file: { relativo: '', assoluto: f.percorso, durata: f.durata ?? 0 }, battuta: stem?.battuta ?? 1 };
      if (!f.durata) this.azioni.avviso('di questo formato non so la durata: usa un WAV');
      this.disegna();
    };
    r.append(scegli);
    const da = crea('label', 'stem-da');
    da.append(crea('span', 'lbl', 'lo stem parte dalla battuta'));
    const n = crea('input');
    n.type = 'number';
    n.min = '1';
    n.step = '1';
    n.value = String(stem?.battuta ?? 1);
    n.disabled = !stem;
    n.onchange = () => {
      sc.stem.battuta = Math.max(1, Math.round(Number(n.value) || 1));
      this.disegna();
    };
    da.append(n);
    r.append(da, crea('p', 'secondario stem-nota', T.stem));
    return r;
  }

  rigaVariante(t, sc, v) {
    const r = crea('div', `variante-riga${v.incluso ? '' : ' spenta'}`);
    const inclusa = sc.varianti[v.id]?.includi !== false;
    r.append(casella(inclusa, (x) => ((sc.varianti[v.id].includi = x), this.disegna())));
    r.append(crea('span', 'variante-nome', v.sigla));
    const dove = v.inizio !== null ? `dalla battuta ${Math.floor(v.inizio / 4) + 1}` : `solo Session, scena ${(v.scena ?? 0) + 1}`;
    r.append(crea('span', 'lbl', `${battuteTesto(v.battute)} · ${v.usi}× · ${dove}`));
    const mancante = v.tipo === 'audio' && v.suoni.some((n) => !this.fileDelProvvisorio(n));
    if (mancante) r.append(crea('span', 'lbl manca', 'file mancante'));
    r.append(crea('div', 'spazio'));
    const suona = this.ascoltando === v.id && this.azioni.inAscolto(`ableton:${v.id}`);
    const b = crea('button', `key piccolo${suona ? ' on' : ''}`, suona ? '■' : '▶');
    b.dataset.aiuto = suona ? 'browser-ferma' : 'browser-prova';
    b.disabled = mancante;
    b.onclick = () => this.prova(v.id);
    r.append(b);
    return r;
  }

  // Il file dietro a un suono provvisorio (ant_…), se c'è.
  fileDelProvvisorio(nome) {
    const ant = this.provvisoriRecenti ?? [];
    const p = ant.find((x) => x.nome === nome);
    return p ? this.files.get(p.relativo || p.assoluto)?.percorso : true;
  }

  // ▶ in cuffia: parte subito, la sezione col tempo del progetto, i suoni dal file originale.
  async prova(id) {
    if (this.ascoltando === id && this.azioni.inAscolto(`ableton:${id}`)) {
      this.ascoltando = null;
      this.azioni.ferma();
      return this.disegna();
    }
    const ant = costruisci(this.modello, this.scelte, { titolo: this.titolo, anteprima: true });
    const s = ant.sezioni.find((x) => x.id === id);
    if (!s) return;
    const mappa = {};
    for (const p of ant.provvisori.filter((x) => s.suoni.includes(x.nome))) {
      const f = this.files.get(p.relativo || p.assoluto);
      if (!f?.id) return this.azioni.avviso('manca il file audio di questa sezione');
      mappa[p.nome] = [`cutx://app/anteprima/${f.id}`];
    }
    if (Object.keys(mappa).length) await this.azioni.registraSuoni(mappa);
    this.ascoltando = id;
    // suona una volta e si ferma da sola quando finisce (cicli per il codice, secondi del buffer per l'audio)
    this.azioni.provaInCuffia(`setcpm(${this.modello.bpm}/4)\n${s.codice}`, `ableton:${id}`, { cicli: s.battute, audioS: s.durataS ?? 0 });
    this.disegna();
  }

  // Se la cuffia ha smesso di suonare l'anteprima, il tasto torna ▶.
  aggiornaAscolto() {
    if (this.aperto && this.ascoltando && !this.azioni.inAscolto(`ableton:${this.ascoltando}`)) {
      this.ascoltando = null;
      this.disegna();
    }
  }

  // Passo 3: il brano che esce.
  disegnaSezioni(c) {
    const lista = $('importa-sezioni');
    lista.replaceChildren();
    $('importa-conteggio').textContent = `${c.sezioni.length} ${c.sezioni.length === 1 ? 'sezione' : 'sezioni'}`;
    c.sezioni.forEach((s, i) => {
      const r = crea('div', 'sezione-riga');
      r.append(crea('span', 'lbl numero-sezione', String(i + 1)));
      const sc = this.scelte.tracce[s.traccia];
      // il tipo è un'etichetta, staccata dai pulsanti: non si clicca e non cambia niente
      r.append(crea('span', 'etichetta tipo-sezione', s.tipo === 'audio' ? 'audio' : sc.modalita === 'audio' && sc.stem ? 'stem' : 'codice'));
      const nome = crea('input', 'nome-sezione');
      nome.value = s.nome;
      nome.spellcheck = false;
      nome.setAttribute('aria-label', `nome della sezione ${i + 1}`);
      nome.onchange = () => {
        const v = nome.value.trim();
        const sv = this.scelte.tracce[s.traccia].varianti[s.id];
        sv.nome = v && v !== s.etichetta ? v : '';
        this.disegna();
      };
      r.append(nome);
      const aperta = this.aperte.has(s.id);
      const apri = crea('button', 'key piccolo apri-codice', aperta ? 'chiudi codice ▴' : 'vedi codice ▾');
      apri.setAttribute('aria-expanded', String(aperta));
      apri.onclick = () => (this.aperte.has(s.id) ? this.aperte.delete(s.id) : this.aperte.add(s.id), this.disegna());
      r.append(apri);
      lista.append(r);
      if (aperta) lista.append(crea('pre', 'sezione-codice', s.codice));
      for (const a of s.avvisi) lista.append(crea('p', 'avviso-sezione', a));
    });
    if (!c.sezioni.length) lista.append(crea('p', 'secondario', 'niente da importare: nel passo 2 spunta almeno una traccia'));

    // file pesanti: sopra i 50 MB si dice quanto pesano e perché
    const grandi = c.suoni.filter((x) => x.peso !== null && x.peso > 50e6);
    const boxGrandi = $('importa-grandi');
    boxGrandi.replaceChildren();
    boxGrandi.hidden = !grandi.length;
    if (grandi.length) {
      boxGrandi.append(crea('h2', 'lbl', `${grandi.length} ${grandi.length === 1 ? 'file pesante' : 'file pesanti'} (sopra 50 MB)`));
      for (const x of grandi) {
        const usato = x.uso && x.durata ? Math.round((100 * (x.uso.max - x.uso.min)) / x.durata) : null;
        const nota = x.ritaglio
          ? `ritagliato: da ${mb(x.dimensione)} a ${mb(x.peso)}`
          : x.dimensione && usato !== null && this.files.get(x.relativo || x.assoluto)?.wav
            ? `si usa il ${usato}% del file: ritagliarlo non serve`
            : 'non è un WAV: CUTX lo copia intero';
        const riga = crea('div', 'mancante');
        const t = crea('div', 'imp-testo');
        t.append(crea('span', '', nomeFile(x)), crea('span', 'imp-nota', nota));
        riga.append(t, crea('span', 'lbl peso', mb(x.peso)));
        boxGrandi.append(riga);
      }
    }
    const ritagliati = c.suoni.filter((x) => x.ritaglio);
    const risparmio = ritagliati.reduce((n, x) => n + (x.dimensione - x.peso), 0);
    const avvisi = c.avvisi.length;
    $('importa-riepilogo').textContent =
      `${c.sezioni.length} sezioni · ${c.suoni.length} ${c.suoni.length === 1 ? 'suono' : 'suoni'} da copiare` +
      (ritagliati.length ? ` (${ritagliati.length} ritagliati, −${mb(risparmio)})` : '') +
      (avvisi ? ` · ${avvisi} ${avvisi === 1 ? 'avviso' : 'avvisi'}` : '');
  }

  // In cima, su ogni passo: i file che servono e non ci sono, ognuno con "cerca…", e il consiglio di Ableton.
  disegnaMancanti(c) {
    const mancanti = this.fileMancanti(c.sezioni);
    const box = $('importa-mancanti');
    box.replaceChildren();
    box.hidden = !mancanti.length;
    if (!mancanti.length) return;
    box.append(crea('h2', 'lbl', `${mancanti.length} ${mancanti.length === 1 ? 'file mancante' : 'file mancanti'}`));
    box.append(crea('p', 'secondario', T.mancanti));
    const consiglio = crea('p', 'consiglio', 'In Ableton: File → Raccogli tutto e salva');
    box.append(consiglio);
    for (const f of mancanti) {
      const riga = crea('div', 'mancante');
      const t = crea('div', 'imp-testo');
      t.append(crea('span', '', nomeFile(f)), crea('span', 'imp-nota', f.assoluto || f.relativo));
      const cerca = crea('button', 'key piccolo', 'cerca…');
      cerca.onclick = async () => {
        const r = await window.cutx.scegliFileAbleton(`Dov'è ${nomeFile(f)}?`);
        if (!r) return;
        if (r.errore) return this.azioni.avviso(r.errore);
        this.files.set(f.relativo || f.assoluto, { percorso: r.percorso, id: r.id, dimensione: r.dimensione, wav: r.wav, manuale: true });
        this.disegna();
      };
      riga.append(t, cerca);
      box.append(riga);
    }
  }

  // Il risultato da scrivere nello stash: il testo del brano e, per ogni suono, il file da copiare.
  risultato() {
    const c = this.conversione();
    return {
      titolo: this.titolo,
      testo: c.testo,
      sezioni: c.sezioni.length,
      suoni: c.suoni.map((s) => ({ nome: s.nome, percorso: this.files.get(s.relativo || s.assoluto)?.percorso ?? null, originale: s.relativo || s.assoluto, ritaglio: s.ritaglio, peso: s.peso })),
      avvisi: c.avvisi,
    };
  }

  async importa() {
    if (this.ascoltando) this.azioni.ferma();
    this.ascoltando = null;
    const fatto = await this.azioni.importa(this.risultato());
    if (fatto) this.chiudi();
  }
}
