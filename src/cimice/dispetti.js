// I DISPETTI della cimice: glitch brevi e VERI sul suono, fatti solo con la coda dei livelli (coda.js): righe come .lpf(900) messe sotto
// il codice, che il motore applica sul pattern già compilato. Il codice del livello non si riscrive mai.
// Modulo puro (niente schermo, niente audio): lo provano i test. Chi esegue è dispetti-app.js.
//
// Regole: uno alla volta; solo su un livello che suona; valori dentro limiti sicuri (mai più forte di prima, niente fischi, niente
// risonanze alte); prova a vuoto sul pattern prima di applicare (se dà errore non parte); dura da mezzo secondo a 2 secondi, e inizia e
// finisce sulla griglia (da un sedicesimo a un giro di 4 movimenti).
import { applica as applicaCoda, imposta, leggiVoce, valoreDi, valoreLetterale } from '../renderer/coda.js';

export const SEDICESIMO = 1 / 16; // un ciclo = una battuta = 16 sedicesimi
const G16 = 1 / 16;
const G8 = 1 / 8;
const G4 = 1 / 4;
export const LIMITE_LIMITER_DB = 3; // se il limiter riduce di più, niente dispetti

// Quanto spesso: probabilità a ogni tocco (al massimo uno per movimento) e pausa minima in cicli dalla fine dell'ultimo.
export const FREQUENZE_DISPETTI = {
  raro: { probabilita: 0.06, pausa: 6 },
  ogni_tanto: { probabilita: 0.15, pausa: 3 },
  spesso: { probabilita: 0.3, pausa: 1.5 },
};

const tra = (x, a, b) => Math.max(a, Math.min(b, x));
// Quanto si sente (0…1): lo slider «intensità» e, se la crescita è accesa, quanto è avanti il set (da 35% a 100% dello slider
// in `crescita` minuti: più il set va avanti, più la cimice pesa). Quando la cimice entra non va mai sotto 0.6: deve sentirsi.
export function forzaDispetti(prefs, minuti = 0, entra = false) {
  const intensita = tra(Number.isFinite(prefs?.intensita) ? prefs.intensita : 0.6, 0, 1);
  const crescita = Number.isFinite(prefs?.crescita) ? prefs.crescita : 45;
  const avanti = crescita > 0 ? tra(minuti / crescita, 0, 1) : 1;
  const k = tra(intensita * (0.35 + 0.65 * avanti), 0, 1);
  return entra ? Math.max(k, Math.min(0.6, 0.6 * (intensita > 0 ? 1 : 0))) : k;
}

const r2 = (x) => Math.round(x * 100) / 100;

