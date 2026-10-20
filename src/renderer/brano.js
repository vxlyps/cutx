// Il brano: un file .cutx di testo semplice, leggibile con qualsiasi editor.
//
//   // @brano notte              ┐
//   // @bpm 140                  │ testa: nome, BPM, data, suoni dello stash usati
//   // @data 2026-10-20          │
//   // @origine /percorso/x.als   │ (solo se importato da Ableton)
//   // @suoni jungle_break, voce ┘
//   setcpm(140/4)                ← preambolo: valutato con ogni sezione
//   // @sezione intro            ← da qui una sezione, fino alla prossima
//   s("bd*4")
//   // @sezione basso · volume 0.8 · muto   ← informazioni della sezione (dal live)
//   note("c1*8").s("supersaw")
//
// Il brano si tiene riga per riga, così com'è: riscriverlo dà esattamente il testo di partenza.
// Le funzioni qui non toccano niente fuori: prendono un brano e ne restituiscono uno nuovo.

export const NOMI_SEZIONE = ['intro', 'drum', 'basso', 'melodia', 'break', 'drop', 'outro'];

const TESTA = /^\/\/ @(brano|bpm|data|origine|suoni)(?:\s+(.*))?$/;
const SEZIONE = /^\s*\/\/\s*@sezione\b\s*(.*)$/;
const ORDINE_TESTA = ['brano', 'bpm', 'data', 'origine', 'suoni'];
const SEP = ' · ';

export const eSezione = (riga) => SEZIONE.test(riga);

// "intro · volume 0.8 · muto" → { nome: 'intro', info: { volume: 0.8, muto: true } }
export function leggiRigaSezione(riga) {
  const resto = riga.match(SEZIONE)?.[1]?.trim() ?? '';
  const [nome, ...pezzi] = resto.split(/\s+·\s+/);
  const info = {};
  for (const p of pezzi) {
    const [chiave, ...valore] = p.trim().split(/\s+/);
    if (!chiave) continue;
    const v = valore.join(' ');
    info[chiave] = v === '' ? true : Number.isFinite(Number(v)) ? Number(v) : v;
  }
  return { nome: nome.trim(), info };
}

export function rigaSezione(nome, info = {}) {
  const pezzi = Object.entries(info)
    .filter(([, v]) => v !== false && v !== undefined && v !== null)
    .map(([k, v]) => (v === true ? k : `${k} ${v}`));
  return `// @sezione ${[nome, ...pezzi].join(SEP)}`;
}

// --- leggere e scrivere ---

export function leggi(testo) {
  const righe = testo.split('\n');
  let i = 0;
  const testa = [];
  while (i < righe.length && TESTA.test(righe[i])) testa.push(righe[i++]);
  const preambolo = [];
  while (i < righe.length && !eSezione(righe[i])) preambolo.push(righe[i++]);
  const sezioni = [];
  while (i < righe.length) {
    const riga = righe[i++];
    const corpo = [];
    while (i < righe.length && !eSezione(righe[i])) corpo.push(righe[i++]);
    sezioni.push({ riga, ...leggiRigaSezione(riga), corpo });
  }
  return { testa, preambolo, sezioni };
}

export function scrivi(brano) {
  return [...brano.testa, ...brano.preambolo, ...brano.sezioni.flatMap((s) => [s.riga, ...s.corpo])].join('\n');
}

// I valori della testa: { brano, bpm, data, origine, suoni: [] }
export function testa(brano) {
  const t = {};
  for (const r of brano.testa) {
    const [, k, v = ''] = r.match(TESTA);
    t[k] = k === 'suoni' ? v.split(',').map((x) => x.trim()).filter(Boolean) : k === 'bpm' ? Number(v) : v.trim();
  }
  return t;
}

// Cambia i valori della testa lasciando dove sono le righe che c'erano già.
export function conTesta(brano, valori) {
  const riga = (k, v) => `// @${k} ${Array.isArray(v) ? v.join(', ') : v}`.trimEnd();
  const testaNuova = [...brano.testa];
  for (const k of ORDINE_TESTA) {
    if (!(k in valori)) continue;
    const i = testaNuova.findIndex((r) => r.match(TESTA)[1] === k);
    if (i >= 0) testaNuova[i] = riga(k, valori[k]);
    else {
      // in ordine: dopo l'ultima chiave che la precede
      const prima = ORDINE_TESTA.slice(0, ORDINE_TESTA.indexOf(k));
      let dove = 0;
      testaNuova.forEach((r, j) => prima.includes(r.match(TESTA)[1]) && (dove = j + 1));
      testaNuova.splice(dove, 0, riga(k, valori[k]));
    }
  }
  return { ...brano, testa: testaNuova };
}

// --- il codice da suonare ---

// Preambolo + righe della sezione (tutte, o solo quelle scelte). In `inizio` c'è dove
// cominciano le righe della sezione nel codice, per riportare le note evidenziate al loro posto.
export function codice(brano, i, righe = null) {
  const pre = brano.preambolo.join('\n');
  const corpo = (righe ?? brano.sezioni[i].corpo).join('\n');
  const inizio = pre ? pre.length + 1 : 0;
  return { codice: pre ? `${pre}\n${corpo}` : corpo, inizio };
}

// --- operazioni sulle sezioni ---

const conSezioni = (brano, sezioni) => ({ ...brano, sezioni });

export function rinomina(brano, i, nome) {
  return conSezioni(
    brano,
    brano.sezioni.map((s, j) => (j === i ? { ...s, nome, riga: rigaSezione(nome, s.info) } : s)),
  );
}

