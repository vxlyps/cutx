// La mappa dell'X-Touch Mini: cosa fa ogni manopola e ogni tasto nelle due pagine (A «suona», B «scolpisci»). Parte pura: i valori dei
// parametri e le tabelle; chi li usa è controller.js. Ogni cosa che si tocca finisce nel codice (la coda del livello) o in un comando.
// Le pagine si scelgono con i tasti layer A e B; la pagina si vede dagli anelli (A = punto, B = fan) e dal tasto layer acceso.

// I parametri della pagina B: la chiave è la funzione Strudel che finisce nella coda; il valore sta fra min e max (log = scala logaritmica).
export const PARAMETRI = {
  filtro: { nome: 'FILTRO', corto: 'filtro', chiave: 'lpf', min: 150, max: 16000, log: true, predefinito: 1, decimali: 0, unita: 'Hz' }, // 1 = aperto
  risonanza: { nome: 'RISONANZA', corto: 'reson', chiave: 'lpq', min: 0, max: 20, predefinito: 0, decimali: 1 },
  eco: { nome: 'ECO', corto: 'eco', chiave: 'delay', min: 0, max: 1, predefinito: 0, decimali: 2 },
  riverbero: { nome: 'RIVERBERO', corto: 'riverb', chiave: 'room', min: 0, max: 1, predefinito: 0, decimali: 2 },
  sporco: { nome: 'SPORCO', corto: 'sporco', chiave: 'distort', min: 0, max: 3, predefinito: 0, decimali: 2 },
};

// Pagina B, le manopole 2–8 (la 1 è la navigazione del CUE, in tutte e due le pagine): filtro, risonanza, eco, riverbero, velocità (a scatti), sporco,
// altezza (semitoni). Il volume sta in pagina A.
export const PAGINA_B = [null, 'filtro', 'risonanza', 'eco', 'riverbero', 'velocita', 'sporco', 'altezza'];

// Pagina A, i tasti in alto: ◀ scena, ▶ scena, prossimo brano, cuffia, go live, togli, piano/registra, paracadute (tenuto 1 s).
export const TASTI_A = ['scenaIndietro', 'scenaAvanti', 'prossimoBrano', 'cuffia', 'goLive', 'togli', 'piano', 'paracadute'];

// Dal numero 0..1 al valore e ritorno.
export function valoreDa(p, x) {
  const t = Math.max(0, Math.min(1, x));
  return p.log ? p.min * (p.max / p.min) ** t : p.min + (p.max - p.min) * t;
}
export function normalizzato(p, v) {
  const n = p.log ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);
  return Math.max(0, Math.min(1, n));
}

// Velocità a scatti (al battito): .fast(¼ ½ 1 2 4); un giro di manopola = un terzo di scatto, così non scatta per sbaglio.
export const SCATTI_VELOCITA = [0.25, 0.5, 1, 2, 4];
export const PASSI_PER_SCATTO = 3;
export const SCATTO_NORMALE = 2; // l'indice di ×1: la riga .fast sparisce
export const etichettaVelocita = (v) => (v < 1 ? `×1/${Math.round(1 / v)}` : `×${v}`);
// Altezza in semitoni: .transpose(n), da -12 a +12; 0 = la riga sparisce.
export const ALTEZZA_MIN = -12;
export const ALTEZZA_MAX = 12;
export const etichettaAltezza = (n) => `${n > 0 ? '+' : ''}${n} st`;

// Il fader: un solo effetto, scelto nelle impostazioni (uguale in tutte e due le pagine), su tutto il live. Scrive righe globali con la funzione all di Strudel,
// per esempio all(x => x.lpf(1920)), che si aggiornano mentre lo muovo; a zero (o tutto aperto per il filtro) la riga sparisce.
export const FILTRO_MASTER_MIN = 150;
export const FILTRO_MASTER_MAX = 16000;

