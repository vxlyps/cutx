// Rivelatore di click per la prova ad anello: segnala il tempo esatto in cui
// il segnale in ingresso supera la soglia, poi ignora tutto per un attimo.
const SOGLIA = 0.2;
const PAUSA_S = 0.15;

class Rivelatore extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ultimo = -1;
  }
  process(ingressi) {
    const canale = ingressi[0]?.[0];
    if (canale) {
      for (let i = 0; i < canale.length; i++) {
        const t = currentTime + i / sampleRate;
        if (Math.abs(canale[i]) > SOGLIA && t - this.ultimo > PAUSA_S) {
          this.ultimo = t;
          this.port.postMessage(t);
        }
      }
    }
    return true;
  }
}

registerProcessor('cutx-rivelatore', Rivelatore);
