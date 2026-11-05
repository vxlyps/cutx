// analizza-prova, la parte pura (la provano i test): registro MOVIOLA + sottotitoli Whisper + lampi del video → i momenti storti.
// Niente AI: regole semplici e scritte qui, da cambiare quando serve. I tempi sono ms dal 1970 nel registro e secondi nel video;
// il ciak (il lampo di SEGNA) dice quanto sono sfasati.

// ---------- leggere ----------

// Il registro: una riga JSON per evento, riordinate per tempo (le finestre mandano a pacchetti, nel file non sono sempre in ordine).
export function leggiRegistro(testo) {
  const eventi = [];
  for (const riga of String(testo ?? '').split('\n')) {
    if (!riga.trim()) continue;
    try {
      const e = JSON.parse(riga);
      if (Number.isFinite(e.t) && typeof e.fonte === 'string' && typeof e.tipo === 'string') eventi.push(e);
    } catch {
      // una riga rotta (la prova si è chiusa di colpo) non ferma l'analisi
    }
  }
  return eventi.map((e, i) => [e, i]).sort((a, b) => a[0].t - b[0].t || a[1] - b[1]).map(([e]) => e);
}

// I sottotitoli .srt → [{ da, a, testo }] in secondi.
export function leggiSrt(testo) {
  const secondi = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  const voci = [];
  for (const blocco of String(testo ?? '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const righe = blocco.split('\n').filter((r) => r.trim() !== '');
    const i = righe.findIndex((r) => r.includes('-->'));
    if (i < 0) continue;
    const m = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/.exec(righe[i]);
    if (!m) continue;
    const parole = righe.slice(i + 1).join(' ').trim();
    if (parole) voci.push({ da: secondi(m[1], m[2], m[3], m[4]), a: secondi(m[5], m[6], m[7], m[8]), testo: parole });
  }
  return voci;
}

// ---------- il ciak: i lampi ambra nel video ----------

// La frazione di pixel «ambra» (come il lampo di SEGNA) in un fotogramma rgb24.
export function frazioneAmbra(rgb) {
  let n = 0;
  for (let i = 0; i + 2 < rgb.length; i += 3) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    if (r > 170 && g > 90 && g < 200 && b < 120 && r - b > 100 && r > g) n++;
  }
  return n / (rgb.length / 3);
}

// Dalle frazioni di ogni fotogramma (a `fps`) ai lampi: l'inizio di ogni gruppo di fotogrammi sopra la solita quantità di ambra
// (la mediana) più `soglia`. Ritorna i secondi.
export function trovaLampi(frazioni, fps, soglia = 0.004) {
  if (!frazioni.length) return [];
  const ordinate = [...frazioni].sort((a, b) => a - b);
  const base = ordinate[Math.floor(ordinate.length / 2)];
  const lampi = [];
  let dentro = false;
  let ultimo = -Infinity;
  frazioni.forEach((f, i) => {
    const acceso = f > base + soglia;
    if (acceso && !dentro && i / fps - ultimo > 1) lampi.push(i / fps);
    if (acceso) ultimo = i / fps;
    dentro = acceso;
  });
  return lampi;
}

// Allinea registro e video. segni: i tempi (ms) dei SEGNO nel registro; lampi: i secondi dei lampi nel video;
// sposta: se c'è, il secondo del video in cui è il primo SEGNO (vince sul resto, è la riserva).
// → { offsetMs, come, avvisi }: tempo del registro = secondo del video × 1000 + offsetMs.
export function allinea(segni, lampi, sposta = null) {
  const avvisi = [];
  if (!segni.length) return { offsetMs: null, come: 'nessun SEGNO nel registro: non so allineare il video', avvisi };
  if (Number.isFinite(sposta)) return { offsetMs: segni[0] - sposta * 1000, come: `a mano: il primo SEGNO è al secondo ${sposta} del video`, avvisi };
  if (!lampi.length) return { offsetMs: null, come: 'nessun lampo ambra nel video (provo con --sposta SECONDI: il secondo del video in cui è il primo SEGNO)', avvisi };
  const offsetMs = segni[0] - lampi[0] * 1000;
  // gli altri lampi devono cadere sugli altri segni: se no, c'è una deriva (o un lampo di troppo)
  for (const l of lampi.slice(1)) {
    const t = l * 1000 + offsetMs;
    const vicino = segni.reduce((m, s) => (Math.abs(s - t) < Math.abs(m - t) ? s : m), segni[0]);
    if (Math.abs(vicino - t) > 400) avvisi.push(`il lampo al secondo ${l.toFixed(1)} non cade su nessun SEGNO (a ${Math.round(Math.abs(vicino - t))} ms)`);
  }
  if (segni.length > lampi.length) avvisi.push(`nel video ho trovato ${lampi.length} lampi su ${segni.length} SEGNO (forse i primi minuti non bastano o il lampo era fuori dall'inquadratura)`);
  return { offsetMs, come: `col lampo del primo SEGNO (video ${lampi[0].toFixed(2)} s)`, avvisi };
}

