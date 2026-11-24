# CUTX · ultimo (24/11/2026) — CHIUSURA 0.6.0-beta.1 «CUTX_06 · CANALI»
1. Fatto: A1 SWEEP rispetta il filtro della clip (limitaRigaMani, anche in eredità), A2 l'X-Touch non sceglie mai, A3 senza nano = beta 4, A4 gruppo MOD sull'X-Touch del SYNTH (tasto 6), A5 revisione logica + correzioni (cavo nano, manopole MANI al neutro, STOP riarma, ⌘Z pulito, selezione righe dopo il menu). STOP annulla anche le scelte; STOP tenuto 1,5 s con carica.
2. Funziona: npm test 586/586; npm run prova superata; serata 30 ok ×2; giro lungo: restano solo i falli dovuti alla macchina (MiniFuse, cattura schermo) come su main. Le prove vecchie ora partono come la beta 4 (nano ignorato, vista pila).
3. Non va / nota: il nano vero è collegato alla macchina di prova (nanoVistoForza(false) per le parti vecchie).
4. File: controller*.js, coda.js, canali.js, nano.js, app.js, cue.js, editor.js, prova.js, docs/NOVITA-6.0.md, CHANGELOG, README, PROSSIMI.
5. Prossimo: merge in main (B2), versione 0.6.0-beta.1, test su main, .dmg, prova app impacchettata col MIDI (B5), release pre-release (B6).
