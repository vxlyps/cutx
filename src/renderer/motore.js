// Motore audio: gira in un processo suo, nascosto, in due copie uguali.
// - live: comanda il tempo, suona sulle casse, pubblica la mappa del tempo alla cuffia;
// - cuffia: segue la mappa del live e suona sul jack, allo stesso istante.
// Ognuno valuta il codice da solo. L'interfaccia manda il codice e non aspetta niente.
import { evalScope, getTrigger, repl, setTime, silence } from '@strudel/core';
import { transpiler } from '@strudel/transpiler';
import {
  getAudioContext,
  getSuperdoughAudioController,
  initAudio,
  registerSynthSounds,
  samples,
  webaudioOutput,
} from '@strudel/webaudio';
import { Orologio } from './tempo.js';
import { impostaUscita } from './uscite.js';
import { Riproduttore, TICK_S } from './riproduttore.js';
import { Sentinella, Anello } from './ascolto.js';

const RUOLO = new URLSearchParams(location.search).get('ruolo') === 'live' ? 'live' : 'cuffia';
const LIVE = RUOLO === 'live';
const MAPPA_OGNI_MS = 1000;
const CPS_INIZIALE = 0.5; // come Strudel: 120 BPM in 4/4

const ac = getAudioContext();
const orologio = new Orologio(ac);
const pronto = (async () => {
  await evalScope(
    import('@strudel/core'),
    import('@strudel/mini'),
    import('@strudel/tonal'),
    import('@strudel/webaudio'),
    import('@strudel/codemirror'),
    import('@strudel/draw'),
  );
  await registerSynthSounds();
  await initAudio();
})();

const porte = {}; // controllo, live o cuffia → MessagePort
const manda = (a, m) => porte[a]?.postMessage(m);

let errore = null; // della configurazione
let offsetMs = 0;
let eco = false; // per il misuratore: dico quando ho suonato ogni evento
let mappaLive = null; // cuffia: l'ultima mappa ricevuta, in tempo assoluto
let livelliLive = []; // cuffia: i livelli live, per il futuro mix cuffia/live
let udibile = true;
let mix = 0; // cuffia: 0 = solo la prova; il mix col live arriva in fase 4 (fader dell'APC)

// Cuffia: una prova sola. Live: una pila di livelli, ognuno con la sua finestra di cicli.
let prova = { codice: '', nome: null, provenienza: null };
let livelli = []; // { id, nome, provenienza, codice, pattern, da, a, richiesto, volume, muto }
let prossimoLivello = 1;

// Solo per quello che si vede (barra, proiettore): il ciclo di Strudel non si tocca mai.
let ancoraFrase = 0; // ciclo in cui la frase vale 1
let inizioSet = null; // epoca in cui è partito il primo livello live

// --- valutazione: il repl di Strudel compila e basta, a tempo suona il riproduttore ---

let erroreValutazione = null;
const compilatore = repl({
  transpiler,
  defaultOutput: webaudioOutput,
  getTime: () => ac.currentTime,
  onEvalError: (e) => (erroreValutazione = String(e.message ?? e)),
});
const rip = new Riproduttore(ac, getTrigger({ getTime: () => ac.currentTime, defaultOutput: webaudioOutput }));

// { pattern, cps } oppure { errore }. cps c'è se il codice chiede un tempo nuovo (setcpm).
let coda = Promise.resolve();
function compila(codice) {
  const lavoro = coda.then(async () => {
    await pronto;
    erroreValutazione = null;
    // setcpm e cpm() vedono il tempo attuale; il tempo nuovo lo applica solo il live.
    const cps = rip.mappa?.cps ?? CPS_INIZIALE;
    compilatore.scheduler.cps = cps;
    const pattern = codice.trim() ? await compilatore.evaluate(codice, false) : silence;
    setTime(() => (rip.mappa ? rip.ciclo(ac.currentTime) : 0));
    if (erroreValutazione || !pattern) return { errore: erroreValutazione ?? 'valutazione fallita' };
    return { pattern, cps: compilatore.scheduler.cps !== cps ? compilatore.scheduler.cps : null };
  });
  coda = lavoro.catch(() => {});
  return lavoro;
}

