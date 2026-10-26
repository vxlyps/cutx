// Lo sfondo del proiettore, dietro al codice: niente, le note che suonano (pianoroll) o l'onda in uscita (oscilloscopio).
// Gira tutto nella finestra dell'uscita: il pianoroll legge i pattern come fa l'evidenziatore (evidenzia.js),
// l'onda arriva dal live solo mentre lo sfondo è l'oscilloscopio. La musica non dipende mai da questo.
import { patternDi } from './evidenzia.js';
import { CORSIE_N, MODI, inizioOnda, modoDopo, modoValido, posto } from './sfondo-calcolo.js';

export { MODI, modoDopo, modoValido };

const MARCIO = '159, 194, 58';
const FPS = 30;
const LARGHEZZA_ONDA = 1024;
const SENZA_ONDA_MS = 400; // senza campioni da così tanto la linea è piatta

// --- il disegno ---

export class Sfondo {
  constructor(canvas) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.modo = 'niente';
    this.onda = null;
    this.ondaAl = 0;
    this.scala = 1;
    this.ultimo = 0;
    this.eventi = new Map(); // `${id}|${codice}|${ciclo intero}` → [{ da, a, nota?, corsia? }]
    this.disegni = 0;
  }

  imposta(modo) {
    this.modo = modoValido(modo);
    this.canvas.hidden = this.modo === 'niente';
    if (this.modo === 'niente') this.c.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  suOnda(dati) {
    this.onda = dati;
    this.ondaAl = performance.now();
  }

  // metà risoluzione: a pieno schermo costa il quadruplo e a distanza non si vede la differenza
  misura() {
    const w = Math.max(2, Math.round(window.innerWidth / 2));
    const h = Math.max(2, Math.round(window.innerHeight / 2));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  disegna(ciclo, livelli, ora = performance.now()) {
    if (this.modo === 'niente' || ora - this.ultimo < 1000 / FPS - 1) return;
    this.ultimo = ora;
    this.misura();
    this.c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.modo === 'note') this.disegnaNote(ciclo, livelli);
    else this.disegnaOnda(ora);
    this.disegni++;
  }

  // gli eventi di un livello attorno al ciclo in corso; si rifanno solo quando cambia il ciclo intero
  eventiDi(l, intero) {
    const chiave = `${l.id}|${l.codice}|${intero}`;
    if (this.eventi.has(chiave)) return this.eventi.get(chiave);
    const p = patternDi(l.codice);
    if (!p) return []; // ancora in valutazione: si riprova al prossimo giro
    const lista = [];
    try {
      for (const hap of p.queryArc(intero - 1, intero + 2)) {
        if (!hap.whole) continue;
        const dove = posto(hap.value);
        if (dove) lista.push({ da: hap.whole.begin.valueOf(), a: hap.whole.end.valueOf(), ...dove });
      }
    } catch {
      return [];
    }
    this.eventi.set(chiave, lista);
    if (this.eventi.size > 60) this.eventi.delete(this.eventi.keys().next().value);
    return lista;
  }

  disegnaNote(ciclo, livelli) {
    const { c } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const prima = 0.5; // cicli visibili prima del punto che suona
    const dopo = 1.5;
    const x = (t) => ((t - (ciclo - prima)) / (prima + dopo)) * w;
    const intero = Math.floor(ciclo);
    const alto = (n) => h * (0.78 - n * 0.66); // 0.12h (acuto) … 0.78h (grave)
    const corsia = (n) => h * (0.83 + n * 0.04);
    for (const l of livelli) {
      if (l.muto || (l.da !== null && l.da > ciclo + dopo) || (l.a !== null && l.a <= ciclo - prima)) continue;
      for (const e of this.eventiDi(l, intero)) {
        if (e.a < ciclo - prima || e.da > ciclo + dopo) continue;
        // un livello non suona prima di entrare né dopo essere uscito
        if ((l.da !== null && e.da < l.da) || (l.a !== null && e.da >= l.a)) continue;
        const suona = e.da <= ciclo && ciclo < e.a;
        c.fillStyle = `rgba(${MARCIO}, ${suona ? 0.5 : 0.17})`;
        const x0 = x(e.da);
        const larghezza = Math.max(3, x(e.a) - x0 - 1);
        if (e.nota !== undefined) c.fillRect(x0, alto(e.nota), larghezza, Math.max(3, h * 0.022));
        else c.fillRect(x0, corsia(e.corsia), Math.min(larghezza, w * 0.02), Math.max(2, h * 0.025));
      }
    }
    c.fillStyle = `rgba(${MARCIO}, 0.28)`;
    c.fillRect(x(ciclo), h * 0.08, 1.5, h * 0.84);
  }

  disegnaOnda(ora) {
    const { c } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dati = this.onda && ora - this.ondaAl < SENZA_ONDA_MS ? this.onda : null;
    const punti = dati ? 640 : 2;
    const da = dati ? inizioOnda(dati) : 0;
    let picco = 0;
    if (dati) for (let i = da; i < da + punti && i < dati.length; i++) picco = Math.max(picco, Math.abs(dati[i]));
    // la scala segue il volume piano piano: un colpo non la fa saltare
    const voluta = Math.min(6, 0.8 / Math.max(picco, 0.04));
    this.scala += (voluta - this.scala) * (voluta < this.scala ? 0.5 : 0.04);
    const percorso = new Path2D();
    for (let i = 0; i < punti; i++) {
      const px = (i / (punti - 1)) * w;
      const py = h / 2 - (dati ? dati[da + i] ?? 0 : 0) * this.scala * h * 0.4;
      if (i === 0) percorso.moveTo(px, py);
      else percorso.lineTo(px, py);
    }
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // il bagliore a tre passate (shadowBlur a pieno schermo costerebbe molto di più)
    for (const [spessore, opacita] of [[h * 0.03, 0.06], [h * 0.012, 0.16], [Math.max(1.5, h * 0.004), 0.7]]) {
      c.lineWidth = spessore;
      c.strokeStyle = `rgba(${MARCIO}, ${opacita})`;
      c.stroke(percorso);
    }
  }
}

// Il live manda l'onda solo se qualcuno la chiede: la finestra dell'uscita lo dice con { tipo: 'onda', on }.
export function avviaOnda({ ac, sorgente, invia, ogniMs = 1000 / FPS }) {
  const nodo = new AnalyserNode(ac, { fftSize: LARGHEZZA_ONDA, smoothingTimeConstant: 0 });
  sorgente.connect(nodo);
  const dati = new Float32Array(nodo.fftSize);
  const timer = setInterval(() => {
    nodo.getFloatTimeDomainData(dati);
    invia(new Float32Array(dati));
  }, ogniMs);
  return () => {
    clearInterval(timer);
    sorgente.disconnect(nodo);
  };
}
