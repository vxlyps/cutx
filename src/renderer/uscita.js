// La finestra di uscita: quello che vede il pubblico. Legge tempo e livelli direttamente dal
// motore live, e dall'interfaccia solo le bozze (quello che sto scrivendo, che fa parte dello
// spettacolo). Gli errori non arrivano mai qui. Se si chiude o crasha, le casse non lo sentono.
import { aspetto, cicloDi, epocaDi, sostituente, sostituito as sostituitoDa } from './aspetto.js';
import { Scrittore } from './scrittura.js';
import { arrotondaBpm, bpmDi, cpsAl, fraseDi } from './tempo.js';
import { attivi, riempi } from './evidenzia.js';
import { righeVisibili } from './coda.js';
import { avviaInsegna } from './insegna.js';
import { AZIONI, corrisponde, effettive } from './scorciatoie.js';
import { Scorrimento, scegliDisposizione, trovaScala } from './scorri.js';
import { Sfondo, modoDopo, modoValido } from './sfondo.js';
import wordmark from '../../design/risorse/logo/cutx_bianco.svg';
import seduto from '../../design/risorse/gatti/gatto_seduto_marcio.svg';
import lecca from '../../design/risorse/gatti/gatto_lecca_marcio.svg';
import dorme from '../../design/risorse/gatti/gatto_dorme_marcio.svg';
import inPiedi from '../../design/risorse/gatti/gatto_in_piedi_marcio.svg';

const $ = (id) => document.getElementById(id);

let mappa = null;
let livelli = [];
let bozze = { livelli: {}, jam: null };
let preferenze = { lunghezzaFrase: 16, scritturaAMacchina: true };
const inizioUscita = new Map();
const blocchi = new Map(); // chiave → { el, tag, codice }

// --- canali: dal live il tempo e i livelli, dall'interfaccia le bozze ---

const sfondo = new Sfondo($('sfondo'));
let portaLive = null;
// il live manda l'onda solo se lo sfondo è l'oscilloscopio
const chiediOnda = () => portaLive?.postMessage({ tipo: 'onda', on: sfondo.modo === 'oscilloscopio' });

window.addEventListener('message', (e) => {
  const con = e.data?.porta;
  if (!con || !e.ports[0]) return;
  if (con === 'live') {
    portaLive = e.ports[0];
    chiediOnda();
  }
  e.ports[0].onmessage = ({ data }) => {
    if (data.tipo === 'onda') sfondo.suOnda(data.dati);
    else if (data.tipo === 'mappa') mappa = data;
    else if (data.tipo === 'livelli') livelli = data.livelli;
    else if (data.tipo === 'bozze') bozze = data;
  };
  if (con === 'controllo') bozze = { livelli: {}, jam: null };
});

// --- il gatto grande, a scatti ---

const POSE = {
  seduto: [seduto, 190],
  lecca: [lecca, 150],
  dorme: [dorme, 160],
  inPiedi: [inPiedi, 196],
};
const SEQUENZA = [
  ['seduto', 6000],
  ['lecca', 3500],
  ['seduto', 5000],
  ['inPiedi', 2000],
  ['seduto', 6000],
  ['dorme', 5000],
];
function avviaGatto() {
  for (const [src] of Object.values(POSE)) new Image().src = src;
  let i = 0;
  const passo = () => {
    const [nome, ms] = SEQUENZA[i];
    $('gatto').src = POSE[nome][0];
    $('gatto').style.height = `calc(${POSE[nome][1]} * var(--u))`;
    i = (i + 1) % SEQUENZA.length;
    setTimeout(passo, ms);
  };
  passo();
}

// --- disegno ---

function blocco(chiave) {
  if (!blocchi.has(chiave)) {
    const el = document.createElement('section');
    el.className = 'livello';
    const tag = document.createElement('span');
    tag.className = 'tag';
    const codice = document.createElement('pre');
    codice.className = 'codice';
    // la coda (coda.js) sta sotto il codice e si aggiorna sul posto: i numeri cambiano mentre si gira, senza macchina da scrivere
    const coda = document.createElement('pre');
    coda.className = 'coda';
    coda.hidden = true;
    el.append(tag, codice, coda);
    blocchi.set(chiave, { el, tag, codice, coda });
  }
  return blocchi.get(chiave);
}