// Un errore lascia suonare quello che c'era: si risponde con l'errore e basta.
async function valuta(codice, etichetta = {}) {
  const c = await compila(codice);
  if (c.errore) return c.errore;
  if (!LIVE) {
    rip.pattern = c.pattern;
    prova = { codice, nome: etichetta.nome ?? null, provenienza: etichetta.provenienza ?? null };
    return null;
  }
  // Live, subito: un livello solo al posto di tutti (test di sfasamento, prova automatica).
  livelli = codice.trim() ? [nuovoLivello(codice, c.pattern, etichetta, -Infinity)] : [];
  if (c.cps) cambiaCps(c.cps);
  iniziaSet(rip.prossimoConfine());
  aggiornaLivelli();
  return null;
}

// scritto = il codice si è già visto scrivere (jam, modifiche sul posto, paracadute): niente macchina da scrivere.
function nuovoLivello(codice, pattern, { nome, provenienza, scritto = false } = {}, da) {
  return {
    scritto,
    id: prossimoLivello++,
    nome: nome ?? 'libero',
    provenienza: provenienza ?? '',
    codice,
    pattern,
    da,
    a: Infinity,
    richiesto: orologio.epoca(ac.currentTime),
    volume: 1,
    muto: false,
  };
}

// GO LIVE: il livello entra al confine tra `cicli` cicli. Uno con lo stesso nome lo sostituisce lì.
async function entra({ codice, nome, provenienza, cicli = 1, scritto = false }) {
  const c = await compila(codice);
  if (c.errore) return { errore: c.errore };
  const da = rip.prossimoConfine() + Math.max(1, cicli) - 1;
  const l = nuovoLivello(codice, c.pattern, { nome, provenienza, scritto }, da);
  for (const vecchio of livelli) {
    if (vecchio.nome !== l.nome || vecchio.a <= da) continue;
    vecchio.a = Math.max(vecchio.da, da);
    l.volume = vecchio.volume;
    l.muto = vecchio.muto;
  }
  livelli.push(l);
  if (c.cps) rip.cambiaCpsA(da, c.cps);
  iniziaSet(da);
  aggiornaLivelli();
  return { da, livello: l.id };
}

// --- paracadute "CUTX, scelgo te!" ---
// Al battito successivo esce tutto ed entra il codice di emergenza, subito. I livelli tolti si
// conservano: la seconda volta escono il paracadute e rientrano loro, al ciclo successivo.
let paracadute = null; // { id, salvati: [livelli] } quando è aperto

async function lanciaParacadute(codice) {
  if (paracadute) return riprendiDalParacadute();
  const c = await compila(codice);
  if (c.errore) return { errore: c.errore };
  const battito = Math.ceil((rip.fine ?? rip.ciclo(ac.currentTime)) * 4) / 4;
  const salvati = livelli.filter((l) => l.a === Infinity);
  for (const l of salvati) l.a = Math.max(l.da, battito);
  const p = nuovoLivello(codice, c.pattern, { nome: 'paracadute', provenienza: 'cutx, scelgo te!', scritto: true }, battito);
  livelli.push(p);
  paracadute = { id: p.id, salvati };
  aggiornaLivelli();
  return { da: battito, paracadute: true };
}

function riprendiDalParacadute() {
  const confine = rip.prossimoConfine();
  const p = livelli.find((l) => l.id === paracadute.id);
  if (p && p.a === Infinity) p.a = Math.max(p.da, confine);
  for (const s of paracadute.salvati) {
    const l = nuovoLivello(s.codice, s.pattern, { nome: s.nome, provenienza: s.provenienza, scritto: true }, confine);
    l.volume = s.volume;
    l.muto = s.muto;
    livelli.push(l);
  }
  paracadute = null;
  aggiornaLivelli();
  return { da: confine, paracadute: false };
}

// Esce alla fine del ciclo in corso.
function togli(id) {
  const l = livelli.find((x) => x.id === id);
  if (!l || l.a !== Infinity) return;
  l.a = Math.max(l.da, rip.prossimoConfine());
  aggiornaLivelli();
}

function ferma() {
  paracadute = null;
  prova = { codice: '', nome: null, provenienza: null };
  rip.pattern = silence;
  if (LIVE) {
    livelli = [];
    aggiornaLivelli();
  }
}

// Il set comincia col primo livello: lì parte anche la frase.
function iniziaSet(ciclo) {
  if (!LIVE || inizioSet !== null || !rip.mappa) return;
  ancoraFrase = ciclo === -Infinity ? rip.prossimoConfine() : ciclo;
  inizioSet = orologio.epoca(rip.tempo(ancoraFrase));
  pubblicaMappa();
}

