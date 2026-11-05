// La postazione: browser a sinistra, CUE al centro (cuffia), LIVE a destra (casse).
// Qui non suona niente: il codice va ai motori live e cuffia, ognuno nel suo processo.
// Se questa finestra si blocca o crasha, le casse non se ne accorgono.
import { Cue } from './cue.js';
import { VistaSynth } from './synth-vista.js';
import { codice as codiceSynth, leggiRiga as leggiRigaSynth } from './synth-codice.js';
import it from './testi/it.json';
import { iniziale as synthIniziale, pulisci as synthPulisci } from './synth-modello.js';
import { Serata } from './set-vista.js';
import * as P from './passaggio.js';
import * as T from './transizioni.js';
import { misuraLimiter, misuraMicroEntrata } from './limiter.js';
import { Browser, esempiHelp } from './browser.js';
import { Aiuto } from './aiuto.js';
import { Impostazioni } from './impostazioni.js';
import { leggiVoce, separa as separaCoda, soloCoda, unisci as unisciCoda } from './coda.js';
import { Importa } from './importa.js';
import { Controller } from './controller.js';
import { PaginaController } from './impostazioni-controller.js';
import { Specchio } from './specchio.js';
import { FADER_PREDEFINITO } from './controller-mappa.js';
import { AZIONI, corrisponde, effettive, scriveTesto } from './scorciatoie.js';
import { modoDopo, modoValido } from './sfondo.js';
import { Cronologia } from './cronologia.js';
import { ControlloBpm } from './bpm.js';
import { arrotondaBpm, bpmDi, cicloDi, cpsAl, fraseDi, tempoInArrivo } from './tempo.js';
import { Pila } from './pila.js';
import { chiediNome, conferma, dialogoAperto } from './dialogo.js';
import * as B from './brano.js';
import { eNomeBeat } from './nomi.js';
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
let dissEntra = 0; // dissolvenza dell'entrata (cicli), scelta nel CUE: parte dal valore delle impostazioni
let entraTra = 1; // GO LIVE entra al confine tra 1, 2, 4 o 8 cicli // la mappa del tempo del live, in tempo assoluto
let config = { uscite: {}, offsetCuffiaMs: 0 };
let suoni = {};
let haStash = false;
let preferenze = { lunghezzaFrase: 16 };
let ripreso = false; // ho già preso lo stato dai motori? (dopo un crash dell'interfaccia stanno ancora suonando)

let libreria = [];
let browser = null; // il browser a sinistra (più sotto): serve già al CUE che si costruisce prima
// ⌘Z fuori dagli editor (cronologia.js): un annulla non cambia mai direttamente il live
const cronologia = new Cronologia(20);
const cue = new Cue(CODICE_INIZIALE, {
  togliDalLive: (brano, nome) => {
    const l = livelliLive.find((x) => x.nome === nome && x.a === null && x.provenienza?.startsWith(`${brano} §`));
    if (l) togliLivello(l.id);
  },
  apriNelSynth: (codice, nome) => apriNelSynth(codice, nome),
  provaInCuffia: () => provaInCuffia(),
  fermaCuffia: () => fermaCuffia(),
  goLive: () => goLive(),
  fermaTutto: () => fermaTutto(),
  suoniStash: () => suoni,
  haStash: () => haStash,
  bpm: () => bpmSet(),
  libreriaCambiata: () => aggiornaLibreria(),
  portaIlSet: (bpm) => live.manda({ tipo: 'tempo', bpm }),
  bozza: () => salvaBozza(),
  mostraLibreria: () => scegliScheda('libreria'),
  suBrani: () => browser?.scheda === 'set' && browser.mostra(),
  fantasma: () => preferenze.aperturaFantasma !== false,
  fantasmaScegli: (acceso) => window.cutx.salvaPreferenze({ aperturaFantasma: acceso }),
  suPromosso: (file) => caricaProssimoDopo(file),
});
cue.registra = (voce) => cronologia.registra(voce);

// La bozza del CUE: il testo dell'editor libero si salva mentre scrivo. Se l'interfaccia crasha e il guardiano la ricarica
// (la pagina riparte vuota) il testo torna com'era; a un avvio normale non si tocca.
const CHIAVE_BOZZA = 'cutx.bozza.libero';
let timerBozza = null;
function salvaBozza() {
  clearTimeout(timerBozza);
  timerBozza = setTimeout(() => {
    try {
      localStorage.setItem(CHIAVE_BOZZA, cue.libero.codice);
    } catch {
      // senza memoria della pagina si va avanti lo stesso
    }
  }, 800);
}
try {
  const ricaricata = performance.getEntriesByType('navigation')[0]?.type === 'reload';
  const bozza = localStorage.getItem(CHIAVE_BOZZA);
  if (ricaricata && bozza && bozza !== CODICE_INIZIALE) {
    cue.libero.codice = bozza;
    cue.avviso("l'interfaccia è ripartita: ho ripreso il testo del CUE");
  }
} catch {
  // idem
}

// --- i gesti ---

