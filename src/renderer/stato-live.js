// Lo stato del live letto dalla lista dei livelli, senza schermo e senza audio (così si prova con test puri).
// I livelli sono come arrivano dal motore live: { id, nome, da, a, beat, … } con `da` = ciclo d'ingresso (null: da sempre)
// e `a` = ciclo d'uscita (null: resta).
import { eNomeBeat } from './nomi.js';

export const suona = (l, ciclo) => (l.a === null || l.a > ciclo) && (l.da === null || l.da <= ciclo);
export const inArrivo = (l, ciclo) => l.a === null && l.da !== null && l.da > ciclo;
export const inUscita = (l, ciclo) => l.a !== null && l.a > ciclo && (l.da === null || l.da <= ciclo);

// Il beat live: quello che suona (anche mentre sta uscendo) e quello che sta per entrare, se un cambio di scena aspetta.
// Conta solo un beat con le sue scene (l.beat): ◀ ▶ e il passaggio di brano lavorano su quelle.
export function statoBeat(livelli, ciclo) {
  const tutte = livelli.filter((l) => eNomeBeat(l.nome) && l.beat);
  return { suona: tutte.filter((l) => suona(l, ciclo)).at(-1) ?? null, pendente: tutte.filter((l) => inArrivo(l, ciclo)).at(-1) ?? null };
}

// C'è una base nel live, o sta arrivando? (qui basta il nome: anche un beat senza scene è una base che suona)
export const beatPresente = (livelli, ciclo) => livelli.some((l) => eNomeBeat(l.nome) && (inArrivo(l, ciclo) || (l.a === null && suona(l, ciclo))));

// GO LIVE su una clip di un brano che ha un beat, mentre nessun beat suona né sta arrivando: la base non partirà da sola, e va detto.
// pezzo: quello che sto mandando ({ nome, beat }); sceneDelBrano: quante scene ha il beat del brano in vista.
export function mancaIlBeat({ pezzo, sceneDelBrano, livelli, ciclo }) {
  if (!pezzo || pezzo.beat || eNomeBeat(pezzo.nome) || pezzo.nome === 'apertura') return false;
  if (!(sceneDelBrano > 0)) return false;
  return !beatPresente(livelli, ciclo);
}

// Un pezzo senza niente da suonare: solo spazi e commenti. Mandato live entrerebbe come silenzio al posto di quello che suona.
export function codiceVuoto(testo) {
  return !String(testo ?? '')
    .split('\n')
    .some((riga) => riga.trim() && !riga.trim().startsWith('//'));
}

// Il livello che un «togli» senza bersaglio toglie: l'ultimo entrato fra quelli che restano.
export const ultimoEntrato = (livelli) => livelli.filter((l) => l.a === null).at(-1) ?? null;
