# Ultimo stato - 16/11/2026
Fatto: (1) fader filtro: il filtro proprio del livello fa da tetto/pavimento (`limitaGlobali` in coda.js, usato in motore.js); (2) cimice: slider intensità e crescita nel set, dispetto sempre udibile all'entrata (`forzaDispetti`); (3) finale HACK: silenzio 4,5 s, cimici se ne vanno, poi nero con TECNOLOGIA CANAGLIA.
Funziona: test puri (cimice, coda, controller) e `prova:parte -- cimice` 36 ok. Non provato dal vivo da Valerio (orecchio): intensità, crescita, ordine del finale.
Non fatto: ARPEGGIO (piano approvato: 1 merge `arpeggio-wip` + capire perché `prova:parte -- synth` si blocca >10 min + prova nell'app; 2 ottave, swing, accenti, umanizza; 3 CAOS e lettura codice → pannello; 4 dal vivo coi tasti, dopo MiniLab).
File toccati: src/renderer/coda.js, motore.js, app.js, uscita.js, impostazioni.js, testi/it.json, src/main/preferenze.js, src/cimice/{dispetti,dispetti-app,hack-app,cimice,aggancio}.js, test e prova-cimice.js, docs/CIMICE*.md.
Prossimo passo: ARPEGGIO passo 1 (sessione pulita).