// Ogni dispetto: chiavi che tocca, durata in secondi [min, max] (sempre dentro 0.5–2), griglie possibili, e le righe di coda.
// righe(c) → ['.lpf(900)', …] oppure null se non ha senso su questo livello. c.cur(chiave) = il numero che c'è già (coda o codice).
export const DISPETTI = [
  {
    id: 'filtro', nome: 'filtro che si chiude', chiavi: ['lpf'], dur: [0.5, 1.5], griglie: [G8, G4],
    righe: (c) => {
      const cur = c.cur('lpf');
      if (cur !== null && cur <= 300) return null; // già chiuso: niente da chiudere
      return [`.lpf(${Math.round(tra(Math.min(cur ?? Infinity, c.rnd(c.mix(1200, 300), c.mix(2200, 700))), 250, 2500))})`];
    },
  },
  {
    id: 'acido', nome: 'acido', chiavi: ['lpf', 'lpq'], dur: [0.5, 1.5], griglie: [G8, G4],
    righe: (c) => {
      const cur = c.cur('lpf');
      if (cur !== null && cur <= 600) return null;
      const q = Math.min(c.cur('lpq') ?? 99, r2(c.rnd(c.mix(3, 5), c.mix(5, 8)))); // niente risonanze alte, niente fischi
      return [`.lpf(${Math.round(tra(Math.min(cur ?? Infinity, c.rnd(c.mix(1400, 400), c.mix(2000, 900))), 350, 2500))})`, `.lpq(${q})`];
    },
  },
  {
    id: 'eco', nome: 'eco', chiavi: ['delay', 'delaytime', 'delayfeedback'], dur: [0.5, 2], griglie: [G8, G4],
    righe: (c) => {
      if ((c.cur('delay') ?? 0) >= 0.25) return null; // ha già il suo eco
      return [`.delay(${r2(c.rnd(c.mix(0.25, 0.45), c.mix(0.35, 0.6)))})`, '.delaytime(.375)', `.delayfeedback(${r2(c.rnd(c.mix(0.3, 0.5), c.mix(0.4, 0.65)))})`];
    },
  },
  {
    id: 'stanza', nome: 'stanza', chiavi: ['room', 'roomsize'], dur: [0.5, 2], griglie: [G8, G4],
    righe: (c) => ((c.cur('room') ?? 0) >= 0.3 ? null : [`.room(${r2(c.rnd(c.mix(0.3, 0.5), c.mix(0.45, 0.8)))})`, `.roomsize(${Math.round(c.rnd(c.mix(3, 5), c.mix(5, 8)))})`]),
  },
  { id: 'sporco', nome: 'sporco', chiavi: ['crush'], dur: [0.5, 1.5], griglie: [G8, G4], righe: (c) => [`.crush(${c.pick(c.k > 0.66 ? [4, 5, 6] : c.k > 0.33 ? [6, 7, 8] : [8, 9, 10])})`] },
  { id: 'rotte', nome: 'note rotte', chiavi: ['degradeBy'], dur: [0.5, 2], griglie: [G16, G8, G4], righe: (c) => [`.degradeBy(${r2(c.rnd(c.mix(0.2, 0.4), c.mix(0.35, 0.65)))})`] },
  { id: 'buco', nome: 'buco', chiavi: ['mask'], dur: [0.5, 1], griglie: [G16, G8, G4], righe: (c) => [`.mask("${c.pick(['1 1 0 1', '1 0 1 1', '1 1 1 0'])}")`] },
  { id: 'scatti', nome: 'fuori tempo a scatti', chiavi: ['late'], dur: [0.5, 1.5], griglie: [G16, G8], righe: (c) => [`.late("${c.pick(['0 .0625 0 .125', '0 0 .125 .0625', '.0625 0 .125 0'])}")`] },
  { id: 'doppio', nome: 'doppio', chiavi: ['fast'], dur: [0.5, 1], griglie: [G16, G8, G4], righe: () => ['.fast(2)'] },
  { id: 'lento', nome: 'a metà', chiavi: ['slow'], dur: [0.5, 1], griglie: [G8, G4], righe: () => ['.slow(2)'] },
  { id: 'balbetta', nome: 'balbettio', chiavi: ['ply'], dur: [0.5, 1], griglie: [G16, G8, G4], righe: (c) => [`.ply(${c.pick([3, 4])})`] },
  { id: 'rovescio', nome: 'al contrario', chiavi: ['rev'], dur: [0.5, 1], griglie: [G4], righe: () => ['.rev()'] },
  {
    id: 'tremolo', nome: 'tremolo', chiavi: ['gain'], dur: [0.5, 1.5], griglie: [G8, G4],
    righe: (c) => {
      const G = tra(c.cur('gain') ?? 1, 0.05, 1); // mai più forte di com'è
      return [`.gain(sine.range(${r2(G * 0.5)}, ${r2(G)}).fast(4))`];
    },
  },
  { id: 'sotto', nome: 'un\'ottava sotto', chiavi: ['transpose'], dur: [0.5, 1.5], griglie: [G8, G4], righe: () => ['.transpose(-12)'] },
  { id: 'quinta', nome: 'una quinta sopra', chiavi: ['transpose'], dur: [0.5, 1.5], griglie: [G8, G4], righe: () => ['.transpose(7)'] },
];

// La durata sulla griglia: da mezzo secondo a 2 secondi (dentro i limiti del dispetto), in multipli della griglia scelta, mai meno di un sedicesimo.
// cps = cicli al secondo. Ritorna { g, cicli }.
// maxSecondi: di serie 2; solo il finale HACK li allunga (fino a 4).
export function durata(def, cps, caso = Math.random, maxSecondi = 2) {
  const g = def.griglie[Math.floor(caso() * def.griglie.length)];
  const secondi = tra(def.dur[0] + caso() * (def.dur[1] - def.dur[0]) * (maxSecondi / 2), 0.5, maxSecondi);
  const cicli = secondi * cps;
  let n = Math.max(1, Math.round(cicli / g));
  while (n * g / cps > maxSecondi && n > 1) n--; // mai più del massimo
  return { g, cicli: Math.max(SEDICESIMO, n * g) };
}

// Le righe di un dispetto per questo livello, o null.
export function costruisci(def, livello, caso = Math.random, k = 0.5) {
  const cur = (k) => valoreDi(livello.coda ?? [], k) ?? valoreLetterale(livello.codice ?? '', k);
  const righe = def.righe({ cur, k, mix: (a, b) => a + (b - a) * k, rnd: (a, b) => a + caso() * (b - a), pick: (arr) => arr[Math.floor(caso() * arr.length)] });
  if (!righe?.length || !righe.every((r) => leggiVoce(r))) return null;
  return righe;
}

const voceDi = (coda, chiave) => (coda ?? []).find((t) => leggiVoce(t)?.chiave === chiave) ?? null;
const eLivelloOk = (l, ciclo) => !!l && l.a === null && !l.muto && (l.da === null || l.da <= ciclo) && l.nome !== 'paracadute' && l.nome !== 'jam' && !!l.codice;