// Gli errori si vedono solo qui, nel CUE: mai sull'uscita.
async function manda(motore, codice, etichetta = {}) {
  if (motore === cuffia && cuffiaInPausa) pausaCuffia(false); // chi manda qualcosa in cuffia vuole sentirlo
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

// Ferma quello che hai in cuffia (non il live).
function fermaCuffia() {
  if (inTest) return;
  pezzoCuffia = null;
  dovaCuffia = null;
  cuffia.manda({ tipo: 'ferma' });
}

// Il tasto «cuffia» di una card: se si sta già sentendo quella, spegne; altrimenti la manda in cuffia.
function provaInCuffia(pezzo = null) {
  if (inTest) return;
  pezzo ??= serata.pezzoScelto(); // la clip del kit scelta col controller
  const p = pezzo && typeof pezzo === 'object' && 'codice' in pezzo ? pezzo : cue.pezzo(); // un pezzo dato (le clip del kit) o quello del CUE
  if (p.errore) return cue.avviso(p.errore);
  return provaPezzo(p);
}
function provaPezzo(p) {
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

// Una coda da sola va al livello scelto (card cliccata; col controller, la manopola tenuta premuta). Niente livello scelto: avviso, niente cambia.
// Ritorna un messaggio da mostrare, o null.
function aggiungiCoda(voci) {
  const l = livelloVivo(pila.selezionato);
  if (!l) {
    cue.avviso('c\'è solo una coda ma nessun livello scelto: clicca la card del livello a cui aggiungerla');
    return 'nessun livello scelto';
  }
  const prima = [...(l.coda ?? [])];
  // scritta a mano: i numeri scivolano (in `scivolata` cicli), gli effetti ritmici entrano sul battito
  live.manda({ tipo: 'coda', livello: l.id, imposta: voci, origine: 'mano', scivolata: preferenze.scivolata ?? 0.25 });
  const id = l.id;
  cronologia.registra({
    etichetta: `coda di «${l.nome}»`,
    annulla: () => (livelloVivo(id) ? void live.manda({ tipo: 'coda', livello: id, pulisci: true, imposta: prima }) : false),
    rifai: () => (livelloVivo(id) ? void live.manda({ tipo: 'coda', livello: id, imposta: voci }) : false),
  });
  cue.avviso(`${voci.length === 1 ? 'riga' : 'righe'} in coda a «${l.nome}»: ${voci.join(' ')}`);
  return null;
}

// Dal CUE libero (testo senza sezioni) ogni go live AGGIUNGE un livello: «scratch», «scratch 2», «scratch 3»… Per sostituire si modifica la card
// (e una sezione con un suo nome, nel libero o in un brano, sostituisce quella con lo stesso nome).
function nomeLiberoNuovo() {
  const usati = new Set(livelliLive.filter((l) => l.a === null).map((l) => l.nome));
  for (let n = 1; ; n++) {
    const nome = n === 1 ? 'scratch' : `scratch ${n}`;
    if (!usati.has(nome)) return nome;
  }
}

// GO LIVE: entra al confine tra 1, 2, 4 o 8 cicli. Se il codice ha un errore, il live non cambia.
async function goLive(pezzo = null) {
  if (inTest) return;
  pezzo ??= serata.pezzoScelto(); // la clip del kit scelta col controller
  const daCue = !(pezzo && typeof pezzo === 'object' && 'codice' in pezzo);
  const p = daCue ? cue.pezzo() : pezzo; // un pezzo dato (le clip del kit) o quello del CUE
  if (p.errore) return cue.avviso(p.errore);
  // una scena del beat del PROSSIMO brano, mentre un altro brano suona: è il passaggio (col tempo che ci arriva)
  if (daCue && p.beat && cue.linguetta === 'prossimo' && cue.slot.attivo && cue.slot.prossimo) return passaBrano(p.beat.indice);
  // solo righe di coda (.lpf(600)…): non è un livello, si aggiunge alla coda di quello scelto con un clic sulla sua card
  const voci = soloCoda(p.codice.slice(p.inizio ?? 0));
  if (voci) return aggiungiCoda(voci);
  let codice = p.codice;
  let inizio = p.inizio ?? 0;
  // Un brano a un altro BPM che entra in un live che sta già suonando NON cambia il tempo del set: si tolgono dal suo preambolo
  // le righe setcpm (un setcpm scritto dentro la sezione, o in un livello, continua a funzionare). Con il live vuoto il brano
  // porta il suo tempo, come sempre.
  const set = bpmSet();
  const diverso = p.bpmBrano && set !== null && livelliLive.some((l) => l.a === null) && Math.abs(p.bpmBrano - set) > 0.05;
  const messaggi = [];
  if (diverso) {
    const preambolo = B.senzaTempo(codice.slice(0, p.inizio));
    codice = preambolo + codice.slice(p.inizio);
    inizio = preambolo.length;
    messaggi.push(`il set resta a ${set} bpm (il brano è a ${p.bpmBrano})`);
    if (B.eSezioneAudio(codice.slice(p.inizio))) messaggi.push('questa clip suona un file audio: va al suo tempo originale');
  }
  // la coda scritta in fondo alla sezione (// @coda) va al livello a parte: il codice suona com'è
  const { codice: senzaCoda, coda } = separaCoda(codice);
  // una scena del beat: se il beat suona già, la coda e il volume dei suoi livelli restano com'erano (le manopole contano)
  // armare il drop: se un cambio di scena aspetta la fine della frase, il pezzo entra insieme a lui
  const alle = p.beat ? null : statoBeat().pendente?.da ?? null;
  const r = await live.richiesta({ tipo: 'entra', scritto: p.scritto, beat: p.beat, alle, codice: senzaCoda, coda: p.beat && !coda.length ? undefined : coda, inizio, nome: p.provenienza === 'scratch' && p.nome === 'scratch' ? nomeLiberoNuovo() : p.nome, provenienza: p.provenienza, cicli: entraTra, volume: p.volume, dissolvenza: dissolvenza(dissEntra) });
  mostraErrore(r.errore, 'live');
  if (!r.errore && messaggi.length) cue.avviso(messaggi.join(' · '));
  if (!r.errore && daCue) cue.dopoGoLive(); // il primo brano mandato live diventa il brano attivo
  return r;
}

// --- il beat e le sue scene ---

// Il beat live: il livello «beat» che suona (e quello che sta per entrare, se un cambio aspetta la fine della frase).
function statoBeat() {
  const ciclo = mappa ? cicloDi(mappa, performance.timeOrigin + performance.now()) : 0;
  const tutte = livelliLive.filter((l) => eNomeBeat(l.nome) && l.beat);
  const suona = tutte.filter((l) => (l.a === null || l.a > ciclo) && (l.da === null || l.da <= ciclo)).at(-1) ?? null;
  const pendente = tutte.filter((l) => l.a === null && l.da !== null && l.da > ciclo).at(-1) ?? null;
  return { suona, pendente };
}

// ◀ ▶: una scena indietro o avanti, a fine frase (come il go live). Parte dalla scena che sta per entrare, se un cambio aspetta.
async function muoviScena(delta) {
  if (inTest) return;
  const { suona, pendente } = statoBeat();
  const l = pendente ?? suona;
  if (!l) return cue.avviso('non c\'è un beat nel live: manda una scena col go live');
  const { base, indice, scene } = l.beat;
  const k = indice + delta;
  if (k < 0 || k >= scene.length) return cue.avviso(delta > 0 ? `«${scene[indice].nome}» è l'ultima scena` : `«${scene[indice].nome}» è la prima scena`);
  const m = scene[k];
  // il tempo del set è quello che suona adesso: il setcpm del brano non lo riporta indietro
  const pre = B.senzaTempo(m.codice.slice(0, m.inizio));
  const { codice: senzaCoda, coda } = separaCoda(pre + m.codice.slice(m.inizio));
  const r = await live.richiesta({
    tipo: 'entra',
    beat: { base, indice: k, scene },
    codice: senzaCoda,
    coda: coda.length ? coda : undefined,
    inizio: pre.length,
    nome: 'beat',
    provenienza: `${base} ◆${k + 1}`,
    cicli: entraTra,
    dissolvenza: dissolvenza(dissEntra),
  });
  mostraErrore(r.errore, 'live');
  return r.errore ? r : { scena: m.nome, indice: k };
}

// Cosa dice il beat al CUE (per le card delle scene) e al controller (per lo specchio).
function mostraBeat() {
  const { suona, pendente } = statoBeat();
  cue.aggiornaBeat(
    suona || pendente
      ? { base: (suona ?? pendente).beat.base, indice: suona ? suona.beat.indice : null, pendente: pendente ? pendente.beat.indice : null }
      : null,
  );
}

// --- passa al prossimo brano ---

let passaggio = null; // { nome, da }: il beat del prossimo brano sta per entrare (a fine frase)

const nomeDelBrano = (b) => (b ? B.testa(b.modello).brano || b.file : null);

// Le clip che restano live (tutte tranne il beat) e che hanno un ritmo: sono quelle che sentirebbero un salto di tempo.
function ritmicheRimaste() {
  const restano = livelliLive.filter((l) => l.a === null && !eNomeBeat(l.nome) && l.nome !== 'paracadute');
  return P.clipRitmiche(restano, (id) => Object.values(pila.strisce.get(id) ?? {}).filter(Boolean).at(-1));
}

// Un comando: a fine frase entra il beat del prossimo brano, dalla scena k (la prima). Le clip del brano vecchio restano finché le tolgo io;
// il tempo fa una rampa se i due brani sono vicini (entro l'8%), altrimenti salta quando il beat nuovo entra.
async function passaBrano(k = 0) {
  if (inTest) return null;
  const prossimo = cue.slot.prossimo;
  if (!prossimo) return void cue.avviso('non c\'è un prossimo brano: sceglilo nel set o aprilo dalla libreria');
  const m = prossimo.modello;
  const nome = nomeDelBrano(prossimo);
  if (!m.beat?.scene.length) return void cue.avviso(`«${nome}» non ha un beat: manda le sue clip una a una`);
  if (passaggio) return void cue.avviso(`il passaggio a «${passaggio.nome}» è già in arrivo`);
  const p = cue.pezzoScena(m, Math.min(k, m.beat.scene.length - 1), 'brano', null, nome);
  const attuale = bpmSet();
  const nuovo = B.bpmDelBrano(m);
  const occupato = livelliLive.some((l) => l.a === null);
  const t = P.decidiTempo(attuale, nuovo, occupato);
  // la transizione: quella scritta nel set per questo brano, altrimenti la predefinita (sweep 8). Il livello scelto col controller resta.
  const { transizione, scartata } = T.sceglieTransizione(serata.transizioneDi(prossimo.file), preferenze.transizione ?? T.PREDEFINITA);
  const tieni = livelloVivo(pila.selezionato) ? [pila.selezionato] : [];
  let { codice, inizio } = p;
  let rampa = null;
  if (t.tipo === 'rampa') {
    // il tempo del brano nuovo non entra col suo setcpm: ci arriva la rampa
    const pre = B.senzaTempo(codice.slice(0, inizio));
    codice = pre + codice.slice(inizio);
    inizio = pre.length;
    rampa = { bpm: nuovo, cicli: preferenze.rampaCicli ?? (transizione.tipo === 'sweep' ? transizione.cicli : P.CICLI_RAMPA) }; // il tempo ci arriva dentro la transizione
  }
  const { codice: senzaCoda, coda } = separaCoda(codice);
  const r = await live.richiesta({ tipo: 'entra', beat: p.beat, rampa, codice: senzaCoda, coda, inizio, nome: 'beat', provenienza: p.provenienza, cicli: entraTra, volume: p.volume, dissolvenza: { cicli: transizione.cicli, tipo: 'filtro', filtroUscita: 'hp' }, transizione: T.perIlLive(transizione, tieni) });
  mostraErrore(r.errore, 'live');
  if (r.errore) return r;
  passaggio = { nome, da: r.da };
  if (scartata) cue.avviso(`transizione «${scartata}» non valida: uso ${T.scriviTransizione(transizione)}`);
  const n = (x) => Math.round(x * 10) / 10;
  if (t.tipo === 'salto') {
    const ritmiche = ritmicheRimaste();
    cue.avviso(`il tempo salta da ${n(attuale)} a ${n(nuovo)} bpm quando entra «${nome}»${ritmiche.length ? ` · clip ritmiche rimaste che cambiano velocità: ${ritmiche.join(', ')}` : ''}`, { persistente: ritmiche.length > 0 });
  } else if (t.tipo === 'rampa') cue.avviso(`«${nome}»: il tempo va da ${n(attuale)} a ${n(nuovo)} bpm con una rampa`);
  else cue.avviso(`passo a «${nome}» · ${T.scriviTransizione(transizione)}`);
  portaUscita?.postMessage({ tipo: 'brano', nome });
  if (!cue.slot.attivo) cue.promuovi(); // il primo brano della serata
  return { brano: nome, da: r.da };
}

// Il beat del prossimo brano suona: quel brano è adesso l'attivo e il successivo del set diventa il prossimo.
function controllaPassaggio() {
  const ciclo = mappa ? cicloDi(mappa, performance.timeOrigin + performance.now()) : 0;
  const { suona } = statoBeat();
  const prossimo = cue.nomeDi('prossimo');
  if (suona && prossimo && suona.beat.base === prossimo && cue.nomeDi('attivo') !== prossimo) {
    passaggio = null;
    cue.promuovi();
  }
  if (passaggio && ciclo > passaggio.da + 2) passaggio = null;
  // sotto le linguette: cosa farà il tempo passando al prossimo
  const m = cue.slot.prossimo?.modello;
  let testo = '';
  if (m?.beat?.scene.length && !passaggio) {
    const bpmNuovo = B.bpmDelBrano(m);
    const rit = P.decidiTempo(bpmSet(), bpmNuovo, livelliLive.some((l) => l.a === null)).tipo === 'salto' ? ritmicheRimaste() : [];
    testo = P.testoPassaggio({ nome: cue.nomeDi('prossimo'), bpmAttuale: bpmSet(), bpmNuovo, occupato: livelliLive.some((l) => l.a === null), ritmiche: rit });
  }
  cue.mostraPassaggio(testo);
}

// Le dissolvenze (dissolvenza.js): quanti cicli, e se solo volume o anche filtro (impostazioni).
const dissolvenza = (cicli) => ({ cicli, tipo: preferenze.dissolvenzaTipo ?? 'volume', filtroUscita: preferenze.dissolvenzaFiltroUscita ?? 'hp' });
// il paracadute è sempre una transizione vera: quello che suona sale col passa-alto, lui entra aprendo il passa-basso
const dissolvenzaParacadute = () => ({ cicli: preferenze.paracaduteCicli ?? 2, tipo: 'filtro', filtroUscita: 'hp' });

// Toglie a fine ciclo l'ultimo livello entrato (al passo 6: quello scelto nel LIVE).
function togliLivello(id) {
  if (inTest) return;
  const attivi = livelliLive.filter((l) => l.a === null);
  const l = id !== undefined ? livelliLive.find((x) => x.id === id) : attivi.at(-1);
  if (!l) return;
  // un livello che sta già sfumando: il secondo togli lo salva, e non c'è niente da annullare
  if (l.a === null) {
    const copia = { nome: l.nome, codice: unisciCoda(l.codice, l.coda), volume: l.volume, muto: l.muto };
    // ⌘Z lo riporta nel CUE, pronto: lo rimanda chi suona col go live (il live non si tocca)
    cronologia.registra({ etichetta: `livello «${l.nome}» tolto`, annulla: () => cue.reinserisci(copia) });
  }
  live.manda({ tipo: 'togli', livello: l.id, dissolvenza: dissolvenza(preferenze.dissolvenzaUscita ?? 0) });
}

// Pulisci coda: le righe del livello se ne vanno (il volume resta). ⌘Z le rimette.
function pulisciCoda(id) {
  const l = livelloVivo(id);
  if (inTest || !l?.coda?.length) return;
  const prima = [...l.coda];
  live.manda({ tipo: 'coda', livello: id, pulisci: true });
  const rimetti = () => (livelloVivo(id) ? void live.manda({ tipo: 'coda', livello: id, pulisci: true, imposta: prima }) : false);
  cronologia.registra({
    etichetta: `coda di «${l.nome}»`,
    annulla: rimetti,
    rifai: () => (livelloVivo(id) ? void live.manda({ tipo: 'coda', livello: id, pulisci: true }) : false),
  });
}

// Toglie una sola riga della coda (la × accanto alla riga): ⌘Z la rimette.
function togliRigaCoda(id, chiave) {
  const l = livelloVivo(id);
  if (inTest || !l?.coda?.length) return;
  const prima = [...l.coda];
  live.manda({ tipo: 'coda', livello: id, togli: [chiave] });
  cronologia.registra({
    etichetta: `riga .${chiave} di «${l.nome}»`,
    annulla: () => (livelloVivo(id) ? void live.manda({ tipo: 'coda', livello: id, pulisci: true, imposta: prima }) : false),
    rifai: () => (livelloVivo(id) ? void live.manda({ tipo: 'coda', livello: id, togli: [chiave] }) : false),
  });
}

// Volume e muto di un livello si annullano subito (sono innocui): un trascinamento del volume è un passo solo.
const livelloVivo = (id) => livelliLive.find((x) => x.id === id && x.a === null);
function registraVolume(id, prima, dopo) {
  if (prima === undefined || dopo === undefined || Math.abs(prima - dopo) < 0.005) return;
  const nome = livelloVivo(id)?.nome ?? '';
  const imposta = (v) => () => (livelloVivo(id) ? void live.manda({ tipo: 'livello', livello: id, volume: v }) : false);
  cronologia.registra({ etichetta: `volume di «${nome}»`, annulla: imposta(prima), rifai: imposta(dopo) });
}
function registraMuto(id, dopo) {
  const l = livelloVivo(id);
  if (!l) return;
  const imposta = (m) => () => (livelloVivo(id) ? void live.manda({ tipo: 'livello', livello: id, muto: m }) : false);
  cronologia.registra({ etichetta: `muto di «${l.nome}»`, annulla: imposta(!dopo), rifai: imposta(dopo) });
}
async function annullaSet(verso = 'annulla') {
  if (inTest) return;
  const r = await (verso === 'annulla' ? cronologia.annulla() : cronologia.rifai());
  if (!r) return cue.avviso(verso === 'annulla' ? 'niente da annullare' : 'niente da rifare');
  const salti = r.saltate.length ? ` · non si poteva più: ${r.saltate.join(', ')}` : '';
  if (!r.etichetta) return cue.avviso(`non si può più annullare${salti}`);
  cue.avviso(`${verso === 'annulla' ? 'annullato' : 'rifatto'}: ${r.etichetta}${r.messaggio ? ` · ${r.messaggio}` : ''}${salti}`);
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
  const r = await live.richiesta({ tipo: 'paracadute', codice: config.paracadute || PARACADUTE, dissolvenza: dissolvenzaParacadute() });
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
  // il beat si salva con la scena che suona adesso (non quello in attesa)
  const { suona } = statoBeat();
  const livelli = livelliLive
    .filter((l) => l.a === null && l.nome !== 'paracadute' && !(l.beat && suona && l.id !== suona.id))
    .map((l) => (l.beat ? { ...l, scena: { nome: l.beat.scene[l.beat.indice].nome } } : l));
  if (!livelli.length) return cue.avviso('niente live da salvare');
  const nome = await chiediNome({ titolo: 'salva il live come brano', valore: `live ${oggi()}`, conferma: 'salva' });
  if (!nome) return;
  const usati = new Set();
  for (const l of livelli) for (const n of (await analizza(l.codice, suoni)).suoni) usati.add(n);
  const bpm = bpmSet() ?? undefined; // il tempo del set in questo momento, non quello del brano da cui vengono le sezioni
  const testo = B.daLivelli(livelli, { nome, bpm, data: oggi(), suoni: [...usati].sort() });
  const file = B.nomeFile(nome);
  let r = await window.cutx.scriviBrano(file, testo);
  if (r.esiste) {
    if (!(await conferma({ titolo: 'salva il live come brano', testo: `${file} esiste già nella libreria. Lo sovrascrivo?`, si: 'sovrascrivi' }))) return;
    r = await window.cutx.scriviBrano(file, testo, { sovrascrivi: true });
  }
  await aggiornaLibreria();
  cue.avviso(`live salvato come ${r.file}: ${livelli.length} clip`);
  return r.file;
}

function scegliDiss(n) {
  dissEntra = n;
  for (const b of document.querySelectorAll('[data-diss]')) b.classList.toggle('on', Number(b.dataset.diss) === n);
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

// Pausa dell'ascolto in cuffia: il contesto si ferma, e alla ripresa la cuffia si riallinea al tempo del live.
let cuffiaInPausa = false;
function pausaCuffia(pausa = !cuffiaInPausa) {
  if (inTest || !cuffia.viva || pausa === cuffiaInPausa) return;
  cuffiaInPausa = pausa;
  cuffia.manda({ tipo: 'pausa', on: pausa });
  mostraPausaCuffia();
}
function mostraPausaCuffia() {
  const b = $('cuffia-pausa');
  b.classList.toggle('on', cuffiaInPausa);
  b.firstChild.textContent = cuffiaInPausa ? 'riprendi ' : 'pausa ';
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

// ⇧⌘P due volte di fila (o il pulsante tenuto premuto): passa al prossimo brano.
let ultimoPasso = 0;
function passaDoppio() {
  const ora = performance.now();
  if (ora - ultimoPasso < DOPPIO_MS) {
    ultimoPasso = 0;
    return passaBrano();
  }
  ultimoPasso = ora;
  cue.avviso('di nuovo ⇧⌘P per passare al prossimo brano');
}

// Il tenuto è arrivato in fondo: la barra resta piena e verde un attimo, poi sparisce (stile.css, .scatta).
function scattato(b) {
  b.classList.remove('scatta');
  void b.offsetWidth; // riparte l'animazione anche se scatta due volte di fila
  b.classList.add('scatta');
  setTimeout(() => b.classList.remove('scatta'), 800);
}

// Un pulsante che si tiene premuto un secondo (si riempie): niente passaggi per sbaglio.
function pulsanteTenuto(b, fa) {
  let timer = null;
  const lascia = () => {
    clearTimeout(timer);
    b.classList.remove('carica');
  };
  b.onpointerdown = () => {
    b.classList.add('carica');
    timer = setTimeout(() => {
      lascia();
      scattato(b);
      fa();
    }, 1000);
  };
  b.onpointerup = lascia;
  b.onpointerleave = lascia;
}
pulsanteTenuto($('passa-brano'), () => passaBrano());

// Le scorciatoie valgono anche dentro l'editor: le prendo prima di lui.
// ⌘↵: nel LIVE (jam o livello in modifica) applica al prossimo ciclo, nel CUE prova in cuffia.
function invio() {
  if (vista === 'synth') return synth.provaInCuffia();
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
    // il gatto si anima come col clic (si riempie di verde), anche se la tastiera parte subito
    const b = $('paracadute');
    b.classList.add('carica');
    setTimeout(() => b.classList.remove('carica'), 1000);
    return lanciaParacadute();
  }
  ultimoP = ora;
}

// --- le due viste: LIVE (CUE e LIVE) e SYNTH ---
// Il SYNTH sta sopra la postazione, che resta viva sotto (il live non si ferma mai) ma inerte. La cuffia è la stessa del CUE:
// nel SYNTH ascolta a volume prudente (la preview) e il limiter della cuffia protegge le orecchie.
const VOLUME_CUFFIA_SYNTH = 0.5;
let vista = 'live';

const synth = new VistaSynth($('vista-synth'), {
  suona: async (codice, nome) => {
    if (inTest) return null;
    cuffia.manda({ tipo: 'volume-cuffia', volume: VOLUME_CUFFIA_SYNTH });
    if (cuffiaInPausa) pausaCuffia(false);
    const etichetta = { nome: `synth · ${nome}`, provenienza: 'synth' };
    // se il codice ha un errore il motore tiene il suono di prima: anche qui resta quello di prima
    const errore = await cuffia.valuta(codice, etichetta);
    if (!errore) {
      pezzoCuffia = { codice, etichetta, da: performance.now() };
      dovaCuffia = null;
    }
    return errore;
  },
  nota: (m) => cuffia.manda({ tipo: 'synth-nota', ...m }),
  click: (accento) => cuffia.manda({ tipo: 'synth-click', accento }),
  fermaNote: () => cuffia.manda({ tipo: 'synth-ferma-note' }),
  suonoTasti: async (codice) => (await cuffia.richiesta({ tipo: 'synth-suono', codice })).errore ?? null,
  ferma: () => fermaCuffia(),
  ciclo: () => (mappa ? cicloDi(mappa, performance.timeOrigin + performance.now()) : null),
  suonaOra: () => pezzoCuffia?.etichetta?.provenienza === 'synth',
  destinazioni: () => [
    { id: 'attivo', nome: it.synth.destinazioni.attivo, ok: !!cue.slot.attivo },
    { id: 'prossimo', nome: it.synth.destinazioni.prossimo, ok: !!cue.slot.prossimo },
    { id: 'kit', nome: it.synth.destinazioni.kit, ok: !!serata.kit },
  ],
  mandaCue: (dove, nome, testo, categoria) => (dove === 'kit' ? serata.aggiungiClipKit(nome, testo, categoria) : cue.aggiungiClip(dove, nome, testo, categoria)),
  salva: (contenuto) => window.cutx.salvaPreferenze({ synthUltimo: contenuto }),
});

// «apri nel synth» sulla card di una clip fatta dal synth: il pannello riparte da quella clip.
function apriNelSynth(codice, nome) {
  const stato = leggiRigaSynth(codice);
  if (!stato) return cue.avviso(it.synth.msg.apriNonSynth);
  synth.apri(stato, nome);
  mostraVista('synth');
}

function mostraVista(v) {
  if (v === vista) return;
  vista = v;
  const insynth = v === 'synth';
  document.body.dataset.vista = v;
  $('vista-synth').hidden = !insynth;
  for (const el of document.querySelector('.postazione').children) if (el.id !== 'vista-synth') el.inert = insynth;
  $('vista-live').classList.toggle('on', !insynth);
  $('vista-synth-btn').classList.toggle('on', insynth);
  document.activeElement?.blur?.();
  if (insynth) cuffia.manda({ tipo: 'volume-cuffia', volume: VOLUME_CUFFIA_SYNTH });
  else {
    synth.fermaAnteprima(); // uscendo dal SYNTH la prova si ferma; il volume della cuffia torna intero
    cuffia.manda({ tipo: 'volume-cuffia', volume: 1 });
  }
  synth.attiva(insynth);
  synth.aggiorna();
}
// la tastiera del Mac suona il synth (A S D F G H J K, W E T Y U, Z/X per l'ottava) quando la vista è SYNTH e non si sta scrivendo
window.addEventListener('keydown', (e) => {
  if (vista === 'synth' && !dialogoAperto() && !imp.catturando && synth.tastoGiu(e)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (vista === 'synth' && !dialogoAperto() && !imp.catturando && synth.tastoSu(e)) e.preventDefault();
});
window.addEventListener('blur', () => synth.fermaNote());
// ⌘X ⌘C ⌘V ⌘A dal menu: il pianoroll in primo piano li tiene, altrove sono i comandi normali (campi di testo, editor)
window.cutx.suModifica((azione) => {
  if (vista === 'synth' && synth.roll.inPrimoPiano()) synth.roll.modifica(azione);
  else window.cutx.modificaNativa(azione);
});
$('vista-live').onclick = () => mostraVista('live');
$('vista-synth-btn').onclick = () => mostraVista('synth');

// Cosa fa ogni azione (i tasti sono in scorciatoie.js e nelle preferenze: si cambiano nelle impostazioni).
const FA = {
  provaCuffia: invio,
  goLive: () => (vista === 'synth' ? null : goLive()),
  togli: () => togliLivello(),
  entra1: () => scegliEntraTra(1),
  entra2: () => scegliEntraTra(2),
  entra4: () => scegliEntraTra(4),
  entra8: () => scegliEntraTra(8),
  // muto del livello n: la cifra arriva dal tasto premuto
  muto: (n) => {
    const l = pila.attivi()[n - 1];
    if (l) {
      registraMuto(l.id, !l.muto);
      live.manda({ tipo: 'livello', livello: l.id, muto: 'inverti' });
    }
  },
  // scelta del livello n (stesso ordine del muto): a lui vanno le code da sole. Resta finché non ne scelgo un altro o premo esc
  selezionaLivello: (n) => {
    const l = pila.attivi()[n - 1];
    if (l) pila.seleziona(l.id);
  },
  fermaTutto,
  cuffiaOnOff: () => cuffiaOnOff(),
  cuffiaPausa: () => pausaCuffia(),
  annullaSet: () => (vista === 'synth' ? synth.annulla() : annullaSet('annulla')),
  rifaiSet: () => (vista === 'synth' ? synth.rifai() : annullaSet('rifai')),
  vistaLive: () => mostraVista('live'),
  vistaSynth: () => mostraVista('synth'),
  // dal CUE al LIVE (il jam) e ritorno
  cambiaLinguetta: () => {
    cue.cambiaLinguetta();
  },
  passaBrano: passaDoppio,
  passaCueLive: () => (document.activeElement?.closest?.('.live') ? cue.focus() : pila.focusJam()),
  help: helpOnOff,
  esci: () => {
    if (importa.aperto) importa.chiudi();
    else if (!$('impostazioni').hidden) impostazioni(false);
    else if (vista === 'synth' && synth.roll.passi) synth.roll.passiAttiva(false); // esc: esce dalla scrittura a passi
    else if (!pila.annulla()) {
      if (pila.selezionato !== null) pila.seleziona(null); // esc toglie la scelta del livello
      else document.activeElement?.blur();
    }
  },
  impostazioni: () => impostazioni(),
  salva: () => cue.salva(),
  salvaLive: () => salvaLiveComeBrano(),
  aggiungiSezione: () => cue.aggiungiSezione(),
  fraseDaCapo,
  paracadute: paracaduteDoppio,
  uscitaIntera: () => window.cutx.uscitaSchermoIntero(),
  sfondo: () => window.cutx.salvaPreferenze({ sfondoProiettore: modoDopo(modoValido(preferenze.sfondoProiettore)) }),
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

// Lo stash è su un SSD che non c'è (non ancora collegato, o scollegato): un avviso chiaro in cima, mai una schermata vuota senza
// spiegazioni. CUTX riguarda ogni pochi secondi: appena il disco torna riprende da solo (e lo dice ai motori, per i suoni).
let stashMancante = false;
let stashInCopia = false; // l'SSD non c'è e si lavora sulla copia dello stash sul Mac
function mostraAvvisoStash(stato) {
  const mancante = !!stato.percorso && !!stato.mancante;
  const inCopia = !!stato.percorso && !!stato.copiaAttiva;
  const era = stashMancante || stashInCopia;
  stashMancante = mancante;
  stashInCopia = inCopia;
  $('avviso-stash').hidden = !mancante && !inCopia;
  if (mancante) {
    const nome = stato.percorso.split('/').filter(Boolean).pop();
    $('avviso-stash-testo').textContent = `Lo stash «${nome}» non è collegato (${stato.percorso}). Attacca il disco: CUTX lo ritrova da solo. Finché manca non ci sono suoni né brani.${stato.copia ? ' (C\'è una copia sul Mac: attivala in Impostazioni → stash.)' : ''}`;
    if (!era) window.cutx.logEvento('avviso', 'stash', `non collegato: ${stato.percorso}`);
  } else if (inCopia) {
    $('avviso-stash-testo').textContent = `L'SSD non c'è: stai usando la COPIA dello stash sul Mac. Quello che salvi resta nella copia, non sull'SSD. Appena il disco torna CUTX torna da solo allo stash vero.`;
    if (!era) window.cutx.logEvento('avviso', 'stash', `SSD assente: uso la copia sul Mac`);
  } else if (era) {
    cue.avviso(`stash «${config.nome ?? ''}» ritrovato`);
    window.cutx.logEvento('info', 'stash', 'ritrovato');
    window.cutx.rileggiStash(); // i motori ricaricano i suoni
  }
}
setInterval(async () => (stashMancante || stashInCopia) && apriStash(await window.cutx.stash()), 3000);

let percorsoStash = null;
let controllerPronto = false; // il controller si costruisce più in basso: finché non c'è, i colpi non si caricano
async function apriStash(stato) {
  if (stato.percorso !== percorsoStash) cronologia.svuota(); // un altro stash: la storia di prima non vale più
  percorsoStash = stato.percorso;
  haStash = !!stato.config;
  if (controllerPronto) caricaColpi();
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
    $('stash-dove').textContent = stato.copiaAttiva ? 'copia' : stato.percorso.startsWith('/Volumes/') ? 'ssd' : 'mac';
  }
  $('stash').title = stato.percorso ?? 'Scegli lo stash';
  mostraAvvisoStash(stato);
  const nomi = Object.keys(suoni).filter((k) => k !== '_base');
  $('suoni').textContent = nomi.length
    ? nomi.map((n) => `${n} (${suoni[n].length})`).join(' · ')
    : 'nessun suono: metti dei WAV in suoni/<nome>/';
  $('offset-cuffia').value = config.offsetCuffiaMs ?? 0;
  await aggiornaLibreria();
  await caricaSerata(stato);
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

// La durata di un suono dello stash: dall'intestazione se è un WAV, altrimenti decodificandolo (quasi sempre piccoli: mp3, ogg…).
const durate = new Map();
async function durataSuono(rel) {
  if (durate.has(rel)) return durate.get(rel);
  let d = await window.cutx.durataSuono(rel);
  if (d === null) {
    try {
      const r = await fetch(`cutx://app/stash/suoni/${rel}`);
      d = (await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await r.arrayBuffer())).duration;
    } catch {
      d = null;
    }
  }
  durate.set(rel, d);
  return d;
}

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
    if (r.mancanti.length) pezzi.push(`${r.mancanti.length} file mancanti (le clip ci sono lo stesso)`);
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
    prova: (codice, chiave, anteprima) => {
      if (inTest) return;
      dovaCuffia = null;
      return manda(cuffia, codice, { nome: chiave, provenienza: 'browser', anteprima });
    },
    ferma: () => {
      pezzoCuffia = null;
      cuffia.manda({ tipo: 'ferma' });
    },
    // finché non finisce da sola (il motore svuota il suo codice): 1,5 s di tolleranza per la partenza
    inAscolto: (chiave) =>
      cuffia.viva && pezzoCuffia?.etichetta?.provenienza === 'browser' && pezzoCuffia.etichetta.nome === chiave && (performance.now() - pezzoCuffia.da < 1500 || !!cuffia.stato?.codice),
    durataSuono,
    inserisci: (testo) => cue.inserisci(testo),
    apriBrano: (file) => cue.apri(file),
    disegnaSet: (el, filtro) => serata.disegna(el, filtro),
    rileggiSet: () => serata.carica(),
    cartelleAbleton: () => preferenze.cartelleAbleton ?? [],
    progettiAbleton: () => window.cutx.progettiAbleton(),
    infoProgetto: (percorso) => window.cutx.infoAbleton(percorso),
    aggiungiCartellaAbleton: () => window.cutx.aggiungiCartellaAbleton(),
    apriProgetto: (progetto) => importa.apri(progetto),
  },
);
// --- il set e il kit ---

// La selezione col controller (manopola 1) scorre le voci del CUE (apertura, scene, clip) e poi le clip del kit, come un elenco solo.
// Ritorna il nome scelto, o null.
function spostaSelezione(delta) {
  const nCue = cue.vociControllo().length;
  const kit = serata.kit?.modello.sezioni ?? [];
  const totale = nCue + kit.length;
  if (!totale) return null;
  const ora = serata.scelta !== null ? nCue + serata.scelta : cue.indiceControllo();
  const k = Math.max(0, Math.min(totale - 1, (ora < 0 ? (delta > 0 ? -1 : totale) : ora) + delta));
  if (k < nCue) {
    serata.scegliKit(null);
    return cue.scegliControllo(k);
  }
  if (browser && browser.scheda !== 'set') browser.vai('set'); // la clip del kit si vede nel SET
  serata.scegliKit(k - nCue);
  return `kit · ${kit[k - nCue].nome}`;
}
function posizioneSelezione() {
  const nCue = cue.vociControllo().length;
  const kit = serata.kit?.modello.sezioni ?? [];
  if (serata.scelta !== null) return { indice: nCue + serata.scelta, totale: nCue + kit.length, nome: kit[serata.scelta]?.nome ?? '' };
  return { indice: cue.indiceControllo(), totale: nCue + kit.length, nome: cue.nomeSezioneScelta() ?? '' };
}

const serata = new Serata({
  libreria: () => libreria,
  branoAttivo: () => cue.slot.attivo?.file ?? null,
  branoProssimo: () => cue.slot.prossimo?.file ?? null,
  // clic su un brano del set: se suona lo mostro, altrimenti lo apro come prossimo
  scegli: (file) => {
    if (cue.slot.attivo?.file === file) return cue.cambiaLinguetta('attivo');
    if (cue.slot.prossimo?.file === file) return cue.cambiaLinguetta('prossimo');
    return cue.apri(file, 'prossimo', { fuoco: false });
  },
  provaKit: (p) => provaInCuffia(p),
  liveKit: (p) => goLive(p),
  fermaTutto: () => fermaTutto(),
  avviso: (testo) => cue.avviso(testo),
  ridisegna: () => mostraBrowser(),
});
// Ho messo le mani sul CUE (clic o cursore): vale di nuovo quello che c'è nel CUE, non la clip del kit scelta col controller.
for (const evento of ['pointerdown', 'focusin']) $('carte').addEventListener(evento, () => serata.scelta !== null && serata.scegliKit(null), true);
let setAvviato = null; // lo stash per cui ho già aperto il brano che apre il set

// Dopo che un brano diventa l'attivo, il successivo del set diventa il prossimo (senza togliermi dalla linguetta in cui sto lavorando).
async function caricaProssimoDopo(file) {
  const dopo = serata.dopo(file);
  if (dopo && libreria.some((b) => b.file === dopo)) await cue.apri(dopo, 'prossimo', { fuoco: false, mostra: false });
}

// Ogni volta che si apre uno stash: rilegge set.cutx e kit.cutx e, se il CUE è vuoto, apre come prossimo il brano che apre il set.
async function caricaSerata(stato) {
  await serata.carica();
  mostraBrowser();
  if (!stato?.percorso || setAvviato === stato.percorso || cue.slot.attivo || cue.slot.prossimo) return;
  setAvviato = stato.percorso;
  const primo = serata.primo();
  if (primo && libreria.some((b) => b.file === primo)) await cue.apri(primo, 'prossimo', { fuoco: false });
}

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

// --- uscite audio: se una scheda sparisce o torna, lo si dice (il motore intanto suona sulla predefinita e riprende da solo) ---

const ultimaUscita = { live: null, cuffia: null };
function controllaUsciteAudio() {
  for (const m of [live, cuffia]) {
    const u = m.stato.uscita;
    if (!u?.dettaglio) continue; // il motore non ha ancora controllato l'uscita
    const chiave = `${u.ok}|${u.dettaglio}`;
    if (ultimaUscita[m.ruolo] === chiave) continue;
    const prima = ultimaUscita[m.ruolo];
    ultimaUscita[m.ruolo] = chiave;
    if (!u.ok) {
      cue.avviso(`${m.ruolo}: ${u.dettaglio}. Si riprende da sola appena la ricolleghi.`, { persistente: true });
      window.cutx.logEvento('avviso', 'uscite', `${m.ruolo}: ${u.dettaglio}`);
    } else if (prima) {
      cue.avviso(`${m.ruolo}: ${u.dettaglio} — ripresa`);
      window.cutx.logEvento('info', 'uscite', `${m.ruolo}: ${u.dettaglio} — ripresa`);
    }
  }
}

// --- motore live crashato: si riavvia da solo (il guardiano) e l'interfaccia gli rimette quello che suonava ---
// L'interfaccia sa sempre cosa c'era live (livelli, volumi, muti, tempo): se il motore rinasce vuoto, lo rimette al ciclo dopo.
// Il CUE non si tocca: sta qui, non nel motore.

let istantaneaLive = null; // { bpm, livelli: [{ codice, nome, provenienza, volume, muto }] }
let ripristinando = false;

function aggiornaIstantanea() {
  if (!ripreso || !live.viva || ripristinando) return;
  const attivi = livelliLive.filter((l) => l.a === null);
  istantaneaLive = attivi.length
    ? { bpm: bpmSet(), livelli: attivi.map((l) => ({ beat: l.beat, codice: l.codice, coda: l.coda, inizio: l.inizio, nome: l.nome, provenienza: l.provenienza, volume: l.volume, muto: l.muto })) }
    : null;
}

async function ripristinaLive() {
  const snap = istantaneaLive;
  if (!snap?.livelli.length || ripristinando) return;
  ripristinando = true; // intanto lo stato (vuoto) del motore nuovo non deve sostituire l'istantanea
  try {
    // aspetto il primo stato del motore nuovo (non quello vecchio): se è già pieno non è rinato, non c'è niente da rimettere
    // (un motore che rinasce risponde ai ping molto prima di aver finito di caricare Strudel e i suoni: i livelli e il tempo si
    // possono rimettere solo quando dice `pronto`, altrimenti si perdono o arrivano dopo i 5 secondi di attesa)
    const nuovoEPronto = () => live.ultimoPong > live.collegatoDa && live.stato.pronto === true;
    for (let i = 0; i < 400 && !nuovoEPronto(); i++) await new Promise((r) => setTimeout(r, 100));
    if (!nuovoEPronto() || (live.stato.livelli ?? []).some((l) => l.a === null)) return;
    window.cutx.logEvento('avviso', 'live', `riavviato: rimetto ${snap.livelli.length} livelli a ${snap.bpm} bpm`);
    if (snap.bpm) live.manda({ tipo: 'tempo', bpm: snap.bpm });
    for (const l of snap.livelli) {
      // il tempo è quello del set: le righe setcpm dei livelli (venivano dal brano di partenza) non devono riportarlo indietro
      const r = await live.richiesta({ tipo: 'entra', codice: B.senzaTempo(l.codice), coda: l.coda, inizio: Math.min(l.inizio ?? 0, B.senzaTempo(l.codice).length), nome: l.nome, provenienza: l.provenienza, beat: l.beat ?? null, cicli: 1, scritto: true });
      if (r.livello) {
        if (l.volume !== 1) live.manda({ tipo: 'livello', livello: r.livello, volume: l.volume });
        if (l.muto) live.manda({ tipo: 'livello', livello: r.livello, muto: true });
      }
    }
    cue.avviso(`il live si è riavviato: ho rimesso ${snap.livelli.length} ${snap.livelli.length === 1 ? 'livello' : 'livelli'} a ${snap.bpm} bpm`, { persistente: true });
  } finally {
    ripristinando = false;
  }
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
  $('uscita-onoff').querySelector('i').textContent = aperta ? 'aperta' : 'chiusa';
}

// Il LIVE: la pila dei livelli, dallo stato del motore live, e il jam in fondo.
let volumePrima = null; // { id, v }: il volume com'era all'inizio del trascinamento
const pila = new Pila($('livelli'), $('jam'), {
  apriNelSynth: (codice, nome) => apriNelSynth(codice, nome),
  togli: (id) => togliLivello(id),
  salvaLivello: (id) => live.manda({ tipo: 'salva-livello', livello: id }),
  pulisciCoda: (id) => pulisciCoda(id),
  togliRigaCoda: (id, chiave) => togliRigaCoda(id, chiave),
  volume: (id, volume) => live.manda({ tipo: 'livello', livello: id, volume }),
  volumeInizio: (id) => (volumePrima = { id, v: livelloVivo(id)?.volume }),
  volumeFine: (id) => {
    if (volumePrima?.id === id) registraVolume(id, volumePrima.v, livelloVivo(id)?.volume);
    volumePrima = null;
  },
  muto: (id, muto) => {
    registraMuto(id, muto);
    live.manda({ tipo: 'livello', livello: id, muto });
  },
  // jam o livello modificato: entra al prossimo ciclo, già scritto. Un errore lascia la versione di prima.
  applica: async (livello, testo) => {
    // una coda da sola (nel jam o in una card) non crea né sostituisce un livello: va a quello scelto
    const soloVoci = soloCoda(testo);
    if (soloVoci) return aggiungiCoda(soloVoci);
    // la coda scritta sotto il codice (// @coda) sostituisce quella del livello; senza, la coda resta
    const { codice, coda } = separaCoda(testo);
    const prima = livello ? livelloVivo(livello.id)?.codice : null;
    const r = await live.richiesta({
      tipo: 'entra',
      codice,
      ...(coda.length ? { coda } : {}),
      nome: livello?.nome ?? 'jam',
      provenienza: livello?.provenienza ?? 'jam',
      cicli: 1,
      scritto: true,
    });
    if (!r.errore && prima && livello) {
      // una modifica live sbagliata: ⌘Z carica la versione di prima nell'editor del livello, e la applico io
      cronologia.registra({ etichetta: `modifica di «${livello.nome}»`, annulla: () => pila.proponi(livello.nome, prima) });
    }
    return r.errore ?? null;
  },
  bozze: (bozze) => {
    ultimeBozze = bozze;
    portaUscita?.postMessage({ tipo: 'bozze', ...bozze });
  },
});

// I livelli arrivano in due modi: spinti dal motore a ogni cambio (subito) e nello stato di ogni pong (ogni mezzo secondo, un po'
// in ritardo). Vale quello più recente: un pong partito prima dell'ultimo cambio non deve riportare indietro la lista
// (un muto o un volume appena cambiati sparivano per un attimo, e un ⇧⌘S in quel momento li salvava vecchi).
// Le righe globali (fader, colpi «su tutto»): visibili sotto i livelli, come codice.
function mostraGlobali(righe) {
  const e = $('globali');
  e.hidden = !righe.length;
  const testo = righe.join('\n');
  if (e.textContent !== testo) e.textContent = testo;
}
let paracaduteAperto = false; // dal motore live: il paracadute è aperto
let spintaLivelli = 0; // quando è arrivata l'ultima spinta di livelli dal motore live
function mostraLive() {
  if (!live.viva) livelliLive = [];
  else if (live.stato.livelli && live.ultimoPong > spintaLivelli) livelliLive = live.stato.livelli;
  pila.aggiorna(livelliLive);
}

function mostraCue() {
  const etichetta = (m) => (m.viva && m.stato.codice && m.stato.nome ? { nome: m.stato.nome, provenienza: m.stato.provenienza ?? '' } : null);
  // live = sta suonando o sta per entrare
  const inLive = livelliLive.filter((l) => l.a === null).map((l) => ({ nome: l.nome, provenienza: l.provenienza }));
  cue.aggiornaStati({ live: inTest ? [] : inLive, cuffia: inTest ? null : etichetta(cuffia) });
  mostraBeat();
  controllaPassaggio();
  serata.segnaLive(livelliLive);
  cue.aggiornaTempo({ set: bpmSet(), occupato: livelliLive.some((l) => l.a === null) });
  const b = $('cuffia-onoff');
  b.classList.toggle('on', cuffia.viva && cuffiaUdibile);
  b.querySelector('i').textContent = !cuffia.viva ? '–' : cuffiaUdibile ? 'on' : 'off';
  const scratchInCuffia = $('card-libero').classList.contains('in-cuffia');
  $('manda-cuffia').classList.toggle('on', scratchInCuffia);
  mostraStriscia(etichetta(cuffia));
}

// La striscia «in cuffia»: cosa stai ascoltando, ogni voce col suo ■ di stop, e uno stop per tutto.
let chiaveStriscia = null;
function mostraStriscia(voce) {
  const chiave = inTest ? '' : voce ? `${voce.nome}|${voce.provenienza}` : '';
  if (chiave === chiaveStriscia) return;
  chiaveStriscia = chiave;
  const contenitore = $('striscia-voci');
  $('cuffia-stop').disabled = !chiave;
  if (!chiave) {
    contenitore.replaceChildren(Object.assign(document.createElement('span'), { className: 'lbl vuota', textContent: 'niente in cuffia' }));
    return;
  }
  const riga = document.createElement('span');
  riga.className = 'voce-cuffia';
  const stop = document.createElement('button');
  stop.className = 'key piccolo stop-voce';
  stop.textContent = '■';
  stop.title = 'ferma questa';
  stop.setAttribute('aria-label', `ferma ${voce.nome}`);
  stop.onclick = fermaCuffia;
  const testo = document.createElement('span');
  testo.textContent = voce.nome;
  const da = document.createElement('em');
  da.textContent = ` · ${voce.provenienza.replace(/ §\d+$/, '')}`;
  riga.append(stop, testo, da);
  contenitore.replaceChildren(riga);
}

function mostra() {
  riprendi();
  controllaUsciteAudio();
  aggiornaIstantanea();
  browser.aggiornaAscolto();
  importa.aggiornaAscolto();
  mostraLive();
  disegnaTempo();
  mostraCue();
  if (vista === 'synth') synth.aggiorna();
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

// Il tempo del set com'è in questo momento (con la mappa del live: cambia solo all'inizio di un ciclo).
const epocaOra = () => performance.timeOrigin + performance.now();
function bpmSet() {
  return mappa && live.viva ? arrotondaBpm(bpmDi(cpsAl(mappa, epocaOra()))) : null;
}

function disegnaTempo() {
  controlloBpm.disegna();
  if (!mappa || !live.viva) {
    $('frase-numero').textContent = '–';
    $('piede-frase').textContent = 'frase –';
    return;
  }
  const epoca = epocaOra();
  const ciclo = cicloDi(mappa, epoca);
  const intero = Math.floor(ciclo);
  const quarto = Math.floor((ciclo - intero) * 4);
  const lunghezza = preferenze.lunghezzaFrase;
  const frase = fraseDi(mappa, epoca, lunghezza);
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

// Il numero dei BPM in alto: il tempo del set, che si cambia da lì (bpm.js). Il cambio entra al ciclo dopo.
const controlloBpm = new ControlloBpm($('bpm'), {
  leggi: () => ({
    attuale: bpmSet(),
    inArrivo: mappa && live.viva ? ((x) => (x === null ? null : arrotondaBpm(bpmDi(x))))(tempoInArrivo(mappa, epocaOra())) : null,
  }),
  manda: (bpm) => live.manda({ tipo: 'tempo', bpm }),
});

function fraseDaCapo() {
  live.manda({ tipo: 'frase-da-capo' });
}

// --- collegamenti ---

for (const m of [live, cuffia]) {
  m.suStato = (viva) => {
    if (inTest) misuratore.scriviLog(`${m.ruolo} ${viva ? 'vivo' : 'fermo'}`);
    if (!ripreso) return;
    if (!viva) window.cutx.logEvento('avviso', m.ruolo, 'non risponde');
    else window.cutx.logEvento('info', m.ruolo, 'di nuovo vivo');
  };
  m.suMessaggio = (msg) => {
    if (msg.tipo === 'mappa') mappa = msg;
    else if (msg.tipo === 'livelli') {
      if (m === live) spintaLivelli = performance.now();
      livelliLive = msg.livelli;
      paracaduteAperto = !!msg.paracadute;
      pila.aggiorna(livelliLive);
    }
    else if (msg.tipo === 'globali') mostraGlobali(msg.righe);
    else if (msg.tipo === 'strisce') pila.suStrisce(msg);
    else if (msg.tipo === 'misure') pila.suMisure(msg, performance.now(), mappa?.cps ? 1000 / mappa.cps : 2000);
    else if (msg.tipo === 'suoni-mancanti' && !inTest) {
      // un campione che non c'è nello stash non suona: lo si dice, non resta silenzio
      const dove = msg.nome ? `«${msg.nome}»` : msg.ruolo === 'cuffia' ? 'in cuffia' : 'nel live';
      cue.avviso(`${dove}: ${msg.suoni.length === 1 ? 'il suono' : 'i suoni'} ${msg.suoni.join(', ')} ${msg.suoni.length === 1 ? 'non è' : 'non sono'} nello stash: non ${msg.suoni.length === 1 ? 'suonerà' : 'suoneranno'}`, { persistente: true });
    } else if (msg.tipo === 'eco') misuratore.eco(msg.ciclo, msg.ruolo, msg.epoca);
    else if (msg.tipo === 'anello') misuratore.misuraAnello(msg.ms);
    else if (msg.tipo === 'guardiano' && !inTest) cue.avviso(`«${msg.nome}»: ${msg.errore}${msg.ripristinato ? ' · continua a suonare la versione di prima' : ''}`, { persistente: true });
    else if (msg.tipo === 'anello-stato') $('anello-stato').textContent = msg.attivo ? 'in ascolto' : `errore: ${msg.errore}`;
  };
}
// Un live rinato dopo un crash riparte vuoto: l'interfaccia gli rimette quello che suonava (se non aveva perso niente, non fa niente).
live.suCollegato = () => {
  live.manda({ tipo: 'strisce-on', on: preferenze.striscia !== false }); // un live rinato riparte con la striscia come l'ho scelta
  if (ripreso) ripristinaLive();
};
// Una cuffia rinata riparte da vuota: le ridò il suo codice.
cuffia.suCollegato = async () => {
  if (!ripreso) return;
  window.cutx.logEvento('avviso', 'cuffia', 'ricollegata (riavviata): le ridò il suo codice');
  cuffiaInPausa = false; // una cuffia rinata non è in pausa
  mostraPausaCuffia();
  // aspetto che abbia finito di caricarsi: risponde ai ping molto prima di poter valutare il codice (5 s di attesa non bastano sempre)
  const nuova = cuffia.collegatoDa;
  for (let i = 0; i < 400 && !(cuffia.ultimoPong > nuova && cuffia.stato.pronto === true); i++) await new Promise((r) => setTimeout(r, 100));
  if (cuffia.collegatoDa !== nuova) return; // nel frattempo è rinata di nuovo: ci pensa la prossima
  if (inTest) cuffia.manda({ tipo: 'eco', attivo: true });
  if (!cuffiaUdibile) cuffia.manda({ tipo: 'udibile', on: false });
  if (vista === 'synth') {
    cuffia.manda({ tipo: 'volume-cuffia', volume: VOLUME_CUFFIA_SYNTH }); // la cuffia rinata riparte prudente
    synth.inviaSuono();
  }
  if (pezzoCuffia) manda(cuffia, pezzoCuffia.codice, pezzoCuffia.etichetta);
};

$('wordmark').src = wordmark;
$('imp-wordmark').src = wordmark;
const posaGatto = avviaGatto($('gatto'));
avviaGatto($('imp-gatto'), { animato: false });
pulsanteParacadute();
const insegna = avviaInsegna($('insegna'));

$('stash').onclick = async () => apriStash(await window.cutx.scegliStash());
$('avviso-stash-cambia').onclick = async () => apriStash(await window.cutx.scegliStash());
$('cuffia-onoff').onclick = () => cuffiaOnOff();
$('cuffia-pausa').onclick = () => pausaCuffia();
$('apri-impostazioni').onclick = () => impostazioni(true);
$('chiudi-impostazioni').onclick = () => impostazioni(false);
$('manda-cuffia').onclick = () => ($('card-libero').classList.contains('in-cuffia') ? fermaCuffia() : provaInCuffia());
$('cuffia-stop').onclick = fermaCuffia;
$('manda-live').onclick = goLive;
$('go-live').onclick = goLive;
$('frase').onclick = fraseDaCapo;
$('uscita-onoff').onclick = async () => mostraUscita(await window.cutx.uscitaOnOff());
window.cutx.suUscita(mostraUscita);
window.cutx.uscitaAperta().then(mostraUscita);
for (const b of document.querySelectorAll('[data-entra]')) b.onclick = () => scegliEntraTra(Number(b.dataset.entra));
for (const b of document.querySelectorAll('[data-diss]')) b.onclick = () => scegliDiss(Number(b.dataset.diss));

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
  synth,
  synthIniziale,
  fermaCuffia,
  codiceSynth: (parziale) => codiceSynth(synthPulisci({ ...synthIniziale(), ...parziale })),
  mostraVista,
  get vista() {
    return vista;
  },
  motori: { live, cuffia },
  misuraLimiter,
  misuraMicroEntrata,
  passaBrano,
  caricaSerata,
  serata,
  statoBeat,
  muoviScena,
  pausaCuffia,
  pulisciCoda,
  togliRigaCoda,
  cronologia,
  annullaSet,
  // per capire un fallimento: cosa vede l'interfaccia in questo momento
  diagnosi: () => ({ inTest, ripreso, avviso: $('cue-avviso').textContent, livelli: livelliLive.map((l) => `${l.nome}:${l.da}-${l.a}`), liveViva: live.viva, cuffiaViva: cuffia.viva, bpm: bpmSet(), ripristinando, haFuoco: document.hasFocus() }),
  avviaTest,
  bloccaInterfaccia,
  valuta: (ruolo, codice, etichetta) => manda(ruolo === 'live' ? live : cuffia, codice, etichetta),
  goLive,
  scegliEntraTra,
  togli: (id) => togliLivello(id),
  salvaLiveComeBrano,
  lanciaParacadute,
  pila,
  get controllerMidi() {
    return controllerMidi;
  },
  imp,
  importa,
  scriviCue: (codice) => {
    cue.cambiaModo('libero'); // scrivere nello scratch: ci si va (all'avvio può essere aperto il brano che apre il set)
    cue.libero.codice = codice;
  },
  cue,
  posaGatto: (nome) => posaGatto(nome),
  accendiInsegna: () => insegna.sfarfalla(),
  spegniLettera: () => insegna.spegniLettera(),
  fermaInsegna: () => insegna.ferma(),
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

// I livelli temporanei del controller: il riser del fader (rumore con un passa-alto che sale) e il «sale» dei colpi. Entrano e escono subito
// (o sulla griglia dei colpi), non al ciclo dopo. def = { codice, coda: [righe] } oppure null per toglierlo.
const temporanei = new Map(); // chiave → { id, creando, ultimo, griglia }
async function gestisciTemp(chiave, def, griglia = 0, nome = chiave) {
  const t = temporanei.get(chiave) ?? { id: null, creando: false, ultimo: null, griglia: 0 };
  temporanei.set(chiave, t);
  t.ultimo = def;
  t.griglia = griglia;
  if (!def) {
    if (t.id !== null) live.manda({ tipo: 'togli', livello: t.id, subito: true, griglia });
    t.id = null;
    return;
  }
  if (t.id !== null) return live.manda({ tipo: 'coda', livello: t.id, imposta: def.coda, origine: 'manopola' });
  if (t.creando) return;
  t.creando = true;
  const risposta = await live.richiesta({ tipo: 'entra', codice: def.codice, nome, provenienza: 'controller', cicli: 1, scritto: true, subito: true, griglia, coda: def.coda });
  t.creando = false;
  if (!risposta.livello) return;
  t.id = risposta.livello;
  if (!t.ultimo) gestisciTemp(chiave, null, t.griglia, nome); // nel frattempo l'avevo già lasciato
  else live.manda({ tipo: 'coda', livello: t.id, imposta: t.ultimo.coda, origine: 'manopola' });
}
// Il riser del fader: rumore con un passa-alto che sale.
const RUMORE = 's("white*16").decay(.12).sustain(0)';
const gestisciRiser = (r) => gestisciTemp('riser', r ? { codice: RUMORE, coda: [`.hpf(${r.hpf})`, `.gain(${r.gain})`] } : null, 0, 'riser');

// --- il controller (X-Touch Mini in MC): le stesse azioni della tastiera e del mouse, gli anelli con i valori veri ---
let rigaTimer = null;
function mostraRiga(testo) {
  const e = $('riga-controller');
  e.textContent = testo;
  e.classList.add('visibile');
  clearTimeout(rigaTimer);
  rigaTimer = setTimeout(() => e.classList.remove('visibile'), 1500);
}
// La finestra del pubblico la scritta del controller la mostra solo se l'ho accesa nei testi per il pubblico.
const mostraScritta = (testo) => portaUscita?.postMessage({ tipo: 'scritta', testo });
let gestoVolume = null; // un giro di manopola sul volume è un passo solo di ⌘Z
const controllerMidi = new Controller({
  livelli: () => pila.attivi(),
  posti: () => pila.posti(),
  volume: (id, v) => {
    const l = livelloVivo(id);
    if (!l) return;
    if (gestoVolume?.id !== id) {
      gestoVolume = { id, prima: l.volume, timer: null };
    }
    clearTimeout(gestoVolume.timer);
    const g = gestoVolume;
    g.timer = setTimeout(() => {
      registraVolume(g.id, g.prima, livelloVivo(g.id)?.volume);
      if (gestoVolume === g) gestoVolume = null;
    }, 700);
    l.volume = v; // subito: il prossimo scatto parte da qui, senza aspettare l'eco del motore
    live.manda({ tipo: 'livello', livello: id, volume: v });
  },
  muto: (id) => {
    const l = livelloVivo(id);
    if (!l) return;
    registraMuto(id, !l.muto);
    l.muto = !l.muto;
    live.manda({ tipo: 'livello', livello: id, muto: l.muto });
  },
  // muoversi nel CUE con la manopola 1: apertura, scene del beat, clip del brano e poi le clip del kit (in silenzio); la manopola premuta ascolta la scelta
  cueSposta: (delta) => spostaSelezione(delta),
  cuePosizione: () => posizioneSelezione(),
  // CUFFIA tenuto + ◀ ▶: il prossimo brano nell'ordine del set (senza il brano che suona); senza set, nell'ordine della libreria
  cueBrano: async (verso) => {
    const base = cue.slot.prossimo?.file ?? cue.slot.attivo?.file ?? null;
    let file = null;
    if (serata.set && serata.primo()) {
      file = serata.vicino(base, verso);
      if (file && file === cue.slot.attivo?.file) file = serata.vicino(file, verso);
      if (file && !libreria.some((b) => b.file === file)) file = null;
    } else {
      const i = libreria.findIndex((b) => b.file === base);
      const j = i < 0 ? (verso > 0 ? 0 : libreria.length - 1) : i + verso;
      file = j >= 0 && j < libreria.length && j !== i ? libreria[j].file : null;
    }
    if (!file) return null;
    await cue.apri(file, 'prossimo', { fuoco: false, forza: true });
    return cue.slot.prossimo?.file === file ? libreria.find((b) => b.file === file)?.nome ?? file : null;
  },
  passaBrano: () => passaBrano(),
  passaInAttesa: () => !!passaggio,
  seleziona: (id) => pila.seleziona(id),
  selezionato: () => pila.selezionato,
  togliRiga: (id, chiave) => live.manda({ tipo: 'coda', livello: id, togli: [chiave], origine: 'manopola' }),
  // il reset di una manopola (pagina B): la riga esce dalla coda; ⌘Z la rimette
  resetRiga: (id, chiave) => {
    const l = livelloVivo(id);
    const prima = l?.coda?.find((r) => leggiVoce(r)?.chiave === chiave);
    if (!prima) return;
    live.manda({ tipo: 'coda', livello: id, togli: [chiave], origine: 'manopola' });
    cronologia.registra({
      etichetta: `reset ${chiave} di «${l.nome}»`,
      annulla: () => (livelloVivo(id) ? void live.manda({ tipo: 'coda', livello: id, imposta: [prima], origine: 'manopola' }) : false),
      rifai: () => (livelloVivo(id) ? void live.manda({ tipo: 'coda', livello: id, togli: [chiave], origine: 'manopola' }) : false),
    });
  },
  // il fader: righe globali all(x => …), il break e il riser (un livello di rumore che entra subito)
  faderEffetto: () => preferenze.controller?.fader, // una stringa (le versioni vecchie avevano { A, B }: non vale più, torna il filtro)
  globale: (chiave, riga, griglia = 0, taglio = null) => live.manda({ tipo: 'globale', chiave, riga, griglia, taglio }),
  // i colpi: righe di coda e livelli temporanei, sulla griglia scelta nelle impostazioni (1/4 o 1/8)
  colpiGriglia: () => preferenze.colpiGriglia ?? 0.25,
  stopTorna: () => preferenze.stopTorna ?? 'battuta',
  stopScegli: (v) => window.cutx.salvaPreferenze({ stopTorna: v }),
  colpiScegliGriglia: (v) => window.cutx.salvaPreferenze({ colpiGriglia: v }),
  ricaricaColpi: () => caricaColpi(),
  codaQ: (id, riga, griglia) => live.manda({ tipo: 'coda', livello: id, imposta: [riga], origine: 'manopola', griglia }),
  togliQ: (id, chiave, griglia) => live.manda({ tipo: 'coda', livello: id, togli: [chiave], origine: 'manopola', griglia }),
  livelloTemp: (chiave, def, griglia) => gestisciTemp(chiave, def ? { codice: def.codice, coda: def.coda } : null, griglia, def?.nome ?? chiave.replace(/^colpo:/, '')),
  breakTutti: (fattore) => live.manda({ tipo: 'break', fattore }),
  riser: (r) => gestisciRiser(r),
  coda: (id, riga) => live.manda({ tipo: 'coda', livello: id, imposta: [riga], origine: 'manopola' }),
  master: (volume) => live.manda({ tipo: 'master', volume }),
  tempo: (bpm) => live.manda({ tipo: 'tempo', bpm }),
  bpm: () => bpmSet() ?? 120,
  goLive: () => goLive(),
  linguettaAttuale: () => cue.linguetta,
  linguetta: () => {
    const quale = cue.cambiaLinguetta();
    const brano = cue.brano;
    return { quale, nome: brano ? B.testa(brano.modello).brano || brano.file : null };
  },
  scena: (delta) => muoviScena(delta),
  scenaNome: (delta) => {
    const l = statoBeat().pendente ?? statoBeat().suona;
    return l ? l.beat.scene[l.beat.indice + delta]?.nome ?? null : null;
  },
  togli: () => togliLivello(pila.selezionato ?? undefined),
  cuffia: () => (cuffia.stato.codice ? fermaCuffia() : provaInCuffia()),
  inCuffia: () => !!cuffia.stato.codice,
  paracadute: () => lanciaParacadute(),
  paracaduteCarica: (on) => $('paracadute').classList.toggle('carica', on),
  passoCarica: (on) => $('passa-brano').classList.toggle('carica', on), // tasto 3 tenuto: la barra del pulsante si riempie come col clic
  passoScattato: () => {
    $('passa-brano').classList.remove('carica');
    scattato($('passa-brano'));
  },
  scritta: (testo) => mostraScritta(testo),
  riga: (testo) => mostraRiga(testo),
  tocca: (id) => pila.tocca(id),
  inAttesa: () => !inTest && mappa && livelliLive.some((l) => l.a === null && l.da !== null && cicloDi(mappa, performance.timeOrigin + performance.now()) < l.da),
  paracaduteAperto: () => paracaduteAperto,
  avviso: (testo) => cue.avviso(testo, { persistente: true }),
  calibrazione: () => preferenze.controller,
  // nel SYNTH il controller comanda il synth (se la preferenza lo vuole; con SHOW acceso, mai: il controller resta sul LIVE)
  nelSynth: () => vista === 'synth' && (preferenze.controller?.nelSynth ?? 'segue') !== 'live',
  nelSynthPreferenza: () => preferenze.controller?.nelSynth ?? 'segue',
  nelSynthScegli: (v) => window.cutx.salvaPreferenze({ controller: { ...preferenze.controller, nelSynth: v } }),
  synth: synth.perControllo(),
  salvaCalibrazione: (c) => window.cutx.salvaPreferenze({ controller: { ...preferenze.controller, ...c } }),
  faderScegli: (effetto) => window.cutx.salvaPreferenze({ controller: { ...preferenze.controller, fader: effetto } }),
});
const paginaController = new PaginaController(controllerMidi);
const specchio = new Specchio($('specchio'));
setInterval(() => specchio.aggiorna(controllerMidi), 100);
const specchioSynth = new Specchio(synth.specchioEl, { synth: true });
setInterval(() => specchioSynth.aggiorna(controllerMidi), 100);
// i numeri ②–⑦ sulle card compaiono solo con il controller collegato
controllerMidi.quandoCambia(() => document.querySelector('.postazione').classList.toggle('con-controller', controllerMidi.collegato));
controllerMidi.collega();
// colpi.cutx dallo stash (se non c'è si crea con i predefiniti): al primo giro e ogni volta che lo stash cambia
async function caricaColpi() {
  controllerMidi.colpi.carica(await window.cutx.leggiColpi().catch(() => null));
}
caricaColpi();
controllerPronto = true;

setInterval(mostra, 100);
mostra();
mostraTempo();
let synthCaricato = false;
function applicaPreferenze(p) {
  const dissPrima = preferenze.dissolvenzaEntrata;
  preferenze = p;
  if (!synthCaricato) {
    synthCaricato = true;
    synth.carica(p.synthUltimo); // il SYNTH riparte dall'ultimo suono
  }
  controllerMidi.ricaricaTabella();
  if (p.striscia !== (preferenze.striscia)) live.manda({ tipo: 'strisce-on', on: p.striscia !== false });
  if (p.dissolvenzaEntrata !== dissPrima) scegliDiss(p.dissolvenzaEntrata ?? 0); // il valore delle impostazioni è anche quello del CUE
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