// Il testo che si sta scrivendo: la parte già scritta, il cursore e il resto *invisibile ma al suo posto*, così l'altezza del
// livello è subito quella finale e il carattere non cambia mentre si scrive.
function scrivi(b, scritto, cursore, nascosto = '', dopo = '') {
  const chiave = `${scritto}|${nascosto}|${dopo}${cursore ? '▌' : ''}`;
  if (b.codice.dataset.testo === chiave) return;
  b.codice.dataset.testo = chiave;
  b.codice.dataset.evidenza = '';
  b.codice.textContent = scritto;
  if (cursore) {
    const c = document.createElement('span');
    c.className = 'cursore';
    c.textContent = '_';
    b.codice.append(c);
  }
  if (nascosto) {
    const resto = document.createElement('span');
    resto.className = 'nascosto';
    resto.textContent = nascosto;
    b.codice.append(resto);
  }
  if (dopo) b.codice.append(dopo); // quello che c'era già dopo il punto che si sta cambiando: si vede
}

// La coda sotto il codice: se cambia solo un numero si cambia il testo e basta; se cambia il numero di righe si rimisura tutto.
function mostraCoda(b, righe, chiave, firma) {
  const testo = righe.join('\n');
  b.coda.hidden = !righe.length;
  if (b.coda.textContent !== testo) b.coda.textContent = testo;
  firma.push(`${chiave}|c${righe.length}`);
}

function disegna() {
  if (!mappa) return;
  const epoca = performance.timeOrigin + performance.now();
  const ciclo = cicloDi(mappa, epoca);
  const intero = Math.floor(ciclo);
  const quarto = Math.floor((ciclo - intero) * 4);
  const lunghezza = preferenze.lunghezzaFrase ?? 16;
  sfondo.disegna(ciclo, livelli);
  $('bpm').textContent = `${arrotondaBpm(bpmDi(cpsAl(mappa, epoca)))} BPM`;
  $('frase').textContent = fraseDi(mappa, epoca, lunghezza);
  [...$('battute').children].forEach((d, i) => {
    d.classList.toggle('passata', i < quarto);
    d.classList.toggle('ora', i === quarto);
  });

  seguito = null;
  const visti = new Set();
  const ordine = [];
  const firma = [];
  let suona = false;
  for (const l of livelli) {
    if (sostituente(l, livelli)) continue; // sostituito: si vede il nuovo
    if (l.a !== null && !inizioUscita.has(l.id)) inizioUscita.set(l.id, epoca);
    const a = aspetto(l, livelli, mappa, epoca, { scrittura: preferenze.scritturaAMacchina !== false, inizioUscita: inizioUscita.get(l.id) });
    const chiave = `l${l.id}`;
    const b = blocco(chiave);
    visti.add(chiave);
    ordine.push(b.el);
    const bozza = bozze.livelli?.[l.id];
    b.el.classList.toggle('arriva', a.arriva);
    b.el.classList.toggle('muto', l.muto);
    b.el.classList.toggle('bozza', bozza !== undefined && bozza !== a.testo);
    if (bozza !== undefined && bozza !== a.testo) {
      // sto riscrivendo questo livello: il pubblico lo vede mentre lo scrivo
      b.tag.textContent = `● ${l.nome} · in scrittura`;
      scrivi(b, bozza, true);
      firma.push(`${chiave}|${bozza}`);
      segnaNovita(chiave, bozza, epoca);
      mostraCoda(b, [], chiave, firma);
      suona ||= !a.arriva;
      continue;
    }
    firma.push(`${chiave}|${a.testo}`);
    segnaNovita(chiave, a.testo, epoca);
    b.tag.textContent = a.arriva ? `${l.nome} · tra ${Math.max(1, Math.ceil(a.mancano))} ${Math.ceil(a.mancano) > 1 ? 'cicli' : 'ciclo'}` : `● ${l.nome}${l.muto ? ' · muto' : ''}`;
    if (a.arriva && a.cursore) {
      // scrittura umana: da zero, o solo la differenza se sostituisce un livello (scrittura.js)
      const vecchio = sostituitoDa(l, livelli);
      const v = scrittore.stato(l.id, vecchio ? vecchio.codice.replace(/\s+$/, '') : '', a.testo, l.richiesto, epocaDi(mappa, l.da), epoca, vecchio?.id ?? null);
      scrivi(b, v.prima, v.cursore, v.nascosto, v.dopo);
      if (v.cursore) {
        const cur = b.codice.querySelector('.cursore');
        if (cur) {
          const r = cur.getBoundingClientRect();
          const s0 = $('scorri').getBoundingClientRect();
          seguito = { top: r.top - s0.top, bottom: r.bottom - s0.top };
        }
        // quando una modifica cambia il numero di righe le misure vanno rifatte
        firma.push(`${chiave}|h${Math.round(b.codice.offsetHeight)}`);
      }
    } else if (a.cursore) scrivi(b, a.mostrato, true, a.testo.slice(a.mostrato.length));
    else riempi(b.codice, a.testo, a.arriva || l.muto ? [] : attivi(l.codice, ciclo), 'nota');
    mostraCoda(b, a.arriva ? [] : righeVisibili(l.coda, l.volume), chiave, firma);
    suona ||= !a.arriva && !l.muto;
  }
  // il jam che sto scrivendo, prima che entri
  const jamLive = livelli.find((l) => l.nome === 'jam' && l.a === null);
  if (bozze.jam && bozze.jam.replace(/\s+$/, '') !== jamLive?.codice.replace(/\s+$/, '')) {
    const b = blocco('jam');
    visti.add('jam');
    ordine.push(b.el);
    b.el.classList.add('bozza');
    b.tag.textContent = 'jam · in scrittura';
    scrivi(b, bozze.jam, true);
    firma.push(`jam|${bozze.jam}`);
    segnaNovita('jam', bozze.jam, epoca);
  }
  for (const [chiave, b] of blocchi) {
    if (!visti.has(chiave)) {
      b.el.remove();
      blocchi.delete(chiave);
    }
  }
  const contenitore = $('scorri');
  ordine.forEach((el, i) => contenitore.children[i] !== el && contenitore.insertBefore(el, contenitore.children[i] ?? null));
  document.body.classList.toggle('suona', suona);
  firma.push(`${innerWidth}x${innerHeight}|${[...document.body.classList].includes('senza-gatto')}`);
  adatta(firma.join('\u0001'), epoca);
}