const descrivi = (l) => ({
  id: l.id,
  nome: l.nome,
  provenienza: l.provenienza,
  codice: l.codice,
  da: l.da === -Infinity ? null : l.da,
  a: l.a === Infinity ? null : l.a,
  richiesto: l.richiesto,
  volume: l.volume,
  muto: l.muto,
  scritto: l.scritto,
  primo: l.primo ?? null,
  ultimo: l.ultimo ?? null,
});

function aggiornaLivelli() {
  rip.sorgenti = livelli;
  const descritti = livelli.map(descrivi);
  const messaggio = { tipo: 'livelli', livelli: descritti, paracadute: !!paracadute };
  manda('controllo', messaggio);
  manda('uscita', messaggio);
  manda('cuffia', { tipo: 'livelli-live', livelli: descritti });
}

// I livelli usciti del tutto (già programmati fino alla loro fine) se ne vanno.
function pulisci() {
  if (!LIVE || rip.fine === null) return;
  const restano = livelli.filter((l) => l.a > rip.fine);
  if (restano.length !== livelli.length) {
    livelli = restano;
    aggiornaLivelli();
  }
}

// --- tempo ---

function pubblicaMappa() {
  if (!LIVE || !rip.mappa || orologio.aggiorna() === null) return;
  // Si riparte da adesso, così il conto in tempo assoluto resta fresco.
  // Anche all'interfaccia, per BPM, battute e frase: in tempo assoluto, cioè quando si sente.
  const t0 = ac.currentTime;
  const mappa = { tipo: 'mappa', ciclo0: rip.ciclo(t0), epoca0: orologio.epoca(t0), cps: rip.mappa.cps, ancoraFrase, inizioSet };
  manda('cuffia', mappa);
  manda('controllo', mappa);
  manda('uscita', mappa);
}

function cambiaCps(cps) {
  rip.cambiaCps(cps);
  pubblicaMappa();
}
rip.suMappa = pubblicaMappa;

// Cuffia: la mappa del live, portata nel tempo del mio contesto. Si rifà a ogni giro perché
// il rapporto tra i due orologi si legge di continuo.
function seguiLive() {
  if (!mappaLive || orologio.aggiorna() === null) return;
  rip.mappa = { ciclo0: mappaLive.ciclo0, t0: orologio.tempo(mappaLive.epoca0 + offsetMs), cps: mappaLive.cps };
}

// --- ascolto: misuratore, sentinella e anello ---

const sentinella = new Sentinella(ac);
const anello = LIVE ? new Anello(ac) : null;
let ultimoGiro = 0;
let giroMax = 0; // il ritardo più lungo tra due giri del riproduttore, in ms

rip.suEvento = (hap, t, sorgente) => {
  // Il primo e l'ultimo ciclo suonati da ogni livello: per controllare che entri ed esca a tempo.
  const inizio = hap.whole.begin.valueOf();
  sorgente.primo ??= inizio;
  sorgente.ultimo = inizio;
  if (!eco) return;
  sentinella.atteso(t);
  anello?.atteso(t);
  const ciclo = hap.whole.begin.valueOf();
  // A suono avvenuto: quando dice questo motore di averlo suonato.
  setTimeout(() => manda('controllo', { tipo: 'eco', ruolo: RUOLO, ciclo, epoca: orologio.epoca(t) }), (t - ac.currentTime) * 1000 + 50);
};
rip.suCps = (cps) => LIVE && cambiaCps(cps);
anello && (anello.suMisura = (ms) => manda('controllo', { tipo: 'anello', ms }));

function giro() {
  const ora = performance.now();
  if (ultimoGiro) giroMax = Math.max(giroMax, ora - ultimoGiro);
  ultimoGiro = ora;
  if (!LIVE) seguiLive();
  rip.tick();
  pulisci();
}

// --- configurazione dallo stash: la leggo io, non dipendo dall'interfaccia ---

let suoniCaricati = null;
async function configura() {
  await pronto;
  const stato = await window.cutx.stash();
  const config = stato.config ?? {};
  try {
    await impostaUscita(ac, config.uscite?.[RUOLO] ?? '');
    const chiave = JSON.stringify(stato.suoni ?? null);
    if (stato.suoni && chiave !== suoniCaricati) {
      await samples(stato.suoni);
      suoniCaricati = chiave;
    }
    if (!LIVE) offsetMs = Number(config.offsetCuffiaMs) || 0;
    errore = null;
  } catch (e) {
    errore = String(e.message ?? e);
  }
}

