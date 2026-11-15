# Ultimo stato - 15/11/2026 (sera, dopo «synth al volo»)

1. Fatto: «synth al volo». Pulsante synth/drum su ogni clip (CUE e LIVE) che il pannello riscrive uguale, anche scritta a mano; «aggiorna «nome»» nella barra del SYNTH e del DRUM riscrive la clip dov'è (CUE con ⌘Z, kit senza), il live non cambia. Scritto da me perché c'erano decisioni di design.
2. Funziona: 478 test puri; prova nell'app vera `aggiorna,drum,synth` (332 ok); foto guardata. Il pulsante non compare dove il giro cambierebbe il suono (es. `s("bd*4")`).
3. Non provato a mano: «aggiorna» da un livello LIVE (provenienza `brano §N`) e dal kit; nella finestra stretta la barra del SYNTH va a capo (→ CUE sotto).
4. File: `apri-tipo.js` (nuovo), `apri-clip.js`, `cue.js` (origineDi, aggiornaClip), `set-vista.js` (aggiornaClipKit), `app.js`, `pila.js`, `synth-vista.js`, `drum-vista.js`, `it.json`, `prova.js` (parte `aggiorna`), `test/apri-tipo.test.js`.
5. Prossimo: (2) → CUE come scena del beat (guarda `@beat` in `brano.js`); (3) valutazione arpeggio (solo testo); (4) beta.3 (CHANGELOG, NOVITA-5.1.3, prova completa, pacchetto, merge, tag, release). Il pulsante dice «synth»: Valerio ha scelto così, niente nomi nuovi.
