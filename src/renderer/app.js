// La postazione: browser a sinistra, CUE al centro (cuffia), LIVE a destra (casse).
// Qui non suona niente: il codice va ai motori live e cuffia, ognuno nel suo processo.
// Se questa finestra si blocca o crasha, le casse non se ne accorgono.
import { Cue } from './cue.js';
import { Browser, esempiHelp } from './browser.js';
import { Aiuto } from './aiuto.js';
import { Impostazioni } from './impostazioni.js';
import { Importa } from './importa.js';
import { AZIONI, corrisponde, effettive, scriveTesto } from './scorciatoie.js';
import { Pila } from './pila.js';
import { chiediNome, conferma, dialogoAperto } from './dialogo.js';
import * as B from './brano.js';
import { analizza, valuta } from './analisi.js';
import { attivi } from './evidenzia.js';
import gattoInPiedi from '../../design/risorse/gatti/gatto_in_piedi_logo_marcio.svg';
import { Motore } from './motori.js';
import { elencoUscite, elencoIngressi } from './uscite.js';
import { Misuratore } from './sfasamento.js';
import { avviaGatto } from './gatto.js';
import { avviaInsegna } from './insegna.js';
import wordmark from '../../design/risorse/logo/cutx_bianco.svg';

const $ = (id) => document.getElementById(id);

