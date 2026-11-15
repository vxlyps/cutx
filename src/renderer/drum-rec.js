// Il REC della scheda DRUM: registra i colpi (tasti del Mac, pad dell'X-Touch) a tempo con il live. Stesso ritmo del REC del SYNTH
// (un ciclo di conteggio, poi `cicli` cicli di registrazione) ma i colpi diventano passi della griglia, quantizzati al passo più vicino.
// Modulo puro: l'orologio (ciclo()) gli arriva da fuori, così lo provano i test.
import { Registratore } from './synth-rec.js';

export class RegistratoreDrum extends Registratore {
  // passi: quanti passi ha la griglia in tutto (passi × cicli); cicli: quanti cicli dura la registrazione.
  constructor({ ciclo, cicli = 1, passi = 16 }) {
    super({ ciclo, cicli, griglia: 1 });
    this.passi = passi;
    this.colpi = []; // { riga, c, vel }
  }

  // Un colpo: conta solo durante la registrazione. Ritorna true se è stato preso.
  colpo(riga, vel, c = this.ciclo()) {
    if (this.fase(c) !== 'registra') return false;
    this.colpi.push({ riga, c, vel });
    return true;
  }

  // I passi da accendere: { riga, passo, vel }. Il passo è il più vicino; un colpo in fondo al giro torna al passo 1.
  // Due colpi sullo stesso passo e sulla stessa riga restano uno solo, con la velocity maggiore.
  passiDaAccendere() {
    const visti = new Map();
    for (const { riga, c, vel } of this.colpi) {
      let passo = Math.round(((c - this.inizio) / this.cicli) * this.passi);
      if (passo >= this.passi) passo -= this.passi;
      if (passo < 0) passo = 0;
      const chiave = `${riga}:${passo}`;
      const prima = visti.get(chiave);
      if (!prima || vel > prima.vel) visti.set(chiave, { riga, passo, vel });
    }
    return [...visti.values()].sort((a, b) => a.riga - b.riga || a.passo - b.passo);
  }
}
