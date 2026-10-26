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
import { Orologio, cpsDi, risolvi } from './tempo.js';
import { elencoUscite, impostaUscita } from './uscite.js';
import { Riproduttore, TICK_S } from './riproduttore.js';
import { Sentinella, Anello } from './ascolto.js';
import { avviaOnda } from './sfondo.js';
import { suoniNuovi } from './suoni-nuovi.js';
import { annulla, filtroEntra, filtroEsce, programma, taglia } from './dissolvenza.js';

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

// L'onda per lo sfondo «oscilloscopio» del proiettore: l'analizzatore esiste solo finché la finestra dell'uscita lo chiede
// (spento non costa niente) e sta in derivazione dall'uscita: non tocca il suono.
let fermaOnda = null;
function onda(accesa) {
  if (!LIVE || !!fermaOnda === accesa) return;
  if (!accesa) {
    fermaOnda();
    fermaOnda = null;
    return;
  }
  fermaOnda = avviaOnda({ ac, sorgente: getSuperdoughAudioController().output.destinationGain, invia: (dati) => manda('uscita', { tipo: 'onda', dati }) });
}

let errore = null; // della configurazione
let offsetMs = 0;
let eco = false; // per il misuratore: dico quando ho suonato ogni evento
let mappaLive = null; // cuffia: l'ultima mappa ricevuta, in tempo assoluto
let livelliLive = []; // cuffia: i livelli live, per il futuro mix cuffia/live
let udibile = true;
let mix = 0; // cuffia: 0 = solo la prova; il mix col live arriva in fase 4 (fader dell'APC)

// Cuffia: una prova sola. Live: una pila di livelli, ognuno con la sua finestra di cicli.
let prova = { codice: '', nome: null, provenienza: null };
let anteprimaId = 0; // per fermare da soli solo l'anteprima che sta ancora suonando
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
    anteprimaId++;
    if (etichetta.anteprima) {
      // Anteprima (progetti Ableton): parte subito e suona una volta sola. Il pattern si sposta in modo che il suo
      // ciclo 0 cada fra ~150 ms, e la sorgente dura quanti sono i suoi cicli; poi il motore si ferma da solo,
      // così il ▶ dell'interfaccia torna com'era (lascia finire i suoni già partiti: niente tagli).
      const { cicli, audioS = 0 } = etichetta.anteprima;
      const cps = rip.mappa ? rip.cpsAl(ac.currentTime) : CPS_INIZIALE;
      const inizio = (rip.mappa ? rip.cicloAl(ac.currentTime) : 0) + 0.15 * cps;
      // (la fine è un millesimo di ciclo prima: un inizio che cade sul confine, a meno di un arrotondamento, non è più dentro)
      rip.sorgenti = [{ pattern: c.pattern.late(inizio), da: inizio, a: inizio + cicli - 0.001 }];
      const id = anteprimaId;
      setTimeout(() => {
        if (id !== anteprimaId) return;
        prova = { codice: '', nome: null, provenienza: null };
        rip.pattern = silence;
      }, (Math.max(cicli / cps, audioS) + 0.5) * 1000);
    } else rip.pattern = c.pattern;
    prova = { codice, nome: etichetta.nome ?? null, provenienza: etichetta.provenienza ?? null, anteprima: !!etichetta.anteprima };
    return null;
  }
  // Live, subito: un livello solo al posto di tutti (test di sfasamento, prova automatica).
  for (const l of livelli) liberaGuadagno(l.id);
  livelli = codice.trim() ? [nuovoLivello(codice, c.pattern, etichetta, -Infinity)] : [];
  if (c.cps) cambiaTempo(c.cps, 'subito');
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
    sfuma: null, // { verso: 'entra' | 'esce', da, a, filtro } finché dura una dissolvenza
  };
}

// Una dissolvenza di un livello, da un ciclo e per tot cicli (dissolvenza.js). Senza cicli non fa niente: di botto, come sempre.
function dissolvi(l, verso, da, cicli, filtro) {
  if (!LIVE || !(cicli > 0) || !Number.isFinite(da) || !rip.mappa) return;
  const g = guadagnoDi(l);
  programma({ ac, fade: g.fade, lp: g.lp, hp: g.hp }, { verso, da: rip.tempo(da), fine: rip.tempo(da + cicli), filtro });
  l.sfuma = { verso, da, a: da + cicli, filtro };
}
// Una dissolvenza che non serve più (il livello rientra, o è sparito): i nodi tornano aperti.
function annullaDissolvi(l) {
  const g = guadagni.get(l.id);
  if (g) annulla({ ac, fade: g.fade, lp: g.lp, hp: g.hp });
  l.sfuma = null;
}
const dissolvenzaDi = (d) => ({ cicli: Math.max(0, Math.round(Number(d?.cicli) || 0)), entra: filtroEntra(d?.tipo), esce: filtroEsce(d?.tipo, d?.filtroUscita) });