export function conInfo(brano, i, info) {
  return conSezioni(
    brano,
    brano.sezioni.map((s, j) => (j === i ? { ...s, info, riga: rigaSezione(s.nome, info) } : s)),
  );
}

// La sezione i si prende il corpo della successiva.
export function unisci(brano, i) {
  if (i < 0 || i >= brano.sezioni.length - 1) return brano;
  const a = brano.sezioni[i];
  const b = brano.sezioni[i + 1];
  const sezioni = [...brano.sezioni];
  sezioni.splice(i, 2, { ...a, corpo: [...a.corpo, ...b.corpo] });
  return conSezioni(brano, sezioni);
}

// Dalla riga k del corpo in poi diventa una sezione nuova, subito dopo.
export function dividi(brano, i, k, nome) {
  const s = brano.sezioni[i];
  if (!s || k <= 0 || k > s.corpo.length) return brano;
  const sezioni = [...brano.sezioni];
  sezioni.splice(i, 1, { ...s, corpo: s.corpo.slice(0, k) }, { riga: rigaSezione(nome), nome, info: {}, corpo: s.corpo.slice(k) });
  return conSezioni(brano, sezioni);
}

export function sposta(brano, da, a) {
  if (da === a || da < 0 || a < 0 || da >= brano.sezioni.length || a >= brano.sezioni.length) return brano;
  const sezioni = [...brano.sezioni];
  const [s] = sezioni.splice(da, 1);
  sezioni.splice(a, 0, s);
  return conSezioni(brano, sezioni);
}

export function conCorpo(brano, i, corpo) {
  return conSezioni(
    brano,
    brano.sezioni.map((s, j) => (j === i ? { ...s, corpo } : s)),
  );
}

// --- lavorare sul testo intero (modalità libero) ---

// I blocchi del testo, con le righe (contate da 0) in cui stanno.
// Il blocco del preambolo ha sezione = -1; la testa è fuori dai blocchi.
export function blocchi(testo) {
  const b = leggi(testo);
  const out = [];
  let riga = b.testa.length;
  out.push({ sezione: -1, nome: null, testa: null, da: riga, a: riga + b.preambolo.length });
  riga += b.preambolo.length;
  b.sezioni.forEach((s, i) => {
    out.push({ sezione: i, nome: s.nome, info: s.info, testa: riga, da: riga + 1, a: riga + 1 + s.corpo.length });
    riga += 1 + s.corpo.length;
  });
  return { brano: b, blocchi: out };
}

// Il blocco che contiene la riga n (la riga @sezione appartiene alla sua sezione).
export function bloccoDellaRiga(testo, n) {
  const { blocchi: bl } = blocchi(testo);
  return bl.find((x) => (x.testa ?? x.da) <= n && n < x.a) ?? bl.at(-1);
}

// "+ sezione": le righe da..a (comprese, contate da 0) diventano la sezione `nome`.
// Se stanno in mezzo a un blocco, le righe scelte si spostano subito dopo quel blocco,
// così quelle di prima e di dopo restano dov'erano. Ritorna { testo, riga } dove riga è la
// nuova riga @sezione, oppure { errore } se la selezione attraversa più sezioni.
export function aggiungiSezione(testo, da, a, nome) {
  const righe = testo.split('\n');
  const { blocchi: bl } = blocchi(testo);
  if (da < bl[0].da) return { errore: 'la testa del brano non può diventare una sezione' };
  const blocco = bloccoDellaRiga(testo, da);
  if (blocco.testa === da) return { errore: 'parti da una riga sotto il nome della sezione' };
  if (a >= blocco.a) return { errore: 'la selezione attraversa più sezioni' };
  const scelte = righe.slice(da, a + 1);
  // Tutto il corpo di una sezione: basta rinominarla.
  if (blocco.sezione >= 0 && da === blocco.da && a === blocco.a - 1) {
    righe[blocco.testa] = rigaSezione(nome, blocco.info);
    return { testo: righe.join('\n'), riga: blocco.testa };
  }
  const resto = [...righe.slice(0, da), ...righe.slice(a + 1)];
  const dove = blocco.a - scelte.length; // la fine del blocco, senza le righe tolte
  resto.splice(dove, 0, rigaSezione(nome), ...scelte);
  return { testo: resto.join('\n'), riga: dove };
}

// --- dal live a un brano ---

// livelli: [{ nome, codice, volume, muto }] nell'ordine in cui sono entrati.
export function daLivelli(livelli, { nome, bpm, data, suoni = [] }) {
  const visti = new Map();
  const sezioni = livelli.map((l) => {
    // due livelli con lo stesso nome restano distinti: basso, basso 2…
    visti.set(l.nome, (visti.get(l.nome) ?? 0) + 1);
    const n = visti.get(l.nome) > 1 ? `${l.nome} ${visti.get(l.nome)}` : l.nome;
    const info = {};
    if (l.volume !== undefined && l.volume !== 1) info.volume = l.volume;
    if (l.muto) info.muto = true;
    return { riga: rigaSezione(n, info), nome: n, info, corpo: l.codice.replace(/\n+$/, '').split('\n') };
  });
  const vuoto = { testa: [], preambolo: [], sezioni };
  return scrivi(conTesta(vuoto, { brano: nome, bpm, data, suoni })) + '\n';
}

// Un nome di file sicuro dal nome del brano.
export function nomeFile(nome) {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 _-]+/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${base || 'brano'}.cutx`;
}
