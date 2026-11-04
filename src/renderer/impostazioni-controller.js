// Impostazioni → controller: lo stato (collegato, modalità), il monitor in diretta, la prova delle luci e la calibrazione dei tasti.
// Resta per sempre: serve a capire in un colpo d'occhio cosa vede CUTX del controller.
const $ = (id) => document.getElementById(id);
const crea = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};

import { EFFETTI_FADER } from './controller-mappa.js';
import it from './testi/it.json';
import { NOMI_TASTI } from './controller-mc.js';

const RIGHE = 14; // quante righe tiene il monitor

export class PaginaController {
  constructor(controller) {
    this.c = controller;
    this.righe = [];
    this.stato = '';
    this.disegnato = false;
    controller.quandoCambia(() => this.disegna());
    controller.suMonitor = (testo, grezzo) => this.riga(testo, grezzo);
    this.disegna();
    this.disegnaMappa();
  }

  // il monitor: l'ultima riga in alto; le manopole che girano si fondono in una riga sola
  riga(testo, grezzo) {
    const prima = this.righe[0];
    const manopola = /^manopola (\d) → ([+-]\d+)$/.exec(testo);
    const precedente = prima && /^manopola (\d) → ([+-]\d+)$/.exec(prima.testo);
    if (manopola && precedente && manopola[1] === precedente[1] && Date.now() - prima.quando < 400) {
      const somma = Number(precedente[2]) + Number(manopola[2]);
      prima.testo = `manopola ${manopola[1]} → ${somma > 0 ? '+' : ''}${somma}`;
      prima.grezzo = grezzo;
      prima.quando = Date.now();
    } else {
      this.righe.unshift({ testo, grezzo, quando: Date.now() });
      this.righe.length = Math.min(this.righe.length, RIGHE);
    }
    if (!this.pronto) {
      this.pronto = true;
      requestAnimationFrame(() => {
        this.pronto = false;
        this.disegnaMonitor();
      });
    }
  }

  disegnaMonitor() {
    const m = $('ctl-monitor');
    if (!m) return;
    m.replaceChildren(
      ...(this.righe.length
        ? this.righe.map((r) => {
            const riga = crea('div', 'riga');
            riga.append(crea('span', '', r.testo), crea('small', '', r.grezzo));
            return riga;
          })
        : [crea('span', 'lbl', 'niente ancora: gira una manopola o premi un tasto')]),
    );
  }

