// Le impostazioni: sezioni generale, audio, scorciatoie, proiezione, stash, estensioni.
// Qui le parti che si disegnano da una lista: interruttori, scorciatoie rimappabili, paracadute.
// L'audio (uscite, test, robustezza) lo gestisce app.js, che ha i motori.
import it from './testi/it.json';
import { AZIONI, caps, comboCifra, comboDa, conflitto, effettive, eRiservata } from './scorciatoie.js';
import { creaEditor } from './editor.js';
import { MODI, modoValido } from './sfondo.js';
import { PREDEFINITI, SEGNAPOSTO, risolvi as risolviTesti } from './testi-pubblico.js';
import { Anteprima } from './anteprima.js';
import { OPZIONI, norma } from './scrittura.js';

const $ = (id) => document.getElementById(id);

const crea = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};

// on / off, come nella tavola: acido se acceso
function interruttore(valore, cambia) {
  const gruppo = crea('div', 'segmenti');
  const on = crea('button', 'key', 'on');
  const off = crea('button', 'key', 'off');
  on.classList.toggle('acid', valore);
  off.classList.toggle('on', !valore);
  on.onclick = () => cambia(true);
  off.onclick = () => cambia(false);
  gruppo.append(on, off);
  return gruppo;
}

function rigaInterruttore({ nome, testo }, valore, cambia) {
  const riga = crea('div', 'imp-riga');
  const t = crea('div', 'imp-testo');
  t.append(crea('span', '', nome), crea('span', 'imp-nota', testo));
  riga.append(t, interruttore(valore, cambia));
  return riga;
}

export class Impostazioni {
  // dati: { preferenze(), salvaPreferenze(modifiche), config(), salvaConfig(modifiche), provaInCuffia(codice),
  //         scegliStash(), codiceParacaduteBase }
  constructor(dati) {
    this.dati = dati;
    this.catturando = null; // id dell'azione di cui sto scegliendo il tasto
    this.errore = null; // { id, testo }
    for (const b of document.querySelectorAll('#imp-nav [data-sez]')) b.onclick = () => this.vai(b.dataset.sez);
    $('scorciatoie-ripristina').onclick = () => this.dati.salvaPreferenze({ scorciatoie: {} });
    $('imp-cambia-stash').onclick = () => this.dati.scegliStash();
    $('imp-ableton-aggiungi').onclick = () => window.cutx.aggiungiCartellaAbleton();
    $('imp-mostra-log').onclick = () => window.cutx.mostraLog();
    // la versione e dov'è il registro: si chiedono una volta
    window.cutx.infoApp().then((i) => {
      $('imp-versione').textContent = `versione ${i.versione}`;
      $('imp-versione-dettagli').textContent = `Electron ${i.electron} · Chromium ${i.chrome} · ${i.sistema}`;
      $('imp-registro').textContent = i.registro ?? 'non disponibile';
    });
    window.addEventListener('keydown', (e) => this.tasto(e), true);
    this.anteprima = new Anteprima($('imp-anteprima'), () => this.dati.preferenze());

    // l'editor del paracadute: ⌘↵ lo prova in cuffia, si salva da solo in stash.json
    let timer = null;
    this.editorParacadute = creaEditor({
      root: $('editor-paracadute'),
      codice: '',
      suValuta: () => this.dati.provaInCuffia(this.editorParacadute.codice),
      suFerma: () => {},
      suCambio: () => {
        if (this.caricando) return;
        clearTimeout(timer);
        timer = setTimeout(() => this.salvaParacadute(), 600);
      },
    });
    $('paracadute-cuffia').onclick = () => this.dati.provaInCuffia(this.editorParacadute.codice);
    $('paracadute-predefinito').onclick = () => {
      this.editorParacadute.codice = this.dati.codiceParacaduteBase;
      this.salvaParacadute(true);
    };
  }

  vai(nome) {
    for (const b of document.querySelectorAll('#imp-nav [data-sez]')) b.classList.toggle('on', b.dataset.sez === nome);
    for (const s of document.querySelectorAll('.imp-sez')) s.hidden = s.dataset.sez !== nome;
  }

  // Salva nel set: se è uguale al predefinito si toglie, così resta "il predefinito" anche se cambierà.
  async salvaParacadute(predefinito = false) {
    const codice = this.editorParacadute.codice;
    const base = this.dati.codiceParacaduteBase;
    await this.dati.salvaConfig({ paracadute: predefinito || codice.trim() === base.trim() ? '' : codice });
    $('paracadute-stato').textContent = 'salvato';
    setTimeout(() => ($('paracadute-stato').textContent = ''), 1500);
  }

