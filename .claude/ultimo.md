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

## Da fare (parte B, poi FERMARSI)
3. Pagina CANALI nelle impostazioni: 8 righe (nome libero, colore, tipi a spunte, una FREE, «torna al predefinito»), `canali.json` nel PROJ. Prima del codice: piano a Valerio e 2-3 nomi per le voci visibili. Parole in `testi/it.json`.
   - Qui sistemare anche `gruppiClip`/`categoriaDi` in categorie.js: oggi usano CATEGORIE (6), quindi una clip `perc`/`drum` nel CUE finisce tra i senza tipo. Deve usare TIPI e l'ordine dei CH.
4. Griglia LIVE col mouse (8 colonne × alternative del brano nel CUE; suona, NEXT, countdown, fader «non letto», mute, vecchia). Il LIVE di oggi è `src/renderer/pila.js` (588 righe). GO deve mandare `ch`; ricostruire `canali` da `ch` dei livelli (stato-live.js, app.js ~347/383/451).
5. X-TOUCH con la mappa di oggi sui CH. Poi test + prova + rapporto (cosa funziona/no/rischia/cosa provare + tabella regola→file→test). Fermarsi.

## File toccati
src/renderer/categorie.js, canali.js, motore.js (entra ~r.489-554, descrivi ~r.678), app.js (ripristino ~r.1434, cutxProva.richiestaLive), src/main/prova.js (provaEntrata, punto 3b).

## Provato e non funziona
- Prova annulla con entrata a 1 ciclo: troppo vicina, il confine passa prima del controllo. Usare cicli: 4.

## Note
- `test/controller-synth.test.js` (1 test, manopole MOD) fallisce già prima del ramo (verificato su 5efed97): non è dei CH, da guardare nel lavoro MOD.
- Prove sempre con volume al 20% e poi rimesso (il Mac era a 100).
- Fase 0 (piano B) ancora aperta: Valerio configura il nano col KORG Kontrol Editor (LED External, tasti Momentary, un canale globale, Write Scene); poi adattare `strumenti/midi-nano`. Il nano non risponde ai sysex.
- Domande aperte a Valerio: nessuna.
