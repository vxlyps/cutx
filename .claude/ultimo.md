# Ultimo stato - 15/11/2026 (sera, dopo il passo 2 del blocco C)

1. Fatto: l'X-Touch è collegato ai ruoli. SYNTH + layer A/B scelgono il ruolo (DRUM: A sequencer, B pad; suono/note: A parametri, B piano). Nel DRUM e nel PIANO niente paracadute dal controller; fader e manopola 8 restano del LIVE.
2. Funziona: 7 test nuovi in `test/controller.test.js` (46 ok) e `prova:parte -- controller,drum` (71 ok, volume al 20% e rimesso). Colpo del pad = nuovo messaggio `drum-colpo` al motore cuffia (`motore.js`).
3. Non provato coi cavi veri: luci e lampeggio della testina, pad in cuffia (primo colpo di un campione può tardare), piano, riga evidenziata a schermo.
4. File: `controller.js`, `drum-vista.js` (+`perControllo`), `synth-vista.js` (+`notaControllo`, `perControllo`), `motore.js` (+`colpoDrum`), `app.js` (+`colpo`), `drum.css` (riga scelta), `test/controller.test.js`.
5. Prossimo: prova coi cavi (lista data a Valerio); poi blocco 2: REC e tasti del Mac nel DRUM (`docs/PROSSIMI.md`). Testi nuovi del controller scritti dentro `controller.js` come quelli di prima, da spostare in `it.json` con gli altri.
