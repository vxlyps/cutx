# Ultimo stato - 15/11/2026 (sera, dopo il blocco 2)

1. Fatto: blocco 2 = nella scheda DRUM i tasti del Mac suonano le righe (A S D F G H J K, poi Q W E R T Y U I) e il pulsante REC registra i colpi (tasti del Mac e pad X-Touch) come passi, a tempo col live (conteggio, giro, quantizzato al passo, ⌘Z annulla). Release 0.5.1-beta.2 «CUTX_05_1_2» già pubblicata prima di questo blocco.
2. Funziona: 472 test puri (6 nuovi in `test/drum-rec.test.js`); prove nell'app vera `strumento,drum` (46 ok, con tasto del Mac e REC) e `synth,controller,cue-controller` (350 ok).
3. Non provato a mano: REC con le orecchie (sfasamento dei colpi rispetto al click: la latenza della cuffia non è compensata, come nel REC del SYNTH).
4. File: `drum-rec.js` (nuovo), `drum-vista.js`, `synth-vista.js`, `drum.css`, `testi/it.json`, `src/main/prova.js`, `CHANGELOG.md`, `docs/PROSSIMI.md`. Non è in nessuna release (serve una 5.1.3 se Valerio vuole il .dmg).
5. Prossimo: Valerio prova tutto col programma vero. Poi, in ordine: synth al volo + aggiorna, → CUE come scena del beat, arpeggio (solo testo) (`docs/PROSSIMI.md`).
