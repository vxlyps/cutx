// Il pannello di importazione da Ableton: scelgo cosa portare in CUTX e vedo il brano che ne esce.
// La conversione è in ../ableton/converti.js (pura): qui si sceglie, si ascolta in cuffia e si mostrano
// i limiti. Un progetto non si modifica mai; i file audio si copiano nello stash (passo 6).
import it from './testi/it.json';
import { NOMI_SYNTH, converti, costruisci, sceltePredefinite } from '../ableton/converti.js';

const $ = (id) => document.getElementById(id);
const oggi = () => new Date().toLocaleDateString('sv-SE');

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

function segmenti(voci, scelto, cambia) {
  const g = crea('div', 'segmenti');
  for (const [valore, etichetta] of voci) {
    const b = crea('button', `key${valore === scelto ? ' on' : ''}`, etichetta);
    b.onclick = () => cambia(valore);
    g.append(b);
  }
  return g;
}

const battuteTesto = (n) => `${n} ${n === 1 ? 'battuta' : 'battute'}`;

export class Importa {
  // azioni: { provaInCuffia(codice, chiave), ferma(), inAscolto(chiave), registraSuoni(mappa), importa(risultato), avviso(testo) }
  constructor(azioni) {
    this.azioni = azioni;
    this.progetto = null;
    this.modello = null;
    this.ascoltando = null;
    $('importa-chiudi').onclick = () => this.chiudi();
    $('importa-annulla').onclick = () => this.chiudi();
    $('importa-vai').onclick = () => this.importa();
    $('importa-titolo').onchange = (e) => {
      this.titolo = e.target.value.trim() || this.titolo;
      this.disegna();
    };
    $('importa-limiti').textContent = it.importa.limiti;
  }

  get aperto() {
    return !$('importa').hidden;
  }

  async apri(progetto) {
    this.progetto = progetto;
    this.modello = null;
    $('importa').hidden = false;
    $('importa-nome').textContent = progetto.nome;
    $('importa-dati').textContent = 'leggo il progetto…';
    $('importa-tracce').replaceChildren();
    $('importa-sezioni').replaceChildren();
    const r = await window.cutx.modelloAbleton(progetto.percorso);
    if (r.errore) {
      $('importa-dati').textContent = `non riesco a leggerlo: ${r.errore}`;
      return;
    }
    this.modello = r.modello;
    this.scelte = sceltePredefinite(this.modello);
    this.titolo = progetto.nome.replace(/\s+/g, ' ').trim().toLowerCase().replace(/[^a-z0-9àèéìòù ]+/g, '').trim() || 'brano';
    this.files = new Map(); // chiave del file → { percorso | null, id | null }
    await this.trovaFile();
    this.disegna();
  }

  chiudi() {
    if (this.ascoltando) this.azioni.ferma();
    this.ascoltando = null;
    $('importa').hidden = true;
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

  // La conversione con le scelte di adesso. `anteprima` serve per ascoltare: i suoni hanno nomi provvisori.
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
    const m = this.modello;
    $('importa-dati').textContent = `${Math.round(m.bpm * 10) / 10} bpm · ${battuteTesto(m.battute)} · ${m.tracce.length} tracce · ${m.versione}`;
    $('importa-titolo').value = this.titolo;
    const c = this.conversione();
    const scroll = [$('importa-tracce').scrollTop, $('importa-sezioni').scrollTop];
    this.disegnaTracce();
    this.disegnaSezioni(c);
    $('importa-tracce').scrollTop = scroll[0];
    $('importa-sezioni').scrollTop = scroll[1];
  }

  sceltaTraccia(t) {
    return this.scelte.tracce[t.ordine];
  }

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
      testa.append(crea('span', 'traccia-nome', t.numero !== null ? `${t.numero} · ${t.nome.replace(/^\d+-/, '')}` : t.nome));
      testa.append(crea('span', 'etichetta', t.drum ? 'batteria' : t.tipo === 'midi' ? 'midi' : 'audio'));
      const strumento = t.strumento ? `${t.strumento.tipo}${t.strumento.nome ? ` · ${t.strumento.nome}` : ''}` : '';
      if (strumento) testa.append(crea('span', 'lbl strumento', strumento));
      testa.append(crea('div', 'spazio'));
      if (t.tipo === 'midi') {
        testa.append(segmenti([['codice', 'codice'], ['audio', 'audio']], sc.modalita, (v) => ((sc.modalita = v), this.disegna())));
        if (sc.modalita === 'codice' && !t.drum) {
          const sel = crea('select', 'synth');
          for (const n of NOMI_SYNTH) sel.add(new Option(n === 'synth' ? 'synth' : n, n));
          sel.value = sc.synth;
          sel.dataset.aiuto = 'importa-synth';
          sel.onchange = () => ((sc.synth = sel.value), this.disegna());
          testa.append(sel);
        } else if (sc.modalita === 'codice') testa.append(crea('span', 'lbl', 'batteria sintetica'));
      } else testa.append(crea('span', 'lbl', 'i file audio del progetto'));
      riga.append(testa);
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
    r.append(da, crea('p', 'secondario stem-nota', it.importa.stem));
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