// --- il codice sul proiettore: tutta l'altezza che c'è, mai sotto neon, gatto e frase, mai righe a metà ---
// 1. L'area del codice è quella tra l'intestazione e l'angolo (neon, gatto, frase), misurata davvero: o larga fino all'angolo,
//    o più stretta ma alta fino ai pallini delle battute. Si prende la disposizione in cui il carattere viene più grande.
// 2. Se non ci sta si rimpicciolisce il carattere, fino a un minimo leggibile da lontano.
// 3. Se ancora non basta si scorre piano e da soli, una riga alla volta, fermandosi sul livello appena entrato o modificato.
const MINIMO_ALTEZZA = 0.026; // il carattere più piccolo: 2,6% dell'altezza della finestra (28 px su un proiettore 1080p)
const scorrimento = new Scorrimento({ passoS: 1.8, pausaS: 4, tieniS: 14 });
const novita = new Map(); // chiave → { testo, quando }: quando è entrato o cambiato
let ultimaNovita = null; // { id, quando }
let firmaPrecedente = '';
const scrittore = new Scrittore();
let seguito = null; // { top, bottom } della riga dove si sta scrivendo adesso (px del contenuto)
let disposizione = { nome: 'ampia', scala: 1, ci: true };
let righe = []; // le righe del codice (e i titoli dei livelli) in px dall'alto del contenuto
let livelliGeom = new Map(); // chiave → { top, bottom }
let scorre = { attivo: false, offset: 0, taglio: 0 };

function segnaNovita(chiave, testo, epoca) {
  const prima = novita.get(chiave);
  if (prima?.testo === testo) return;
  novita.set(chiave, { testo, quando: epoca });
  ultimaNovita = { id: chiave, quando: epoca };
}