export function creaDispetti({ caso = Math.random } = {}) {
  let attivo = null;
  let ultimaFine = -Infinity;
  let motivo = ''; // perché l'ultima proposta non è partita (per le prove e la MOVIOLA)
  const no = (perche) => { motivo = perche; return null; };

  return {
    get attivo() { return attivo; },
    get motivo() { return motivo; },

    // Un tocco della cimice su un livello: parte un dispetto, o niente. Ritorna il piano o null.
    // livello: { id, nome, codice, coda, a, da, muto } · prefs: preferenze.cimice · pattern(codice) → pattern già valutato o null
    // limiterDb: la riduzione del limiter (dB, anche negativa) · inModifica(nome) → sto scrivendo in quella card · forza: salta il caso (prove)
    // occupato(idLivello, chiave) → un altro dispetto sta già usando quella riga su quel livello (nel finale HACK ce ne sono più insieme)
    proponi({ livello, ciclo, cps, prefs, pattern, limiterDb = 0, inModifica = () => false, forza = false, maxSecondi = 2, occupato = () => false, minuti = 0, entra = false }) {
      if (!prefs?.dispetti) return no('spenti');
      if (attivo) return no('uno-alla-volta');
      if (!(cps > 0)) return no('senza-tempo');
      const f = FREQUENZE_DISPETTI[prefs.dispettiFrequenza] ?? FREQUENZE_DISPETTI.ogni_tanto;
      const k = forzaDispetti(prefs, minuti, entra);
      if (!forza && !entra && ciclo - ultimaFine < f.pausa * (1.6 - 1.2 * k)) return no('pausa');
      if (!forza && !entra && caso() >= Math.min(0.9, f.probabilita * (0.4 + 2.2 * k))) return no('caso');
      if (Math.abs(limiterDb) > LIMITE_LIMITER_DB) return no('limiter');
      if (!eLivelloOk(livello, ciclo)) return no('livello-non-ok');
      if (inModifica(livello.nome)) return no('in-modifica');
      const base = pattern(livello.codice);
      if (!base) return no('pattern-non-pronto');
      const ordine = [...DISPETTI].sort(() => caso() - 0.5);
      for (const def of ordine) {
        if (def.chiavi.some((k) => occupato(livello.id, k))) continue;
        const righe = costruisci(def, livello, caso, k);
        if (!righe) continue;
        // prima di applicare: la riga deve compilare e dare un pattern che si interroga
        const prova = applicaCoda(base, righe.reduce(imposta, livello.coda ?? []));
        if (prova.errore) continue;
        const { g, cicli } = durata(def, cps, caso, maxSecondi <= 2 ? 2 + k : maxSecondi); // più forte = anche più lungo (fino a 3 secondi)
        const inizio = Math.ceil((ciclo + 0.004) / g - 1e-9) * g;
        const fine = inizio + cicli;
        attivo = {
          id: def.id, nome: def.nome, livelloId: livello.id, livelloNome: livello.nome, righe, chiavi: def.chiavi,
          prima: Object.fromEntries(def.chiavi.map((k) => [k, voceDi(livello.coda, k)])),
          g, cicli, inizio, fine, invioRitorno: fine - g / 2, // il ritorno parte mezza griglia prima: il motore lo mette sulla griglia giusta
        };
        return attivo;
      }
      return no('nessun-dispetto-valido');
    },

    // Il messaggio per il motore che parte (o null).
    messaggioInizio() {
      return attivo ? { tipo: 'coda', livello: attivo.livelloId, imposta: attivo.righe, origine: 'dispetto', griglia: attivo.g } : null;
    },

    // Il dispetto è da chiudere (è passato il suo tempo)?
    scaduto(ciclo) { return attivo && ciclo >= attivo.invioRitorno ? attivo : null; },

    // Il messaggio per riportare la coda com'era, o null. Se nel frattempo ho cambiato io quella riga (manopola, a mano) non si tocca.
    // codaAttuale: la coda del livello adesso · subito: senza griglia (stop)
    messaggioRitorno(codaAttuale, subito = false) {
      if (!attivo) return null;
      const togli = [];
      const rimetti = [];
      for (const riga of attivo.righe) {
        const chiave = leggiVoce(riga).chiave;
        if (voceDi(codaAttuale, chiave) !== riga) continue; // cambiata da me: resta mia
        if (attivo.prima[chiave]) rimetti.push(attivo.prima[chiave]);
        else togli.push(chiave);
      }
      if (!togli.length && !rimetti.length) return null;
      return { tipo: 'coda', livello: attivo.livelloId, togli, imposta: rimetti, origine: 'dispetto', ...(subito ? {} : { griglia: attivo.g }) };
    },

    finito(ciclo) { ultimaFine = ciclo; attivo = null; },
  };
}
