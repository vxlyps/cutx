// Le impostazioni: sezioni generale, audio, scorciatoie, proiezione, stash, estensioni.
// Qui le parti che si disegnano da una lista: interruttori, scorciatoie rimappabili, paracadute.
// L'audio (uscite, test, robustezza) lo gestisce app.js, che ha i motori.
import it from './testi/it.json';
import { AZIONI, caps, comboCifra, comboDa, conflitto, effettive, eRiservata } from './scorciatoie.js';
import { creaEditor } from './editor.js';

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
    gruppo('imp-proiezione', it.impostazioni.proiezione);
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
