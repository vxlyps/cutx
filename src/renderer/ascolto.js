// Ascoltare quello che un motore suona davvero, per i test.
// - Sentinella: ascolta il segnale digitale in uscita dal motore e controlla che ogni click
//   programmato sia uscito, e in orario. È lei che dice se le casse hanno perso un colpo.
// - Anello: il click rientra col cavo nell'ingresso della MiniFuse (prova vera, solo live).
import { elencoIngressi } from './uscite.js';

const SOGLIA_SENTINELLA = 0.01;
const TOLLERANZA_S = 0.005; // un click sentito più lontano di così dal suo orario è fuori tempo
const SCADENZA_S = 0.3; // dopo così tanto un click non sentito è perso

async function rivelatore(ac, soglia) {
  ac.cutxRivelatore ??= ac.audioWorklet.addModule('./rivelatore.js');
  await ac.cutxRivelatore;
  return new AudioWorkletNode(ac, 'cutx-rivelatore', { processorOptions: { soglia } });
}

export class Sentinella {
  constructor(ac) {
    this.ac = ac;
    this.nodo = null;
    this.azzera();
  }

  azzera() {
    this.attesi = [];
    this.conti = { attesi: 0, sentiti: 0, mancati: 0, extra: 0, scartoMaxMs: 0 };
  }

  async attiva(sorgente) {
    this.disattiva();
    this.azzera();
    const nodo = await rivelatore(this.ac, SOGLIA_SENTINELLA);
    this.muto = new GainNode(this.ac, { gain: 0 }); // il nodo deve arrivare all'uscita per lavorare
    sorgente.connect(nodo).connect(this.muto).connect(this.ac.destination);
    nodo.port.onmessage = ({ data }) => this.arrivo(data);
    this.sorgente = sorgente;
    this.nodo = nodo;
  }

  disattiva() {
    if (!this.nodo) return;
    this.sorgente.disconnect(this.nodo);
    this.nodo.disconnect();
    this.muto.disconnect();
    this.nodo = null;
  }

  atteso(t) {
    if (!this.nodo) return;
    this.attesi.push(t);
    this.conti.attesi++;
    this.scadi();
  }

  arrivo(a) {
    const i = this.attesi.findIndex((t) => Math.abs(a - t) < TOLLERANZA_S);
    if (i < 0) return this.conti.extra++;
    this.conti.sentiti++;
    this.conti.scartoMaxMs = Math.max(this.conti.scartoMaxMs, Math.abs(a - this.attesi[i]) * 1000);
    this.attesi.splice(i, 1);
  }

  scadi() {
    const limite = this.ac.currentTime - SCADENZA_S;
    while (this.attesi.length && this.attesi[0] < limite) {
      this.attesi.shift();
      this.conti.mancati++;
    }
  }

  riepilogo() {
    if (!this.nodo) return null;
    this.scadi();
    return { ...this.conti, inAttesa: this.attesi.length };
  }
}

export class Anello {
  constructor(ac) {
    this.ac = ac;
    this.click = []; // tempi del contesto dei click programmati
    this.suMisura = null; // (ms) => {}
  }

  atteso(t) {
    this.click.push(t);
    if (this.click.length > 64) this.click.shift();
  }

  async attiva(nome) {
    this.disattiva();
    if (!nome) return;
    const ingresso = (await elencoIngressi()).find((d) => d.label === nome);
    if (!ingresso) throw new Error(`ingresso non trovato: ${nome}`);
    this.flusso = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: ingresso.deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this.sorgente = this.ac.createMediaStreamSource(this.flusso);
    this.nodo = await rivelatore(this.ac);
    this.muto = new GainNode(this.ac, { gain: 0 });
    this.sorgente.connect(this.nodo).connect(this.muto).connect(this.ac.destination);
    this.nodo.port.onmessage = ({ data }) => this.arrivo(data);
  }

  disattiva() {
    this.sorgente?.disconnect();
    this.nodo?.disconnect();
    this.muto?.disconnect();
    this.flusso?.getTracks().forEach((t) => t.stop());
    this.sorgente = this.nodo = this.muto = this.flusso = null;
  }

  // Un click è rientrato dall'ingresso al tempo a del contesto.
  arrivo(a) {
    const t = this.click.filter((c) => c <= a && a - c < 0.5).at(-1);
    if (t !== undefined) this.suMisura?.((a - t) * 1000);
  }
}
