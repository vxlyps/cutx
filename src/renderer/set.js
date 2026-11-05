// Il SET: la serata, un file di testo semplice (`set.cutx`, nella radice dello stash) con i brani in ordine.
//
//   // @set venerdì al locale
//
//   brano_1.cutx · apre
//   notte-canaglia.cutx
//   mayia.cutx
//   test_jungle_1.cutx · chiude
//
// Un brano per riga (il nome del file in libreria/), nell'ordine in cui si suona; `· apre` e `· chiude` segnano il primo e l'ultimo
// (come `· volume 0.6` nei brani). `· transizione sweep 8` dice come si passa a quel brano dal precedente (vedi transizioni.js). Le righe // sono commenti, le righe vuote si saltano. Il file si tiene riga per riga:
// riscriverlo dà esattamente il testo di partenza. Modulo puro: lo provano i test.

const SEP = ' · ';
const NOME = /^\s*\/\/\s*@set\b\s*(.*)$/;

const comeFile = (nome) => (/\.cutx$/i.test(nome) ? nome : `${nome}.cutx`);

// Una riga di brano → { file, apre, chiude, transizione? }, o null se è un commento o una riga vuota.
export function leggiRiga(riga) {
  const r = String(riga).trim();
  if (!r || r.startsWith('//')) return null;
  const [nome, ...segni] = r.split(/\s+·\s+/).map((x) => x.trim());
  if (!nome) return null;
  const transizione = segni.map((s) => /^transizione\s+(.+)$/i.exec(s)?.[1]?.trim()).find(Boolean);
  return { file: comeFile(nome), apre: segni.includes('apre'), chiude: segni.includes('chiude'), ...(transizione && { transizione }) };
}

export const scriviRiga = ({ file, apre, chiude, transizione }) => [file, apre && 'apre', chiude && 'chiude', transizione && `transizione ${transizione}`].filter(Boolean).join(SEP);

// Il testo → { righe: [{ testo } | { brano }], nome }
export function leggiSet(testo) {
  const righe = String(testo ?? '')
    .split('\n')
    .map((riga) => {
      const brano = leggiRiga(riga);
      return brano ? { riga, brano } : { riga };
    });
  const nome = righe.map((r) => NOME.exec(r.riga)?.[1]?.trim()).find((n) => n !== undefined) ?? '';
  return { righe, nome };
}

export const scriviSet = (set) => set.righe.map((r) => r.riga).join('\n');

export const brani = (set) => set.righe.filter((r) => r.brano).map((r) => r.brano);

// Il file di un set nuovo (o con il primo brano dentro).
export const setVuoto = (nome = 'serata') => leggiSet(`// @set ${nome}\n\n`);

const conBrani = (set, nuovi) => {
  // le righe di testo restano dove sono; le righe dei brani si riscrivono nell'ordine nuovo
  let k = 0;
  const righe = set.righe.map((r) => (r.brano ? { riga: scriviRiga(nuovi[k]), brano: nuovi[k++] } : r));
  for (; k < nuovi.length; k++) {
    const ultimaVuota = righe.length && !righe.at(-1).riga.trim();
    righe.splice(ultimaVuota ? righe.length - 1 : righe.length, 0, { riga: scriviRiga(nuovi[k]), brano: nuovi[k] });
  }
  return { ...set, righe };
};

// Le righe di brano tolte (meno di prima): si tolgono le ultime righe di brano del file.
function senzaRighe(set, quante) {
  let tolte = 0;
  const righe = [...set.righe];
  for (let i = righe.length - 1; i >= 0 && tolte < quante; i--) {
    if (righe[i].brano) {
      righe.splice(i, 1);
      tolte++;
    }
  }
  return { ...set, righe };
}

function applica(set, nuovi) {
  const prima = brani(set).length;
  const base = nuovi.length < prima ? senzaRighe(set, prima - nuovi.length) : set;
  return conBrani(base, nuovi);
}

export const aggiungi = (set, file) => (brani(set).some((b) => b.file === comeFile(file)) ? set : applica(set, [...brani(set), { file: comeFile(file), apre: false, chiude: false }]));
export const togli = (set, i) => applica(set, brani(set).filter((_, j) => j !== i));

export function sposta(set, da, a) {
  const b = brani(set);
  if (da < 0 || da >= b.length || a < 0 || a >= b.length || da === a) return set;
  const [x] = b.splice(da, 1);
  b.splice(a, 0, x);
  return applica(set, b);
}

// Segna il brano i come quello che apre o che chiude (uno solo per tipo; richiamato di nuovo lo toglie).
export function segna(set, i, cosa) {
  const b = brani(set).map((x, j) => ({ ...x, [cosa]: j === i ? !x[cosa] : false }));
  return applica(set, b);
}

// Il brano da cui si parte: quello che apre, altrimenti il primo.
export const primo = (set) => (brani(set).find((b) => b.apre) ?? brani(set)[0])?.file ?? null;

// La transizione scritta per arrivare al brano `file` (testo, come «sweep 8»), o '' se non c'è.
export const transizioneDi = (set, file) => brani(set).find((b) => b.file === file)?.transizione ?? '';

// Il brano dopo `file` nell'ordine del set (null se è l'ultimo o non c'è).
export function dopo(set, file) {
  const b = brani(set);
  const i = b.findIndex((x) => x.file === file);
  return i >= 0 && i < b.length - 1 ? b[i + 1].file : null;
}

// Un passo avanti o indietro nell'ordine del set (senza girare intorno), a partire da `file`; null se non c'è.
export function vicino(set, file, verso) {
  const b = brani(set);
  const i = b.findIndex((x) => x.file === file);
  const j = i < 0 ? (verso > 0 ? 0 : b.length - 1) : i + verso;
  return j >= 0 && j < b.length && j !== i ? b[j].file : null;
}