// --- messaggi ---

function stato() {
  // codice, nome e provenienza: la prova in cuffia, l'ultimo livello entrato nel live
  const ultimo = LIVE ? livelli.filter((l) => l.a === Infinity).at(-1) : null;
  return {
    ruolo: RUOLO,
    codice: LIVE ? (ultimo?.codice ?? '') : prova.codice,
    nome: LIVE ? (ultimo?.nome ?? null) : prova.nome,
    provenienza: LIVE ? (ultimo?.provenienza ?? null) : prova.provenienza,
    livelli: LIVE ? livelli.map(descrivi) : undefined,
    paracadute: LIVE ? !!paracadute : undefined,
    eco,
    errore: rip.errore ?? errore,
    tardi: rip.tardi,
    giroMax,
    cps: rip.mappa?.cps ?? null,
    ciclo: rip.mappa ? rip.ciclo(ac.currentTime) : null,
    sentinella: sentinella.riepilogo(),
    udibile,
    mix,
    livelliLive: LIVE ? undefined : livelliLive.length,
  };
}

async function ricevi(da, m) {
  switch (m.tipo) {
    case 'valuta': {
      const errore = await valuta(m.codice, m);
      return manda(da, { tipo: 'valutato', id: m.id, errore });
    }
    case 'entra': {
      const r = LIVE ? await entra(m) : { errore: 'solo il live fa entrare i livelli' };
      return manda(da, { tipo: 'risposta', ...r, id: m.id });
    }
    case 'paracadute': {
      const r = LIVE ? await lanciaParacadute(m.codice) : { errore: 'solo il live ha il paracadute' };
      return manda(da, { tipo: 'risposta', ...r, id: m.id });
    }
    case 'togli':
      return togli(m.livello);
    case 'livello': {
      // volume e muto di un livello, subito
      const l = livelli.find((x) => x.id === m.livello);
      if (!l) return;
      if (m.volume !== undefined) l.volume = Math.max(0, Math.min(1.5, Number(m.volume)));
      if (m.muto !== undefined) l.muto = !!m.muto;
      return aggiornaLivelli();
    }
    case 'ferma':
      return ferma();
    case 'eco':
      eco = m.attivo;
      if (eco) sentinella.attiva(getSuperdoughAudioController().output.destinationGain);
      else sentinella.disattiva();
      return;
    case 'ping':
      return manda(da, { tipo: 'pong', ...stato() });
    case 'anello':
      try {
        await anello?.attiva(m.ingresso);
        return manda(da, { tipo: 'anello-stato', attivo: true });
      } catch (e) {
        return manda(da, { tipo: 'anello-stato', attivo: false, errore: String(e.message ?? e) });
      }
    case 'blocca': {
      // Solo per i test: blocca questo processo come farebbe un motore impallato.
      const fine = performance.now() + m.ms;
      while (performance.now() < fine);
      return;
    }
    // dal live alla cuffia
    case 'mappa':
      mappaLive = m;
      return;
    case 'livelli-live':
      livelliLive = m.livelli;
      return;
    case 'frase-da-capo': // la frase riparte da 1 al prossimo ciclo
      if (!rip.mappa) return;
      ancoraFrase = Math.ceil(rip.ciclo(ac.currentTime));
      return pubblicaMappa();
    case 'mix':
      mix = m.valore;
      return;
    case 'udibile': // cuffia on/off: il motore continua a girare, si spegne solo l'uscita
      getSuperdoughAudioController().output.destinationGain.gain.value = m.on ? 1 : 0;
      udibile = m.on;
      return;
  }
}

window.addEventListener('message', (e) => {
  const con = e.data?.porta;
  if (!con || !e.ports[0]) return;
  porte[con] = e.ports[0];
  porte[con].onmessage = ({ data }) => ricevi(con, data);
  // Chi arriva riceve subito il tempo e i livelli live.
  if (LIVE) {
    pubblicaMappa();
    aggiornaLivelli();
  }
});
window.cutx.suStashCambiato(configura);

// Per la prova automatica di robustezza (npm run prova).
globalThis.cutxStato = stato;

await configura();
if (LIVE) {
  rip.mappa = { ciclo0: 0, t0: ac.currentTime, cps: CPS_INIZIALE };
  setInterval(pubblicaMappa, MAPPA_OGNI_MS);
}
setInterval(giro, TICK_S * 1000);
console.log(`motore ${RUOLO} pronto`);
