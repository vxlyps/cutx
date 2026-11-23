// La griglia dei CANALI: una riga per CH nel LIVE (nome, cosa suona, NEXT tra le alternative del brano, GO / OUT / MUTE, fader).
// Non decide niente: legge la foto dello stato (StatoCanali.vista()) e manda intenzioni ad `azioni`. Si ridisegna solo se la foto cambia.
const crea = (tag, classe, testo) => {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (testo !== undefined) e.textContent = testo;
  return e;
};

const NOMI_LUCE = { spenta: '', accesa: 'acceso', lenta: 'lenta', veloce: 'veloce' };

export class Griglia {
  // azioni: { scegli(ch, k), premiR(ch), tieniR(ch), cuffia(ch), mute(ch), fader(ch, v) }
  constructor(contenitore, azioni) {
    this.el = contenitore;
    this.azioni = azioni;
    this.firma = '';
    this.righe = [];
  }

  // vista = StatoCanali.vista(); ciclo = il ciclo di adesso (per il conto alla rovescia)
  aggiorna(vista, ciclo) {
    this.ciclo = ciclo;
    const firma = JSON.stringify(vista.map((v) => [v.nome, v.alternative.map((a) => a.id), v.suona?.id, v.next?.id, v.attesa?.tipo, v.attesa?.alt?.id, v.azioneR, v.inCuffia, v.mute, v.vecchia, v.avvisi, v.luci]));
    const trascino = this.el.contains(document.activeElement) && document.activeElement.type === 'range';
    if (firma !== this.firma && !trascino) {
      this.firma = firma; // se sto muovendo un fader il ridisegno aspetta: non gli tolgo il fader di mano
      this.disegna(vista);
    }
    this.conti(vista);
  }

  // Il conto alla rovescia cambia a ogni ciclo, non ridisegna la riga.
  conti(vista) {
    vista.forEach((v, i) => {
      const r = this.righe[i];
      if (!r) return;
      const resta = v.attesa?.da !== undefined && this.ciclo !== null ? Math.max(0, Math.ceil(v.attesa.da - this.ciclo)) : null;
      if (v.fader.letto && document.activeElement !== r.fader) r.fader.value = String(v.fader.valore); // lo slider segue il fader fisico
      r.fader.classList.toggle('non-letto', !v.fader.letto);
      r.fader.title = v.fader.letto ? '' : 'fader non letto: vale il volume del codice';
      r.conto.textContent = v.attesa ? `${v.attesa.tipo === 'go' ? 'entra' : 'esce'}${resta !== null ? ` tra ${resta}` : '…'}` : '';
    });
  }

  disegna(vista) {
    this.righe = [];
    const sposta = this.el.scrollTop;
    this.el.replaceChildren(
      ...vista.map((v) => {
        const riga = crea('div', 'ch-riga');
        riga.classList.toggle('suona', !!v.suona);
        riga.classList.toggle('vecchia', v.vecchia);
        const testa = crea('div', 'ch-testa');
        testa.append(crea('span', 'ch-nome', v.nome), crea('span', 'lbl ch-n', `CH${v.indice + 1}`));
        const ora = crea('div', 'ch-ora');
        const stato = crea('span', 'lbl ch-stato', v.suona ? 'SUONA' : 'VUOTO');
        const suona = crea('span', 'ch-suona', v.suona ? v.suona.nome : '');
        const conto = crea('span', 'lbl ch-conto');
        ora.append(stato, suona, conto);
        if (v.vecchia) ora.append(crea('span', 'lbl ch-vecchia', 'vecchia'));
        for (const a of v.avvisi) ora.append(crea('span', 'ch-avviso', a));
        if (v.inCuffia) ora.append(crea('span', 'lbl ch-in-cuffia', 'IN CUFFIA'));
        const alt = crea('div', 'ch-alt');
        alt.append(crea('span', 'lbl ch-next', 'NEXT'));
        // il primo chip è OUT, come la prima zona della manopola: stessi indici
        [{ id: 'OUT', tipo: 'out', nome: 'OUT' }, ...v.alternative].forEach((a, k) => {
          const b = crea('button', 'key ch-chip', a.nome);
          b.classList.toggle('next', v.next?.id === a.id);
          b.classList.toggle('in-onda', v.suona?.id === a.id);
          b.title = a.tipo === 'scena' ? 'scena del beat' : a.tipo === 'out' ? 'il CH esce' : '';
          b.onclick = () => this.azioni.scegli(v.indice, k);
          b.ondblclick = () => this.azioni.premiR(v.indice);
          alt.append(b);
        });
        if (!v.alternative.length) alt.append(crea('span', 'lbl ch-vuoto', 'niente nel brano'));
        const tasti = crea('div', 'ch-tasti');
        // R: un tasto solo, la parola dice cosa fa adesso (GO / OUT / ANNULLA); tenuto 1 s esce subito
        const go = crea('button', `key ch-go ${NOMI_LUCE[v.luci.r]}`, v.azioneR || '—');
        go.title = v.azioneR ? 'R · esegue NEXT · tenuto 1 s: esce subito' : 'R · niente da fare';
        let timer = null;
        let lungo = false;
        go.onpointerdown = () => {
          lungo = false;
          timer = setTimeout(() => ((lungo = true), this.azioni.tieniR(v.indice)), 1000);
        };
        go.onpointerup = () => {
          clearTimeout(timer);
          if (!lungo) this.azioni.premiR(v.indice);
        };
        go.onpointerleave = () => clearTimeout(timer);
        const cue = crea('button', `key ch-cue ${NOMI_LUCE[v.luci.s]}`, 'CUE');
        cue.title = 'S · ascolta in cuffia la clip in NEXT';
        cue.onclick = () => this.azioni.cuffia(v.indice);
        const mute = crea('button', `key ch-mute ${NOMI_LUCE[v.luci.m]}`, 'M');
        mute.onclick = () => this.azioni.mute(v.indice);
        tasti.append(go, cue, mute);
        const fader = crea('input', 'ch-fader');
        fader.type = 'range';
        fader.min = '0';
        fader.max = '1';
        fader.step = '0.01';
        fader.value = v.fader.letto ? String(v.fader.valore) : '1';
        fader.oninput = () => this.azioni.fader(v.indice, Number(fader.value));
        const mezzo = crea('div', 'ch-mezzo');
        mezzo.append(ora, alt);
        riga.append(testa, mezzo, fader, tasti);
        this.righe[v.indice] = { conto, fader };
        return riga;
      }),
    );
    this.el.scrollTop = sposta;
  }
}
