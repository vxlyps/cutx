# Prossimi passi (decisi il 2/11/2026)

Si parte da qui quando sono finiti il blocco 1 e il blocco 2 del SYNTH (vedi `docs/SYNTH.md`).

## Regola per tutto il lavoro

Tutte le parole dell'interfaccia (etichette, pulsanti, avvisi, nomi di moduli e funzioni) stanno in un unico file di testi (`src/renderer/testi/it.json`), così si possono rinominare quando si vuole, come i testi per il pubblico. Nomi brevi, puliti, stile Ableton; niente frasi da chatbot nei messaggi a schermo. Vale per le parti nuove (SYNTH compreso); le parole già esistenti si spostano lì in un momento tranquillo.

## Principio degli ASSIST

CUTX propone, io ascolto in cuffia, io decido. Mai cambi automatici nel live. Ogni proposta è un piccolo segnale sulla card (accetta/ignora con un tocco), mai sul proiettore. Tutti gli ASSIST sono un gruppo nelle impostazioni, disattivabili uno per uno.

## Dopo il blocco 2 del SYNTH, in quest'ordine

1. **SHOW** (Impostazioni, più spia «SHOW» nella barra in alto, verde fisso quando è accesa):
   - il Mac non va in stop e lo schermo non si spegne; notifiche zittite se possibile;
   - ⌘Q e chiusura della finestra chiedono conferma; impostazioni e modifica degli script bloccate;
   - controllo all'avvio: scheda audio, cuffia, controller in MC, stash (o copia), schermo del proiettore. Tutto verde o dice cosa manca.
2. **RECOVER**: lo stato del live (livelli, codice, code, volumi, BPM, brano attivo e prossimo, scena) si salva ogni pochi secondi. Dopo un crash o una chiusura per sbaglio, all'avvio: «recover set?» e riparte uguale, quantizzato.
3. **SIDECHAIN** e **DUCK**: verificare se superdough supporta il ducking tra orbite (`duckorbit` / `duckattack` / `duckdepth` o simili) e come. Ogni livello ha già la sua orbita: la cassa del BEAT abbassa le clip scelte a ogni colpo. Manopola SIDECHAIN in pagina B per livello, riga visibile nella coda, e un colpo DUCK da tenere premuto su tutto. Se superdough non lo fa, proporre come farlo nel motore.
4. **Transizioni pronte** per «passa al prossimo brano» (tasto 3 tenuto): **CUT** (il vecchio si ferma sull'1, il nuovo entra sull'1 dopo), **SWEEP** (il vecchio si chiude, il nuovo si apre, 4 o 8 cicli), **BREAKDOWN** (il vecchio alla sua scena break, riser, il nuovo droppa), **ECHO OUT** (il vecchio lanciato nell'eco). Tutte scritte in codice visibile, con il cambio di BPM fatto dentro la durata della transizione. Nel `set.cutx` si scrive la transizione di ogni passaggio (es. `brano_2.cutx · transizione sweep 8`); predefinita `sweep 8`.

## Poi pausa

Valerio suona per un paio di settimane.

## Dopo la pausa (ASSIST)

- **Tonalità**: `// @tonalita` nel brano; per le clip si deduce da scala/note. Se una clip è in un'altra tonalità: «Re min → La min?», preview in cuffia, accetta. Cambio visibile nel codice. Mai sulle batterie.
- **WARP**: porta a tempo le clip audio, con preview (dicendo che cambia l'altezza).
- **BASS CLASH**: due bassi insieme (dalla striscia viva): «abbasso il vecchio?».
- **AUTO GAIN**: una clip molto più forte delle altre entra al livello giusto (volume d'ingresso).
