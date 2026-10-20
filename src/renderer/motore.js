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

let errore = null; // dell'ultima valutazione o della configurazione
let codice = '';
let offsetMs = 0;
let eco = false; // per il misuratore: dico quando ho suonato ogni evento
let mappaLive = null; // cuffia: l'ultima mappa ricevuta, in tempo assoluto
let codiceLive = ''; // cuffia: il codice live, per il futuro mix cuffia/live
let mix = 0; // cuffia: 0 = solo la prova; il mix col live arriva in fase 4 (fader dell'APC)

// --- valutazione: il repl di Strudel compila e basta, a tempo suona il riproduttore ---

let erroreValutazione = null;
const compilatore = repl({
  transpiler,
  defaultOutput: webaudioOutput,
  getTime: () => ac.currentTime,
  onEvalError: (e) => (erroreValutazione = String(e.message ?? e)),
});
const rip = new Riproduttore(ac, getTrigger({ getTime: () => ac.currentTime, defaultOutput: webaudioOutput }));

async function valuta(nuovo) {
  await pronto;
  erroreValutazione = null;
  // setcpm e cpm() vedono il tempo attuale. Solo il live può cambiarlo: in cuffia è innocuo.
  const cps = rip.mappa?.cps ?? CPS_INIZIALE;
  compilatore.scheduler.cps = cps;
  const pattern = nuovo.trim() ? await compilatore.evaluate(nuovo, false) : silence;
  setTime(() => (rip.mappa ? rip.ciclo(ac.currentTime) : 0));
  if (erroreValutazione || !pattern) return erroreValutazione ?? 'valutazione fallita';
  codice = nuovo;
  rip.pattern = pattern;
  if (LIVE) {
    if (compilatore.scheduler.cps !== cps) cambiaCps(compilatore.scheduler.cps);
    manda('cuffia', { tipo: 'codice-live', codice });
  }
  return null;
}

function ferma() {
  codice = '';
  rip.pattern = silence;
  if (LIVE) manda('cuffia', { tipo: 'codice-live', codice });
}

// --- tempo ---

function pubblicaMappa() {
  if (!LIVE || !rip.mappa || orologio.aggiorna() === null) return;
  // Si riparte da adesso, così il conto in tempo assoluto resta fresco.
  const t0 = ac.currentTime;
  manda('cuffia', { tipo: 'mappa', ciclo0: rip.ciclo(t0), epoca0: orologio.epoca(t0), cps: rip.mappa.cps });
}

function cambiaCps(cps) {
  rip.cambiaCps(cps);
  pubblicaMappa();
}

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

rip.suEvento = (hap, t) => {
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
  return {
    ruolo: RUOLO,
    codice,
    eco,
    errore: rip.errore ?? errore,
    tardi: rip.tardi,
    giroMax,
    cps: rip.mappa?.cps ?? null,
    ciclo: rip.mappa ? rip.ciclo(ac.currentTime) : null,
    sentinella: sentinella.riepilogo(),
    mix,
  };
}

async function ricevi(da, m) {
  switch (m.tipo) {
    case 'valuta': {
      const errore = await valuta(m.codice);
      return manda(da, { tipo: 'valutato', id: m.id, errore });
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
    case 'codice-live':
      codiceLive = m.codice;
      return;
    case 'mix':
      mix = m.valore;
      return;
  }
}

window.addEventListener('message', (e) => {
  const con = e.data?.porta;
  if (!con || !e.ports[0]) return;
  porte[con] = e.ports[0];
  porte[con].onmessage = ({ data }) => ricevi(con, data);
  // Una cuffia appena (ri)nata riceve subito il tempo e il codice live.
  if (LIVE && con === 'cuffia') {
    pubblicaMappa();
    manda('cuffia', { tipo: 'codice-live', codice });
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
