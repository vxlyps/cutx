// I ruoli dell'X-Touch Mini: ogni evento produce uno stato nuovo e azioni da applicare fuori da questo modulo.
import { VEL_DI_SERIE, VEL_MIN, slot } from './drum-codice.js';

export const RUOLI = ['live', 'synth', 'sequencer', 'pad', 'piano'];
export const TESTINA = 'lampeggio';
export const OTTAVA_MIN = 1;
export const OTTAVA_MAX = 7;

export function ruoloDi({ vista, scheda, layer } = {}) {
  if (vista !== 'synth') return 'live';
  if (scheda === 'drum') return layer === 'A' ? 'sequencer' : layer === 'B' ? 'pad' : 'live';
  return layer === 'A' ? 'synth' : layer === 'B' ? 'piano' : 'live';
}

const righeDi = (ctx) => Array.isArray(ctx?.g?.righe) ? ctx.g.righe : [];
const eventoValido = (e, tipo, max) => e?.tipo === tipo && Number.isInteger(e.n) && e.n >= 1 && e.n <= max;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function nuovoSequencer() {
  return { riga: 0, pagina: 0, tenuti: [], mossi: [] };
}

function sistemaSequencer(stato, ctx) {
  const righe = righeDi(ctx);
  const pagine = Math.max(1, Math.ceil(slot(ctx?.g) / 16));
  return {
    ...stato,
    riga: righe.length ? clamp(Number.isInteger(stato?.riga) ? stato.riga : 0, 0, righe.length - 1) : 0,
    pagina: clamp(Number.isInteger(stato?.pagina) ? stato.pagina : 0, 0, pagine - 1),
    tenuti: [...(Array.isArray(stato?.tenuti) ? stato.tenuti : [])],
    mossi: [...(Array.isArray(stato?.mossi) ? stato.mossi : [])],
  };
}

export function eventoSequencer(stato, e, ctx = {}) {
  let s = sistemaSequencer(stato ?? nuovoSequencer(), ctx);
  const azioni = [];
  const righe = righeDi(ctx);
  const passiMassimi = slot(ctx?.g);
  if (eventoValido(e, 'tasto', 16) && typeof e.giu === 'boolean') {
    const passo = s.pagina * 16 + e.n - 1;
    if (e.giu) {
      if (passo < passiMassimi && !s.tenuti.includes(passo)) s = { ...s, tenuti: [...s.tenuti, passo] };
    } else if (s.tenuti.includes(passo)) {
      const mossi = s.mossi.includes(passo);
      s = { ...s, tenuti: s.tenuti.filter((x) => x !== passo), mossi: s.mossi.filter((x) => x !== passo) };
      const riga = righe[s.riga];
      if (!mossi && riga?.tipo === 'griglia') {
        azioni.push({ tipo: 'passo', riga: s.riga, passo, vel: riga.vel?.[passo] > 0 ? 0 : VEL_DI_SERIE });
      }
    }
  } else if (eventoValido(e, 'manopola', 8) && Number.isInteger(e.passi) && e.passi !== 0) {
    const riga = righe[s.riga];
    if (e.n === 1 && s.tenuti.length) {
      if (riga?.tipo === 'griglia') for (const passo of s.tenuti) {
        const attuale = riga.vel?.[passo] ?? 0;
        if (attuale > 0) azioni.push({ tipo: 'velocita', riga: s.riga, passo, vel: Math.round(clamp(attuale + e.passi * 0.02, VEL_MIN, 1) * 100) / 100 });
      }
      s = { ...s, mossi: [...new Set([...s.mossi, ...s.tenuti])] };
    } else if (e.n === 1 && !s.tenuti.length) {
      if (righe.length) s = { ...s, riga: clamp(s.riga + Math.sign(e.passi), 0, righe.length - 1) };
    } else if (e.n === 2 && riga?.tipo === 'griglia') {
      azioni.push({ tipo: 'suono', riga: s.riga, verso: Math.sign(e.passi) });
    }
  } else if (e?.tipo === 'push' && e.n === 3 && e.giu === true) {
    const pagine = Math.max(1, Math.ceil(passiMassimi / 16));
    if (pagine > 1) s = { ...s, pagina: (s.pagina + 1) % pagine };
  }
  return { stato: s, azioni };
}

