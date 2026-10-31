// L'apertura fantasma: il codice dell'apertura (scritto a casa) compare in grigio sotto quello che scrivo io; scrivendo, i caratteri che
// coincidono diventano miei. Modulo puro: lo provano i test. (Il disegno dentro l'editor è in fantasma-cm.js.)

const FINESTRA = 40; // quanto in là nel fantasma si cerca un carattere diverso da quello atteso, per riallinearsi
const spazio = (c) => /\s/.test(c);

// Quanti caratteri del fantasma sono già «scritti» da quello che ho scritto io. Gli spazi e gli a capo contano poco (l'indentazione è mia);
// un carattere diverso fa cercare lo stesso carattere poco più avanti nel fantasma (se non c'è, il carattere è in più e il fantasma resta dov'è).
export function allinea(scritto, fantasma) {
  let g = 0;
  for (const c of scritto) {
    if (spazio(c)) {
      if (g < fantasma.length && spazio(fantasma[g])) g++;
      continue;
    }
    while (g < fantasma.length && spazio(fantasma[g])) g++;
    if (fantasma[g] === c) {
      g++;
      continue;
    }
    const j = fantasma.indexOf(c, g);
    if (j >= 0 && j - g <= FINESTRA) g = j + 1;
  }
  return g;
}

// Quello che resta da scrivere.
export const resto = (scritto, fantasma) => fantasma.slice(allinea(scritto, fantasma));

// Tab: la parola successiva del fantasma (con gli spazi che la precedono): una parola, o una serie di segni di punteggiatura.
export function parolaSuccessiva(rimasto) {
  return /^\s*(?:\w+|[^\w\s]+)/.exec(rimasto)?.[0] ?? '';
}

// Tab tenuto: fino a fine riga (se il fantasma riparte da un a capo, l'intera riga dopo).
export function rigaSuccessiva(rimasto) {
  return /^\s*[^\n]*/.exec(rimasto)?.[0] ?? '';
}