// ---------- i momenti storti ----------

export const SOGLIE = {
  ritardoIngressoMs: 4000, // da quando mando una clip a quando entra: più di così è lungo (una battuta a 120 bpm sono 2 s)
  rispostaMs: 500, // il live che risponde dopo più di così è lento
  silenzioDb: -60, // il livello medio sotto il quale è silenzio
  silenzioS: 3, // per quanti secondi
  giroLentoMs: 150,
  cpuAlta: 85,
  cpuS: 3,
  ripetuti: { invio: [3, 15000], midi: [4, 4000], tasto: [4, 4000] }, // [quante volte, entro quanti ms]
};

// Le parole che dici a voce. Regole semplici, da cambiare qui.
export const PAROLE = {
  idea: /\b(vorrei|vorrebbe|sarebbe (bello|utile|figo|comodo)|perch[eé] non|e se|idea|mi servirebbe|servirebbe|manca|dovrebbe|bisognerebbe|potrebbe)\b/i,
  difetto: /\b(non va|non funziona|non parte|non si sente|non risponde|non entra|sbagliato|bug|rotto|errore|problema|si [eè] bloccato|bloccato|scatta|click|taglia|crasha|crash)\b/i,
  inciampo: /\b(boh|aspetta|riprovo|di nuovo|ancora una volta|ops|oddio|cavolo|non capisco|dov['’]?[eè]|dove sta|ma perch[eé]|strano)\b/i,
};

const primaRiga = (s) => String(s ?? '').split('\n')[0].slice(0, 160);
const secondoDi = (t, t0) => (t - t0) / 1000;

// I motivi per cui un momento è storto, dal registro. → [{ t, tipo: 'difetto' | 'inciampo' | 'segno', fonte, testo, dettaglio? }]
export function trovaMotivi(eventi, soglie = SOGLIE) {
  const motivi = [];
  const aggiungi = (e, tipo, testo, dettaglio) => motivi.push({ t: e.t, tipo, fonte: e.fonte, testo, ...(dettaglio ? { dettaglio } : {}) });

  const segniT = eventi.filter((e) => e.fonte === 'app' && e.tipo === 'segno').map((e) => e.t);
  const eUnSegno = (e) => segniT.some((t) => t - e.t >= -50 && t - e.t <= 300); // il tasto SEGNA premuto: non è un tentativo ripetuto
  const invii = new Map(); // id → invio, per misurare quanto ci mette a rispondere
  const ultimoStato = { tardi: null, giroMax: 0 };
  const recenti = { invio: new Map(), midi: new Map(), tasto: new Map() };
  const ripetuto = (gruppo, chiave, e, nome) => {
    const [quante, entro] = soglie.ripetuti[gruppo];
    const lista = (recenti[gruppo].get(chiave) ?? []).filter((t) => e.t - t <= entro);
    lista.push(e.t);
    recenti[gruppo].set(chiave, lista);
    if (lista.length === quante) aggiungi(e, 'inciampo', `provato ${quante} volte di fila: ${nome}`);
  };

  for (const e of eventi) {
    const d = e.dati ?? {};
    if (e.tipo === 'segno' && e.fonte === 'app') aggiungi(e, 'segno', `SEGNO ${d.n ?? ''}`.trim());
    else if (e.fonte === 'log' && e.tipo === 'errore') aggiungi(e, 'difetto', `errore (${d.fonte}): ${primaRiga(d.messaggio)}`);
    else if (e.fonte === 'log' && e.tipo === 'avviso' && /non risponde|bloccato|riavvio|ricollegata/i.test(d.messaggio ?? '')) aggiungi(e, 'difetto', `avviso (${d.fonte}): ${primaRiga(d.messaggio)}`);
    else if (e.fonte === 'app' && e.tipo === 'errore') aggiungi(e, 'difetto', `errore mostrato (${d.chi}): ${primaRiga(d.errore)}`);
    else if (e.fonte === 'live' && e.tipo === 'guardiano') aggiungi(e, 'difetto', `il guardiano ha respinto «${d.nome ?? '?'}»: ${primaRiga(d.errore)}`);
    else if ((e.fonte === 'live' || e.fonte === 'cuffia') && e.tipo === 'invio' && Number.isFinite(d.id)) {
      invii.set(`${e.fonte}:${d.id}`, e);
      if (e.fonte === 'live' && (d.tipo === 'entra' || d.tipo === 'valuta')) ripetuto('invio', `${d.tipo}:${d.nome ?? ''}`, e, `${d.tipo === 'entra' ? 'entra' : 'codice'} «${d.nome ?? 'live'}»`);
    } else if ((e.fonte === 'live' || e.fonte === 'cuffia') && e.tipo === 'risposta') {
      if (d.errore) aggiungi(e, 'difetto', `${e.fonte} ha rifiutato: ${primaRiga(d.errore)}`);
      const invio = invii.get(`${e.fonte}:${d.id}`);
      if (invio && e.t - invio.t > soglie.rispostaMs) aggiungi(invio, 'difetto', `${e.fonte} ha risposto dopo ${Math.round(e.t - invio.t)} ms`);
      if (Number.isFinite(d.ingressoMs) && d.ingressoMs > soglie.ritardoIngressoMs) aggiungi(invio ?? e, 'inciampo', `ha messo ${(d.ingressoMs / 1000).toFixed(1)} s a entrare (${primaRiga(invio?.dati?.nome ?? '')})`);
    } else if (e.fonte === 'live' && e.tipo === 'stato') {
      if (ultimoStato.tardi !== null && d.tardi > ultimoStato.tardi) aggiungi(e, 'difetto', `il live è andato in ritardo (${d.tardi - ultimoStato.tardi} giri)`);
      if (Number.isFinite(d.tardi)) ultimoStato.tardi = d.tardi;
      if (Number.isFinite(d.giroMax) && d.giroMax > soglie.giroLentoMs && d.giroMax > ultimoStato.giroMax) aggiungi(e, 'inciampo', `un giro del live è durato ${Math.round(d.giroMax)} ms`);
      if (Number.isFinite(d.giroMax)) ultimoStato.giroMax = Math.max(ultimoStato.giroMax, d.giroMax);
    } else if (e.fonte === 'controller' && e.tipo === 'midi' && Array.isArray(d.byte)) {
      const [stato, nota, vel] = d.byte;
      if ((stato & 0xf0) === 0x90 && vel > 0 && !eUnSegno(e)) ripetuto('midi', `n${nota}`, e, `tasto ${nota} del controller`);
    } else if (e.fonte === 'tastiera' && e.tipo === 'tasto' && !eUnSegno(e)) ripetuto('tasto', d.combo ?? '', e, `tasto ${d.combo}`);
  }

  // CPU alta per qualche secondo
  let alta = 0;
  for (const e of eventi) {
    if (e.fonte !== 'main' || e.tipo !== 'cpu') continue;
    const cpu = Math.max(e.dati?.live ?? 0, e.dati?.controllo ?? 0, e.dati?.cuffia ?? 0);
    alta = cpu > soglie.cpuAlta ? alta + 1 : 0;
    if (alta === soglie.cpuS) aggiungi(e, 'inciampo', `CPU alta da ${soglie.cpuS} s (${Math.round(cpu)}%)`);
  }

  // silenzi: il master sotto soglia per qualche secondo, dopo che aveva suonato; non conta quello finale
  const master = eventi.filter((e) => e.fonte === 'live' && e.tipo === 'master');
  let aveva = false;
  let da = null;
  for (const e of master) {
    const db = e.dati?.medioDb;
    if (!Number.isFinite(db)) continue;
    if (db > soglie.silenzioDb) {
      if (da !== null && aveva && e.t - da >= soglie.silenzioS * 1000) aggiungi({ t: da, fonte: 'live' }, 'inciampo', `silenzio per ${Math.round((e.t - da) / 1000)} s`);
      aveva = true;
      da = null;
    } else if (da === null) da = e.t;
  }
  // (il silenzio che arriva fino alla fine della prova non si segnala: non si chiude mai)
  return motivi;
}

// I motivi che vengono da quello che dici: voci dei sottotitoli → motivi nel tempo del registro.
export function motiviDaParlato(voci, offsetMs) {
  const motivi = [];
  for (const v of voci) {
    const t = v.da * 1000 + offsetMs;
    if (PAROLE.idea.test(v.testo)) motivi.push({ t, tipo: 'idea', fonte: 'voce', testo: v.testo });
    if (PAROLE.difetto.test(v.testo)) motivi.push({ t, tipo: 'difetto', fonte: 'voce', testo: v.testo });
    if (PAROLE.inciampo.test(v.testo)) motivi.push({ t, tipo: 'inciampo', fonte: 'voce', testo: v.testo });
  }
  return motivi;
}

// I motivi vicini (meno di `vuotoMs` uno dall'altro) fanno un momento solo.
// Categoria: difetto se c'è almeno un difetto; altrimenti idea se qualcuno l'ha detto (un SEGNO da solo non basta a toglierla);
// altrimenti inciampo (anche un SEGNO senza altro: da rivedere).
export function raggruppa(motivi, vuotoMs = 6000) {
  const ordinati = [...motivi].sort((a, b) => a.t - b.t);
  const momenti = [];
  for (const m of ordinati) {
    const ultimo = momenti.at(-1);
    if (ultimo && m.t - ultimo.t1 <= vuotoMs) {
      ultimo.motivi.push(m);
      ultimo.t1 = Math.max(ultimo.t1, m.t);
    } else momenti.push({ t0: m.t, t1: m.t, motivi: [m] });
  }
  for (const mo of momenti) {
    const tipi = new Set(mo.motivi.map((m) => m.tipo));
    mo.categoria = tipi.has('difetto') ? 'difetti' : tipi.has('idea') ? 'idee' : 'inciampi';
    const principale = (mo.categoria === 'idee' && mo.motivi.find((m) => m.tipo === 'idea')) || mo.motivi.find((m) => m.tipo === 'difetto' && m.fonte !== 'voce') || mo.motivi.find((m) => m.tipo !== 'segno' && m.fonte !== 'voce') || mo.motivi[0];
    mo.titolo = principale.fonte === 'voce' ? `hai detto: «${principale.testo}»` : principale.testo;
  }
  return momenti;
}

// Cosa hai detto attorno a un momento: le voci che toccano [t0 − margine, t1 + margine] (tempo del registro).
export function parlatoAttorno(voci, offsetMs, t0, t1, margineS = 10) {
  return voci.filter((v) => v.a * 1000 + offsetMs >= t0 - margineS * 1000 && v.da * 1000 + offsetMs <= t1 + margineS * 1000);
}

// I secondi del video a cui prendere i fotogrammi di un momento (1 o 2, mai prima dell'inizio).
export function istantiFotogrammi(momento, offsetMs, durataVideoS = Infinity) {
  const a = Math.max(0, (momento.t0 - offsetMs) / 1000);
  const b = Math.max(0, (momento.t1 - offsetMs) / 1000);
  const secondo = b - a > 3 ? b : a + 2;
  return [...new Set([a, secondo].map((x) => Math.round(Math.min(x, Math.max(0, durataVideoS - 0.1)) * 10) / 10))];
}

// ---------- il rapporto ----------

const DueCifre = (n) => String(n).padStart(2, '0');
export const minuti = (s) => `${DueCifre(Math.floor(s / 60))}:${DueCifre(Math.floor(s % 60))}`;
const ora = (t) => new Date(t).toTimeString().slice(0, 8);
const TITOLI = { difetti: 'Difetti', inciampi: 'Inciampi', idee: 'Idee' };
const NOTE = { difetti: 'qualcosa non ha funzionato (errori, guardiano, ritardi, o l\'hai detto a voce)', inciampi: 'ho visto un intoppo (silenzi, tentativi ripetuti, SEGNI senza altro)', idee: 'cose che hai detto che vorresti' };

// momenti: con t0, t1, categoria, titolo, motivi, e (messi da chi chiama) parlato, fotogrammi: [file], videoS.
export function rapportoMd({ momenti, info }) {
  const righe = [`# Analisi della prova · ${info.nome}`, ''];
  righe.push(`- registro: \`${info.registro}\``, `- video: \`${info.video}\``, `- allineamento: ${info.allineamento}`);
  for (const a of info.avvisi ?? []) righe.push(`- ⚠ ${a}`);
  righe.push(`- voce: ${info.voce}`, '');
  for (const cat of ['difetti', 'inciampi', 'idee']) {
    const dei = momenti.filter((m) => m.categoria === cat);
    righe.push(`## ${TITOLI[cat]} (${dei.length})`, '', `_${NOTE[cat]}_`, '');
    if (!dei.length) righe.push('Niente.', '');
    for (const m of dei) {
      righe.push(`### ${ora(m.t0)} · video ${m.videoS === null ? '–' : minuti(m.videoS)} · ${m.titolo}`, '');
      for (const x of m.motivi) if (x.fonte !== 'voce') righe.push(`- ${ora(x.t)} ${x.testo}`);
      if (m.parlato?.length) {
        righe.push('', 'Hai detto:');
        for (const v of m.parlato) righe.push(`> ${v.testo}`);
      }
      for (const f of m.fotogrammi ?? []) righe.push('', `![${f}](${f})`);
      righe.push('');
    }
  }
  return `${righe.join('\n')}\n`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// La stessa cosa in una pagina che si apre con un doppio clic.
export function rapportoHtml({ momenti, info }) {
  const parti = [`<h1>Analisi della prova · ${esc(info.nome)}</h1>`, '<ul>', `<li>registro: <code>${esc(info.registro)}</code></li>`, `<li>video: <code>${esc(info.video)}</code></li>`, `<li>allineamento: ${esc(info.allineamento)}</li>`];
  for (const a of info.avvisi ?? []) parti.push(`<li class="avviso">⚠ ${esc(a)}</li>`);
  parti.push(`<li>voce: ${esc(info.voce)}</li>`, '</ul>');
  for (const cat of ['difetti', 'inciampi', 'idee']) {
    const dei = momenti.filter((m) => m.categoria === cat);
    parti.push(`<h2>${TITOLI[cat]} (${dei.length})</h2>`, `<p class="nota">${esc(NOTE[cat])}</p>`);
    if (!dei.length) parti.push('<p>Niente.</p>');
    for (const m of dei) {
      parti.push(`<section><h3>${ora(m.t0)} · video ${m.videoS === null ? '–' : minuti(m.videoS)} · ${esc(m.titolo)}</h3><ul>`);
      for (const x of m.motivi) if (x.fonte !== 'voce') parti.push(`<li>${ora(x.t)} ${esc(x.testo)}</li>`);
      parti.push('</ul>');
      if (m.parlato?.length) parti.push(`<p class="detto">Hai detto:</p>${m.parlato.map((v) => `<blockquote>${esc(v.testo)}</blockquote>`).join('')}`);
      if (m.fotogrammi?.length) parti.push(`<div class="foto">${m.fotogrammi.map((f) => `<img src="${esc(f)}" alt="">`).join('')}</div>`);
      parti.push('</section>');
    }
  }
  const stile = 'body{background:#050604;color:#d9dccc;font:15px/1.5 ui-monospace,Menlo,monospace;max-width:1100px;margin:32px auto;padding:0 20px}h1,h2{font-weight:600}h3{font-size:15px;margin:0 0 6px}code{color:#9fc23a}.nota{color:#7a7e72}.avviso{color:#e0a03a}section{border-top:1px solid #2a2a28;padding:14px 0}blockquote{margin:4px 0 4px 8px;padding-left:10px;border-left:3px solid #4e6118}.foto img{width:48%;margin:6px 1% 0 0;border:1px solid #2a2a28}';
  return `<!doctype html><html lang="it"><meta charset="utf-8"><title>Analisi della prova</title><style>${stile}</style><body>${parti.join('\n')}</body></html>\n`;
}