// GO LIVE: il livello entra al confine tra `cicli` cicli. Uno con lo stesso nome lo sostituisce lì.
async function entra({ codice, nome, provenienza, cicli = 1, scritto = false, volume, dissolvenza }) {
  const c = await compila(codice);
  if (c.errore) return { errore: c.errore };
  const da = rip.prossimoConfine() + Math.max(1, cicli) - 1;
  const l = nuovoLivello(codice, c.pattern, { nome, provenienza, scritto }, da);
  const d = dissolvenzaDi(dissolvenza);
  const scambi = [];
  for (const vecchio of livelli) {
    if (vecchio.nome !== l.nome || vecchio.a <= da) continue;
    // con una dissolvenza i due livelli si scambiano: il vecchio continua e sfuma mentre il nuovo entra
    vecchio.a = Math.max(vecchio.da, da) + d.cicli;
    scambi.push(vecchio);
    l.volume = vecchio.volume;
    l.muto = vecchio.muto;
  }
  if (Number.isFinite(volume)) l.volume = Math.max(0, Math.min(1.5, volume)); // il volume scritto nella sezione vince
  livelli.push(l);
  if (c.cps) cambiaTempo(c.cps, da); // il tempo del livello vale dal ciclo in cui entra
  iniziaSet(da);
  aggiornaLivelli();
  dissolvi(l, 'entra', da, d.cicli, d.entra);
  for (const vecchio of scambi) dissolvi(vecchio, 'esce', da, d.cicli, d.esce);
  return { da, livello: l.id };
}

// --- paracadute "CUTX, scelgo te!" ---
// Al battito successivo esce tutto ed entra il codice di emergenza, subito. I livelli tolti si
// conservano: la seconda volta escono il paracadute e rientrano loro, al ciclo successivo.
let paracadute = null; // { id, salvati: [livelli] } quando è aperto

async function lanciaParacadute(codice, dissolvenza) {
  if (paracadute) return riprendiDalParacadute(dissolvenza);
  const c = await compila(codice);
  if (c.errore) return { errore: c.errore };
  const battito = Math.ceil((rip.fine ?? rip.ciclo(ac.currentTime)) * 4) / 4;
  const d = dissolvenzaDi(dissolvenza);
  const salvati = livelli.filter((l) => l.a === Infinity);
  for (const l of salvati) l.a = Math.max(l.da, battito) + d.cicli;
  const p = nuovoLivello(codice, c.pattern, { nome: 'paracadute', provenienza: 'cutx, scelgo te!', scritto: true }, battito);
  livelli.push(p);
  paracadute = { id: p.id, salvati };
  aggiornaLivelli();
  // quello che suona esce (passa-alto che sale) mentre il paracadute entra (passa-basso che si apre), agganciati al battito
  dissolvi(p, 'entra', battito, d.cicli, d.entra);
  for (const l of salvati) dissolvi(l, 'esce', Math.max(l.da, battito), d.cicli, d.esce);
  return { da: battito, paracadute: true };
}

function riprendiDalParacadute(dissolvenza) {
  const d = dissolvenzaDi(dissolvenza);
  const confine = rip.prossimoConfine();
  const p = livelli.find((l) => l.id === paracadute.id);
  if (p && p.a === Infinity) {
    p.a = Math.max(p.da, confine) + d.cicli;
    dissolvi(p, 'esce', Math.max(p.da, confine), d.cicli, d.esce);
  }
  for (const s of paracadute.salvati) {
    const l = nuovoLivello(s.codice, s.pattern, { nome: s.nome, provenienza: s.provenienza, scritto: true }, confine);
    l.volume = s.volume;
    l.muto = s.muto;
    livelli.push(l);
  }
  paracadute = null;
  aggiornaLivelli();
  for (const l of livelli) if (l.da === confine && l.a === Infinity) dissolvi(l, 'entra', confine, d.cicli, d.entra);
  return { da: confine, paracadute: false };
}