function misuraRighe() {
  righe = [];
  livelliGeom = new Map();
  for (const [chiave, b] of blocchi) {
    const top = b.el.offsetTop;
    const lh = parseFloat(getComputedStyle(b.codice).lineHeight) || 1;
    righe.push({ top, bottom: top + b.tag.offsetHeight });
    const n = Math.max(1, Math.round(b.codice.offsetHeight / lh));
    const t0 = top + b.codice.offsetTop;
    for (let k = 0; k < n; k++) righe.push({ top: t0 + k * lh, bottom: t0 + (k + 1) * lh });
    let fine = t0 + n * lh;
    if (!b.coda.hidden) {
      const lc = parseFloat(getComputedStyle(b.coda).lineHeight) || lh;
      const nc = Math.max(1, Math.round(b.coda.offsetHeight / lc));
      const tc = top + b.coda.offsetTop;
      for (let k = 0; k < nc; k++) righe.push({ top: tc + k * lc, bottom: tc + (k + 1) * lc });
      fine = tc + nc * lc;
    }
    livelliGeom.set(chiave, { top, bottom: fine });
  }
  righe.sort((x, y) => x.top - y.top);
}

function adatta(firma, epoca) {
  const livelli = $('livelli');
  const radice = document.documentElement.style;
  if (firma !== firmaPrecedente) {
    firmaPrecedente = firma;
    const u = innerWidth / 1440;
    const angolo = document.querySelector('.angolo').getBoundingClientRect();
    const battute = $('battute').getBoundingClientRect();
    const margine = 18 * u;
    const minima = Math.max(0.25, (MINIMO_ALTEZZA * innerHeight) / (40 * u));
    const sotto = (basso) => innerHeight - basso;
    const opzioni = [
      // larga: sopra l'angolo; stretta: a sinistra dell'angolo, fino ai pallini delle battute
      { nome: 'ampia', destra: 64 * u, basso: sotto(angolo.top - margine) },
      { nome: 'stretta', destra: innerWidth - (angolo.left - 40 * u), basso: sotto(battute.top - margine) },
    ].map((o) => {
      radice.setProperty('--destra', `${o.destra}px`);
      radice.setProperty('--basso', `${o.basso}px`);
      // altezze frazionarie (non arrotondate) e un pixel di sicurezza: una riga a un decimo di pixel dal bordo non ci sta
      const r = trovaScala((s) => (radice.setProperty('--scala', s.toFixed(4)), $('scorri').getBoundingClientRect().height), livelli.getBoundingClientRect().height - 1, minima);
      return { ...o, ...r, altezza: livelli.clientHeight };
    });
    disposizione = scegliDisposizione(opzioni);
    radice.setProperty('--destra', `${disposizione.destra}px`);
    radice.setProperty('--basso', `${disposizione.basso}px`);
    radice.setProperty('--scala', disposizione.scala.toFixed(4));
    document.body.dataset.disposizione = disposizione.nome;
    misuraRighe();
  }
  // non ci sta neanche al carattere minimo: si scorre
  const altezza = livelli.clientHeight;
  scorre.attivo = !disposizione.ci;
  const stile = $('scorri').style;
  if (!scorre.attivo) {
    scorre = { attivo: false, offset: 0, taglio: 0 };
    stile.transform = '';
    livelli.style.clipPath = '';
    return;
  }
  const g = ultimaNovita && livelliGeom.get(ultimaNovita.id);
  const r = scorrimento.aggiorna(epoca / 1000, { righe, altezza, focus: g ? { id: ultimaNovita.id, quando: ultimaNovita.quando, top: g.top, bottom: g.bottom } : null, segui: seguito });
  scorre = { attivo: true, offset: r.offset, taglio: r.taglio };
  stile.transform = `translateY(${-r.offset}px)`;
  livelli.style.clipPath = r.taglio > 0 ? `inset(0 0 ${r.taglio}px 0)` : '';
}