  disegna() {
    const c = this.c;
    const stato = $('ctl-stato');
    const riga = (testo, valore, classe = '') => {
      const r = crea('div', 'ctl-stato-riga');
      r.append(crea('span', 'lbl', testo), crea('span', classe, valore));
      return r;
    };
    const voci = [
      riga('controller', c.collegato ? `collegato · ${c.nomePorta}` : 'non collegato', c.collegato ? 'ok' : ''),
      riga('modalità', c.modo === 'MC' ? 'MC (Mackie) · è quella giusta' : c.modo === 'standard' ? 'standard · NON va bene' : c.collegato ? 'non so ancora: gira una manopola' : '–', c.modo === 'MC' ? 'ok' : ''),
      riga('pagina', `${c.pagina} · ${c.pagina === 'A' ? 'suona' : 'scolpisci'} (tasti layer A e B)`),
    ];
    if (c.modo === 'standard') {
      const istruzioni = crea('div', 'ctl-istruzioni');
      istruzioni.append(
        crea('p', '', 'Il controller è in modalità standard e CUTX lo vuole in MC. Per rimetterlo:'),
        crea('p', '', '1. scollega il cavo USB;'),
        crea('p', '', '2. tieni premuto il tasto MC (in basso a sinistra, sotto la prima manopola);'),
        crea('p', '', '3. ricollega l\'USB tenendolo premuto, e rilascialo quando la lucina MC MODE (ambra) resta accesa fissa.'),
        crea('p', '', 'Il modo si ricorda anche dopo aver scollegato. Il tasto qui sotto prova a rimetterlo in MC dal computer.'),
      );
      voci.push(istruzioni);
    }
    const prova = crea('button', 'key', 'chiedigli di passare a MC');
    prova.disabled = !c.collegato;
    prova.onclick = () => c.passaAMC();
    voci.push(prova);
    stato.replaceChildren(...voci);

    // l'effetto del fader: uno solo, in tutte e due le pagine
    const fader = $('ctl-fader');
    const rigaFader = crea('div', 'imp-riga');
    const testoFader = crea('div', 'imp-testo');
    testoFader.append(crea('span', '', 'fader'), crea('span', 'imp-nota', `${EFFETTI_FADER[c.effettoFader()].descrizione} · cambiare pagina A/B non lo tocca`));
    const sceltaFader = crea('select');
    for (const [chiave, e] of Object.entries(EFFETTI_FADER)) {
      const o = crea('option', '', e.nome.toLowerCase());
      o.value = chiave;
      o.selected = chiave === c.effettoFader();
      sceltaFader.append(o);
    }
    sceltaFader.onchange = () => c.azioni.faderScegli?.(sceltaFader.value);
    rigaFader.append(testoFader, sceltaFader);
    // nel SYNTH il controller segue la vista, oppure resta sul LIVE
    const rigaSynth = crea('div', 'imp-riga');
    const testoSynth = crea('div', 'imp-testo');
    testoSynth.append(crea('span', '', it.synth.controller.impostazione.nome), crea('span', 'imp-nota', it.synth.controller.impostazione.nota));
    const sceltaSynth = crea('select');
    for (const chiave of ['segue', 'live']) {
      const o = crea('option', '', it.synth.controller.impostazione[chiave]);
      o.value = chiave;
      o.selected = (c.azioni.nelSynthPreferenza?.() ?? 'segue') === chiave;
      sceltaSynth.append(o);
    }
    sceltaSynth.onchange = () => c.azioni.nelSynthScegli?.(sceltaSynth.value);
    rigaSynth.append(testoSynth, sceltaSynth);
    fader.replaceChildren(rigaFader, rigaSynth);

    // i colpi: la griglia e i tasti
    const colpi = $('ctl-colpi');
    const griglia = crea('div', 'imp-riga');
    const gTesto = crea('div', 'imp-testo');
    gTesto.append(crea('span', '', 'griglia dei colpi'), crea('span', 'imp-nota', 'un colpo entra sul primo punto della griglia dopo che premi e torna a tempo sulla griglia dopo che lasci'));
    const gSelect = crea('select');
    for (const [v, t] of [[0.25, '¼ (un battito)'], [0.125, '⅛ (mezzo battito)']]) {
      const o = crea('option', '', t);
      o.value = String(v);
      o.selected = Number(c.azioni.colpiGriglia?.() ?? 0.25) === v;
      gSelect.append(o);
    }
    gSelect.onchange = () => c.azioni.colpiScegliGriglia?.(Number(gSelect.value));
    griglia.append(gTesto, gSelect);
    const stop = crea('div', 'imp-riga');
    const sTesto = crea('div', 'imp-testo');
    sTesto.append(crea('span', '', 'stop torna'), crea('span', 'imp-nota', 'il vuoto prima del drop: rilasciando lo stop, tutto riparte sull\'1 della battuta (o, se preferisci, sul primo battito)'));
    const sSelect = crea('select');
    for (const [v, t] of [['battuta', 'sulla battuta (l\'1)'], ['battito', 'sul battito']]) {
      const o = crea('option', '', t);
      o.value = v;
      o.selected = (c.azioni.stopTorna?.() ?? 'battuta') === v;
      sSelect.append(o);
    }
    sSelect.onchange = () => c.azioni.stopScegli?.(sSelect.value);
    stop.append(sTesto, sSelect);
    const elenco = crea('div', 'ctl-colpi-elenco');
    c.colpi.colpi.forEach((colpo, i) => {
      const r = crea('div', 'ctl-colpo');
      r.append(crea('span', 'lbl', `${i + 9} · ${NOMI_TASTI[8 + i]}`), crea('span', '', colpo.nome), crea('span', 'lbl', colpo.bersaglio), crea('span', 'ctl-catena', colpo.catena));
      elenco.append(r);
    });
    if (!c.colpi.colpi.length) elenco.append(crea('span', 'lbl', 'nessun colpo caricato (serve uno stash)'));
    for (const e of c.colpi.errori) elenco.append(crea('p', 'ctl-errore', `colpi.cutx riga ${e.riga}: ${e.errore} — ${e.testo}`));
    const ricarica = crea('button', 'key', 'ricarica colpi.cutx');
    ricarica.onclick = () => c.azioni.ricaricaColpi?.();
    colpi.replaceChildren(griglia, stop, elenco, ricarica);

    const luci = $('ctl-luci');
    const stampa = crea('span', 'lbl', this.stato);
    const bottone = (testo, tipo) => {
      const b = crea('button', 'key', testo);
      b.disabled = !c.collegato;
      b.onclick = () => c.provaLuci(tipo, (t) => ((this.stato = t), (stampa.textContent = t)));
      return b;
    };
    luci.replaceChildren(
      bottone('accendi tutti i tasti', 'tutti'),
      bottone('tasti uno alla volta (note 0–103)', 'uno'),
      bottone('anelli: punto, pan, fan, spread', 'anelli'),
      bottone('spegni tutto', 'spegni'),
      stampa,
    );
    luci.style.display = 'flex';
    luci.style.flexWrap = 'wrap';
    luci.style.gap = '8px';
    luci.style.alignItems = 'center';

    const cal = $('ctl-calibra');
    const p = c.passoCalibrazione;
    if (p) {
      const annulla = crea('button', 'key', 'annulla');
      annulla.onclick = () => c.annullaCalibrazione();
      cal.replaceChildren(crea('p', 'ctl-istruzioni', `Premi: ${p.testo} · ${p.n} di ${p.di}`), annulla);
    } else {
      const avvia = crea('button', 'key', 'calibra i tasti');
      avvia.disabled = !c.collegato || c.modo !== 'MC';
      avvia.onclick = () => c.avviaCalibrazione();
      const note = crea('span', 'lbl', `note oggi — alto: ${c.tab.tasti.slice(0, 8).map((n) => n ?? '?').join(' ')} · basso: ${c.tab.tasti.slice(8).map((n) => n ?? '?').join(' ')} · layer A ${c.tab.layer.A}, B ${c.tab.layer.B}`);
      cal.replaceChildren(avvia, note);
    }
    this.disegnaMonitor();
  }