// Esce alla fine del ciclo in corso.
// Con una dissolvenza il livello continua a suonare e sfuma per tot cicli; un secondo togli (o un clic sulla card) lo salva.
function togli(id, dissolvenza) {
  const l = livelli.find((x) => x.id === id);
  if (!l) return;
  if (l.sfuma?.verso === 'esce' && l.a !== Infinity) return salva(l);
  if (l.a !== Infinity) return;
  const d = dissolvenzaDi(dissolvenza);
  const fine = Math.max(l.da, rip.prossimoConfine());
  const parte = l.da > rip.ciclo(ac.currentTime) ? 0 : d.cicli; // un livello che non è ancora entrato se ne va e basta
  l.a = fine + parte;
  aggiornaLivelli();
  dissolvi(l, 'esce', fine, parte, d.esce);
}

// L'uscita si annulla: il livello torna al suo volume e resta.
function salva(l) {
  if (!l || l.a === Infinity || l.sfuma?.verso !== 'esce') return;
  l.a = Infinity;
  annullaDissolvi(l);
  aggiornaLivelli();
}

// Cuffia: zittisce anche i suoni già partiti (un campione lungo), buttando le orbite e il loro audio.
function tagliaSuoni() {
  const controller = getSuperdoughAudioController();
  controller.reset();
  controller.output.destinationGain.gain.value = udibile ? 1 : 0;
  if (eco) sentinella.attiva(controller.output.destinationGain);
}

function ferma() {
  anteprimaId++;
  paracadute = null;
  prova = { codice: '', nome: null, provenienza: null };
  rip.pattern = silence;
  if (!LIVE) tagliaSuoni();
  if (LIVE) {
    // ⌘. è il panico: niente dissolvenza, i livelli si zittiscono subito (con 30 ms per non fare click)
    for (const g of guadagni.values()) taglia({ ac, fade: g.fade });
    for (const l of livelli) liberaGuadagno(l.id);
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
  sfuma: l.sfuma,
  primo: l.primo ?? null,
  ultimo: l.ultimo ?? null,
});

// Il guadagno di ogni livello: una sua orbita di superdough con un GainNode in uscita. Volume e muto
// agiscono subito anche sui suoni già partiti, con una sfumata breve (niente click).
const SFUMATA_S = 0.02; // costante di tempo: a regime in circa 80 ms
const guadagni = new Map(); // id → { orbita, gain }
function guadagnoDi(l) {
  if (!guadagni.has(l.id)) {
    const controller = getSuperdoughAudioController();
    const orbita = 1000 + l.id;
    const o = controller.getOrbit(orbita, [0, 1]);
    const gain = new GainNode(ac, { gain: l.muto ? 0 : l.volume });
    // orbita → passa-basso → passa-alto → volume → dissolvenza → casse (vedi dissolvenza.js): aperti, i filtri sono l'identità
    const lp = new BiquadFilterNode(ac, { type: 'lowpass', frequency: ac.sampleRate / 2, Q: 0.707 });
    const hp = new BiquadFilterNode(ac, { type: 'highpass', frequency: 0, Q: 0.707 });
    const fade = new GainNode(ac, { gain: 1 });
    o.output.disconnect();
    o.output.connect(lp);
    lp.connect(hp);
    hp.connect(gain);
    gain.connect(fade);
    controller.output.connectToDestination(fade, [0, 1]);
    guadagni.set(l.id, { orbita, gain, lp, hp, fade });
  }
  return guadagni.get(l.id);
}
function applicaGuadagni() {
  if (!LIVE) return;
  for (const l of livelli) {
    const g = guadagnoDi(l);
    l.orbita = g.orbita;
    g.gain.gain.setTargetAtTime(l.muto ? 0 : l.volume, ac.currentTime, SFUMATA_S);
  }
}
// Un livello uscito: dopo la coda (riverbero, delay) il suo guadagno e la sua orbita si buttano.
function liberaGuadagno(id) {
  const g = guadagni.get(id);
  if (!g) return;
  guadagni.delete(id);
  setTimeout(() => {
    const controller = getSuperdoughAudioController();
    controller.nodes[g.orbita]?.disconnect();
    delete controller.nodes[g.orbita];
    for (const n of [g.lp, g.hp, g.fade]) n.disconnect();
    g.gain.disconnect();
  }, 15000);
}

function aggiornaLivelli() {
  applicaGuadagni();
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
    for (const l of livelli) if (!restano.includes(l)) liberaGuadagno(l.id);
    livelli = restano;
    aggiornaLivelli();
  }
}

// --- tempo ---

