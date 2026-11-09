// I suoni di Strudel nell'interfaccia: finestra del primo avvio (dove li metto + barra di avanzamento), avviso all'avvio se la cartella
// non c'è o è incompleta, e la sezione Impostazioni → Suoni (cartella, sposta, riscarica/ripara).
// I file li gestisce il processo principale (suoni-strudel-ipc.js).

const el = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};
const MB = 'circa 215 MB';

export function frase(st) {
  if (!st.cartella) return { livello: 'manca', testo: 'I suoni di Strudel non sono ancora sul Mac: senza, bd, sd, hh e le drum machine non suonano.', azione: 'scarica…' };
  if (st.stato === 'assente') return { livello: 'manca', testo: `La cartella dei suoni di Strudel non c'è (${st.cartella}). Se è su un disco, attaccalo; altrimenti scegline un'altra o riscaricali.`, azione: 'apri Suoni' };
  if (st.stato === 'vuota') return { livello: 'manca', testo: `La cartella dei suoni di Strudel è vuota (${st.cartella}): vanno scaricati.`, azione: 'scarica' };
  if (st.stato === 'incompleta') return { livello: 'manca', testo: st.vecchia ? 'I suoni di Strudel sono di una versione vecchia: vanno riscaricati.' : `Ai suoni di Strudel mancano ${st.mancanti} file su ${st.totale}: alcuni suoni non suoneranno.`, azione: 'ripara' };
  return null;
}

export class SuoniVista {
  // ctx: { avvisoEl, avvisoTesto, avvisoBottone, impEl, apriImpostazioni(), logEvento(livello, testo) }
  constructor(ctx) {
    this.ctx = ctx;
    this.stato = null;
    this.avanza = null;
    this.barre = new Set(); // le barre di avanzamento oggi visibili (finestra e impostazioni)
    window.cutx.suSuoniAvanza((p) => {
      this.avanza = p;
      this.disegnaBarre();
    });
    ctx.avvisoBottone.onclick = () => this.azioneAvviso();
  }

  async leggi() {
    this.stato = await window.cutx.suoniStato();
    if (this.stato.scaricando) this.avanza = this.stato.scaricando;
    return this.stato;
  }

  // All'avvio: se serve, un avviso chiaro subito (non a metà set) e, la prima volta, la domanda sulla cartella.
  async inizia() {
    const st = await this.leggi();
    this.disegna();
    if (st.perProve) return; // nelle prove automatiche nessuna finestra
    const f = frase(st);
    if (f) this.ctx.logEvento('avviso', 'suoni', f.testo);
    if (!st.cartella) await this.primoAvvio();
  }

  async aggiorna() {
    await this.leggi();
    this.disegna();
  }

  disegna() {
    const st = this.stato;
    // nelle prove automatiche l'avviso c'è solo se una prova ha scelto una cartella apposta (altrimenti sposterebbe il resto della pagina)
    const f = st && !st.scaricando && !(st.perProve && !st.cartella) ? frase(st) : null;
    this.ctx.avvisoEl.hidden = !f;
    if (f) {
      this.ctx.avvisoTesto.textContent = f.testo;
      this.ctx.avvisoBottone.textContent = f.azione;
    }
    this.disegnaImpostazioni();
  }

  azioneAvviso() {
    const st = this.stato;
    if (!st?.cartella) return this.primoAvvio();
    if (st.stato === 'assente') return this.ctx.apriImpostazioni();
    return this.scarica();
  }

  // --- la finestra del primo avvio ---

  dialogo(titolo) {
    const fondo = el('div', 'dialogo-fondo');
    const box = el('div', 'dialogo dialogo-suoni');
    box.append(el('div', 'lbl', titolo));
    fondo.append(box);
    document.body.append(fondo);
    return { fondo, box, chiudi: () => fondo.remove() };
  }

  async primoAvvio() {
    const { box, chiudi } = this.dialogo('Dove metto i suoni di Strudel?');
    const testo = el('p', 'secondario a-capo', `Sono i suoni di strudel.cc (bd, sd, hh, amen, le drum machine come RolandTR909, il piano…). CUTX li scarica una volta (${MB}) e poi suona anche senza internet. Ti propongo il disco del Mac; puoi scegliere un'altra cartella.`);
    const riga = el('div', 'dialogo-bottoni');
    const scegli = el('button', 'key on', 'scegli la cartella…');
    const dopo = el('button', 'key', 'più tardi');
    riga.append(scegli, dopo);
    box.append(testo, riga);
    dopo.onclick = () => {
      chiudi();
      this.disegna();
    };
    scegli.onclick = async () => {
      chiudi();
      const st = await window.cutx.suoniScegli();
      this.stato = st;
      if (!st.cartella) return this.disegna(); // ha annullato la scelta della cartella
      await this.scarica();
    };
  }

