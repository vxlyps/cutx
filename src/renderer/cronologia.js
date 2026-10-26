// ⌘Z fuori dagli editor: annulla l'ultima azione sul set (livello tolto, modifica live, volume, muto, strutture del CUE, brano chiuso).
// La regola di sicurezza è questa: un annulla non cambia MAI direttamente il live. Un livello tolto torna nel CUE, pronto, e lo rimanda
// chi suona col go live; una modifica live sbagliata ricarica la versione di prima nell'editor del livello, e la applica chi suona.
// Solo il volume e il muto tornano subito, perché sono innocui. Modulo puro: lo provano i test.
//
// Una voce: { etichetta, annulla(), rifai? }. annulla() ritorna false se non si può più fare (il livello non c'è più, il brano è cambiato
// nel frattempo): la voce si lascia andare e si passa alla precedente. Può ritornare un testo, che si mostra a chi suona.
// Senza rifai() una voce non si può rifare.

export class Cronologia {
  constructor(max = 20) {
    this.max = max;
    this.passi = [];
    this.rifacibili = [];
  }

  get conta() {
    return this.passi.length;
  }

  registra(voce) {
    this.passi.push(voce);
    if (this.passi.length > this.max) this.passi.shift();
    this.rifacibili = [];
  }

  svuota() {
    this.passi = [];
    this.rifacibili = [];
  }

  // { etichetta, messaggio, saltate: [etichetta] } oppure null se non c'è niente da annullare.
  async annulla() {
    const saltate = [];
    while (this.passi.length) {
      const voce = this.passi.pop();
      const r = await voce.annulla();
      if (r === false) {
        saltate.push(voce.etichetta);
        continue;
      }
      if (voce.rifai) this.rifacibili.push(voce);
      return { etichetta: voce.etichetta, messaggio: typeof r === 'string' ? r : null, saltate };
    }
    return saltate.length ? { etichetta: null, messaggio: null, saltate } : null;
  }

  async rifai() {
    const saltate = [];
    while (this.rifacibili.length) {
      const voce = this.rifacibili.pop();
      const r = await voce.rifai();
      if (r === false) {
        saltate.push(voce.etichetta);
        continue;
      }
      this.passi.push(voce);
      return { etichetta: voce.etichetta, messaggio: typeof r === 'string' ? r : null, saltate };
    }
    return saltate.length ? { etichetta: null, messaggio: null, saltate } : null;
  }
}
