// Finestra di controllo, fase 0: editor, valigetta, uscite, test di sfasamento.
// Qui vivono l'orologio e il motore live: sono il riferimento del tempo.
import { getAudioContext, samples, webaudioOutput } from '@strudel/webaudio';
import { creaEditor } from './editor.js';
import { Cuffia } from './cuffia.js';
import { Orologio } from './tempo.js';
import { elencoUscite, elencoIngressi, impostaUscita } from './uscite.js';
import { Misuratore } from './sfasamento.js';

const $ = (id) => document.getElementById(id);

const CODICE_INIZIALE = `// DANEEL · fase 0
// Ctrl+Invio suona, Ctrl+. ferma.
// I suoni della valigetta: s("nome_cartella")
setcpm(120/4)
note("c2 [eb2 g2] c3 <bb1 f2>").s("sawtooth").lpf(800).decay(.2).sustain(0)
`;

const CODICE_TEST = `// DANEEL · test sfasamento: un click per quarto a 120 BPM,
// uguale su live e cuffia.
setcpm(120/4)
s("sine*4").freq(1000).attack(0).decay(.02).sustain(0).gain(.8)
`;

const ac = getAudioContext();
const orologioLive = new Orologio(ac);
const cuffia = new Cuffia();
const misuratore = new Misuratore(ac, orologioLive);

let destinazione = { live: true, cuffia: false };
let inTest = false;
let codicePrimaDelTest = CODICE_INIZIALE;
let config = { uscite: {}, offsetCuffiaMs: 0 };
let haValigetta = false;

// Ogni evento dell'orologio passa da qui e va al live, alla cuffia o a entrambi.
function uscita(hap, deadline, durata, cps, t) {
  hap.ensureObjectValue();
  const id = inTest ? misuratore.click(t) : undefined;
  if (destinazione.cuffia) {
    cuffia.evento(hap.value, orologioLive.epoca(t), durata, cps, hap.whole?.begin.valueOf(), id);
  }
  if (destinazione.live) return webaudioOutput(hap, deadline, durata, cps, t);
}

const editor = creaEditor({
  root: $('editor'),
  codice: CODICE_INIZIALE,
  uscita,
  suToggle: (acceso) => aggiornaSpie(acceso),
});

function aggiornaSpie(acceso = editor.repl.state.started) {
  $('stato-live').classList.toggle('accesa', acceso && destinazione.live);
  $('dest-live').classList.toggle('attivo', destinazione.live);
  $('dest-cuffia').classList.toggle('attivo', destinazione.cuffia);
}

function scegliDestinazione(dest) {
  if (inTest) return;
  destinazione = { live: dest === 'live', cuffia: dest === 'cuffia' };
  aggiornaSpie();
}

// --- valigetta ---

async function salva(modifiche) {
  Object.assign(config, modifiche);
  if (haValigetta) await window.daneel.salvaConfig(modifiche);
}