const CODICE_INIZIALE = `// CUTX · ⌘↵ in cuffia, ⇧⌘↵ go live, ⌘. ferma tutto
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

let inTest = false;
let erroreInVista = false;
let pezzoCuffia = null; // { codice, etichetta }: per ridarlo alla cuffia se rinasce
let cuffiaUdibile = true;
let mappa = null;
let livelliLive = []; // i livelli del motore live: { id, nome, provenienza, codice, da, a, … }
let entraTra = 1; // GO LIVE entra al confine tra 1, 2, 4 o 8 cicli // la mappa del tempo del live, in tempo assoluto
let config = { uscite: {}, offsetCuffiaMs: 0 };
let suoni = {};
let haStash = false;
let preferenze = { lunghezzaFrase: 16 };
let ripreso = false; // ho già preso lo stato dai motori? (dopo un crash dell'interfaccia stanno ancora suonando)

let libreria = [];
let browser = null; // il browser a sinistra (più sotto): serve già al CUE che si costruisce prima
const cue = new Cue(CODICE_INIZIALE, {
  provaInCuffia: () => provaInCuffia(),
  goLive: () => goLive(),
  fermaTutto: () => fermaTutto(),
  suoniStash: () => suoni,
  haStash: () => haStash,
  bpm: () => (mappa ? Math.round(mappa.cps * 240 * 10) / 10 : null),
  libreriaCambiata: () => aggiornaLibreria(),
  mostraLibreria: () => scegliScheda('libreria'),
});

// --- i gesti ---

// Gli errori si vedono solo qui, nel CUE: mai sull'uscita.
async function manda(motore, codice, etichetta = {}) {
  if (motore === cuffia) pezzoCuffia = { codice, etichetta, da: performance.now() };
  const errore = await motore.valuta(codice, etichetta);
  mostraErrore(errore, motore.ruolo);
  return errore;
}

function mostraErrore(errore, chi) {
  if (errore) cue.avviso(`${chi}: ${errore}`, { persistente: true });
  else if (erroreInVista) cue.avviso('');
  erroreInVista = !!errore;
}

function provaInCuffia() {
  if (inTest) return;
  const p = cue.pezzo();
  if (p.errore) return cue.avviso(p.errore);
  dovaCuffia = p.dove ? { ...p.dove, inizio: p.inizio } : null;
  return manda(cuffia, p.codice, { nome: p.nome, provenienza: p.provenienza });
}

// Le note che suonano in cuffia, in bianco nel CUE: solo finché quelle righe non sono cambiate.
let dovaCuffia = null; // { editor, base, inizio }: dove sta nel CUE il codice mandato in cuffia
function evidenziaCuffia(ciclo) {
  const codice = cuffia.viva && !inTest ? pezzoCuffia?.codice : null;
  const d = dovaCuffia;
  const intervalli = [];
  if (codice && d) {
    const corpo = codice.slice(d.inizio);
    if (d.editor.codice.slice(d.base, d.base + corpo.length) === corpo) {
      const scarto = d.base - d.inizio;
      for (const [a, b] of attivi(codice, ciclo)) if (a >= d.inizio) intervalli.push([a + scarto, b + scarto]);
    }
  }
  for (const e of cue.editors()) e.evidenzia(e === d?.editor ? intervalli : []);
}

// GO LIVE: entra al confine tra 1, 2, 4 o 8 cicli. Se il codice ha un errore, il live non cambia.
async function goLive() {
  if (inTest) return;
  const p = cue.pezzo();
  if (p.errore) return cue.avviso(p.errore);
  const r = await live.richiesta({ tipo: 'entra', codice: p.codice, nome: p.nome, provenienza: p.provenienza, cicli: entraTra });
  mostraErrore(r.errore, 'live');
  return r;
}

// Toglie a fine ciclo l'ultimo livello entrato (al passo 6: quello scelto nel LIVE).
function togliLivello(id) {
  if (inTest) return;
  const attivi = livelliLive.filter((l) => l.a === null);
  const l = id !== undefined ? livelliLive.find((x) => x.id === id) : attivi.at(-1);
  if (l) live.manda({ tipo: 'togli', livello: l.id });
}

// --- paracadute "CUTX, scelgo te!" ---

// Il codice di emergenza del set (stash.json → paracadute), o questo: cassa e charleston, solo synth.
const PARACADUTE = `// CUTX, scelgo te!
stack(
  note("c1*4").s("sine").decay(.3).sustain(0).gain(.9),
  s("white*8").decay(.03).sustain(0).gain(.2)
)`;

async function lanciaParacadute() {
  if (inTest || preferenze.paracadute === false) return;
  const r = await live.richiesta({ tipo: 'paracadute', codice: config.paracadute || PARACADUTE });
  if (r.errore) cue.avviso(`paracadute: ${r.errore}`, { persistente: true });
  else cue.avviso(r.paracadute ? 'paracadute aperto · di nuovo per tornare com\'eri' : 'si torna com\'eri al prossimo ciclo');
}

// Tenuto premuto un secondo: niente partenze per sbaglio.
function pulsanteParacadute() {
  const b = $('paracadute');
  let timer = null;
  const lascia = () => {
    clearTimeout(timer);
    b.classList.remove('carica');
  };
  b.onpointerdown = () => {
    b.classList.add('carica');
    timer = setTimeout(() => {
      lascia();
      lanciaParacadute();
    }, 1000);
  };
  b.onpointerup = lascia;
  b.onpointerleave = lascia;
  $('paracadute-gatto').src = gattoInPiedi;
}

// --- salva il live come brano: per catturare una jam fatta a casa ---

const oggi = () => new Date().toLocaleDateString('sv-SE');

async function salvaLiveComeBrano() {
  if (!haStash) return cue.avviso('nessuno stash: sceglilo nella barra in alto');
  const livelli = livelliLive.filter((l) => l.a === null && l.nome !== 'paracadute');
  if (!livelli.length) return cue.avviso('niente live da salvare');
  const nome = await chiediNome({ titolo: 'salva il live come brano', valore: `live ${oggi()}`, conferma: 'salva' });
  if (!nome) return;
  const usati = new Set();
  for (const l of livelli) for (const n of (await analizza(l.codice, suoni)).suoni) usati.add(n);
  const bpm = mappa ? Math.round(mappa.cps * 240 * 10) / 10 : undefined;
  const testo = B.daLivelli(livelli, { nome, bpm, data: oggi(), suoni: [...usati].sort() });
  const file = B.nomeFile(nome);
  let r = await window.cutx.scriviBrano(file, testo);
  if (r.esiste) {
    if (!(await conferma({ titolo: 'salva il live come brano', testo: `${file} esiste già nella libreria. Lo sovrascrivo?`, si: 'sovrascrivi' }))) return;
    r = await window.cutx.scriviBrano(file, testo, { sovrascrivi: true });
  }
  await aggiornaLibreria();
  cue.avviso(`live salvato come ${r.file}: ${livelli.length} sezioni`);
  return r.file;
}

function scegliEntraTra(n) {
  entraTra = n;
  for (const b of document.querySelectorAll('[data-entra]')) b.classList.toggle('on', Number(b.dataset.entra) === n);
}

function fermaTutto() {
  if (inTest) return fermaTest();
  pezzoCuffia = null;
  live.manda({ tipo: 'ferma' });
  cuffia.manda({ tipo: 'ferma' });
}

function cuffiaOnOff(on = !cuffiaUdibile) {
  cuffiaUdibile = on;
  cuffia.manda({ tipo: 'udibile', on });
}

function impostazioni(aperte = $('impostazioni').hidden) {
  $('impostazioni').hidden = !aperte;
  if (aperte) {
    aggiornaElenchi();
    imp.disegna();
  } else imp.catturando = null;
}

// ⌘I: suggerimenti e riquadro help insieme, tutti e due on o tutti e due off.
function helpOnOff() {
  const acceso = preferenze.suggerimenti !== false || preferenze.riquadroHelp !== false;
  window.cutx.salvaPreferenze({ suggerimenti: !acceso, riquadroHelp: !acceso });
}

// Le scorciatoie valgono anche dentro l'editor: le prendo prima di lui.
// ⌘↵: nel LIVE (jam o livello in modifica) applica al prossimo ciclo, nel CUE prova in cuffia.
function invio() {
  if (pila.fuoco()) return pila.applica();
  return provaInCuffia();
}

// ⌘P due volte di fila (o il pulsante tenuto premuto): il paracadute non parte per sbaglio.
const DOPPIO_MS = 500;
let ultimoP = 0;
function paracaduteDoppio() {
  const ora = performance.now();
  if (ora - ultimoP < DOPPIO_MS) {
    ultimoP = 0;
    return lanciaParacadute();
  }
  ultimoP = ora;
}

// Cosa fa ogni azione (i tasti sono in scorciatoie.js e nelle preferenze: si cambiano nelle impostazioni).
const FA = {
  provaCuffia: invio,
  goLive,
  togli: () => togliLivello(),
  entra1: () => scegliEntraTra(1),
  entra2: () => scegliEntraTra(2),
  entra4: () => scegliEntraTra(4),
  entra8: () => scegliEntraTra(8),
  // muto del livello n: la cifra arriva dal tasto premuto
  muto: (n) => {
    const l = pila.attivi()[n - 1];
    if (l) live.manda({ tipo: 'livello', livello: l.id, muto: 'inverti' });
  },
  fermaTutto,
  cuffiaOnOff: () => cuffiaOnOff(),
  // dal CUE al LIVE (il jam) e ritorno
  passaCueLive: () => (document.activeElement?.closest?.('.live') ? cue.focus() : pila.focusJam()),
  help: helpOnOff,
  esci: () => {
    if (importa.aperto) importa.chiudi();
    else if (!$('impostazioni').hidden) impostazioni(false);
    else if (!pila.annulla()) document.activeElement?.blur();
  },
  impostazioni: () => impostazioni(),
  salva: () => cue.salva(),
  salvaLive: () => salvaLiveComeBrano(),
  aggiungiSezione: () => cue.aggiungiSezione(),
  fraseDaCapo,
  paracadute: paracaduteDoppio,
  uscitaIntera: () => window.cutx.uscitaSchermoIntero(),
};

// Le scorciatoie valgono anche dentro l'editor (le prendo prima di lui), tranne quelle che scrivono
// un carattere: ⌥5 è ~ sulla tastiera italiana, e 1 2 4 8 sono numeri.
window.addEventListener(
  'keydown',
  (e) => {
    if (dialogoAperto() || imp.catturando) return; // i dialoghi e la scelta di un tasto se li gestiscono da soli
    const scrivendo = e.target.closest?.('.cm-editor, input, select, textarea');
    const mappa = effettive(preferenze.scorciatoie);
    for (const a of AZIONI) {
      const r = corrisponde(e, a, mappa[a.id]);
      if (!r) continue;
      if (scrivendo && (a.soloFuori || scriveTesto(mappa[a.id]))) continue;
      e.preventDefault();
      e.stopPropagation();
      FA[a.id](r);
      return;
    }
  },
  true,
);

// --- stash: lo leggono anche i motori, da soli ---

async function salva(modifiche) {
  Object.assign(config, modifiche);
  if (haStash) await window.cutx.salvaConfig(modifiche);
}

async function apriStash(stato) {
  haStash = !!stato.config;
  suoni = {};
  if (!stato.percorso) {
    $('stash-nome').textContent = 'nessuno';
    $('stash-dove').textContent = 'scegli';
  } else if (stato.mancante) {
    $('stash-nome').textContent = 'manca';
    $('stash-dove').textContent = 'attacca il disco';
  } else {
    config = { uscite: {}, offsetCuffiaMs: 0, ...stato.config };
    suoni = stato.suoni;
    $('stash-nome').textContent = config.nome;
    $('stash-dove').textContent = stato.percorso.startsWith('/Volumes/') ? 'ssd' : 'mac';
  }
  $('stash').title = stato.percorso ?? 'Scegli lo stash';
  const nomi = Object.keys(suoni).filter((k) => k !== '_base');
  $('suoni').textContent = nomi.length
    ? nomi.map((n) => `${n} (${suoni[n].length})`).join(' · ')
    : 'nessun suono: metti dei WAV in suoni/<nome>/';
  $('offset-cuffia').value = config.offsetCuffiaMs ?? 0;
  await aggiornaLibreria();
  await aggiornaElenchi();
}

// --- impostazioni e help ---

const imp = new Impostazioni({
  preferenze: () => preferenze,
  salvaPreferenze: (m) => window.cutx.salvaPreferenze(m),
  config: () => config,
  salvaConfig: (m) => salva(m),
  percorsoStash: () => $('stash').title === 'Scegli lo stash' ? null : $('stash').title,
  scegliStash: async () => apriStash(await window.cutx.scegliStash()),
  provaInCuffia: (codice) => (inTest ? null : (dovaCuffia = null, manda(cuffia, codice, { nome: 'paracadute', provenienza: 'impostazioni' }))),
  codiceParacaduteBase: PARACADUTE,
});
const aiuto = new Aiuto({
  riquadro: $('riquadro-help'),
  combo: (azione) => effettive(preferenze.scorciatoie)[azione],
});

// --- importazione da Ableton ---

const importa = new Importa({
  // ▶: la cuffia, mai le casse
  provaInCuffia: (codice, chiave, anteprima) => {
    if (inTest) return;
    dovaCuffia = null;
    return manda(cuffia, codice, { nome: chiave, provenienza: 'ableton', anteprima });
  },
  ferma: () => {
    pezzoCuffia = null;
    cuffia.manda({ tipo: 'ferma' });
  },
  // finché non finisce da sola: il motore svuota il suo codice, e qui il tasto torna ▶ (1,5 s di tolleranza per la partenza)
  inAscolto: (chiave) =>
    cuffia.viva && pezzoCuffia?.etichetta?.provenienza === 'ableton' && pezzoCuffia.etichetta.nome === chiave && (performance.now() - pezzoCuffia.da < 1500 || !!cuffia.stato?.codice),
  registraSuoni: (mappa) => cuffia.manda({ tipo: 'suoni-extra', mappa }),
  avviso: (testo) => cue.avviso(testo),
  // Scrive il brano nella libreria, copia i suoni nello stash e lo apre nel CUE in modalità brano.
  importa: async (risultato) => {
    if (!haStash) {
      cue.avviso('nessuno stash: sceglilo nella barra in alto');
      return false;
    }
    const richiesta = { file: B.nomeFile(risultato.titolo), testo: risultato.testo, suoni: risultato.suoni.map((s) => ({ nome: s.nome, percorso: s.percorso, ritaglio: s.ritaglio })) };
    let r = await window.cutx.importaAbleton(richiesta);
    if (r.esiste) {
      if (!(await conferma({ titolo: 'importa da ableton', testo: `${r.file} esiste già nella libreria. Lo sovrascrivo?`, si: 'sovrascrivi' }))) return false;
      r = await window.cutx.importaAbleton({ ...richiesta, sovrascrivi: true });
    }
    if (r.errore) {
      cue.avviso(`importazione non riuscita: ${r.errore}`, { persistente: true });
      return false;
    }
    await apriStash(await window.cutx.stash()); // suoni e libreria nuovi
    await cue.apri(r.file);
    const pezzi = [`creato il brano «${risultato.titolo}»: ${risultato.sezioni} ${risultato.sezioni === 1 ? 'sezione' : 'sezioni'}, ${r.copiati.length} ${r.copiati.length === 1 ? 'suono copiato' : 'suoni copiati'}, aperto nel CUE`];
    if (r.ritagliati?.length) pezzi.push(`${r.ritagliati.length} ritagliati (−${Math.round(r.ritagliati.reduce((n, x) => n + x.prima - x.dopo, 0) / 1e5) / 10} MB)`);
    if (r.mancanti.length) pezzi.push(`${r.mancanti.length} file mancanti (le sezioni ci sono lo stesso)`);
    if (r.nonSupportati.length) pezzi.push(`${r.nonSupportati.length} file in un formato che CUTX non legge: esportali in WAV`);
    cue.avviso(pezzi.join(' · '), { persistente: r.mancanti.length > 0 || r.nonSupportati.length > 0 });
    return true;
  },
});

// --- browser: suoni, libreria, help ---

browser = new Browser(
  { elenco: $('elenco'), cerca: $('cerca'), schede: [...document.querySelectorAll('[data-scheda]')] },
  {
    suoni: () => suoni,
    haStash: () => haStash,
    libreria: () => libreria,
    branoAperto: () => cue.brano?.file ?? null,
    // ▶: lo sente solo la cuffia, mai le casse
    prova: (codice, chiave, unaVolta) => {
      if (inTest) return;
      dovaCuffia = null;
      return manda(cuffia, codice, { nome: chiave, provenienza: 'browser', unaVolta });
    },
    ferma: () => {
      pezzoCuffia = null;
      cuffia.manda({ tipo: 'ferma' });
    },
    inAscolto: (chiave) => cuffia.viva && pezzoCuffia?.etichetta?.provenienza === 'browser' && pezzoCuffia.etichetta.nome === chiave,
    inserisci: (testo) => cue.inserisci(testo),
    apriBrano: (file) => cue.apri(file),
    cartelleAbleton: () => preferenze.cartelleAbleton ?? [],
    progettiAbleton: () => window.cutx.progettiAbleton(),
    infoProgetto: (percorso) => window.cutx.infoAbleton(percorso),
    aggiungiCartellaAbleton: () => window.cutx.aggiungiCartellaAbleton(),
    apriProgetto: (progetto) => importa.apri(progetto),
  },
);
function scegliScheda(nome) {
  browser.vai(nome);
}
function mostraBrowser() {
  browser?.mostra();
}

async function aggiornaLibreria() {
  libreria = await window.cutx.libreria();
  mostraBrowser();
}

// --- uscite (provvisorie, nelle impostazioni) ---

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

// --- test (provvisorio, nelle impostazioni) ---

function avviaTest(codice = CODICE_TEST) {
  if (inTest) return;
  inTest = true;
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
  pezzoCuffia = null;
}

// All'avvio chiedo ai motori cosa suonano: dopo un crash dell'interfaccia non si sono fermati.
function riprendi() {
  if (ripreso || !live.viva || !cuffia.viva) return;
  ripreso = true;
  const c = cuffia.stato;
  pezzoCuffia = c.codice ? { codice: c.codice, etichetta: { nome: c.nome, provenienza: c.provenienza } } : null;
  cuffiaUdibile = c.udibile ?? true;
  if (live.stato.eco) {
    inTest = true;
    misuratore.avvia();
    misuratore.scriviLog('interfaccia ripartita, test in corso');
  }
}

// Per provare la regola d'oro: questa finestra si pianta e i motori vanno avanti.
function bloccaInterfaccia(ms) {
  const fine = performance.now() + ms;
  while (performance.now() < fine);
}

// --- disegno ---

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

function mostraImpostazioni() {
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

// Verso la finestra di uscita passano solo le bozze: quello che sto scrivendo nel LIVE.
let portaUscita = null;
let ultimeBozze = { livelli: {}, jam: null };
window.addEventListener('message', (e) => {
  if (e.data?.porta !== 'uscita' || !e.ports[0]) return;
  portaUscita = e.ports[0];
  portaUscita.postMessage({ tipo: 'bozze', ...ultimeBozze });
});

function mostraUscita(aperta) {
  $('uscita-onoff').classList.toggle('on', aperta);
  $('uscita-onoff').querySelector('i').textContent = aperta ? 'on' : 'off';
}

// Il LIVE: la pila dei livelli, dallo stato del motore live, e il jam in fondo.
const pila = new Pila($('livelli'), $('jam'), {
  togli: (id) => togliLivello(id),
  volume: (id, volume) => live.manda({ tipo: 'livello', livello: id, volume }),
  muto: (id, muto) => live.manda({ tipo: 'livello', livello: id, muto }),
  // jam o livello modificato: entra al prossimo ciclo, già scritto. Un errore lascia la versione di prima.
  applica: async (livello, codice) => {
    const r = await live.richiesta({
      tipo: 'entra',
      codice,
      nome: livello?.nome ?? 'jam',
      provenienza: livello?.provenienza ?? 'jam',
      cicli: 1,
      scritto: true,
    });
    return r.errore ?? null;
  },
  bozze: (bozze) => {
    ultimeBozze = bozze;
    portaUscita?.postMessage({ tipo: 'bozze', ...bozze });
  },
});

function mostraLive() {
  if (!live.viva) livelliLive = [];
  else if (live.stato.livelli) livelliLive = live.stato.livelli;
  pila.aggiorna(livelliLive);
}

function mostraCue() {
  const etichetta = (m) => (m.viva && m.stato.codice && m.stato.nome ? { nome: m.stato.nome, provenienza: m.stato.provenienza ?? '' } : null);
  // live = sta suonando o sta per entrare
  const inLive = livelliLive.filter((l) => l.a === null).map((l) => ({ nome: l.nome, provenienza: l.provenienza }));
  cue.aggiornaStati({ live: inTest ? [] : inLive, cuffia: inTest ? null : etichetta(cuffia) });
  const b = $('cuffia-onoff');
  b.classList.toggle('on', cuffia.viva && cuffiaUdibile);
  b.querySelector('i').textContent = !cuffia.viva ? '–' : cuffiaUdibile ? 'on' : 'off';
  $('manda-cuffia').classList.toggle('on', $('card-libero').classList.contains('in-cuffia'));
}

function mostra() {
  riprendi();
  browser.aggiornaAscolto();
  importa.aggiornaAscolto();
  mostraLive();
  disegnaTempo();
  mostraCue();
  if (!$('impostazioni').hidden) mostraImpostazioni();
}

// Tempo: BPM, battute e frase seguono il live, nell'istante in cui si sente.
// La frase è solo da vedere: il ciclo di Strudel non si tocca.
const battute = [...$('battute').children];
const quarti = [...$('quarti').children];

function durata(ms) {
  const s = Math.floor(ms / 1000);
  const due = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h ? `${h}:${due(Math.floor(s / 60) % 60)}:${due(s % 60)}` : `${due(Math.floor(s / 60))}:${due(s % 60)}`;
}

// A ogni fotogramma, e comunque ogni 100 ms: i fotogrammi si fermano se la finestra è coperta.
function mostraTempo() {
  requestAnimationFrame(mostraTempo);
  disegnaTempo();
}

function disegnaTempo() {
  if (!mappa || !live.viva) {
    $('bpm').textContent = '–';
    $('frase-numero').textContent = '–';
    $('piede-frase').textContent = 'frase –';
    return;
  }
  const epoca = performance.timeOrigin + performance.now();
  const ciclo = mappa.ciclo0 + ((epoca - mappa.epoca0) / 1000) * mappa.cps;
  const intero = Math.floor(ciclo);
  const quarto = Math.floor((ciclo - intero) * 4);
  const lunghezza = preferenze.lunghezzaFrase;
  const frase = (((intero - (mappa.ancoraFrase ?? 0)) % lunghezza) + lunghezza) % lunghezza + 1;
  $('bpm').textContent = Math.round(mappa.cps * 240 * 10) / 10;
  $('frase-numero').textContent = frase;
  $('frase-lunghezza').textContent = `/${lunghezza}`;
  $('piede-frase').textContent = `frase ${frase}/${lunghezza}`;
  const set = mappa.inizioSet && epoca > mappa.inizioSet ? durata(epoca - mappa.inizioSet) : null;
  $('tempo-set').textContent = set ?? '–:–';
  $('tempo-live').textContent = set ?? '';
  evidenziaCuffia(ciclo);
  const conti = pila.disegna(mappa, epoca);
  if (conti) {
    document.body.classList.toggle('live-suona', conti.suonano > 0);
    $('conteggio').textContent = `${conti.suonano} live${conti.inArrivo ? ` · ${conti.inArrivo} in arrivo` : ''}`;
  }
  for (const fila of [battute, quarti]) {
    fila.forEach((d, i) => {
      d.classList.toggle('passata', i < quarto);
      d.classList.toggle('ora', i === quarto);
    });
  }
}

function fraseDaCapo() {
  live.manda({ tipo: 'frase-da-capo' });
}

// --- collegamenti ---

for (const m of [live, cuffia]) {
  m.suStato = (viva) => inTest && misuratore.scriviLog(`${m.ruolo} ${viva ? 'vivo' : 'fermo'}`);
  m.suMessaggio = (msg) => {
    if (msg.tipo === 'mappa') mappa = msg;
    else if (msg.tipo === 'livelli') {
      livelliLive = msg.livelli;
      pila.aggiorna(livelliLive);
    }
    else if (msg.tipo === 'eco') misuratore.eco(msg.ciclo, msg.ruolo, msg.epoca);
    else if (msg.tipo === 'anello') misuratore.misuraAnello(msg.ms);
    else if (msg.tipo === 'anello-stato') $('anello-stato').textContent = msg.attivo ? 'in ascolto' : `errore: ${msg.errore}`;
  };
}
// Una cuffia rinata riparte da vuota: le ridò il suo codice.
cuffia.suCollegato = () => {
  if (!ripreso) return;
  if (inTest) cuffia.manda({ tipo: 'eco', attivo: true });
  if (!cuffiaUdibile) cuffia.manda({ tipo: 'udibile', on: false });
  if (pezzoCuffia) manda(cuffia, pezzoCuffia.codice, pezzoCuffia.etichetta);
};

$('wordmark').src = wordmark;
$('imp-wordmark').src = wordmark;
const posaGatto = avviaGatto($('gatto'));
avviaGatto($('imp-gatto'), { animato: false });
pulsanteParacadute();
const accendiInsegna = avviaInsegna($('insegna'));

$('stash').onclick = async () => apriStash(await window.cutx.scegliStash());
$('cuffia-onoff').onclick = () => cuffiaOnOff();
$('apri-impostazioni').onclick = () => impostazioni(true);
$('chiudi-impostazioni').onclick = () => impostazioni(false);
$('manda-cuffia').onclick = provaInCuffia;
$('manda-live').onclick = goLive;
$('go-live').onclick = goLive;
$('frase').onclick = fraseDaCapo;
$('uscita-onoff').onclick = async () => mostraUscita(await window.cutx.uscitaOnOff());
window.cutx.suUscita(mostraUscita);
window.cutx.uscitaAperta().then(mostraUscita);
for (const b of document.querySelectorAll('[data-entra]')) b.onclick = () => scegliEntraTra(Number(b.dataset.entra));

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

// Per la prova automatica di robustezza (npm run prova) e le foto della postazione.
globalThis.cutxProva = {
  avviaTest,
  bloccaInterfaccia,
  valuta: (ruolo, codice, etichetta) => manda(ruolo === 'live' ? live : cuffia, codice, etichetta),
  goLive,
  scegliEntraTra,
  togli: (id) => togliLivello(id),
  salvaLiveComeBrano,
  lanciaParacadute,
  pila,
  imp,
  importa,
  scriviCue: (codice) => (cue.libero.codice = codice),
  cue,
  posaGatto: (nome) => posaGatto(nome),
  accendiInsegna: () => accendiInsegna(),
  libreria: () => libreria,
  suoniStash: () => suoni,
  browser,
  ricaricaStash: async () => apriStash(await window.cutx.stash()),
  ricaricaLibreria: aggiornaLibreria,
  fermaTutto,
  esempiHelp,
  valutaCodice: valuta,
  // seleziona le righe da..a (contate da 0) nell'editor libero
  selezionaRighe: (da, a) => {
    const v = cue.libero.vista;
    v.dispatch({ selection: { anchor: v.state.doc.line(da + 1).from, head: v.state.doc.line(a + 1).to } });
    v.focus();
  },
  misure: () => ({ stima: misuratore.stima.riepilogo(), live: live.stato, cuffia: cuffia.stato }),
};

setInterval(mostra, 100);
mostra();
mostraTempo();
function applicaPreferenze(p) {
  preferenze = p;
  pila.scritturaAMacchina = p.scritturaAMacchina !== false;
  $('paracadute').hidden = p.paracadute === false;
  document.body.classList.toggle('senza-gatto', p.gatto === false);
  document.body.classList.toggle('senza-insegna', p.insegna === false);
  aiuto.aggiorna(p);
  imp.disegna();
  if (browser?.scheda === 'ableton') browser.cercaProgetti();
}
window.cutx.suPreferenze(applicaPreferenze);
applicaPreferenze(await window.cutx.preferenze());
$('percorso-log').textContent = `log: ${await window.cutx.percorsoLog()}`;
await apriStash(await window.cutx.stash());
