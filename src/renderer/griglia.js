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
  // azioni: { scegli(ch, k), go(ch), out(ch), outSubito(ch), mute(ch), fader(ch, v) }
  constructor(contenitore, azioni) {
    this.el = contenitore;
    this.azioni = azioni;
    this.firma = '';
    this.righe = [];
  }

  // vista = StatoCanali.vista(); ciclo = il ciclo di adesso (per il conto alla rovescia)
  aggiorna(vista, ciclo) {
    this.ciclo = ciclo;
    const firma = JSON.stringify(vista.map((v) => [v.nome, v.alternative.map((a) => a.id), v.suona?.id, v.next?.id, v.attesa?.tipo, v.attesa?.alt?.id, v.mute, v.vecchia, v.avvisi, v.luci]));
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
        const alt = crea('div', 'ch-alt');
        if (v.alternative.length) alt.append(crea('span', 'lbl ch-next', 'NEXT'));
        v.alternative.forEach((a, k) => {
          const b = crea('button', 'key ch-chip', a.nome);
          b.classList.toggle('next', v.next?.id === a.id);
          b.classList.toggle('in-onda', v.suona?.id === a.id);
          b.title = a.tipo === 'scena' ? 'scena del beat' : '';
          b.onclick = () => this.azioni.scegli(v.indice, k);
          b.ondblclick = () => this.azioni.go(v.indice);
          alt.append(b);
        });
        if (!v.alternative.length) alt.append(crea('span', 'lbl ch-vuoto', 'niente nel brano'));
        const tasti = crea('div', 'ch-tasti');
        const go = crea('button', `key ch-go ${NOMI_LUCE[v.luci.r]}`, 'GO');
        go.onclick = () => this.azioni.go(v.indice);
        const out = crea('button', `key ch-out ${NOMI_LUCE[v.luci.s]}`, 'OUT');
        out.title = 'esce al prossimo «entra tra» · tenuto 1 s: esce subito';
        let timer = null;
        let lungo = false;
        out.onpointerdown = () => {
          lungo = false;
          timer = setTimeout(() => ((lungo = true), this.azioni.outSubito(v.indice)), 1000);
        };
        out.onpointerup = () => {
          clearTimeout(timer);
          if (!lungo) this.azioni.out(v.indice);
        };
        out.onpointerleave = () => clearTimeout(timer);
        const mute = crea('button', `key ch-mute ${NOMI_LUCE[v.luci.m]}`, 'M');
        mute.onclick = () => this.azioni.mute(v.indice);
        tasti.append(go, out, mute);
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
