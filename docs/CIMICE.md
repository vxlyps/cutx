# CIMICE

Una creatura di linee e nodi che cammina sul codice **sul proiettore** (la finestra dell'uscita per il pubblico), mai nell'interfaccia di lavoro. **Solo visiva**: non tocca mai il codice, il set, l'audio, la selezione o il cursore. Idea di @rybinfx (la firma «idea by @rybinfx» compare sempre ed è obbligatoria).

## Dove sta
- `src/cimice/corpo.js` geometria e movimento (testa, 5 vertebre, **7 zampe**: 3 a sinistra e 4 a destra, non equilibrato apposta; 2 antenne a segmenti dritti). Niente schermo: si prova con `test/cimice.test.js`.
- `src/cimice/disegno.js` il disegno sul canvas. `src/cimice/cimice.js` il canvas (uno solo, `pointer-events: none`, un solo `requestAnimationFrame`), le impostazioni, la decisione a ogni battuta. Se qualcosa va storto si spegne in silenzio.
- `src/cimice/sensore.js` (puro, `test/cimice-sensore.test.js`): variazione e drop. `src/cimice/dom.js`: legge le parole e le note evidenziate dalla pagina, senza toccarla. `src/cimice/aggancio.js`: l'unico file che conosce il resto; lo usa `uscita.js` (una riga di `tic`, una di `ricarica`).
- `src/main/prova-cimice.js`: `npm run prova:parte -- cimice` (master a zero; foto in `~/Desktop/cutx-schermate/cimice`).
- `src/cimice/demo.html`: parole finte, `npx vite src/cimice --port 5199`.

## Cosa legge (dati veri, non l'audio)
- Livelli live: chi suona, volume, quante note per battuta (dal pattern, come l'evidenziatore).
- **Variazione**: un livello entra o esce, cambia la scena del beat, l'energia cambia più del 25%. Entra con una probabilità e solo dopo il tempo minimo.
- **Drop** (sempre entra, impazzisce N battute): la cassa o il basso tornano di colpo dopo almeno 2 battute senza (soglia con la sensibilità); la scena del beat si chiama `drop`; il fader si riapre di scatto (letto dalle righe globali `all(x => …)`, perché il proiettore non ha il controller).
- Le note che suonano sono quelle già evidenziate dal proiettore: le antenne toccano solo quelle.

## Impostazioni (sezione CIMICE · sul proiettore)
Attiva, quanto spesso (di rado / ogni tanto / spesso) con pausa minima e probabilità, quante battute resta (min-max), impazzisce sul drop e per quante battute, sensibilità del drop, grandezza, velocità degli scatti, lampi rossi, corrompe le parole, schermo che trema. Salvate come le altre in `preferenze.cimice`.

## Limiti noti
- Il «tremito» sposta solo il disegno della cimice, non le finestre.
- La grandezza si adatta da sola alla grandezza del testo (sul proiettore il codice è enorme).
- Non c'è un «fader del drop» a sé: vale qualunque effetto del fader che si riapre di scatto.
