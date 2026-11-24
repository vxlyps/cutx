// Il passaggio da un brano al prossimo (passa al prossimo brano): cosa fa il tempo e quali clip rimaste ne risentirebbero.
// Modulo puro: lo provano i test.
import { perIlLive } from './transizioni.js';

export const SOGLIA_RAMPA = 0.08; // fino a questa differenza (8%) il tempo sale o scende con una rampa; oltre, salta quando entra il beat nuovo
export const CICLI_RAMPA = 8; // quanti cicli dura la rampa (a ogni ciclo un gradino, mai più di un 1% alla volta)

// { tipo: 'niente' | 'rampa' | 'salto', rapporto } — rapporto = (nuovo − attuale) / attuale. `occupato`: sta già suonando qualcosa
// (altrimenti il brano nuovo porta il suo tempo e basta).
export function decidiTempo(bpmAttuale, bpmNuovo, occupato) {
  if (!occupato || !(bpmAttuale > 0) || !(bpmNuovo > 0)) return { tipo: 'niente', rapporto: 0 };
  const rapporto = (bpmNuovo - bpmAttuale) / bpmAttuale;
  if (Math.abs(bpmNuovo - bpmAttuale) <= 0.05) return { tipo: 'niente', rapporto: 0 };
  return { tipo: Math.abs(rapporto) <= SOGLIA_RAMPA ? 'rampa' : 'salto', rapporto };
}

// I gradini della rampa: [{ ciclo, cps }] dal ciclo `da` (primo gradino) in poi, l'ultimo arriva esattamente al tempo nuovo.
export function gradiniRampa(cps0, cps1, da, cicli = CICLI_RAMPA) {
  return Array.from({ length: cicli }, (_, i) => ({ ciclo: da + i, cps: cps0 + ((cps1 - cps0) * (i + 1)) / cicli }));
}

// Una clip è ritmica se in un ciclo ha almeno 4 colpi o ha una batteria: è quella che si sente cambiare davvero se il tempo salta.
// eventi: gli eventi compatti di un ciclo [[inizio, durata, nota (<0 = batteria), forza]].
export const eRitmica = (eventi) => (eventi ?? []).length >= 4 || (eventi ?? []).some((e) => e[2] < 0);

// I nomi delle clip rimaste che salterebbero: livelli = [{ id, nome }], eventiDi(id) → eventi di un ciclo.
export function clipRitmiche(livelli, eventiDi) {
  return livelli.filter((l) => eRitmica(eventiDi(l.id))).map((l) => l.nome);
}

const arrotonda = (x) => String(Math.round(x * 10) / 10);

// La riga che dice cosa succederà passando a un brano (si vede sotto le linguette): niente se il tempo è lo stesso.
export function testoPassaggio({ nome, bpmAttuale, bpmNuovo, occupato, ritmiche = [] }) {
  const d = decidiTempo(bpmAttuale, bpmNuovo, occupato);
  if (d.tipo === 'niente') return '';
  const da = `${arrotonda(bpmAttuale)} → ${arrotonda(bpmNuovo)} bpm`;
  const per = `${d.rapporto > 0 ? '+' : '−'}${arrotonda(Math.abs(d.rapporto) * 100)}%`;
  if (d.tipo === 'rampa') return `passando a «${nome}» il tempo ${d.rapporto > 0 ? 'sale' : 'scende'} con una rampa (${da}, ${per})`;
  const avviso = ritmiche.length ? ` · le clip ritmiche rimaste cambierebbero velocità: ${ritmiche.join(', ')}` : '';
  return `passando a «${nome}» il tempo salta (${da}, ${per})${avviso}`;
}

// Cosa mandare al motore quando il BEAT di un altro brano entra su un live che suona (passaggio fatto dai CANALI: THUMP con R o con PLAY).
// Il tempo lo decide decidiTempo come in passaBrano (rampa o salto); il beat vecchio esce col filtro della transizione, e `tieni` (tutti gli altri
// livelli) non esce da solo. `transizione` è già scelta ({ tipo, cicli }). Ritorna { tempo, rampa | null, togliTempo, dissolvenza, transizione }:
// con la rampa il brano nuovo non entra col suo setcpm (ci arriva la rampa), con il salto sì.
export function parametriPassaggio({ attuale, nuovo, transizione, tieni = [], rampaCicli = null }) {
  const tempo = decidiTempo(attuale, nuovo, true);
  const rampa = tempo.tipo === 'rampa' ? { bpm: nuovo, cicli: rampaCicli ?? (transizione.tipo === 'sweep' ? transizione.cicli : CICLI_RAMPA) } : null;
  return {
    tempo,
    rampa,
    togliTempo: rampa !== null,
    dissolvenza: { cicli: transizione.cicli, tipo: 'filtro', filtroUscita: 'hp' },
    transizione: perIlLive(transizione, tieni),
  };
}