// La mappa del tempo è una sola, e si pubblica da qui: cuffia, interfaccia e uscita la leggono (tempo.js).
// Fase 4: anche il click di sync del PO-33 leggerà il tempo da questa mappa, mai da altre strade.
function pubblicaMappa() {
  if (!LIVE || !rip.mappa || orologio.aggiorna() === null) return;
  // Si riparte da adesso, così il conto in tempo assoluto resta fresco. Il tempo di *adesso* è quello di prima di un
  // cambio già programmato, che è nei `cambi`: ognuno entra all'inizio di un ciclo, quindi la frase non sballa.
  const t0 = ac.currentTime;
  const mappa = { tipo: 'mappa', ciclo0: rip.cicloAl(t0), epoca0: orologio.epoca(t0), cps: rip.cpsAl(t0), cambi: rip.cambiProssimi(t0), ancoraFrase, inizioSet };
  manda('cuffia', mappa);
  manda('controllo', mappa);
  manda('uscita', mappa);
}

// L'UNICO punto da cui cambia il tempo del set: setcpm di un livello (dal ciclo in cui entra), un evento con un tempo suo,
// il numero in alto ('ciclo' = all'inizio del ciclo dopo). Mai `rip.cambiaCps*` da altre parti: lo controlla un test.
// quando: 'subito' | 'ciclo' | un numero di ciclo.
function cambiaTempo(cps, quando) {
  if (!LIVE || !(cps > 0) || !rip.mappa) return;
  if (quando === 'subito') rip.cambiaCps(cps);
  else if (quando === 'ciclo') {
    // a mano: vince su un livello che stava per portare il suo tempo (entrerebbe dopo e lo cambierebbe di nuovo)
    const ciclo = rip.prossimoConfine();
    rip.annullaCambiDopo(ciclo);
    rip.cambiaCpsA(ciclo, cps);
  } else rip.cambiaCpsA(quando, cps);
  pubblicaMappa();
}
rip.suMappa = pubblicaMappa;

// Il tempo del set com'è adesso e i cambi in arrivo: per leggerlo da fuori (fase 4: sync PO-33).
const tempoSet = () => ({ cps: rip.cpsAl(ac.currentTime), cambi: rip.cambiProssimi(ac.currentTime) });

