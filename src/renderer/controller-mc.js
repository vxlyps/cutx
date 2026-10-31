// L'X-Touch Mini in modalità MC (Mackie Control): cosa manda e come si accendono anelli e tasti. Modulo puro: lo provano i test.
// Fonte: la tabella MIDI della guida ufficiale (pagina 14, «MC MODE») e il protocollo Mackie Control:
//  - manopole (V-Pot): CC 16–23 sul canale 1, valori relativi (1–63 = in avanti, 65–127 = indietro: il bit 6 è il segno);
//  - push delle manopole: note 32–39 (velocità 127 giù, 0 su);
//  - i 16 tasti: note nel gruppo delle funzioni Mackie (CLICK, SOLO, TRACK, SEND, PAN, PLUG-IN, EQ, INSTRUMENT, DROP, REPLACE, CYCLE…);
//    quali sono si controlla con la calibrazione nelle impostazioni (le etichette della guida non dicono tutta la fila bassa);
//  - tasti layer A e B: MARKER e NUDGE (le etichette a destra del fader, in alto e in basso);
//  - fader: pitch bend (il «MASTER» del Mackie è sul canale 9);
//  - anelli: CC 48–55 (0x30 + n), valore = posizione (0–11) + modo × 16 (0 punto, 1 pan, 2 fan, 3 spread) + 64 per il led sotto;
//  - led dei tasti: la stessa nota con velocità 127 (acceso), 0 (spento), 1 (lampeggia).
// In modalità standard (non MC) il controller parla sul canale 11: serve per accorgersene e rimetterlo in MC.

export const NOME_PORTA = /x-?touch mini/i;

export const MODI_ANELLO = ['punto', 'pan', 'fan', 'spread'];

// Le note note dalla guida, per posto: 16 tasti (8 in alto, 8 in basso), null = da calibrare.
export const TASTI_PREDEFINITI = [
  89, 90, 40, 41, 42, 43, 44, 45, // alto: CLICK SOLO TRACK SEND PAN PLUG-IN EQ INSTRUMENT
  87, 88, null, null, 86, null, null, null, // basso: DROP REPLACE … CYCLE …
];
export const LAYER_PREDEFINITI = { A: 84, B: 85 }; // MARKER, NUDGE

export const NOMI_TASTI = ['CLICK', 'SOLO', 'TRACK', 'SEND', 'PAN', 'PLUG-IN', 'EQ', 'INSTRUMENT', 'DROP', 'REPLACE', '', '', 'CYCLE', '', '', ''];

// Le tabelle effettive: quelle calibrate (preferenze) sopra i predefiniti.
export function tabella(preferenza) {
  preferenza ??= {};
  const tasti = TASTI_PREDEFINITI.map((n, i) => (Number.isInteger(preferenza.tasti?.[i]) ? preferenza.tasti[i] : n));
  const layer = { ...LAYER_PREDEFINITI, ...(preferenza.layer ?? {}) };
  return { tasti, layer };
}

// Un valore relativo di V-Pot → passi (con segno).
export function passiRelativi(v) {
  const m = v & 0x3f;
  return v & 0x40 ? -m : m;
}

const esadecimale = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
export { esadecimale };

