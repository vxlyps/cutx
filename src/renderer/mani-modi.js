// I modi delle mani (sperimentale), stile Kaoss Pad: ognuno ha due manopole (parametri 0..1), dice da che gesto arrivano e come diventano
// una riga globale segnata «mano» (all(x => …) // mano). Modulo puro, lo provano i test. Il controllo (mani-controllo.js) non sa niente
// di filtri o riverberi: sa solo di valori 0..1, di dove stanno a riposo (`neutro`) e di che riga scrivere.

export const HZ_MIN = 200;
export const HZ_MAX = 16000;

const limita = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const arrotonda = (x, cifre = 2) => Number(x.toFixed(cifre));

// Da altezza (0 = chiuso … 1 = aperto) a Hz, esponenziale: ogni passo uguale è la stessa nota in più.
export const hzDaAltezza = (a) => Math.round(HZ_MIN * (HZ_MAX / HZ_MIN) ** limita(a));

// Da y a specchio (0 = bordo alto, 1 = bordo basso) ad altezza 0..1. La sensibilità (0..1) dice quanta strada fa la mano:
// 0 = serve quasi tutta la zona, 1 = basta meno della metà. Al centro il valore è a metà.
const ampiezza = (sensibilita) => 0.9 - 0.5 * limita(sensibilita);
export const altezzaDaY = (y, sensibilita = 0.5) => limita((0.5 - y) / ampiezza(sensibilita) + 0.5);
// Da x a specchio (0 = sinistra, 1 = destra) a 0..1: la destra è «di più».
export const valoreDaX = (x, sensibilita = 0.5) => limita((x - 0.5) / ampiezza(sensibilita) + 0.5);

// La risonanza (lpq), il crush (bit: meno bit = più sporco) e la distorsione dai loro 0..1
const qDa = (b) => Math.round(limita(b) * 24);
const bitDa = (a) => arrotonda(16 * (3 / 16) ** limita(a), 1);
const distorsioneDa = (b) => arrotonda(limita(b) ** 2 * 8, 1);

// Le voci (.lpf(1200), .room(0.4)…) di un modo: quelle spente (a zero) non ci sono. Su tutto il live diventano la riga globale, sul livello
// scelto righe di coda del livello.
const rigaDa = (voci) => (voci.length ? `all(x => x${voci.join('')}) // mano` : null);

// fonte: da dove arriva il parametro: 'y' altezza della mano, 'x' destra-sinistra, 'dita' apertura delle dita.
// neutro: dov'è il parametro a riposo (filtro tutto aperto = 1, il resto spento = 0). voci(valori) → voci; riga(valori) → riga o null (= niente).
export const MODI = {
  filtro: {
    nome: 'FILTRO',
    params: [{ fonte: 'y', neutro: 1 }, { fonte: 'x', neutro: 0 }],
    voci: ([a, b]) => [`.lpf(${hzDaAltezza(a)})`, qDa(b) > 0 && `.lpq(${qDa(b)})`].filter(Boolean),
    testo: ([a, b]) => `${hzDaAltezza(a)} Hz${qDa(b) > 0 ? ` · Q ${qDa(b)}` : ''}`,
  },
  spazio: {
    nome: 'SPAZIO',
    params: [{ fonte: 'y', neutro: 0 }, { fonte: 'dita', neutro: 0 }],
    voci: ([a, b]) => [arrotonda(a) > 0 && `.room(${arrotonda(a)})`, arrotonda(b * 0.9) > 0 && `.delay(${arrotonda(b * 0.9)})`].filter(Boolean),
    testo: ([a, b]) => `riverbero ${Math.round(a * 100)}% · eco ${Math.round(b * 100)}%`,
  },
  ctx: {
    nome: 'CTX',
    params: [{ fonte: 'y', neutro: 0 }, { fonte: 'x', neutro: 0 }],
    voci: ([a, b]) => [arrotonda(a) > 0 && `.crush(${bitDa(a)})`, distorsioneDa(b) > 0 && `.distort(${distorsioneDa(b)})`].filter(Boolean),
    testo: ([a, b]) => `crush ${bitDa(a)} bit · distorsione ${distorsioneDa(b)}`,
  },
};
for (const m of Object.values(MODI)) m.riga = (valori) => rigaDa(m.voci(valori));

export const ORDINE = ['filtro', 'spazio', 'ctx'];
export const MODO_DI_SERIE = 'filtro';
export const modoDopo = (id) => ORDINE[(Math.max(0, ORDINE.indexOf(id)) + 1) % ORDINE.length];
export const modoValido = (id) => (Object.hasOwn(MODI, id) ? id : MODO_DI_SERIE);
