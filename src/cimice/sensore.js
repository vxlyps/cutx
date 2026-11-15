// Il sensore della cimice: a ogni battuta legge cosa sta suonando e dice se c'è una variazione o un drop.
// Puro: niente schermo, niente audio. Riceve numeri già letti dai dati veri di CUTX (livelli live, volumi, note del pattern, scena, fader).

// Quanto spesso entra: cooldown (battute minime tra un'uscita e la prossima entrata) e probabilità a ogni variazione.
export const FREQUENZE = {
  raro: { cooldown: 16, probabilita: 0.25 },
  ogni_tanto: { cooldown: 8, probabilita: 0.5 },
  spesso: { cooldown: 4, probabilita: 0.8 },
};

export function frequenzaDi({ cooldown, probabilita }) {
  for (const [nome, f] of Object.entries(FREQUENZE)) if (f.cooldown === cooldown && Math.abs(f.probabilita - probabilita) < 0.001) return nome;
  return 'personalizzata';
}

const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// Il basso di un evento di Strudel (hap.value): una cassa o un suono basso, o una nota sotto il do 2 (midi 48).
const NOMI_BASSI = /^(bd|kick|sub|bass|bassdrum|808|rolandtr\d+_bd)/i;
const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export function midiDi(nota) {
  if (typeof nota === 'number') return nota;
  const m = /^([a-g])([#bs]*)(-?\d+)?$/i.exec(String(nota ?? '').trim());
  if (!m) return null;
  const alt = [...m[2]].reduce((a, c) => a + (c === '#' || c === 's' ? 1 : -1), 0);
  return 12 * ((m[3] === undefined ? 3 : Number(m[3])) + 1) + PC[m[1].toLowerCase()] + alt;
}
export function eBasso(valore) {
  if (!valore || typeof valore !== 'object') return false;
  if (typeof valore.s === 'string' && NOMI_BASSI.test(valore.s)) return true;
  const midi = midiDi(valore.note ?? valore.n);
  return midi !== null && midi < 48;
}

// Quanto è «chiuso» il fader (0 = nessun effetto, 1 = al massimo), letto dalle righe globali che il fader scrive: all(x => x.lpf(1920)) ecc.
// Così lo legge anche il proiettore, che non ha il controller. Nessuna riga = 0.
export function chiusuraDaRighe(righe) {
  const riga = (righe ?? []).find((r) => /^\s*all\(/.test(r));
  if (!riga) return 0;
  const n = (nome) => { const m = new RegExp(`\\.${nome}\\(\\s*(-?[\\d.]+)`).exec(riga); return m ? Number(m[1]) : null; };
  const lp = n('lpf');
  if (lp !== null) return Math.max(0, Math.min(1, 1 - Math.log(lp / 150) / Math.log(16000 / 150)));
  const hp = n('hpf');
  if (hp !== null) return Math.max(0, Math.min(1, Math.log(Math.max(hp, 40) / 40) / Math.log(8000 / 40)));
  const cr = n('crush');
  if (cr !== null) return Math.max(0, Math.min(1, (16 - cr) / 12));
  const v = n('delay') ?? n('room');
  return v !== null ? Math.max(0, Math.min(1, v)) : 0;
}

export function creaSensore() {
  const st = { energie: [], bassi: [], firma: null, scenaDrop: false, campioni: [], faderDrop: false };

  return {
    // Il fader (0 = nessun effetto, 1 = effetto al massimo): se era chiuso e si riapre di scatto, è un drop.
    campionaFader(chiusura, ms) {
      if (typeof chiusura !== 'number' || Number.isNaN(chiusura)) return;
      st.campioni = st.campioni.filter((c) => ms - c.ms <= 1500);
      const prima = Math.max(0, ...st.campioni.map((c) => c.v));
      if (chiusura <= 0.12 && prima >= 0.45) { st.faderDrop = true; st.campioni = []; }
      else st.campioni.push({ v: chiusura, ms });
    },

    // opzioni: { energia, basso (quante note basse in questa battuta), firma (stringa: chi suona + scena), scenaDrop, sensibilita 0..1 }
    // ritorna { variazione, drop, motivo }
    battuta({ energia = 0, basso = 0, firma = '', scenaDrop = false, sensibilita = 0.5 }) {
      const prima = st.energie.at(-1);
      const ultimiBassi = st.bassi.slice(-2);
      let variazione = false;
      let drop = false;
      let motivo = '';
      if (st.firma !== null && firma !== st.firma) { variazione = true; motivo = 'livelli'; }
      if (prima !== undefined && Math.abs(energia - prima) / Math.max(prima, 1) > 0.25) { variazione = true; motivo ||= 'energia'; }
      // il ritorno della cassa: dopo almeno due battute senza basso, torna di colpo (la sensibilità abbassa la soglia)
      const soglia = 6 - 4 * Math.max(0, Math.min(1, sensibilita));
      if (ultimiBassi.length >= 2 && basso >= soglia && Math.max(...ultimiBassi) <= basso * 0.25) { drop = true; motivo = 'cassa'; }
      if (scenaDrop && !st.scenaDrop) { drop = true; motivo = 'scena'; }
      if (st.faderDrop) { drop = true; motivo = 'fader'; }
      st.faderDrop = false;
      st.scenaDrop = scenaDrop;
      st.firma = firma;
      st.energie.push(energia);
      st.bassi.push(basso);
      if (st.energie.length > 16) { st.energie.shift(); st.bassi.shift(); }
      return { variazione: variazione || drop, drop, motivo, mediaEnergia: media(st.energie) };
    },

    // un salto del tempo (stop, ripartenza): le misure di prima non valgono più
    azzera() { st.energie = []; st.bassi = []; st.firma = null; st.scenaDrop = false; st.campioni = []; st.faderDrop = false; },
  };
}
