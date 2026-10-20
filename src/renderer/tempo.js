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

// --- La mappa del tempo ---
// Il live comanda il tempo e lo pubblica a tutti (cuffia, interfaccia, uscita) come una mappa:
//   { ciclo0, epoca0, cps, cambi: [{ ciclo, cps }] }
// "al tempo assoluto epoca0 (ms) si è al ciclo ciclo0, e si va a cps cicli al secondo; e ai cicli indicati in `cambi` il tempo
// cambia". I cambi entrano sempre all'inizio di un ciclo, così i cicli (e con loro la frase) continuano a contare senza salti.
// Questo è l'unico punto da cui si legge il tempo: lo leggerà anche il click di sync del PO-33 (fase 4).
// Funzioni pure: le provano i test.

export const bpmDi = (cps) => cps * 240; // 4 quarti per ciclo
export const cpsDi = (bpm) => bpm / 240;
export const arrotondaBpm = (bpm) => Math.round(bpm * 10) / 10;

// La mappa vista da quell'epoca: i cambi già passati sono assorbiti, restano quelli in arrivo.
export function risolvi(mappa, epoca) {
  let { ciclo0, epoca0, cps } = mappa;
  const cambi = [...(mappa.cambi ?? [])].sort((a, b) => a.ciclo - b.ciclo);
  while (cambi.length && ciclo0 + ((epoca - epoca0) / 1000) * cps >= cambi[0].ciclo) {
    const c = cambi.shift();
    epoca0 += ((c.ciclo - ciclo0) / cps) * 1000;
    ciclo0 = c.ciclo;
    cps = c.cps;
  }
  return { ciclo0, epoca0, cps, cambi };
}

// Il ciclo (con la parte frazionaria) in cui siamo a quell'epoca.
export function cicloDi(mappa, epoca) {
  const m = risolvi(mappa, epoca);
  return m.ciclo0 + ((epoca - m.epoca0) / 1000) * m.cps;
}

// Il tempo (cicli al secondo) che vale a quell'epoca.
export const cpsAl = (mappa, epoca) => risolvi(mappa, epoca).cps;

// Quando (epoca, ms) comincia un ciclo: passa dai cambi di tempo.
export function epocaDi(mappa, ciclo) {
  let { ciclo0, epoca0, cps } = mappa;
  for (const c of [...(mappa.cambi ?? [])].sort((a, b) => a.ciclo - b.ciclo)) {
    if (ciclo < c.ciclo) break;
    epoca0 += ((c.ciclo - ciclo0) / cps) * 1000;
    ciclo0 = c.ciclo;
    cps = c.cps;
  }
  return epoca0 + ((ciclo - ciclo0) / cps) * 1000;
}

// Il tempo che si avrà quando tutti i cambi in arrivo saranno entrati (per mostrare "→ 128"), o null.
export function tempoInArrivo(mappa, epoca) {
  const m = risolvi(mappa, epoca);
  return m.cambi.length ? m.cambi.at(-1).cps : null;
}

// La posizione nella frase (1..lunghezza) a quell'epoca: conta i cicli, quindi un cambio di tempo non la sposta.
export function fraseDi(mappa, epoca, lunghezza) {
  const intero = Math.floor(cicloDi(mappa, epoca));
  return ((((intero - (mappa.ancoraFrase ?? 0)) % lunghezza) + lunghezza) % lunghezza) + 1;
}
