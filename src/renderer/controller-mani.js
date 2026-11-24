// X-TOUCH MANI: nella vista LIVE, quando il nano è stato visto in questa sessione, l'X-Touch Mini scolpisce IL CANALE IN FOCUS (CH1…CH8).
// Tasti in alto 1–8 = FOCUS · manopole 1 SWEEP, 2 risonanza, 3 eco, 4 riverbero, 5 velocità, 6 sporco, 7 altezza · manopola 8 = volume generale.
// Layer A = il CH in focus; layer B = le stesse manopole su TUTTO (righe globali). Spinta = la riga esce. Fila in basso e fader: come prima.
// Qui c'è la logica; controller.js le passa se stesso (`c`) e il resto (anelli, luci, scritte) lo fa già lui.
import { sweep } from './canali.js';
import { ALTEZZA_MAX, ALTEZZA_MIN, PARAMETRI, PASSO_X, PASSI_PER_SCATTO, SCATTI_VELOCITA, SCATTO_NORMALE, clamp01, etichettaAltezza, etichettaVelocita, rigaCoda, valoreDa, valoreTesto } from './controller-mappa.js';

// Cosa fa la manopola n (1–7); la 8 è il volume generale.
export const MANOPOLE_MANI = ['sweep', 'risonanza', 'eco', 'riverbero', 'velocita', 'sporco', 'altezza'];
export const PARAMETRO_MANI = (n) => MANOPOLE_MANI[n - 1] ?? null;

// Le chiavi delle righe di coda che MANI scrive: sono le sole che una clip nuova eredita dal suo CH.
export const CHIAVI_MANI = ['lpf', 'hpf', 'lpq', 'delay', 'room', 'fast', 'distort', 'transpose'];

// La chiave Strudel di un parametro (le righe che scrive).
export const chiaveCoda = (param) => (param === 'velocita' ? 'fast' : param === 'altezza' ? 'transpose' : PARAMETRI[param]?.chiave ?? null);

// SWEEP: la posizione 0…1 della manopola → cosa scrivere. Neutro: niente righe. A sinistra passa-basso (.lpf), a destra passa-alto (.hpf).
// Ritorna { imposta: riga | null, togli: chiave | null, testo }.
export function righeSweep(pos) {
  const s = sweep(pos);
  if (s.tipo === 'acqua') return { imposta: `.lpf(${Math.round(s.lp)})`, togli: 'hpf', testo: `${Math.round(s.lp)} Hz · passa-basso` };
  if (s.tipo === 'aria') return { imposta: `.hpf(${Math.round(s.hp)})`, togli: 'lpf', testo: `${Math.round(s.hp)} Hz · passa-alto` };
  return { imposta: null, togli: null, testo: 'centro' };
}

// La riga globale (all(x => …)) di una riga di coda: `.lpf(742)` → `all(x => x.lpf(742))`.
export const rigaGlobale = (riga) => `all(x => x${riga})`;

// Le righe che un CH deve far ereditare a una clip che entra: { chiave → riga }. Quelle già scritte nella coda della clip con la stessa chiave
// perdono: vince la manopola. `coda` = le righe della clip; `righeCH` = Map chiave → riga del CH. Ritorna la nuova coda.
export function ereditaRighe(coda, righeCH) {
  if (!righeCH || !righeCH.size) return coda;
  const chiave = (r) => String(r).match(/^\s*\.(\w+)/)?.[1];
  const della = new Set(righeCH.keys());
  return [...(coda ?? []).filter((r) => !della.has(chiave(r))), ...righeCH.values()];
}

// --- il controller (c = Controller) ---

export const maniAttiva = (c) => !c.nelSynth && !c.strumento && !!c.azioni.maniAttiva?.();

const scopo = (c) => (c.pagina === 'B' ? 'tutto' : `ch${c.focusCH}`);
const etichetta = (c) => (c.pagina === 'B' ? 'TUTTO' : String(c.azioni.maniNome?.(c.focusCH) ?? `CH${c.focusCH + 1}`).toUpperCase());

// I livelli che la manopola tocca: quelli del CH in focus (layer A), o nessuno (layer B scrive righe globali).
const livelliDelFocus = (c) => c.azioni.maniLivelli?.(c.focusCH) ?? [];

// Il valore di partenza di un parametro per questo bersaglio.
function valorePartenza(c, param, livelli) {
  const k = `${scopo(c)}|${param}`;
  if (c.maniX.has(k)) return c.maniX.get(k);
  if (c.pagina === 'A' && livelli[0]) return c.xDi(livelli[0], param); // legge la coda del livello
  if (param === 'velocita') return SCATTO_NORMALE;
  if (param === 'altezza') return 0;
  return PARAMETRI[param].predefinito;
}

// Una riga di coda al bersaglio (layer A: ai livelli del CH + memoria del CH per le clip nuove; layer B: riga globale).
function scrivi(c, param, riga, chiaveRiga) {
  if (c.pagina === 'B') return c.azioni.maniGlobale?.(`mani:${chiaveRiga}`, rigaGlobale(riga));
  for (const l of livelliDelFocus(c)) c.mandaCoda(l.id, riga);
  c.azioni.maniRiga?.(c.focusCH, chiaveRiga, riga);
}

function togli(c, chiaveRiga) {
  if (c.pagina === 'B') return c.azioni.maniGlobale?.(`mani:${chiaveRiga}`, null);
  for (const l of livelliDelFocus(c)) c.azioni.resetRiga?.(l.id, chiaveRiga);
  c.azioni.maniRiga?.(c.focusCH, chiaveRiga, null);
}