  // --- scrittura umana: velocità, imperfezione, refusi ---

  disegnaScrittura() {
    const contenitore = $('imp-scrittura');
    if (contenitore.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // sto trascinando
    const p = this.dati.preferenze();
    const o = norma(p.scrittura);
    const salva = (parziale) => this.dati.salvaPreferenze({ scrittura: { ...norma(this.dati.preferenze().scrittura), ...parziale } });
    const cursore = ({ chiave, nome, nota, min, max, passo, etichetta }) => {
      const riga = crea('div', 'imp-riga imp-testi-riga');
      riga.dataset.voce = chiave;
      const t = crea('div', 'imp-testo');
      t.append(crea('span', '', nome), crea('span', 'imp-nota', nota));
      const comandi = crea('div', 'imp-controlli');
      const i = crea('input');
      i.type = 'range';
      i.min = min;
      i.max = max;
      i.step = passo;
      i.value = o[chiave];
      const valore = crea('span', 'lbl', etichetta(o[chiave]));
      let timer = null;
      i.oninput = () => {
        valore.textContent = etichetta(Number(i.value));
        clearTimeout(timer);
        timer = setTimeout(() => salva({ [chiave]: Number(i.value) }), 150);
      };
      const ripr = crea('button', 'key piccolo', 'ripristina');
      ripr.onclick = () => salva({ [chiave]: OPZIONI[chiave] });
      comandi.append(i, valore, ripr);
      riga.append(t, comandi);
      return riga;
    };
    const rivedi = crea('button', 'key', 'rivedi nell\'anteprima');
    rivedi.onclick = () => this.anteprima.riparti();
    const ultima = crea('div', 'imp-riga');
    ultima.append(crea('div', 'imp-testo'), rivedi);
    contenitore.replaceChildren(
      cursore({ chiave: 'velocita', nome: 'velocità', nota: '1 = naturale (circa 14 caratteri al secondo); se non basta il tempo accelera da sola', min: 0.4, max: 2.5, passo: 0.1, etichetta: (v) => `${v.toFixed(1)}×` }),
      cursore({ chiave: 'imperfezione', nome: 'imperfezione', nota: 'a raffiche, esitazioni prima dei numeri, qualche pausa a metà parola col cursore che lampeggia', min: 0, max: 1, passo: 0.05, etichetta: (v) => (v === 0 ? 'regolare' : `${Math.round(v * 100)}%`) }),
      cursore({ chiave: 'refusi', nome: 'refusi', nota: 'un tasto sbagliato, corretto subito. Spenti di default; al massimo «ogni tanto»', min: 0, max: 1, passo: 0.05, etichetta: (v) => (v === 0 ? 'mai' : v >= 0.95 ? 'ogni tanto' : `${Math.round(v * 100)}%`) }),
      ultima,
    );
  }

  // --- testi per il pubblico ---

  // Cambia una voce dei testi (o le toglie, per ripristinarla) e salva: la finestra di uscita e l'anteprima si aggiornano subito.
  salvaTesti(chiave, parziale) {
    const p = this.dati.preferenze();
    const tutti = { ...(p.testiPubblico ?? {}) };
    if (parziale === null) delete tutti[chiave];
    else tutti[chiave] = { ...(tutti[chiave] ?? {}), ...parziale };
    this.dati.salvaPreferenze({ testiPubblico: tutti });
  }

  disegnaTesti() {
    const contenitore = $('imp-testi');
    // mentre scrivo in un campo non si ricostruisce la lista: perderei il cursore (le preferenze arrivano comunque)
    if (contenitore.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const p = this.dati.preferenze();
    const cfg = risolviTesti(p);
    const salvati = p.testiPubblico ?? {};
    const campo = (valore, cambia, classe = '') => {
      const i = crea('input', classe);
      i.type = 'text';
      i.value = valore;
      i.spellcheck = false;
      let timer = null;
      i.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(() => cambia(i.value), 250);
      };
      return i;
    };
    const riga = ({ chiave, nome, nota, acceso, onOff, testo, ripristina, extra = [] }) => {
      const r = crea('div', 'imp-riga imp-testi-riga');
      r.dataset.voce = chiave;
      const t = crea('div', 'imp-testo');
      const segn = SEGNAPOSTO[chiave];
      t.append(crea('span', '', nome), crea('span', 'imp-nota', segn && testo ? `${nota} · segnaposto: ${segn.map((x) => `{${x}}`).join(' ')}` : nota));
      const comandi = crea('div', 'imp-controlli');
      if (testo) comandi.append(campo(testo.valore, testo.cambia));
      comandi.append(...extra);
      if (onOff) comandi.append(interruttore(acceso, onOff));
      const ripr = crea('button', 'key piccolo', 'ripristina');
      ripr.onclick = ripristina;
      comandi.append(ripr);
      r.append(t, comandi);
      return r;
    };
    const voce = (chiave, nome, nota, { testo = true, acceso = true, extra = [] } = {}) =>
      riga({
        chiave,
        nome,
        nota,
        acceso: cfg[chiave].acceso,
        onOff: acceso ? (x) => this.salvaTesti(chiave, { acceso: x }) : null,
        testo: testo ? { valore: cfg[chiave].testo, cambia: (v) => this.salvaTesti(chiave, { testo: v }) } : null,
        ripristina: () => this.salvaTesti(chiave, null),
        extra,
      });

    // il logo: acceso/spento e un'immagine mia
    const scegli = crea('button', 'key piccolo', cfg.logo.immagine ? cfg.logo.immagine.split('/').pop() : 'scegli immagine…');
    scegli.title = cfg.logo.immagine ?? 'svg, png, jpg o webp: si parte dallo stash';
    scegli.onclick = async () => {
      const f = await window.cutx.scegliImmagine();
      if (f) this.salvaTesti('logo', { immagine: f });
    };
    const togli = crea('button', 'key piccolo', 'logo CUTX');
    togli.title = 'torna al logo di CUTX';
    togli.onclick = () => this.salvaTesti('logo', { immagine: null });
    const logo = voce('logo', 'logo', 'in alto a sinistra: quello di CUTX o una tua immagine', { testo: false, extra: cfg.logo.immagine ? [scegli, togli] : [scegli] });

    const neon = riga({
      chiave: 'neon',
      nome: 'neon',
      nota: 'l\'insegna accanto al gatto',
      acceso: cfg.neon.acceso,
      onOff: (x) => this.dati.salvaPreferenze({ insegna: x }),
      testo: { valore: cfg.neon.testo, cambia: (v) => this.salvaTesti('neon', { testo: v }) },
      ripristina: () => {
        this.salvaTesti('neon', null);
        this.dati.salvaPreferenze({ insegna: true });
      },
    });

    // le etichette dei livelli: i nomi automatici si rinominano (vuoto = nascosta); «paracadute» non si vede mai
    const nomi = crea('div', 'imp-controlli');
    for (const auto of Object.keys(PREDEFINITI.etichette.nomi)) {
      const c = campo(cfg.etichette.nomi[auto], (v) => this.salvaTesti('etichette', { nomi: { ...cfg.etichette.nomi, [auto]: v } }), 'corto');
      c.title = `come si chiama sul proiettore il livello «${auto}» (vuoto: senza etichetta)`;
      c.placeholder = auto;
      nomi.append(c);
    }
    const etichette = riga({
      chiave: 'etichette',
      nome: 'etichette dei livelli',
      nota: 'il nome sopra ogni livello. Rinomina «libero» e «jam» (vuoto: nascosta). «paracadute» non compare mai',
      acceso: cfg.etichette.acceso,
      onOff: (x) => this.salvaTesti('etichette', { acceso: x }),
      ripristina: () => this.salvaTesti('etichette', null),
      extra: [...nomi.children],
    });

    contenitore.replaceChildren(
      logo,
      voce('bpm', 'BPM', 'il tempo, in alto'),
      voce('frase', 'numero di frase', 'in basso a destra'),
      neon,
      voce('titolo', 'titolo della finestra', 'la barra del titolo, se la finestra non è a tutto schermo'),
      etichette,
      voce('muto', 'muto', 'accanto al nome del livello in muto'),
      voce('conto', 'conto alla rovescia', 'prima che il livello entri'),
      voce('scrittura', 'in scrittura', 'mentre riscrivo un livello o il jam'),
      voce('coda', 'coda', 'le righe .lpf(…), .fast(…) sotto il codice e il volume', { testo: false }),
      voce('commenti', 'commenti // nel codice', 'acceso: il pubblico legge anche le righe di commento', { testo: false }),
      voce('preambolo', 'preambolo del brano', 'acceso: si vedono le righe sopra la sezione (setcpm del brano…). Spento: solo sul mio schermo. Un setcpm scritto dal vivo si vede sempre', { testo: false }),
      voce('controller', 'scritta del controller', 'fase 4: la scritta grande di quello che tocco'),
      voce('momento', 'nome del momento', 'fase 4: intro, drop… della spina'),
      (() => {
        const r = crea('div', 'imp-riga');
        const t = crea('div', 'imp-testo');
        t.append(crea('span', '', 'avvisi ed errori'), crea('span', 'imp-nota', 'non compaiono mai sul proiettore, solo sul tuo schermo: non si cambia'));
        r.append(t, crea('span', 'lbl', 'mai'));
        return r;
      })(),
    );
    this.anteprima.aggiorna();
    void salvati;
  }

  // Si ridisegna quando cambiano preferenze o stash, o all'apertura.
  disegna() {
    const p = this.dati.preferenze();
    const frase = $('imp-frase');
    frase.replaceChildren(
      ...[8, 16, 32].map((n) => {
        const b = crea('button', `key${p.lunghezzaFrase === n ? ' on' : ''}`, String(n));
        b.onclick = () => this.dati.salvaPreferenze({ lunghezzaFrase: n });
        return b;
      }),
    );
    const gruppo = (id, voci) => $(id).replaceChildren(...voci.map((v) => rigaInterruttore(v, p[v.chiave] !== false, (x) => this.dati.salvaPreferenze({ [v.chiave]: x }))));
    gruppo('imp-help', it.impostazioni.help);
    this.disegnaTesti();
    this.disegnaScrittura();
    // le dissolvenze: cicli (0 = di botto), se solo volume o anche filtro, il filtro dell'uscita, il paracadute
    const sceltaPref = (nome, testo, valori, chiave, predefinito) => {
      const riga = crea('div', 'imp-riga');
      const t = crea('div', 'imp-testo');
      t.append(crea('span', '', nome), crea('span', 'imp-nota', testo));
      const gruppoBottoni = crea('div', 'segmenti');
      for (const [valore, etichetta] of valori) {
        const b = crea('button', `key${(p[chiave] ?? predefinito) === valore ? ' on' : ''}`, etichetta);
        b.onclick = () => this.dati.salvaPreferenze({ [chiave]: valore });
        gruppoBottoni.append(b);
      }
      riga.append(t, gruppoBottoni);
      return riga;
    };
    const cicli = [[0, '0'], [1, '1'], [2, '2'], [4, '4']];
    $('imp-dissolvenze').replaceChildren(
      sceltaPref('dissolvenza in entrata', 'cicli di sfumata di un livello che entra (0: di botto). Nel CUE si cambia al volo', cicli, 'dissolvenzaEntrata', 0),
      sceltaPref('dissolvenza in uscita', 'quanto sfuma un livello che togli: resta nella pila, attenuato, e un clic lo salva', cicli, 'dissolvenzaUscita', 0),
      sceltaPref('tipo', 'solo volume, oppure volume più filtro (entra aprendo un passa-basso, esce con un filtro)', [['volume', 'volume'], ['filtro', 'volume + filtro']], 'dissolvenzaTipo', 'volume'),
      sceltaPref('filtro in uscita', 'come si chiude un livello che esce con il filtro', [['hp', 'passa-alto che sale'], ['lp', 'passa-basso che chiude']], 'dissolvenzaFiltroUscita', 'hp'),
      sceltaPref('scivolata dei valori', 'un numero della coda cambiato a mano (.lpf, .delay, .room…) scivola dal vecchio al nuovo in questo tempo; dalle manopole segue subito la mano', [[0, '0'], [0.25, '¼ (1 battito)'], [0.5, '½'], [1, '1 battuta']], 'scivolata', 0.25),
      sceltaPref('transizione del paracadute', 'cicli in cui il paracadute sostituisce quello che suona (esce col passa-alto, lui entra aprendo il filtro). 0: di botto', [[0, '0'], [1, '1'], [2, '2'], [4, '4']], 'paracaduteCicli', 2),
    );
    gruppo('imp-proiezione', it.impostazioni.proiezione);
    const sfondo = modoValido(p.sfondoProiettore);
    const riga = crea('div', 'imp-riga');
    const testo = crea('div', 'imp-testo');
    testo.append(crea('span', '', it.impostazioni.sfondo.nome), crea('span', 'imp-nota', it.impostazioni.sfondo.testo));
    const scelta = crea('div', 'segmenti');
    for (const modo of MODI) {
      const b = crea('button', `key${modo === sfondo ? ' on' : ''}`, modo);
      b.onclick = () => this.dati.salvaPreferenze({ sfondoProiettore: modo });
      scelta.append(b);
    }
    riga.append(testo, scelta);
    $('imp-proiezione').append(riga);
    gruppo('imp-paracadute', [it.impostazioni.paracadute]);
    this.disegnaScorciatoie();
    this.disegnaAbleton();
    const config = this.dati.config();
    $('imp-stash-nome').textContent = config.nome ?? 'nessuno stash';
    $('imp-stash-percorso').textContent = this.dati.percorsoStash() ?? 'scegli una cartella: diventa lo stash del set';
    // il paracadute del set, senza sovrascrivere quello che sto scrivendo
    if (!this.editorParacadute.haFuoco()) {
      const voluto = config.paracadute || this.dati.codiceParacaduteBase;
      if (this.editorParacadute.codice !== voluto) {
        this.caricando = true;
        this.editorParacadute.codice = voluto;
        this.caricando = false;
      }
    }
  }

  // --- ableton: le cartelle dei progetti ---

  async disegnaAbleton() {
    const cartelle = this.dati.preferenze().cartelleAbleton ?? [];
    const progetti = cartelle.length ? await window.cutx.progettiAbleton() : [];
    const gruppo = $('imp-ableton');
    gruppo.replaceChildren();
    if (!cartelle.length) gruppo.append(crea('p', 'secondario', 'nessuna cartella: aggiungine una'));
    for (const c of cartelle) {
      const quanti = progetti.filter((p) => p.percorso.startsWith(c + '/')).length;
      const riga = crea('div', 'imp-riga');
      const t = crea('div', 'imp-testo');
      t.append(crea('span', '', c.split('/').pop() || c), crea('span', 'imp-nota', `${c} · ${quanti} ${quanti === 1 ? 'progetto' : 'progetti'}`));
      const togli = crea('button', 'key', 'togli');
      togli.onclick = () => this.dati.salvaPreferenze({ cartelleAbleton: cartelle.filter((x) => x !== c) });
      riga.dataset.cartella = c;
      riga.append(t, togli);
      gruppo.append(riga);
    }
  }

  // --- scorciatoie ---

  disegnaScorciatoie() {
    const mappa = effettive(this.dati.preferenze().scorciatoie);
    const elenco = $('scorciatoie-elenco');
    elenco.replaceChildren();
    for (const a of AZIONI) {
      const riga = crea('div', 'imp-riga');
      riga.dataset.azione = a.id;
      riga.append(Object.assign(crea('span', ''), { textContent: a.nome, style: 'flex:1' }));
      const cambiata = mappa[a.id] !== a.predefinita;
      if (this.errore?.id === a.id) {
        riga.classList.add('errore-riga');
        riga.append(crea('span', 'cap-errore', this.errore.testo));
      }
      const gruppo = crea(a.id === 'esci' ? 'span' : 'button', 'cap-gruppo');
      if (this.catturando === a.id) {
        riga.classList.add('cattura');
        riga.append(crea('span', 'lbl', 'premi un tasto…'));
        gruppo.append(crea('span', 'cap', '_'));
      } else {
        for (const c of caps(mappa[a.id])) gruppo.append(crea('span', 'cap', c));
        if (cambiata) gruppo.title = 'cambiata: ripristina per tornare al predefinito';
      }
      if (a.id !== 'esci') {
        gruppo.onclick = () => {
          this.catturando = this.catturando === a.id ? null : a.id;
          this.errore = null;
          this.disegnaScorciatoie();
        };
      } else {
        gruppo.title = 'esc chiude e annulla: non si cambia';
      }
      riga.append(gruppo);
      elenco.append(riga);
    }
  }

  // Il tasto premuto mentre scelgo una scorciatoia nuova.
  tasto(e) {
    if (!this.catturando) return;
    const a = AZIONI.find((x) => x.id === this.catturando);
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      this.catturando = null;
      return this.disegnaScorciatoie();
    }
    let combo = comboDa(e);
    if (!combo) return; // un modificatore da solo: aspetto il resto
    const rifiuta = (testo) => {
      this.errore = { id: a.id, testo };
      this.disegnaScorciatoie();
    };
    if (a.cifre) {
      if (!/Digit[1-9]$/.test(combo)) return rifiuta('premi un modificatore e una cifra da 1 a 9');
      if (combo.split('+').length < 2) return rifiuta('serve anche un modificatore (⌥, ⌃, ⇧ o ⌘)');
      combo = comboCifra(combo);
    }
    if (eRiservata(combo)) return rifiuta('è riservata a macOS o all\'editor');
    const mappa = effettive(this.dati.preferenze().scorciatoie);
    const altra = conflitto(mappa, a.id, combo);
    if (altra) return rifiuta(`già usata da "${AZIONI.find((x) => x.id === altra).nome}"`);
    const scorciatoie = { ...this.dati.preferenze().scorciatoie, [a.id]: combo };
    if (combo === a.predefinita) delete scorciatoie[a.id];
    this.catturando = null;
    this.errore = null;
    this.dati.salvaPreferenze({ scorciatoie });
  }
}