export const EFFETTI_FADER = {
  filtro: { nome: 'FILTRO', descrizione: 'passa-basso su tutto (in alto aperto, scendendo si chiude)' },
  lavaggio: { nome: 'LAVAGGIO', descrizione: 'passa-alto su tutto, sempre più sottile' },
  break: { nome: 'BREAK', descrizione: 'abbassa tutti le clip tranne il beat (finché non c\'è, tutti tranne il livello 1)' },
  riser: { nome: 'RISER', descrizione: 'rumore + passa-alto che sale' },
  eco: { nome: 'ECO', descrizione: 'lancio nel delay sempre più forte' },
  cattedrale: { nome: 'CATTEDRALE', descrizione: 'un riverbero che affoga tutto' },
  rottame: { nome: 'ROTTAME', descrizione: 'crush e coarse sempre più forti' },
};
export const FADER_PREDEFINITO = 'filtro';
export const eEffettoFader = (e) => Object.hasOwn(EFFETTI_FADER, e);

const log = (min, max, a) => min * (max / min) ** a;
const n2 = (v) => String(Math.round(v * 100) / 100);
export const SOGLIA_FADER = 0.015; // sotto (o sopra, per il filtro) l'effetto non c'è

// Cosa fa l'effetto con il fader a x (0 in basso, 1 in alto): { attivo, riga (all(x => …) o null), testo, fattore (break), riser: { hpf, gain } }.
export function calcolaFader(effetto, x) {
  const v = Math.max(0, Math.min(1, x));
  const spento = (testo = 'OFF') => ({ attivo: false, riga: null, testo });
  switch (effetto) {
    case 'filtro': {
      if (v >= 1 - SOGLIA_FADER) return spento('APERTO');
      const f = Math.round(log(FILTRO_MASTER_MIN, FILTRO_MASTER_MAX, v));
      return { attivo: true, riga: `all(x => x.lpf(${f}))`, testo: `${f} Hz` };
    }
    case 'lavaggio': {
      if (v <= SOGLIA_FADER) return spento();
      const f = Math.round(log(40, 8000, v));
      return { attivo: true, riga: `all(x => x.hpf(${f}))`, testo: `${f} Hz` };
    }
    case 'break': {
      if (v <= SOGLIA_FADER) return spento();
      const fattore = Math.round((1 - 0.85 * v) * 100) / 100;
      return { attivo: true, riga: `// break · tutti tranne il beat a ${Math.round(fattore * 100)}%`, fattore, testo: `${Math.round(fattore * 100)}%` };
    }
    case 'riser': {
      if (v <= SOGLIA_FADER) return spento();
      const f = Math.round(log(200, 9000, v));
      return { attivo: true, riga: `all(x => x.hpf(${f}))`, testo: `${f} Hz`, riser: { hpf: f, gain: Math.round((0.04 + 0.26 * v) * 100) / 100 } };
    }
    case 'eco':
      return v <= SOGLIA_FADER ? spento() : { attivo: true, riga: `all(x => x.delay(${n2(v)}).delaytime(.375).delayfeedback(.5))`, testo: `${Math.round(v * 100)}%` };
    case 'cattedrale':
      return v <= SOGLIA_FADER ? spento() : { attivo: true, riga: `all(x => x.room(${n2(v)}).roomsize(${n2(2 + 8 * v)}))`, testo: `${Math.round(v * 100)}%` };
    case 'rottame': {
      if (v <= SOGLIA_FADER) return spento();
      const bit = Math.round(16 - 12 * v);
      const coarse = 1 + Math.round(7 * v);
      return { attivo: true, riga: `all(x => x.crush(${bit}).coarse(${coarse}))`, testo: `crush ${bit}` };
    }
    default:
      return spento();
  }
}

// Il valore come si legge (con l'unità dove serve): «800 Hz», «0.40».
export function valoreTesto(p, x) {
  const v = valoreDa(p, x);
  const n = p.decimali === 0 ? String(Math.round(v)) : v.toFixed(p.decimali);
  return p.unita ? `${n} ${p.unita}` : n;
}

// Il nome corto sotto l'anello dello specchio: al massimo 6 lettere.
export const corto = (testo) => String(testo).toLowerCase().slice(0, 6);

// La riga di coda per un valore: .lpf(742), .delay(0.4)
export function rigaCoda(p, x) {
  const v = valoreDa(p, x);
  const testo = p.decimali === 0 ? String(Math.round(v)) : String(Math.round(v * 10 ** p.decimali) / 10 ** p.decimali);
  return `.${p.chiave}(${testo})`;
}

// Un passo di manopola: 1/64 dell'escursione (una rotazione lenta = fine, veloce = più passi insieme).
export const PASSO_X = 1 / 64;
export const PASSO_VOLUME = 0.02;
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
