# Ultimo stato - 17/11/2026
Fatto: tasto CASSE nella scheda DRUM (stesso interruttore del SYNTH); pulsante «synth» su OGNI clip (codice libero: si apre con avviso, senza «aggiorna», solo → CUE come clip nuova); specchietto animato (onda che scorre, filtro mosso dagli LFO a tempo col live). Beta 0.5.1-beta.4 «CUTX_05_1_4» pubblicata.
Funziona: test puri 489/490; prove synth+drum 350 ok, aggiorna 9 ok (da sole).
Non funziona: test `controller-synth` (le manopole MOD non hanno un posto sul controller: da fare). Giro lungo: 58 falli, in gran parte ambiente (MiniFuse scollegata) e interferenza nota aggiorna→synth (c'era già prima).
File toccati: drum-vista.js, synth-vista.js, synth-scope.js, apri-tipo.js, app.js, testi/it.json, prova.js, test (apri-tipo, synth), CHANGELOG, docs/NOVITA-5.1.4.md, package.json/lock.
Prossimo passo: Valerio prova la beta.4; poi MOD sul controller (mappa da approvare) e tastiera MIDI.
