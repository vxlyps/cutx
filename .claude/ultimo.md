# Ultimo stato - 16/11/2026
Fatto: ARPEGGIO passo 2: nel gruppo arpeggio ottave (1-3), swing, accenti (ogni 2/3/4), umanizza (tempo e forza). Codice una riga per voce dopo `.arpWith`, lettura inversa dal codice. `cutxHaps` ora scarta i pezzi senza attacco (come il player).
Funziona: test puri ok, `prova:parte -- synth` 305 ok, 0 falliti. Non provato a orecchio da Valerio (né il passo 1 né il 2).
Non fatto: controller (mappa da approvare), CAOS, arpeggio dal vivo da tasti tenuti, foto del gruppo ARPEGGIO (sta sotto il bordo della finestra).
File toccati: src/renderer/synth-codice.js, synth-modello.js, testi/it.json, motore.js (solo cutxHaps), src/main/prova.js, test/synth.test.js, docs/PROSSIMI.md.
Prossimo passo: Valerio prova l'arpeggio (⌘2, gruppo ARPEGGIO); poi passo 3: CAOS e lettura codice → pannello.
