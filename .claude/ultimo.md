# Ultimo stato - 16/11/2026
Fatto: ARPEGGIO passo 1: merge di `arpeggio-wip` in main; trovata la causa del "blocco" di `prova:parte -- synth`: errore di sintassi in prova.js (`haps` dichiarato due volte), l'app non caricava il file. Corretto, e un controllo del «caso» sbagliato nel test. Gruppo arpeggio ora largo (span 12).
Funziona: `prova:parte -- synth` 301 ok, 0 falliti. Non provato a orecchio da Valerio.
Non fatto: passo 2 (ottave, swing, accenti, umanizza), controller (mappa da approvare), CAOS, arpeggio dal vivo.
File toccati: src/main/prova.js, src/renderer/synth.css, docs/PROSSIMI.md, .claude/ultimo.md.
Prossimo passo: Valerio prova l'arpeggio nel SYNTH (⌘2, gruppo ARPEGGIO in fondo), poi passo 2.
