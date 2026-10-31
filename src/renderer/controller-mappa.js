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

// Pagina B, le otto manopole: volume (il livello), filtro, risonanza, eco, riverbero, velocità (a scatti), sporco, altezza (semitoni).
export const PAGINA_B = ['volume', 'filtro', 'risonanza', 'eco', 'riverbero', 'velocita', 'sporco', 'altezza'];

// Pagina A, i tasti in alto: ◀ momento, ▶ momento, passa la spina, cuffia, go live, togli, piano/registra, paracadute (tenuto 1 s).
export const TASTI_A = ['momentoIndietro', 'momentoAvanti', 'passaSpina', 'cuffia', 'goLive', 'togli', 'piano', 'paracadute'];

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

// Il fader: il filtro del drop su tutto il live. In alto = aperto; scendendo, un passa-basso si chiude (150 Hz in fondo).
export const FILTRO_MASTER_MIN = 150;
export const FILTRO_MASTER_MAX = 16000;
export const frequenzaMaster = (x) => (x >= 0.985 ? null : FILTRO_MASTER_MIN * (FILTRO_MASTER_MAX / FILTRO_MASTER_MIN) ** Math.max(0, x)); // null = aperto

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
