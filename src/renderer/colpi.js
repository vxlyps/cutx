// I colpi: gli otto tasti della fila bassa del controller, definiti in un file `colpi.cutx` nello stash (una riga per colpo), così li cambio e ne scrivo
// di nuovi io. Modulo puro (lo provano i test).
//
//   // commenti e righe vuote si saltano
//   nome · bersaglio · funzione Strudel
//   nome · livello · codice del livello · catena
//
// - bersaglio `beat`: le righe vanno nella coda del beat (finché non c'è, il livello 1) o delle clip con la manopola tenuta premuta;
// - bersaglio `tutto`: una riga globale all(x => …), per ogni livello;
// - bersaglio `livello`: un livello temporaneo (il codice) con la catena in coda (il «sale»: rumore con un passa-alto che sale);
// - {2,4,8}: valori a gradini, avanzano ogni PASSO_BATTITI battiti finché tengo premuto (il «roll»: .ply che cresce).
// I primi otto colpi del file sono i tasti 9–16 (DROP … REC), nell'ordine in cui sono scritti.

export const PASSO_BATTITI = 2; // ogni quanti battiti avanza un valore a gradini
export const SEPARATORE = ' · ';
export const BERSAGLI = ['beat', 'tutto', 'livello'];

export const COLPI_PREDEFINITI = `// colpi.cutx — una riga per colpo: nome · bersaglio · funzione Strudel
// I primi otto sono i tasti della fila bassa del controller, da sinistra (DROP REPLACE REWIND FORWARD CYCLE STOP PLAY REC).
// bersaglio: beat (le righe vanno nella coda del beat, o delle clip con la manopola tenuta premuta)
//            tutto (una riga globale all(x => …) su ogni livello)
//            livello (un livello temporaneo: nome · livello · codice · catena)
// {2,4,8} = valori a gradini: avanzano ogni 2 battiti finché tieni premuto.
roll · beat · .ply({2,4,8})
spezza · beat · .degradeBy(.4).sometimesBy(.3, x => x.ply(2))
mezzo · beat · .slow(2)
doppio · beat · .fast(2)
indietro · beat · .rev()
stop · tutto · .gain(0)
sale · livello · s("white*16").decay(.12).sustain(0) · .hpf({400,900,2000,4500,9000}).gain({.08,.12,.16,.2,.26})
eco · tutto · .delay(.7).delayfeedback(.6)
`;

// Una catena (.a(1).b(x => x.c(2))) → le sue chiamate, una per voce: [{ chiave, testo }]. null se non è una catena ben fatta.
export function dividiCatena(catena) {
  const testo = String(catena).trim();
  if (!testo.startsWith('.')) return null;
  const voci = [];
  let profondita = 0;
  let inizio = 0;
  let stringa = null;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (stringa) {
      if (c === '\\') i++;
      else if (c === stringa) stringa = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') stringa = c;
    else if (c === '(') profondita++;
    else if (c === ')') {
      profondita--;
      if (profondita < 0) return null;
    } else if (c === '.' && profondita === 0 && i > inizio && testo[i - 1] === ')') {
      voci.push(testo.slice(inizio, i));
      inizio = i;
    }
  }
  if (profondita !== 0 || stringa) return null;
  voci.push(testo.slice(inizio));
  const fatte = voci.map((v) => {
    const m = v.match(/^\.([A-Za-z_]\w*)\(/);
    return m && v.endsWith(')') ? { chiave: m[1], testo: v } : null;
  });
  return fatte.every(Boolean) ? fatte : null;
}

// I valori a gradini {a,b,c} di un testo: le liste (solo valori semplici, non il corpo di una funzione).
const VALORE = String.raw`(?:\s*[-+]?[\d.]+\s*|\s*"[^"]*"\s*|\s*'[^']*'\s*)`;
const GRADINI = new RegExp(String.raw`\{(${VALORE}(?:,${VALORE})*)\}`, 'g');
const elenco = (g) => g.split(',').map((x) => x.trim());

export function passiDi(testo) {
  let massimo = 1;
  for (const m of String(testo).matchAll(GRADINI)) massimo = Math.max(massimo, elenco(m[1]).length);
  return massimo;
}

// Il testo al gradino k (si ferma sull'ultimo): .ply({2,4,8}) → .ply(2), .ply(4), .ply(8), .ply(8)…
export const espandi = (testo, k) => String(testo).replace(GRADINI, (_, g) => {
  const v = elenco(g);
  return v[Math.min(Math.max(0, k), v.length - 1)];
});

// Il file → { colpi, errori }. Ogni colpo: { nome, bersaglio, base, catena, voci, passi, riga }.
export function leggiColpi(testo) {
  const colpi = [];
  const errori = [];
  String(testo)
    .split('\n')
    .forEach((riga, i) => {
      const r = riga.trim();
      if (!r || r.startsWith('//')) return;
      const campi = r.split(SEPARATORE).map((x) => x.trim());
      const [nome, bersaglioScritto, ...resto] = campi;
      const bersaglio = bersaglioScritto === 'spina' ? 'beat' : bersaglioScritto; // «spina» è il nome vecchio del beat
      const errore = (m) => errori.push({ riga: i + 1, testo: r, errore: m });
      if (campi.length < 3 || !nome) return errore('servono almeno tre campi: nome · bersaglio · funzione');
      if (!BERSAGLI.includes(bersaglio)) return errore(`il bersaglio dev'essere ${BERSAGLI.join(', ')}`);
      let base = null;
      let catena = resto.at(-1);
      if (bersaglio === 'livello') {
        if (resto.length < 2) return errore('un colpo «livello» vuole: nome · livello · codice · catena');
        base = resto.slice(0, -1).join(SEPARATORE);
      } else catena = resto.join(SEPARATORE);
      const voci = dividiCatena(catena);
      if (!voci) return errore('la funzione dev\'essere una catena come .fast(2).rev()');
      colpi.push({ nome, bersaglio, base, catena, voci, passi: passiDi(catena), riga: i + 1 });
    });
  return { colpi, errori };
}

// Le voci di un colpo al gradino k: [{ chiave, testo }] con i numeri già scelti.
export const vociAl = (colpo, k) => colpo.voci.map((v) => ({ chiave: v.chiave, testo: espandi(v.testo, k) }));

// La riga globale di un colpo «tutto» al gradino k: all(x => x.gain(0)).
export const rigaGlobaleAl = (colpo, k) => `all(x => x${espandi(colpo.catena, k)})`;

// Il testo di una voce per la coda (le righe di coda sono .nome(...)).
export const rigaCodaAl = (voce, k) => espandi(voce.testo, k);

// I colpi dei tasti: i primi `n`.
export const dieciTasti = (colpi, n = 8) => colpi.slice(0, n);

// Quanto dura un gradino in millisecondi (a quel BPM, un battito = un quarto).
export const gradinoMs = (bpm) => (60000 / Math.max(20, bpm)) * PASSO_BATTITI;