  // Scarica (o ripara) con una finestra e una barra. Ritorna quando ha finito.
  async scarica() {
    const { box, chiudi } = this.dialogo('Scarico i suoni di Strudel');
    const nota = el('p', 'secondario a-capo', 'Una volta sola. Puoi lasciare che vada: CUTX si può usare, i suoni arrivano man mano.');
    const barra = this.creaBarra();
    const annulla = el('button', 'key', 'annulla');
    annulla.onclick = () => window.cutx.suoniAnnulla();
    box.append(nota, barra.el, annulla);
    this.avanza = { fase: 'liste', fatti: 0, totale: 0, errori: 0 };
    this.disegnaBarre();
    const r = await window.cutx.suoniScarica();
    chiudi();
    this.barre.delete(barra);
    await this.leggi();
    this.avanza = null;
    this.disegna();
    if (!r.ok && !r.annullato) this.errore(r);
    else if (r.ok) this.ctx.logEvento('info', 'suoni', 'suoni di Strudel pronti');
  }

  errore(r) {
    const { box, chiudi } = this.dialogo('Scarico non finito');
    const ok = el('button', 'key on', 'ok');
    ok.onclick = chiudi;
    box.append(el('p', 'secondario a-capo', `Qualcosa non è arrivato (${(r.errori ?? []).join('; ') || 'errore di rete'}). Quello che c'è funziona; per il resto riprova da Impostazioni → Suoni → scarica / ripara.`), ok);
  }

  creaBarra() {
    const contenitore = el('div', 'barra-suoni');
    const pieno = el('div', 'barra-suoni-pieno');
    const testo = el('span', 'imp-nota');
    contenitore.append(pieno);
    const b = { el: el('div', 'barra-suoni-blocco'), pieno, testo };
    b.el.append(contenitore, testo);
    this.barre.add(b);
    return b;
  }

  disegnaBarre() {
    const p = this.avanza;
    for (const b of this.barre) {
      if (!b.el.isConnected) {
        this.barre.delete(b);
        continue;
      }
      const frazione = p?.totale ? p.fatti / p.totale : 0;
      b.pieno.style.width = `${(frazione * 100).toFixed(1)}%`;
      b.testo.textContent = !p ? '' : p.fase === 'liste' ? 'preparo la lista…' : `${p.fatti} di ${p.totale} file${p.errori ? ` · ${p.errori} non arrivati` : ''}`;
    }
  }

  // --- Impostazioni → Suoni ---

  disegnaImpostazioni() {
    const radice = this.ctx.impEl;
    const st = this.stato;
    if (!radice || !st) return;
    radice.replaceChildren();
    const riga = el('div', 'imp-riga');
    const t = el('div', 'imp-testo');
    const stato = !st.cartella ? 'non scelta' : { ok: `a posto · ${st.totale} file`, assente: 'la cartella non c\'è', vuota: 'vuota: da scaricare', incompleta: `incompleta: mancano ${st.mancanti} file` }[st.stato] ?? st.stato;
    t.append(el('span', '', 'Suoni di Strudel · pacchetto base'), el('span', 'imp-nota', st.cartella ? `${st.cartella} · ${stato}` : `nessuna cartella · ${stato}`));
    const bottoni = el('div', 'imp-bottoni');
    const occupato = !!st.scaricando || !!st.occupato;
    const cambia = el('button', 'key', st.cartella ? 'sposta in un\'altra cartella…' : 'scegli la cartella…');
    cambia.disabled = occupato;
    cambia.onclick = async () => {
      cambia.disabled = true;
      if (st.cartella) {
        const r = await window.cutx.suoniSposta();
        if (r?.errore) this.ctx.logEvento('avviso', 'suoni', r.errore);
      } else await window.cutx.suoniScegli();
      await this.aggiorna();
    };
    const ripara = el('button', 'key', st.stato === 'ok' ? 'riscarica / ripara' : 'scarica / ripara');
    ripara.disabled = occupato || !st.cartella;
    ripara.onclick = () => this.scarica();
    bottoni.append(cambia, ripara);
    riga.append(t, bottoni);
    radice.append(riga);
    if (st.scaricando) {
      const b = this.creaBarra();
      radice.append(b.el);
      this.disegnaBarre();
    }
    if (st.occupato) radice.append(el('p', 'imp-nota', 'sto spostando i suoni: un attimo…'));
    radice.append(el('p', 'lbl imp-aiuto', `${MB} · crediti e licenze nel file CREDITI.md dentro la cartella · vcsl e soundfont arriveranno come aggiunte facoltative`));
  }
}