// Un messaggio MIDI → { tipo, … }. tipo: 'manopola' { n, passi } · 'push' { n, giu } · 'tasto' { n, giu } · 'layer' { pagina, giu } ·
// 'fader' { valore 0..1 } · 'standard' (il controller parla come in standard) · 'altro' { nota? }.
export function decodifica(bytes, tab = tabella()) {
  const [stato = 0, a = 0, b = 0] = bytes;
  const tipo = stato & 0xf0;
  const canale = (stato & 0x0f) + 1;
  // in standard i messaggi arrivano sul canale 11 (in MC su quello 1)
  if (canale === 11 && (tipo === 0xb0 || tipo === 0x90 || tipo === 0x80)) return { tipo: 'standard' };
  if (tipo === 0xb0 && a >= 16 && a <= 23) return { tipo: 'manopola', n: a - 15, passi: passiRelativi(b) };
  if ((tipo === 0x90 || tipo === 0x80) && a >= 32 && a <= 39) return { tipo: 'push', n: a - 31, giu: tipo === 0x90 && b > 0 };
  if (tipo === 0x90 || tipo === 0x80) {
    const giu = tipo === 0x90 && b > 0;
    for (const pagina of ['A', 'B']) if (tab.layer[pagina] === a) return { tipo: 'layer', pagina, giu, nota: a };
    const i = tab.tasti.indexOf(a);
    if (i >= 0) return { tipo: 'tasto', n: i + 1, giu, nota: a };
    return { tipo: 'altro', nota: a, giu };
  }
  if (tipo === 0xe0) return { tipo: 'fader', canale, valore: ((b << 7) | a) / 16383, grezzo: (b << 7) | a };
  return { tipo: 'altro' };
}

const POSTO = (n) => `${n <= 8 ? 'alto' : 'basso'} ${((n - 1) % 8) + 1}`;

// Cosa è successo, in parole (e in piccolo il messaggio grezzo lo aggiunge chi mostra).
export function parole(e) {
  switch (e.tipo) {
    case 'manopola':
      return `manopola ${e.n} → ${e.passi > 0 ? '+' : ''}${e.passi}`;
    case 'push':
      return `manopola ${e.n} ${e.giu ? 'premuta' : 'rilasciata'}`;
    case 'tasto':
      return `tasto ${e.n} (${POSTO(e.n)}${NOMI_TASTI[e.n - 1] ? ` · ${NOMI_TASTI[e.n - 1]}` : ''}) ${e.giu ? 'giù' : 'su'}`;
    case 'layer':
      return `layer ${e.pagina} ${e.giu ? 'giù' : 'su'}`;
    case 'fader':
      return `fader → ${Math.round(e.valore * 100)}%`;
    case 'standard':
      return 'messaggio da modalità standard (canale 11)';
    default:
      return e.nota !== undefined ? `nota ${e.nota} ${e.giu ? 'giù' : 'su'} (non assegnata)` : 'messaggio non riconosciuto';
  }
}

// --- accendere ---

// Anello n (1–8): posizione 0–11 (0 = spento) nel modo scelto; sotto = il led sotto l'anello.
export function messaggioAnello(n, posizione, modo = 'punto', sotto = false) {
  const m = Math.max(0, MODI_ANELLO.indexOf(modo));
  const p = Math.max(0, Math.min(11, Math.round(posizione)));
  return [0xb0, 0x30 + n - 1, p + m * 16 + (sotto ? 64 : 0)];
}

// L'anello per un valore 0..1: punto (una posizione), fan (si riempie), pan (dal centro), spread.
export function anelloDa(n, valore, modo = 'punto') {
  const v = Math.max(0, Math.min(1, Number(valore) || 0));
  if (modo === 'pan') return messaggioAnello(n, 1 + Math.round(v * 10), 'pan');
  return messaggioAnello(n, v === 0 && modo === 'punto' ? 1 : modo === 'fan' && v === 0 ? 0 : 1 + Math.round(v * 10), modo);
}

export const messaggioTasto = (nota, stato) => [0x90, nota, stato === 'lampeggia' ? 1 : stato ? 127 : 0];

// Le note di tutti i tasti (16 + layer), per accenderli o spegnerli tutti.
export function noteTasti(tab = tabella()) {
  return [...tab.tasti.filter((n) => n !== null), tab.layer.A, tab.layer.B];
}

// Passare a MC (e a standard) dal computer: CC 127 sul canale globale (11).
export const MESSAGGIO_MC = [0xba, 127, 1];
export const MESSAGGIO_STANDARD = [0xba, 127, 0];