export function luciSequencer(stato, ctx = {}) {
  const s = sistemaSequencer(stato ?? nuovoSequencer(), ctx);
  const righe = righeDi(ctx);
  const riga = righe[s.riga];
  const nPassi = slot(ctx?.g);
  const stile = ctx.stileTestina ?? TESTINA;
  return Array.from({ length: 16 }, (_, i) => {
    const passo = s.pagina * 16 + i;
    if (passo >= nPassi || !riga) return 'spento';
    const acceso = riga.tipo === 'griglia' && riga.vel?.[passo] > 0;
    if (passo === ctx.testina) {
      if (stile === 'inverso') return acceso ? 'spento' : 'acceso';
      if (stile === 'lampeggio') return 'lampeggia';
    }
    return acceso ? 'acceso' : 'spento';
  });
}

export function nuovoPad() {
  return { tenuti: [] };
}

export function eventoPad(stato, e, ctx = {}) {
  let tenuti = [...(Array.isArray(stato?.tenuti) ? stato.tenuti : [])];
  const azioni = [];
  const righe = righeDi(ctx);
  if (eventoValido(e, 'tasto', 16) && typeof e.giu === 'boolean') {
    const riga = e.n - 1;
    if (riga < righe.length && e.giu) {
      if (!tenuti.includes(riga)) tenuti.push(riga);
      azioni.push({ tipo: 'suona', riga, vel: VEL_DI_SERIE });
    } else if (tenuti.includes(riga)) {
      tenuti = tenuti.filter((x) => x !== riga);
      azioni.push({ tipo: 'rilascia', riga });
    }
  }
  return { stato: { tenuti }, azioni };
}

export function luciPad(stato) {
  const tenuti = Array.isArray(stato?.tenuti) ? stato.tenuti : [];
  return Array.from({ length: 16 }, (_, i) => tenuti.includes(i) ? 'acceso' : 'spento');
}

export function nuovoPiano() {
  return { ottava: 4, tenuti: {} };
}

const semitoniPerTasto = { 1: 1, 2: 3, 4: 6, 5: 8, 6: 10, 9: 0, 10: 2, 11: 4, 12: 5, 13: 7, 14: 9, 15: 11, 16: 12 };

export function eventoPiano(stato, e) {
  let tenuti = { ...(stato?.tenuti ?? {}) };
  let ottava = Number.isInteger(stato?.ottava) ? clamp(stato.ottava, OTTAVA_MIN, OTTAVA_MAX) : 4;
  const azioni = [];
  if (eventoValido(e, 'tasto', 16) && typeof e.giu === 'boolean') {
    const midiTenuto = tenuti[e.n];
    if (e.giu && semitoniPerTasto[e.n] !== undefined && midiTenuto === undefined) {
      const midi = 12 * (ottava + 1) + semitoniPerTasto[e.n];
      tenuti[e.n] = midi;
      azioni.push({ tipo: 'nota', midi, vel: VEL_DI_SERIE, giu: true });
    } else if (!e.giu && midiTenuto !== undefined) {
      delete tenuti[e.n];
      azioni.push({ tipo: 'nota', midi: midiTenuto, vel: 0, giu: false });
    }
  } else if (eventoValido(e, 'manopola', 8) && e.n === 1 && Number.isInteger(e.passi) && e.passi !== 0) {
    ottava = clamp(ottava + Math.sign(e.passi), OTTAVA_MIN, OTTAVA_MAX);
  }
  return { stato: { ottava, tenuti }, azioni };
}

export function luciPiano(stato) {
  const tenuti = stato?.tenuti ?? {};
  return Array.from({ length: 16 }, (_, i) => tenuti[i + 1] !== undefined ? 'acceso' : 'spento');
}
