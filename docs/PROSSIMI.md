# Prossimi passi (decisi il 2/11/2026)

Si parte da qui quando sono finiti il blocco 1 e il blocco 2 del SYNTH (vedi `docs/SYNTH.md`).

## Principio degli aiuti

CUTX propone, io ascolto in cuffia, io decido. Mai cambi automatici nel live. Ogni proposta è un piccolo segnale sulla card (accetta/ignora con un tocco), mai sul proiettore, tutti disattivabili nelle impostazioni.

## Dopo il blocco 2 del SYNTH, in quest'ordine

1. **Modalità SERATA** (Impostazioni, più spia SERATA nella barra in alto, verde fisso quando è accesa):
   - il Mac non va in stop e lo schermo non si spegne; notifiche zittite se possibile;
   - ⌘Q e chiusura della finestra chiedono conferma; impostazioni e modifica degli script bloccate;
   - controllo all'avvio: scheda audio, cuffia, controller in MC, stash (o copia), schermo del proiettore. Tutto verde o dice cosa manca.
2. **Riprendi da dove eri**: lo stato del live (livelli, codice, code, volumi, BPM, brano attivo e prossimo, scena) si salva ogni pochi secondi. Dopo un crash o una chiusura per sbaglio, al riavvio: «riprendi il set?» e riparte uguale, quantizzato.
3. **Sidechain («pompa»)**: verificare se superdough supporta il ducking tra orbite (`duckorbit` / `duckattack` / `duckdepth` o simili) e come. Ogni livello ha già la sua orbita: la cassa del BEAT abbassa le clip scelte a ogni colpo. Manopola «pompa» in pagina B per livello, riga visibile nella coda, e un colpo «pompa» da tenere premuto su tutto. Se superdough non lo fa, proporre come farlo nel motore.
4. **Transizioni pronte** per «passa al prossimo brano» (tasto 3 tenuto): taglio (il vecchio si ferma sull'1, il nuovo entra sull'1 dopo), filtro (il vecchio si chiude, il nuovo si apre, 4 o 8 cicli), break (il vecchio alla sua scena break, riser, il nuovo droppa), eco (il vecchio lanciato nell'eco). Tutte scritte in codice visibile, con il cambio di BPM fatto dentro la durata della transizione. Nel `set.cutx` si scrive la transizione di ogni passaggio (es. `brano_2.cutx · transizione filtro 8`); predefinita «filtro 8».

## Poi pausa

Valerio suona per un paio di settimane.

## Dopo la pausa (aiuti)

- **Tonalità**: `// @tonalita` nel brano; per le clip si deduce da scala/note. Se una clip è in un'altra tonalità: «Re min → La min?», preview in cuffia, accetta. Cambio visibile nel codice. Mai sulle batterie.
- **BPM delle clip audio**: «porta a tempo» con preview (dicendo che cambia l'altezza).
- **Due bassi insieme** (dalla striscia viva): «abbasso il vecchio?».
- **Volume d'ingresso**: una clip molto più forte delle altre entra al livello giusto.
