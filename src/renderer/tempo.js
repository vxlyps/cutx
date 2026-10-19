// Conversione tra il tempo di un AudioContext e il tempo assoluto (ms dall'epoca),
// che è lo stesso per tutti i processi del Mac. Live e cuffia si parlano in tempo assoluto.

// Oltre questa differenza la stima ripartente da zero (es. dopo un cambio di uscita).
const SALTO_MS = 50;
// Quanto pesa ogni nuova lettura: la deriva tra due quarzi è lentissima, quindi si può levigare.
const PESO = 0.05;

export class Orologio {
  constructor(ac) {
    this.ac = ac;
    this.scarto = null; // ms: epoca − tempo del contesto, misurato all'uscita
  }

  aggiorna() {
    const ts = this.ac.getOutputTimestamp();
    if (this.ac.state !== 'running' || !ts.performanceTime) return this.scarto;
    const letto = performance.timeOrigin + ts.performanceTime - ts.contextTime * 1000;
    if (this.scarto === null || Math.abs(letto - this.scarto) > SALTO_MS) this.scarto = letto;
    else this.scarto += (letto - this.scarto) * PESO;
    return this.scarto;
  }

  // Quando (in tempo assoluto) esce dall'uscita il suono previsto al tempo t del contesto.
  epoca(t) {
    return this.aggiorna() + t * 1000;
  }

  // Il tempo del contesto in cui deve partire un suono che deve uscire all'epoca data.
  tempo(epoca) {
    return (epoca - this.aggiorna()) / 1000;
  }
}
