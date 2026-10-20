// Finestra di controllo: editor, stash, uscite, test di sfasamento e di robustezza.
// Qui non suona niente: il codice va ai motori live e cuffia, ognuno nel suo processo.
// Se questa finestra si blocca o crasha, le casse non se ne accorgono.
import { creaEditor } from './editor.js';
import { Motore } from './motori.js';
import { elencoUscite, elencoIngressi } from './uscite.js';
import { Misuratore } from './sfasamento.js';

const $ = (id) => document.getElementById(id);

const CODICE_INIZIALE = `// CUTX
// Ctrl+Invio suona, Ctrl+. ferma.
// I suoni dello stash: s("nome_cartella")
setcpm(120/4)
note("c2 [eb2 g2] c3 <bb1 f2>").s("sawtooth").lpf(800).decay(.2).sustain(0)
`;

const CODICE_TEST = `// CUTX · test sfasamento: un click per quarto a 120 BPM,
// uguale su live e cuffia.
setcpm(120/4)
s("sine*4").freq(1000).attack(0).decay(.02).sustain(0).gain(.8)
`;

const live = new Motore('live');
const cuffia = new Motore('cuffia');
const misuratore = new Misuratore();

let destinazione = 'live';
let inTest = false;
let codicePrimaDelTest = CODICE_INIZIALE;
let codiceCuffia = ''; // per ridarlo alla cuffia se rinasce
let config = { uscite: {}, offsetCuffiaMs: 0 };
let haStash = false;
let ripreso = false; // ho già preso lo stato dai motori? (dopo un crash dell'interfaccia stanno ancora suonando)

const editor = creaEditor({ root: $('editor'), codice: CODICE_INIZIALE, suValuta: suona, suFerma: ferma });

async function manda(motore, codice) {
  if (motore === cuffia) codiceCuffia = codice;
  const errore = await motore.valuta(codice);
  $('errore-codice').textContent = errore ? `${motore.ruolo}: ${errore}` : '';
}

function suona() {
  if (inTest) return;
  manda(destinazione === 'live' ? live : cuffia, editor.codice);
}

function ferma() {
  if (inTest) return fermaTest();
  codiceCuffia = '';
  live.manda({ tipo: 'ferma' });
  cuffia.manda({ tipo: 'ferma' });
}

function aggiornaSpie() {
  $('stato-live').classList.toggle('accesa', live.viva && !!live.stato.codice);
  $('stato-cuffia').classList.toggle('accesa', cuffia.viva);
  $('dest-live').classList.toggle('attivo', destinazione === 'live');
  $('dest-cuffia').classList.toggle('attivo', destinazione === 'cuffia');
}

function scegliDestinazione(dest) {
  if (inTest) return;
  destinazione = dest;
  aggiornaSpie();
}

// --- stash: lo leggono anche i motori, da soli ---

async function salva(modifiche) {
  Object.assign(config, modifiche);
  if (haStash) await window.cutx.salvaConfig(modifiche);
}

async function apriStash(stato) {
  haStash = !!stato.config;
  if (!stato.percorso) {
    $('stash-nome').textContent = 'nessuno stash';
  } else if (stato.mancante) {
    $('stash-nome').textContent = `stash non trovato: ${stato.percorso} (attacca il disco o scegline un altro)`;
  } else {
    config = { uscite: {}, offsetCuffiaMs: 0, ...stato.config };
    $('stash-nome').textContent = `${config.nome} · ${stato.percorso}`;
    const nomi = Object.keys(stato.suoni).filter((k) => k !== '_base');
    $('suoni').textContent = nomi.length
      ? nomi.map((n) => `${n} (${stato.suoni[n].length})`).join(' · ')
      : 'nessun suono: metti dei WAV in suoni/<nome>/';
  }
  $('offset-cuffia').value = config.offsetCuffiaMs ?? 0;
  await aggiornaElenchi();
}

// --- uscite ---

async function riempiSelect(select, dispositivi, scelto, vuota = 'predefinita di macOS') {
  select.replaceChildren(new Option(vuota, ''));
  for (const d of dispositivi) select.add(new Option(d.label, d.label));
  if (scelto && !dispositivi.some((d) => d.label === scelto)) select.add(new Option(`${scelto} (non collegata)`, scelto));
  select.value = scelto ?? '';
}

async function aggiornaElenchi() {
  const uscite = await elencoUscite();
  await riempiSelect($('uscita-live'), uscite, config.uscite?.live);
  await riempiSelect($('uscita-cuffia'), uscite, config.uscite?.cuffia);
  await riempiSelect($('ingresso-anello'), await elencoIngressi(), config.ingressoAnello, '—');
}

function erroriUscite() {
  const errori = [];
  if (live.stato.errore) errori.push(`Live: ${live.stato.errore}`);
  if (cuffia.stato.errore) errori.push(`Cuffia: ${cuffia.stato.errore}`);
  if (config.uscite?.live && config.uscite.live === config.uscite?.cuffia) errori.push('Live e cuffia sono sulla stessa uscita.');
  return errori.join(' ');
}

// --- test ---

function avviaTest(codice = CODICE_TEST) {
  if (inTest) return;
  inTest = true;
  codicePrimaDelTest = editor.codice;
  editor.codice = codice;
  misuratore.avvia();
  for (const m of [live, cuffia]) m.manda({ tipo: 'eco', attivo: true });
  manda(live, codice);
  manda(cuffia, codice);
}