async function apriValigetta(stato) {
  haValigetta = !!stato.config;
  if (!stato.percorso) {
    $('valigetta-nome').textContent = 'nessuna valigetta';
  } else if (stato.mancante) {
    $('valigetta-nome').textContent = `valigetta non trovata: ${stato.percorso} (attacca il disco o scegline un'altra)`;
  } else {
    config = { uscite: {}, offsetCuffiaMs: 0, ...stato.config };
    $('valigetta-nome').textContent = `${config.nome} · ${stato.percorso}`;
    const nomi = Object.keys(stato.suoni).filter((k) => k !== '_base');
    $('suoni').textContent = nomi.length
      ? nomi.map((n) => `${n} (${stato.suoni[n].length})`).join(' · ')
      : 'nessun suono: metti dei WAV in suoni/<nome>/';
    await editor.prebaked;
    await samples(stato.suoni);
    cuffia.configura({ suoni: stato.suoni });
  }
  $('offset-cuffia').value = config.offsetCuffiaMs ?? 0;
  cuffia.configura({ offset: Number(config.offsetCuffiaMs) || 0 });
  await applicaUscite();
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

async function applicaUscite() {
  await aggiornaElenchi();
  const errori = [];
  try {
    await impostaUscita(ac, config.uscite?.live ?? '');
  } catch (e) {
    errori.push(`Live: ${e.message}`);
  }
  cuffia.configura({ uscita: config.uscite?.cuffia ?? '' });
  if (config.uscite?.live && config.uscite.live === config.uscite?.cuffia) {
    errori.push('Live e cuffia sono sulla stessa uscita.');
  }
  $('errore-uscite').textContent = errori.join(' ');
}

async function cambiaUscita(quale, nome) {
  await salva({ uscite: { ...config.uscite, [quale]: nome } });
  await applicaUscite();
}

// --- test ---

function avviaTest() {
  if (inTest) return;
  inTest = true;
  codicePrimaDelTest = editor.code;
  destinazione = { live: true, cuffia: true };
  editor.setCode(CODICE_TEST);
  misuratore.avvia();
  editor.evaluate();
  aggiornaSpie();
}

function fermaTest() {
  if (!inTest) return;
  editor.stop();
  misuratore.scriviLog('fine test');
  misuratore.ferma();
  inTest = false;
  destinazione = { live: true, cuffia: false };
  editor.setCode(codicePrimaDelTest);
  aggiornaSpie(false);
}

const f = (x) => (x === null || x === undefined ? '–' : x.toFixed(2));

function rigaMisure(id, r) {
  const riga = $(id);
  riga.replaceChildren(riga.firstElementChild);
  for (const k of ['ultimo', 'media', 'min', 'max', 'deriva']) riga.insertCell().textContent = f(r?.[k]);
}

function mostraMisure() {
  rigaMisure('riga-stima', misuratore.stima.riepilogo());
  rigaMisure('riga-vero', misuratore.vero() ?? misuratore.anello.riepilogo());
  const v = misuratore.verdetto();
  $('verdetto').textContent = !v ? '' : v.dentro ? 'DENTRO SOGLIA' : 'FUORI SOGLIA';
  const s = misuratore.stima.riepilogo();
  $('durata').textContent = s ? `test da ${(s.durata / 60000).toFixed(1)} min · ${s.n} click misurati` : '';
  const a = misuratore.anello.riepilogo();
  $('anello-stato').textContent = !misuratore.anelloAttivo
    ? 'anello spento'
    : `in ascolto · ${a?.n ?? 0} click rientrati` +
      (misuratore.riferimento === null ? ' · nessun riferimento' : ` · riferimento ${f(misuratore.riferimento)} ms`);
  $('cuffia-dettagli').textContent =
    `cuffia: ${cuffia.viva ? 'viva' : 'ferma'} · eventi arrivati tardi: ${cuffia.tardi}` +
    (cuffia.errore ? ` · ${cuffia.errore}` : '');
}

// --- collegamenti ---

$('valigetta-scegli').onclick = async () => apriValigetta(await window.daneel.scegliValigetta());
$('dest-live').onclick = () => scegliDestinazione('live');
$('dest-cuffia').onclick = () => scegliDestinazione('cuffia');
$('uscita-live').onchange = (e) => cambiaUscita('live', e.target.value);
$('uscita-cuffia').onchange = (e) => cambiaUscita('cuffia', e.target.value);
$('offset-cuffia').onchange = async (e) => {
  const offset = Number(e.target.value) || 0;
  cuffia.configura({ offset });
  await salva({ offsetCuffiaMs: offset });
};
$('test-avvia').onclick = avviaTest;
$('test-ferma').onclick = fermaTest;
$('ingresso-anello').onchange = (e) => salva({ ingressoAnello: e.target.value });
$('anello-attiva').onclick = async () => {
  const nome = $('ingresso-anello').value;
  const ingresso = (await elencoIngressi()).find((d) => d.label === nome);
  if (!ingresso) return ($('anello-stato').textContent = 'scegli un ingresso');
  try {
    await misuratore.attivaAnello(ingresso);
  } catch (e) {
    $('anello-stato').textContent = `errore: ${e.message}`;
  }
};
$('anello-riferimento').onclick = () => misuratore.salvaRiferimento();
$('cuffia-blocca').onclick = () => cuffia.blocca(5000);
$('cuffia-crasha').onclick = () => window.daneel.crashaCuffia();
cuffia.suEco = ({ id, epoca }) => misuratore.eco(id, 'cuffia', epoca);
cuffia.suStato = (viva) => {
  $('stato-cuffia').classList.toggle('accesa', viva);
  if (inTest) misuratore.scriviLog(viva ? 'cuffia tornata' : 'cuffia ferma');
};
navigator.mediaDevices.addEventListener('devicechange', applicaUscite);

setInterval(mostraMisure, 250);
$('percorso-log').textContent = `log: ${await window.daneel.percorsoLog()}`;
await apriValigetta(await window.daneel.valigetta());