// Cuffia: la mappa del live, portata nel tempo del mio contesto. Si rifà a ogni giro perché
// il rapporto tra i due orologi si legge di continuo. I cambi in arrivo restano cambi: entrano al ciclo giusto.
function seguiLive() {
  if (!mappaLive || orologio.aggiorna() === null) return;
  const r = risolvi({ ...mappaLive, epoca0: mappaLive.epoca0 + offsetMs }, orologio.epoca(ac.currentTime));
  rip.mappa = { ciclo0: r.ciclo0, t0: orologio.tempo(r.epoca0), cps: r.cps };
  rip.cambiTempo = r.cambi.map((c) => ({ ciclo: c.ciclo, cps: c.cps }));
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
rip.suCps = (cps) => cambiaTempo(cps, 'subito');
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

// --- l'uscita audio ---
// Se la scheda sparisce mentre suona, o il contesto si ferma, si dice e si suona sull'uscita predefinita (meglio che restare muti);
// quando la scheda torna, si riprende da soli. L'interfaccia legge `uscita` dallo stato e avvisa.
let uscitaVoluta = ''; // il nome scelto nello stash ('' = predefinita di macOS)
let uscitaStato = { ok: true, dettaglio: '' };
let controllandoUscita = false;

async function controllaUscita() {
  if (controllandoUscita) return;
  controllandoUscita = true;
  try {
    await pronto;
    let nuovo;
    try {
      const elenco = await elencoUscite();
      if (uscitaVoluta && !elenco.some((u) => u.label === uscitaVoluta)) {
        if (ac.sinkId) await ac.setSinkId('');
        nuovo = { ok: false, dettaglio: `uscita «${uscitaVoluta}» non collegata: suono sull'uscita predefinita` };
      } else {
        await impostaUscita(ac, uscitaVoluta);
        nuovo = { ok: true, dettaglio: uscitaVoluta ? `uscita «${uscitaVoluta}»` : 'uscita predefinita' };
      }
      if (ac.state === 'suspended' || ac.state === 'interrupted') await ac.resume();
    } catch (e) {
      nuovo = { ok: false, dettaglio: `uscita: ${e.message ?? e}` };
    }
    if (nuovo.ok !== uscitaStato.ok || nuovo.dettaglio !== uscitaStato.dettaglio) {
      uscitaStato = nuovo;
      if (!nuovo.ok) console.warn(`${RUOLO}: ${nuovo.dettaglio}`); // finisce nel registro
    }
    errore = uscitaStato.ok ? (errore?.startsWith('uscita') ? null : errore) : uscitaStato.dettaglio;
  } finally {
    controllandoUscita = false;
  }
}
navigator.mediaDevices.addEventListener('devicechange', () => setTimeout(controllaUscita, 300));
ac.addEventListener('statechange', () => ac.state !== 'running' && setTimeout(controllaUscita, 100));
setInterval(controllaUscita, 3000);

// --- configurazione dallo stash: la leggo io, non dipendo dall'interfaccia ---

let suoniCaricati = null;
async function configura() {
  await pronto;
  const stato = await window.cutx.stash();
  const config = stato.config ?? {};
  uscitaVoluta = config.uscite?.[RUOLO] ?? '';
  await controllaUscita(); // non lancia mai: se l'uscita non c'è si suona sulla predefinita e si dice
  errore = uscitaStato.ok ? null : uscitaStato.dettaglio;
  try {
    // solo i suoni nuovi o cambiati: mentre suona non si rifà tutta la mappa
    const nuovi = suoniNuovi(suoniCaricati, stato.suoni);
    if (nuovi) {
      await samples(nuovi);
      suoniCaricati = stato.suoni;
    }
    if (!LIVE) offsetMs = Number(config.offsetCuffiaMs) || 0;
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
    guadagni: LIVE ? Object.fromEntries([...guadagni].map(([id, g]) => [id, g.gain.gain.value])) : undefined,
    dissolvenze: LIVE ? Object.fromEntries([...guadagni].map(([id, g]) => [id, { fade: g.fade.gain.value, lp: g.lp.frequency.value, hp: g.hp.frequency.value }])) : undefined,
    eco,
    uscita: uscitaStato,
    pronto: !!rip.mappa, // ha finito di caricarsi: da qui accetta livelli e cambi di tempo
    errore: rip.errore ?? errore,
    tardi: rip.tardi,
    eventi: rip.eventi,
    anteprima: !LIVE ? !!prova.anteprima : undefined,
    giroMax,
    cps: rip.mappa ? rip.cpsAl(ac.currentTime) : null,
    tempoInArrivo: LIVE && rip.mappa ? rip.cambiProssimi(ac.currentTime) : undefined,
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
      const r = LIVE ? await lanciaParacadute(m.codice, m.dissolvenza) : { errore: 'solo il live ha il paracadute' };
      return manda(da, { tipo: 'risposta', ...r, id: m.id });
    }
    case 'togli':
      return togli(m.livello, m.dissolvenza);
    case 'salva-livello': // un clic sulla card che sta sfumando
      return salva(livelli.find((x) => x.id === m.livello));
    case 'livello': {
      // volume e muto di un livello, subito
      const l = livelli.find((x) => x.id === m.livello);
      if (!l) return;
      if (m.volume !== undefined) l.volume = Math.max(0, Math.min(1.5, Number(m.volume)));
      if (m.muto !== undefined) l.muto = m.muto === 'inverti' ? !l.muto : !!m.muto; // inverti: lo stato vero è qui
      return aggiornaLivelli();
    }
    case 'suoni-extra': // suoni solo da ascoltare (anteprima dei progetti Ableton): nome → [indirizzi]
      await pronto;
      return samples(m.mappa);
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
    case 'tempo': // il numero in alto: il set va a quel BPM all'inizio del ciclo dopo
      return cambiaTempo(cpsDi(Math.min(300, Math.max(20, Number(m.bpm) || 0))), 'ciclo');
    case 'frase-da-capo': // la frase riparte da 1 al prossimo ciclo
      if (!rip.mappa) return;
      ancoraFrase = Math.ceil(rip.ciclo(ac.currentTime));
      return pubblicaMappa();
    case 'onda':
      if (da === 'uscita') onda(!!m.on);
      return;
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
  if (con === 'uscita') onda(false); // un'uscita nuova (o riaperta) riparte da capo: l'onda la richiede lei
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
// Per le prove: azzera i massimi e i conti della sentinella, così si misura una fase alla volta.
globalThis.cutxAzzeraMisure = () => {
  giroMax = 0;
  sentinella.azzera();
};
globalThis.cutxTempoSet = tempoSet; // fase 4: il sync del PO-33 legge il tempo da qui

await configura();
if (LIVE) {
  rip.mappa = { ciclo0: 0, t0: ac.currentTime, cps: CPS_INIZIALE };
  setInterval(pubblicaMappa, MAPPA_OGNI_MS);
}
setInterval(giro, TICK_S * 1000);
console.log(`motore ${RUOLO} pronto`);