function fermaTest() {
  if (!inTest) return;
  misuratore.scriviLog('fine test');
  misuratore.ferma();
  inTest = false;
  for (const m of [live, cuffia]) {
    m.manda({ tipo: 'eco', attivo: false });
    m.manda({ tipo: 'ferma' });
  }
  codiceCuffia = '';
  editor.codice = codicePrimaDelTest;
}

// All'avvio chiedo ai motori cosa suonano: dopo un crash dell'interfaccia non si sono fermati.
function riprendi() {
  if (ripreso || !live.viva || !cuffia.viva) return;
  ripreso = true;
  codiceCuffia = cuffia.stato.codice ?? '';
  if (live.stato.eco) {
    inTest = true;
    misuratore.avvia();
    misuratore.scriviLog('interfaccia ripartita, test in corso');
  }
  if (live.stato.codice) editor.codice = live.stato.codice;
}

// Per provare la regola d'oro: questa finestra si pianta e i motori vanno avanti.
function bloccaInterfaccia(ms) {
  const fine = performance.now() + ms;
  while (performance.now() < fine);
}

const f = (x) => (x === null || x === undefined ? '–' : x.toFixed(2));

function rigaMisure(id, r) {
  const riga = $(id);
  riga.replaceChildren(riga.firstElementChild);
  for (const k of ['ultimo', 'media', 'min', 'max', 'deriva']) riga.insertCell().textContent = f(r?.[k]);
}

function descriviMotore(m) {
  if (!m.viva) return `${m.ruolo}: fermo`;
  const s = m.stato;
  const sent = s.sentinella;
  return (
    `${m.ruolo}: vivo · tardi ${s.tardi} · giro max ${f(s.giroMax)} ms` +
    (sent ? ` · click ${sent.sentiti}/${sent.attesi}, persi ${sent.mancati}, fuori ${sent.extra}` : '')
  );
}

function mostra() {
  riprendi();
  aggiornaSpie();
  $('errore-uscite').textContent = erroriUscite();
  rigaMisure('riga-stima', misuratore.stima.riepilogo());
  rigaMisure('riga-vero', misuratore.vero() ?? misuratore.anello.riepilogo());
  const v = misuratore.verdetto();
  $('verdetto').textContent = !v ? '' : v.dentro ? 'DENTRO SOGLIA' : 'FUORI SOGLIA';
  const s = misuratore.stima.riepilogo();
  $('durata').textContent = s ? `test da ${(s.durata / 60000).toFixed(1)} min · ${s.n} click misurati` : '';
  const a = misuratore.anello.riepilogo();
  $('anello-stato').textContent =
    `${a?.n ?? 0} click rientrati` +
    (misuratore.riferimento === null ? ' · nessun riferimento' : ` · riferimento ${f(misuratore.riferimento)} ms`);
  $('motori-dettagli').textContent = `${descriviMotore(live)}\n${descriviMotore(cuffia)}`;
}

// --- collegamenti ---

for (const m of [live, cuffia]) {
  m.suStato = (viva) => inTest && misuratore.scriviLog(`${m.ruolo} ${viva ? 'vivo' : 'fermo'}`);
  m.suMessaggio = (msg) => {
    if (msg.tipo === 'eco') misuratore.eco(msg.ciclo, msg.ruolo, msg.epoca);
    else if (msg.tipo === 'anello') misuratore.misuraAnello(msg.ms);
    else if (msg.tipo === 'anello-stato') $('anello-stato').textContent = msg.attivo ? 'in ascolto' : `errore: ${msg.errore}`;
  };
}
// Una cuffia rinata riparte da vuota: le ridò il suo codice.
cuffia.suCollegato = () => {
  if (!ripreso) return;
  if (inTest) cuffia.manda({ tipo: 'eco', attivo: true });
  if (codiceCuffia) manda(cuffia, codiceCuffia);
};

$('stash-scegli').onclick = async () => apriStash(await window.cutx.scegliStash());
$('dest-live').onclick = () => scegliDestinazione('live');
$('dest-cuffia').onclick = () => scegliDestinazione('cuffia');
$('uscita-live').onchange = (e) => salva({ uscite: { ...config.uscite, live: e.target.value } });
$('uscita-cuffia').onchange = (e) => salva({ uscite: { ...config.uscite, cuffia: e.target.value } });
$('offset-cuffia').onchange = (e) => salva({ offsetCuffiaMs: Number(e.target.value) || 0 });
$('test-avvia').onclick = () => avviaTest();
$('test-ferma').onclick = fermaTest;
$('ingresso-anello').onchange = (e) => salva({ ingressoAnello: e.target.value });
$('anello-attiva').onclick = () => live.manda({ tipo: 'anello', ingresso: $('ingresso-anello').value });
$('anello-riferimento').onclick = () => misuratore.salvaRiferimento();
$('cuffia-blocca').onclick = () => cuffia.manda({ tipo: 'blocca', ms: 5000 });
$('cuffia-crasha').onclick = () => window.cutx.crasha('cuffia');
$('ui-blocca').onclick = () => bloccaInterfaccia(5000);
$('ui-crasha').onclick = () => window.cutx.crasha('controllo');
navigator.mediaDevices.addEventListener('devicechange', aggiornaElenchi);

// Per la prova automatica di robustezza (npm run prova).
globalThis.cutxProva = {
  avviaTest,
  bloccaInterfaccia,
  valuta: (ruolo, codice) => (ruolo === 'live' ? live : cuffia).valuta(codice),
  misure: () => ({ stima: misuratore.stima.riepilogo(), live: live.stato, cuffia: cuffia.stato }),
};

setInterval(mostra, 250);
$('percorso-log').textContent = `log: ${await window.cutx.percorsoLog()}`;
await apriStash(await window.cutx.stash());
