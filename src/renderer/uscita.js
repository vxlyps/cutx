// La finestra di uscita: quello che vede il pubblico. Legge tempo e livelli direttamente dal
// motore live, e dall'interfaccia solo le bozze (quello che sto scrivendo, che fa parte dello
// spettacolo). Gli errori non arrivano mai qui. Se si chiude o crasha, le casse non lo sentono.
import { aspetto, cicloDi } from './aspetto.js';
import { attivi, riempi } from './evidenzia.js';
import { avviaInsegna } from './insegna.js';
import { AZIONI, corrisponde, effettive } from './scorciatoie.js';
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
let scala = 1;

// --- canali: dal live il tempo e i livelli, dall'interfaccia le bozze ---

window.addEventListener('message', (e) => {
  const con = e.data?.porta;
  if (!con || !e.ports[0]) return;
  e.ports[0].onmessage = ({ data }) => {
    if (data.tipo === 'mappa') mappa = data;
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
    el.append(tag, codice);
    blocchi.set(chiave, { el, tag, codice });
  }
  return blocchi.get(chiave);
}

function scrivi(b, testo, cursore) {
  const chiave = `${testo}${cursore ? '▌' : ''}`;
  if (b.codice.dataset.testo === chiave) return;
  b.codice.dataset.testo = chiave;
  b.codice.dataset.evidenza = '';
  b.codice.textContent = testo;
  if (cursore) {
    const c = document.createElement('span');
    c.className = 'cursore';
    c.textContent = '_';
    b.codice.append(c);
  }
}

function disegna() {
  if (!mappa) return;
  const epoca = performance.timeOrigin + performance.now();
  const ciclo = cicloDi(mappa, epoca);
  const intero = Math.floor(ciclo);
  const quarto = Math.floor((ciclo - intero) * 4);
  const lunghezza = preferenze.lunghezzaFrase ?? 16;
  $('bpm').textContent = `${Math.round(mappa.cps * 240 * 10) / 10} BPM`;
  $('frase').textContent = ((((intero - (mappa.ancoraFrase ?? 0)) % lunghezza) + lunghezza) % lunghezza) + 1;
  [...$('battute').children].forEach((d, i) => {
    d.classList.toggle('passata', i < quarto);
    d.classList.toggle('ora', i === quarto);
  });

  const visti = new Set();
  const ordine = [];
  let suona = false;
  for (const l of livelli) {
    if (l.a !== null && livelli.some((x) => x !== l && x.nome === l.nome && x.da === l.a)) continue; // sostituito: si vede il nuovo
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
      suona ||= !a.arriva;
      continue;
    }
    b.tag.textContent = a.arriva ? `${l.nome} · tra ${Math.max(1, Math.ceil(a.mancano))} ${Math.ceil(a.mancano) > 1 ? 'cicli' : 'ciclo'}` : `● ${l.nome}${l.muto ? ' · muto' : ''}`;
    if (a.cursore) scrivi(b, a.mostrato, true);
    else riempi(b.codice, a.testo, a.arriva || l.muto ? [] : attivi(l.codice, ciclo), 'nota');
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
  }
  for (const [chiave, b] of blocchi) {
    if (!visti.has(chiave)) {
      b.el.remove();
      blocchi.delete(chiave);
    }
  }
  const contenitore = $('livelli');
  ordine.forEach((el, i) => contenitore.children[i] !== el && contenitore.insertBefore(el, contenitore.children[i] ?? null));
  document.body.classList.toggle('suona', suona);
  adatta(contenitore);
}

// Tanto codice: il carattere si stringe finché ci sta; poco codice: torna grande.
function adatta(contenitore) {
  const troppo = contenitore.scrollHeight > contenitore.clientHeight + 2;
  const nuova = troppo ? Math.max(0.35, scala * 0.94) : contenitore.scrollHeight < contenitore.clientHeight * 0.75 ? Math.min(1, scala * 1.03) : scala;
  if (nuova !== scala) {
    scala = nuova;
    document.documentElement.style.setProperty('--scala', scala.toFixed(3));
  }
}

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
});

$('wordmark').src = wordmark;
avviaGatto();
globalThis.cutxInsegna = avviaInsegna($('insegna'));
function applica(p) {
  preferenze = p;
  document.body.classList.toggle('senza-gatto', p.gatto === false);
  document.body.classList.toggle('senza-insegna', p.insegna === false);
}
window.cutx.suPreferenze(applica);
applica(await window.cutx.preferenze());
setInterval(disegna, 100);
giro();
globalThis.cutxUscita = () => ({ livelli: [...blocchi.keys()], testo: $('livelli').innerText, frase: $('frase').textContent, scala });