  // ▶ in cuffia: la sezione col tempo del progetto, i suoni dal file originale.
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
    // parte subito, suona una volta e si ferma da sola quando finisce (cicli per il codice, secondi del buffer per l'audio)
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

  disegnaSezioni(c) {
    const lista = $('importa-sezioni');
    lista.replaceChildren();
    $('importa-conteggio').textContent = `${c.sezioni.length} ${c.sezioni.length === 1 ? 'sezione' : 'sezioni'}`;
    c.sezioni.forEach((s, i) => {
      const r = crea('div', 'sezione-riga');
      r.append(crea('span', 'lbl numero-sezione', String(i + 1)));
      const nome = crea('input', 'nome-sezione');
      nome.value = s.nome;
      nome.spellcheck = false;
      nome.setAttribute('aria-label', `nome della sezione ${i + 1}`);
      nome.onchange = () => {
        const v = nome.value.trim();
        const sc = this.scelte.tracce[s.traccia].varianti[s.id];
        sc.nome = v && v !== s.etichetta ? v : '';
        this.disegna();
      };
      r.append(nome);
      r.append(crea('span', 'lbl', s.tipo === 'audio' ? 'audio' : this.scelte.tracce[s.traccia].modalita === 'audio' && this.scelte.tracce[s.traccia].stem ? 'stem' : 'codice'));
      lista.append(r);
      for (const a of s.avvisi) lista.append(crea('p', 'avviso-sezione', a));
    });
    if (!c.sezioni.length) lista.append(crea('p', 'secondario', 'niente da importare: spunta almeno una traccia'));

    // file che mancano
    const mancanti = this.fileMancanti(c.sezioni);
    const box = $('importa-mancanti');
    box.replaceChildren();
    box.hidden = !mancanti.length;
    if (mancanti.length) {
      box.append(crea('h2', 'lbl', `${mancanti.length} ${mancanti.length === 1 ? 'file mancante' : 'file mancanti'}`), crea('p', 'secondario', it.importa.mancanti));
      for (const f of mancanti) {
        const riga = crea('div', 'mancante');
        const t = crea('div', 'imp-testo');
        t.append(crea('span', '', (f.relativo || f.assoluto).split('/').pop()), crea('span', 'imp-nota', f.assoluto || f.relativo));
        const cerca = crea('button', 'key piccolo', 'cerca…');
        cerca.onclick = async () => {
          const r = await window.cutx.scegliFileAbleton(`Dov'è ${(f.relativo || f.assoluto).split('/').pop()}?`);
          if (!r) return;
          if (r.errore) return this.azioni.avviso(r.errore);
          this.files.set(f.relativo || f.assoluto, { percorso: r.percorso, id: r.id, dimensione: r.dimensione, wav: r.wav, manuale: true });
          this.disegna();
        };
        riga.append(t, cerca);
        box.append(riga);
      }
    }
    // file pesanti: sopra i 50 MB si dice quanto pesano e perché
    const mb = (n) => `${Math.round(n / 1e5) / 10} MB`;
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
        t.append(crea('span', '', (x.relativo || x.assoluto).split('/').pop()), crea('span', 'imp-nota', nota));
        riga.append(t, crea('span', 'lbl peso', mb(x.peso)));
        boxGrandi.append(riga);
      }
    }
    const ritagliati = c.suoni.filter((x) => x.ritaglio);
    const risparmio = ritagliati.reduce((n, x) => n + (x.dimensione - x.peso), 0);
    const avvisi = c.avvisi.length + mancanti.length;
    $('importa-riepilogo').textContent =
      `${c.sezioni.length} sezioni · ${c.suoni.length} ${c.suoni.length === 1 ? 'suono' : 'suoni'} da copiare` +
      (ritagliati.length ? ` (${ritagliati.length} ritagliati, −${mb(risparmio)})` : '') +
      (avvisi ? ` · ${avvisi} ${avvisi === 1 ? 'avviso' : 'avvisi'}` : '');
    $('importa-vai').disabled = !c.sezioni.length;
    this.ultima = c;
  }

  // Il risultato da scrivere nello stash (passo 6): il testo del brano e, per ogni suono, il file da copiare.
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
