# Ultimo stato - 15/11/2026 (sera, dopo «→ CUE come scena del beat»)

1. Fatto: nel DRUM il menu di «→ CUE» ha due voci nuove, «attivo · beat» e «prossimo · beat»: la griglia diventa una scena in fondo al @beat del brano (il beat nasce se manca; nome unico: colpi, colpi 2). Scritto da me (poche righe, decisioni di design).
2. Funziona: 478 test puri; prova nell'app vera `drum,aggiorna` (42 ok). Il live non cambia, ⌘Z come per le clip. Il SYNTH manda ancora solo clip.
3. Non provato a mano: guardare la scena appena creata nel CUE (pillola nel beat) e mandarla in live.
4. File: `cue.js` (aggiungiScena), `app.js` (destinazioniBeat, mandaBeat), `drum-vista.js`, `it.json`, `prova.js` (parte `drum`), `docs/PROSSIMI.md`.
5. Prossimo: (3) valutazione arpeggio (solo testo); (4) beta.3 (CHANGELOG, NOVITA-5.1.3, prova completa, pacchetto, merge, tag, release: il merge lo fa Valerio).
