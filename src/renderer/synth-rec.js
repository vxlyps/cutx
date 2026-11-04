// Il REC del SYNTH: registra a tempo con il live. Si parte dal ciclo intero dopo, con un ciclo (una battuta) di conteggio; poi si registra
// per `cicli` cicli; le note si quantizzano al 1/16 (o alla griglia del pianoroll: 1/12 per le terzine…). Modulo puro: l'orologio (ciclo()) gli arriva da fuori, così lo provano i test.
import { SCATTI } from './synth-note.js';

export class Registratore {
  // ciclo(): il ciclo di adesso (con la virgola), dal tempo del live. cicli: quanti si registrano.
  constructor({ ciclo, cicli = 1, griglia = SCATTI }) {
    this.griglia = griglia;
    this.ciclo = ciclo;
    this.cicli = cicli;
    const c = ciclo();
    this.inizio = Math.ceil(c + 1e-9) + 1; // un ciclo di conteggio dopo il confine
    this.fine = this.inizio + cicli;
    this.aperte = new Map(); // midi → { da, vel }
    this.chiuse = []; // { da, a, n, vel }
  }

  // 'attesa' (fino al confine) → 'conta' (la battuta di conteggio) → 'registra' → 'fine'
  fase(c = this.ciclo()) {
    if (c < this.inizio - 1) return 'attesa';
    if (c < this.inizio) return 'conta';
    if (c < this.fine) return 'registra';
    return 'fine';
  }

  // Il battito del conteggio: 4, 3, 2, 1 (null fuori dal conteggio).
  conto(c = this.ciclo()) {
    const f = this.fase(c);
    if (f === 'attesa') return 4;
    if (f !== 'conta') return null;
    return 4 - Math.min(3, Math.floor((c - (this.inizio - 1)) * 4));
  }

  noteOn(midi, vel = 100, c = this.ciclo()) {
    if (this.fase(c) !== 'registra' || this.aperte.has(midi)) return;
    this.aperte.set(midi, { da: c, vel });
  }

  noteOff(midi, c = this.ciclo()) {
    const n = this.aperte.get(midi);
    if (!n) return;
    this.aperte.delete(midi);
    this.chiuse.push({ da: n.da, a: Math.min(c, this.fine), n: midi, vel: n.vel });
  }

  // Le note ancora tenute si chiudono dove finisce la registrazione.
  chiudi() {
    for (const midi of [...this.aperte.keys()]) this.noteOff(midi, this.fine);
  }

  // Gli eventi quantizzati al 1/16: { i, l, n }. Una nota non esce dal suo ciclo; una che parte appena prima della fine torna all'inizio.
  risultato() {
    const g = this.griglia;
    const totale = this.cicli * g;
    const fuori = [];
    for (const c of this.chiuse) {
      const i0 = Math.max(0, Math.round((c.da - this.inizio) * g));
      const i = i0 >= totale ? i0 - totale : i0;
      const fineRel = Math.round((c.a - this.inizio) * g);
      const bordo = (Math.floor(i / g) + 1) * g;
      const l = Math.max(1, Math.min(fineRel - i0, bordo - i));
      if (!fuori.some((e) => e.i === i && e.n === c.n)) fuori.push({ i, l, n: c.n });
    }
    return fuori.sort((a, b) => a.i - b.i || a.n - b.n);
  }
}