// Per le prove: com'è il codice adesso (mai righe a metà, mai sotto l'angolo, carattere leggibile).
function verificaCodice() {
  const c = $('livelli').getBoundingClientRect();
  const finestra = { top: c.top, bottom: c.top + $('livelli').clientHeight - scorre.taglio };
  let tagliate = 0;
  let visibili = 0;
  for (const r of righe) {
    const top = c.top + r.top - scorre.offset;
    const bottom = c.top + r.bottom - scorre.offset;
    if (bottom <= finestra.top + 0.5 || top >= finestra.bottom - 0.5) continue; // fuori dalla finestra
    visibili++;
    if (top < finestra.top - 0.5 || bottom > finestra.bottom + 0.5) tagliate++;
  }
  const a = document.querySelector('.angolo').getBoundingClientRect();
  const area = { left: c.left, right: c.right, top: c.top, bottom: finestra.bottom };
  const sovrappone = area.left < a.right && area.right > a.left && area.top < a.bottom && area.bottom > a.top;
  const codice = document.querySelector('.codice');
  const g = ultimaNovita && livelliGeom.get(ultimaNovita.id);
  const altezza = $('livelli').clientHeight - scorre.taglio;
  // un livello più alto della finestra si scende piano: basta che se ne veda una parte
  const focusVisibile = !g || (g.bottom - g.top > altezza ? g.top < scorre.offset + altezza && g.bottom > scorre.offset : g.top >= scorre.offset - 0.5 && g.bottom <= scorre.offset + altezza + 0.5);
  return {
    focus: g ? { id: ultimaNovita.id, top: g.top, bottom: g.bottom } : null,
    focusVisibile,
    tagliate,
    visibili,
    sovrappone,
    disposizione: disposizione.nome,
    ci: disposizione.ci,
    scorre: scorre.attivo,
    offset: scorre.offset,
    scala: disposizione.scala,
    carattere: codice ? parseFloat(getComputedStyle(codice).fontSize) : null,
    minimo: MINIMO_ALTEZZA * innerHeight,
    area: { altezza: $('livelli').clientHeight, larghezza: c.width },
    livelli: [...blocchi.keys()],
  };
}
globalThis.cutxVerificaUscita = verificaCodice;
// quando il carattere è pronto le altezze cambiano: si rimisura tutto
document.fonts?.ready.then(() => (firmaPrecedente = ''));

function giro() {
  requestAnimationFrame(giro);
  disegna();
}

// La scorciatoia dello schermo intero (⌃⌘F, o quella scelta nelle impostazioni) vale anche da qui.
window.addEventListener('keydown', (e) => {
  if (corrisponde(e, AZIONI.find((a) => a.id === 'uscitaIntera'), effettive(preferenze.scorciatoie).uscitaIntera)) {
    e.preventDefault();
    window.cutx.uscitaSchermoIntero();
  }
  if (corrisponde(e, AZIONI.find((a) => a.id === 'sfondo'), effettive(preferenze.scorciatoie).sfondo)) {
    e.preventDefault();
    window.cutx.salvaPreferenze({ sfondoProiettore: modoDopo(modoValido(preferenze.sfondoProiettore)) });
  }
});

$('wordmark').src = wordmark;
avviaGatto();
globalThis.cutxInsegna = avviaInsegna($('insegna'));
function applica(p) {
  preferenze = p;
  const prima = sfondo.modo;
  sfondo.imposta(p.sfondoProiettore);
  if (sfondo.modo !== prima) chiediOnda();
  document.body.classList.toggle('senza-gatto', p.gatto === false);
  document.body.classList.toggle('senza-insegna', p.insegna === false);
}
window.cutx.suPreferenze(applica);
applica(await window.cutx.preferenze());
setInterval(disegna, 100);
giro();
globalThis.cutxSfondo = sfondo;
// Per le prove: cosa si vede di ogni livello (senza il testo ancora invisibile) e quando entrano quelli in arrivo.
globalThis.cutxScrittura = () => {
  const epoca = performance.timeOrigin + performance.now();
  return {
    epoca,
    blocchi: [...blocchi].map(([k, b]) => ({
      k,
      tag: b.tag.textContent,
      cursore: !!b.codice.querySelector('.cursore'),
      visibile: [...b.codice.childNodes].filter((n) => !n.classList?.contains('nascosto') && !n.classList?.contains('cursore')).map((n) => n.textContent).join(''),
    })),
    arrivi: mappa ? livelli.filter((l) => l.da !== null && cicloDi(mappa, epoca) < l.da).map((l) => ({ id: l.id, nome: l.nome, fine: epocaDi(mappa, l.da) })) : [],
  };
};
globalThis.cutxUscita = () => ({ livelli: [...blocchi.keys()], testo: $('livelli').innerText, frase: $('frase').textContent, scala: disposizione.scala });
