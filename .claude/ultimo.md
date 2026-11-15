# Ultimo stato - 15/11/2026 (sera, dopo la prima prova coi cavi)

1. Fatto: i layer portano alla scheda (A = batteria: sequencer, di nuovo pad; B = synth: piano, di nuovo parametri). Luci più rapide (50 ms e subito dopo il tocco), la riga cliccata col mouse è anche quella del controller. Nuovo interruttore CASSE nella barra del SYNTH (la cuffia esce dall'uscita del live; spento all'avvio e uscendo dal SYNTH).
2. Funziona: test puri 429 ok; `prova:parte -- strumento` (nuova, 12 ok: layer, piano, pad, colpo, CASSE) e controller,drum,synth,cue-controller,specchio-aspetto (382 ok).
3. Non provato coi cavi/orecchie: luci vere sull'X-Touch (se ancora lente o sbagliate dirlo), CASSE con l'uscita vera delle casse (la prova non ha un'uscita separata), lampeggio dei layer.
4. File: `controller.js`, `drum-vista.js`, `synth-vista.js`, `motore.js` (`casse`, `drum-colpo`), `app.js`, `synth.css`, `drum.css`, `it.json`, `src/main/prova.js` (parte `strumento`), `test/controller.test.js`, `docs/CONTROLLER-5.2.md`.
5. Prossimo: Valerio riprova coi cavi; poi blocco 2 (REC e tasti del Mac nel DRUM, `docs/PROSSIMI.md`). Testi nuovi del controller ancora dentro `controller.js`.