const dice = (c, n, testo) => {
  c.toccata = { n, quando: c.ora(), testo };
  c.riga(testo); // la scritta a schermo, nella riga del LIVE (e sul proiettore)
};

// Il CH in focus non ha niente che suona: le manopole non fanno niente.
const vuoto = (c, n) => dice(c, n, `CH${c.focusCH + 1} vuoto`);

export function giraMani(c, n, passi) {
  if (n === 8) return c.giraMaster(passi);
  const param = PARAMETRO_MANI(n);
  if (!param) return;
  const livelli = livelliDelFocus(c);
  if (c.pagina === 'A' && !livelli.length) return vuoto(c, n);
  const k = `${scopo(c)}|${param}`;
  const nome = etichetta(c);
  if (param === 'sweep') {
    const pos = clamp01((c.maniX.get(k) ?? 0.5) + passi * PASSO_X);
    c.maniX.set(k, pos);
    const r = righeSweep(pos);
    if (r.togli) togli(c, r.togli);
    if (r.imposta) scrivi(c, param, r.imposta, r.imposta.match(/^\.(\w+)/)[1]);
    else {
      togli(c, 'lpf');
      togli(c, 'hpf');
    }
    return dice(c, n, `${nome} · SWEEP ${r.testo}`);
  }
  if (param === 'velocita') {
    const indice = Math.max(0, Math.min(SCATTI_VELOCITA.length - 1, valorePartenza(c, param, livelli) + passi / PASSI_PER_SCATTO));
    c.maniX.set(k, indice);
    const v = SCATTI_VELOCITA[Math.round(indice)];
    if (c.maniUltimo.get(k) !== v) {
      c.maniUltimo.set(k, v);
      if (Math.round(indice) === SCATTO_NORMALE) togli(c, 'fast');
      else scrivi(c, param, `.fast(${v})`, 'fast');
    }
    return dice(c, n, `${nome} · VELOCITÀ ${etichettaVelocita(v)}`);
  }
  if (param === 'altezza') {
    const st = Math.max(ALTEZZA_MIN, Math.min(ALTEZZA_MAX, Math.round(valorePartenza(c, param, livelli) + passi)));
    c.maniX.set(k, st);
    if (c.maniUltimo.get(k) !== st) {
      c.maniUltimo.set(k, st);
      if (st === 0) togli(c, 'transpose');
      else scrivi(c, param, `.transpose(${st})`, 'transpose');
    }
    return dice(c, n, `${nome} · ALTEZZA ${etichettaAltezza(st)}`);
  }
  const p = PARAMETRI[param];
  const x = clamp01(valorePartenza(c, param, livelli) + passi * PASSO_X);
  c.maniX.set(k, x);
  scrivi(c, param, rigaCoda(p, x), p.chiave);
  dice(c, n, `${nome} · ${p.nome} ${valoreTesto(p, x)}`);
}

// Spinta di una manopola: la riga esce, il parametro torna com'era.
export function resetMani(c, n) {
  const param = PARAMETRO_MANI(n);
  if (!param) return;
  if (c.pagina === 'A' && !livelliDelFocus(c).length) return vuoto(c, n);
  const k = `${scopo(c)}|${param}`;
  if (param === 'sweep') {
    togli(c, 'lpf');
    togli(c, 'hpf');
    c.maniX.set(k, 0.5);
  } else {
    togli(c, chiaveCoda(param));
    c.maniX.delete(k);
    c.maniUltimo.delete(k);
  }
  dice(c, n, `${etichetta(c)} · ${param === 'sweep' ? 'SWEEP' : PARAMETRI[param]?.nome ?? param.toUpperCase()} RESET`);
}

// Tasto in alto n (1–8) = FOCUS sul CH n.
export function focusMani(c, n) {
  c.focusCH = n - 1;
  c.toccata = null;
  c.ultime.clear();
  const nome = c.azioni.maniNome?.(c.focusCH) ?? `CH${n}`;
  c.azioni.maniFocus?.(c.focusCH);
  c.riga(`FOCUS · ${nome}`);
  c.cambiato();
}

// Gli anelli (manopole 1–7; la 8 è il volume generale, la fa controller.js). Ritorna una lista di 8 voci per lo specchio.
export function manopoleMani(c) {
  const livelli = livelliDelFocus(c);
  const vivo = c.pagina === 'B' || livelli.length > 0;
  const m = [];
  for (let n = 1; n <= 7; n++) {
    const param = PARAMETRO_MANI(n);
    if (!vivo) {
      m.push(null);
      continue;
    }
    if (param === 'sweep') {
      const pos = c.maniX.get(`${scopo(c)}|sweep`) ?? 0.5;
      m.push({ stile: 'pan', valore: pos, nome: 'sweep', corto: 'sweep', testo: righeSweep(pos).testo });
    } else if (param === 'velocita') {
      const i = Math.round(valorePartenza(c, param, livelli));
      m.push({ stile: 'punto', valore: i / (SCATTI_VELOCITA.length - 1), nome: 'velocità', corto: 'veloc', testo: etichettaVelocita(SCATTI_VELOCITA[i]) });
    } else if (param === 'altezza') {
      const x = valorePartenza(c, param, livelli);
      m.push({ stile: 'punto', valore: (x - ALTEZZA_MIN) / (ALTEZZA_MAX - ALTEZZA_MIN), nome: 'altezza', corto: 'altezz', testo: etichettaAltezza(x) });
    } else {
      const p = PARAMETRI[param];
      const x = valorePartenza(c, param, livelli);
      m.push({ stile: 'punto', valore: x, nome: p.nome.toLowerCase(), corto: p.corto, testo: valoreTesto(p, x) });
    }
  }
  return m;
}

export { valoreDa };
