# Ultimo stato - 19/11/2026 (LAVORARE IN ~/Progetti/cutx-canali, ramo `canali` da v0.5.1-beta.4; main = beta 4 intatta)

## Obiettivo
Nuovo LIVE a canali (CH1…CH8): fase 1 parte B, poi FERMARSI e fare il rapporto a Valerio. Parte A (stato puro `src/renderer/canali.js`, 16 test) già fatta.

## Decisioni prese (non rimettere in discussione)
- Nomi: REGIA→NANO · SCALPELLO→X-TOUCH · PENNA→tastiera · corsia→CH · Banco→pagina CANALI · in canna→NEXT · ENTRA/ESCE/MUTO→GO/OUT/MUTE · ACQUA·ARIA→SWEEP · ARREMBAGGIO→GO ALL · CANAGLIA→FREE · in mano→FOCUS · TUTTO→MASTER · CUFFIA (tasto CYCLE)→CUE. Il file del PROJ è `canali.json`.
- Alternative della manopolina = SOLO clip del brano nel CUE (ordine di file; DRUM = scene @beat poi clip drum; FREE = tutte le clip, scene no). Il resto entra nel CH del suo tipo, o FREE se senza tipo. I colpi che creano livelli da soli sono fuori dai CH.
- Identità del livello = CH + nome. Dopo un crash l'interfaccia ricostruisce lo stato `canali` dal `ch` dei livelli del live.
- SYNTH: niente drum e perc (le clip drum nascono dal DRUM; perc lo dà Valerio dal menu del CUE). Una fonte sola in `categorie.js`: TIPI (8, per i CH) e CATEGORIE (6, SYNTH).
- L'ordine dei gruppi nel CUE segue l'ordine dei CH della pagina CANALI. Predefinito: drum, keys/arp, bass, lead, pad, perc, fx, poi senza tipo. Se cambia l'ordine dei CH, cambia il CUE.
- Test del SYNTH: adeguarli solo se contano i tipi; se per farli passare cambia cosa verificano, FERMARSI e dirlo.
- PROJ: definizioni in `canali.json` nella sua cartella (vince se c'è; PROJ nuovo = predefinito). Si cambiano solo a live fermo (acceso: sola lettura con scritta del perché).
- «Annulla» = `togli` su livello non ancora entrato (c'era già). Il motore lo scrivo io, mai Codex.

## Fatto
- c4cce66 passo 1: TIPI/CATEGORIE in categorie.js, canali.js importa TIPI. Test synth/canali/pacchetto verdi.
- b126097 passo 2: motore con `ch` (entra, descrivi, ripristino in app.js), sostituzione per CH+nome, prova `entrata` con 3 controlli nuovi (18 ok); `livelli`+`robustezza` 44 ok. `npm test` 505/506.
- Rete di sicurezza: backup in ~/Progetti/backup/cutx-stash-2026-11-19 (e -con-tipi); il ramo gira con dati separati («CUTX canali», CUTX-canali; blocco `CANALI` in main.js da togliere prima di un merge).

## Fatto (passo 3, 23/11/2026)
- Pagina «canali» nelle impostazioni (`impostazioni-canali.js`, sezione in index.html, testi in it.json `canali`): nome, colore, tipi a spunte, FREE, «torna al predefinito». Salva subito in `canali.json` del PROJ; a live acceso è sola lettura. Si ricarica a ogni cambio di PROJ.
- Nomi predefiniti: THUMP · PURR · GROWL · HOWL · FUR · CLAW · HISS · STRAY.
- Il CUE segue l'ordine dei CH (`gruppiClip(clip, ordine)` in categorie.js, `cue.ordineCh`); drum/perc ora hanno il loro gruppo.
- Test: canali+synth 64 ok. Foto `--foto` ora scatta anche `-impostazioni-canali.png`. NON lanciate le prove lunghe (`npm run prova`).

## Fatto (passo 4, 23/11/2026)
- Colori dei CH TOLTI (Valerio: «mi fanno cagare», vuole verde marcio, bianco, scritte). Solo verde = suona. Via `colore` da canali.js e dalla pagina.
- LIVE: vista «canali» (griglia `griglia.js`, 8 righe: SUONA/VUOTO, NEXT, GO/OUT/M, fader) e «pila» (vecchia) con interruttore in alto. Default canali. Stato in `statoCanali` (app.js), si risincronizza ogni 250 ms dai livelli del motore (`StatoCanali.sincronizza`).
- Ogni GO dal CUE entra nel CH del suo tipo (beat → THUMP, senza tipo/scratch/jam → FREE); `ch` mandato in goLive, muoviScena, passaBrano, jam. I colpi restano fuori dai CH.
- NANO: `nano.js` legge i CC di fabbrica (fader 0-7, manopole 16-23, S 32-39, M 48-55, R 64-71, PLAY 41; qualsiasi canale MIDI). R=GO, S=OUT (tenuto 1 s = subito), M=MUTE, manopola=NEXT, fader=volume CH, PLAY=GO ALL. NON provato con le mani su nano vero.
- LED del nano: NON si accendono (non risponde ai sysex). Serve l'Editor Korg: LED External, Momentary, un canale solo, Write Scene (Valerio, una volta).
- Prove: test 515/516 (resta il solo MOD noto); prova livelli+entrata+robustezza 62 ok, brani+browser+impostazioni 64 ok, entrata 19 ok (nuovo controllo FREE).

## Da fare
- X-TOUCH sui CH: NON fatto. Oggi l'X-Touch comanda i «posti» della pila (beat + 5 clip, manopola 1 = CUE, 8 = master). Va deciso con Valerio cosa vuol dire «scolpisce il CH in FOCUS» prima di toccarlo.
- Master: nano fader/manopola 8 = master o CH8? Oggi il fader 8 è il CH8. Da decidere.
- Provare il nano a mano; poi luci (dopo l'Editor Korg) e fase 3: passaggio da brano a brano canale per canale.
- OUT non rispetta ancora «entra tra» (esce al prossimo confine con la dissolvenza di uscita).
- Prima di un merge: togliere il blocco `CANALI` in main.js.

## File toccati
src/renderer/categorie.js, canali.js, motore.js (entra ~r.489-554, descrivi ~r.678), app.js (ripristino ~r.1434, cutxProva.richiestaLive), src/main/prova.js (provaEntrata, punto 3b).

## Provato e non funziona
- Prova annulla con entrata a 1 ciclo: troppo vicina, il confine passa prima del controllo. Usare cicli: 4.

## Note
- `test/controller-synth.test.js` (1 test, manopole MOD) fallisce già prima del ramo (verificato su 5efed97): non è dei CH, da guardare nel lavoro MOD.
- Prove sempre con volume al 20% e poi rimesso (il Mac era a 100).
- Fase 0 (piano B) ancora aperta: Valerio configura il nano col KORG Kontrol Editor (LED External, tasti Momentary, un canale globale, Write Scene); poi adattare `strumenti/midi-nano`. Il nano non risponde ai sysex.
- Domande aperte a Valerio: nessuna.
