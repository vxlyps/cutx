// Dissolvenze di un livello del live: un meccanismo solo, per tutto quello che fa entrare o uscire un livello
// (go live, togli, sostituzione di un livello con lo stesso nome, paracadute, e quello che verrà).
//
// Ogni livello ha una catena sua: orbita → passa-basso → passa-alto → volume → dissolvenza → casse.
// - il volume (e il muto) lo muovono la mano e i tasti, la dissolvenza solo le curve di qui: non si pestano i piedi;
// - i due filtri stanno sempre in catena ma «aperti» sono l'identità esatta (passa-basso a Nyquist, passa-alto a 0 Hz);
// - le curve si programmano sul clock audio, agganciate ai cicli: non dipendono dal JS.
// Entra: sale il volume, e se c'è il filtro si apre un passa-basso. Esce: scende il volume, e il filtro è un passa-alto
// che sale (o un passa-basso che si chiude).

export const FILTRO_MIN_HZ = 150; // da dove si apre il passa-basso, dove si chiude
export const FILTRO_ALTO_HZ = 6000; // dove arriva il passa-alto
const PUNTI = 64;

// Curva del volume: potenza costante tra uscita e entrata (due livelli che si scambiano non fanno buco né picco).
export function curva(verso, punti = PUNTI) {
  const c = new Float32Array(punti);
  for (let i = 0; i < punti; i++) {
    const x = i / (punti - 1);
    c[i] = verso === 'entra' ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
  }
  return c;
}

// I tipi: 'volume' = solo volume; 'filtro' = volume + filtro.
export const FILTRI = { volume: { entra: null, esce: null }, filtro: { entra: 'lp', esce: 'hp' } };
export const filtroEsce = (tipo, preferito = 'hp') => (tipo === 'filtro' ? (preferito === 'lp' ? 'lp' : 'hp') : null);
export const filtroEntra = (tipo) => (tipo === 'filtro' ? 'lp' : null);

// Una dissolvenza completa dei nodi { fade, lp, hp } (GainNode e due BiquadFilterNode).
// verso 'entra' | 'esce'; da e fine sono tempi del contesto audio; filtro 'lp' | 'hp' | null.
export function programma({ ac, fade, lp, hp }, { verso, da, fine, filtro = null }) {
  const nyquist = ac.sampleRate / 2;
  const adesso = ac.currentTime;
  const t0 = Math.max(da, adesso);
  const durata = Math.max(0.05, fine - t0);
  fade.gain.cancelScheduledValues(adesso);
  if (verso === 'entra') {
    fade.gain.setValueAtTime(0, adesso); // prima di entrare non si sente comunque, ma i primi colpi partono da zero
    fade.gain.setValueCurveAtTime(curva('entra'), t0, durata);
    if (filtro === 'lp') {
      lp.frequency.cancelScheduledValues(adesso);
      lp.frequency.setValueAtTime(FILTRO_MIN_HZ, adesso);
      lp.frequency.setValueAtTime(FILTRO_MIN_HZ, t0);
      lp.frequency.exponentialRampToValueAtTime(nyquist, t0 + durata);
    }
    return;
  }
  fade.gain.setValueAtTime(1, adesso);
  fade.gain.setValueCurveAtTime(curva('esce'), t0, durata);
  if (filtro === 'hp') {
    hp.frequency.cancelScheduledValues(adesso);
    hp.frequency.setValueAtTime(0, adesso);
    hp.frequency.setValueAtTime(20, t0);
    hp.frequency.exponentialRampToValueAtTime(FILTRO_ALTO_HZ, t0 + durata);
  } else if (filtro === 'lp') {
    lp.frequency.cancelScheduledValues(adesso);
    lp.frequency.setValueAtTime(nyquist, adesso);
    lp.frequency.setValueAtTime(nyquist, t0);
    lp.frequency.exponentialRampToValueAtTime(FILTRO_MIN_HZ, t0 + durata);
  }
}

// Annulla una dissolvenza (anche una che non è ancora cominciata): il livello torna al suo volume, i filtri si riaprono.
export function annulla({ ac, fade, lp, hp }, ritornoS = 0.15) {
  const adesso = ac.currentTime;
  for (const p of [fade.gain, lp.frequency, hp.frequency]) {
    p.cancelAndHoldAtTime(adesso);
  }
  fade.gain.linearRampToValueAtTime(1, adesso + ritornoS);
  lp.frequency.exponentialRampToValueAtTime(ac.sampleRate / 2, adesso + ritornoS);
  hp.frequency.linearRampToValueAtTime(0, adesso + ritornoS);
}

// Taglio immediato (⌘.: il panico): niente dissolvenza, ma senza click.
export function taglia({ ac, fade }, durataS = 0.03) {
  const adesso = ac.currentTime;
  fade.gain.cancelAndHoldAtTime(adesso);
  fade.gain.linearRampToValueAtTime(0, adesso + durataS);
}

// Quanto manca a finire una dissolvenza d'uscita, 1 → 0 (per la barra della card). Prima che cominci è 1.
export function resta(sfuma, ciclo) {
  if (!sfuma) return null;
  if (ciclo <= sfuma.da) return 1;
  return Math.max(0, Math.min(1, (sfuma.a - ciclo) / (sfuma.a - sfuma.da)));
}