  disegnaMappa() {
    const m = $('ctl-mappa');
    const p = (t) => {
      const e = crea('p');
      e.innerHTML = t;
      return e;
    };
    m.replaceChildren(
      p('<b>Manopola 1 = navigazione, in tutte e due le pagine.</b> Gira = scorre la selezione nel CUE (apertura, scene del beat, clip del brano, poi le clip del kit), in silenzio · premi = ascolta in cuffia la cosa scelta (un altro tocco smette) · <b>go live</b> manda la cosa scelta.'),
      p('<b>Pagina A · suona</b> (tasto layer A). Manopola 2 = il beat, 3–7 = le clip live nell\'ordine di entrata (cinque), 8 = il volume generale. Gira = volume · tocco = muto · tieni premuta e gira = filtro (scritto nella coda) · tenuta = scelta del livello.'),
      p('Tasti in alto, da sinistra: <b>◀ ▶ scena</b> (una scena del beat indietro o avanti, a fine frase; accesi se c\'è una scena da raggiungere) · <b>prossimo brano</b> (tocco = cambia linguetta del CUE, ● attivo / ▸ prossimo; tenuto 1 s lampeggia e, a fine frase, entra il beat del prossimo brano dalla sua prima scena; le clip vecchie restano) · <b>cuffia</b> (da sola accende e spegne la cuffia; tenuta + ◀ ▶ = scelgo quale brano del set è il prossimo) · <b>go live</b> · <b>togli</b> · piano · <b>paracadute</b> (tenuto 1 s). Il piano arriva dopo. Tasti in basso: i colpi.'),
      p('<b>Pagina B · scolpisci</b> (tasto layer B). I tasti in alto 2–7 scelgono il livello nello stesso ordine delle manopole (beat sul 2, clip sul 3–7); l\'1 non fa niente (la manopola 1 è la navigazione); l\'8 resta il paracadute (tenuto 1 s, in tutte e due le pagine). Il «globale» si sceglie premendo di nuovo il tasto layer B (B una volta = il livello scelto, B di nuovo = globale, e così via). Manopole 2–8: filtro · risonanza · eco · riverbero · velocità · sporco · altezza, ognuna scritta nella coda del livello (il volume sta in pagina A). Sul globale: 2 = BPM, 4 = eco di tutto, 5 = riverbero di tutto.'),
      p('Anelli: pagina A = punto (volume), pagina B = fan (il valore del parametro). Il tasto layer acceso dice la pagina. Il fader fa lo stesso effetto in tutte e due le pagine (lo scegli qui sopra, predefinito filtro).'),
    );
  }
}
