# Novità di CUTX

## 0.5.0-beta.5 «CUTX_05» (14/11/2026)

Beta del check-up: niente funzioni grosse nuove, il live più affidabile.

### Il live
- **Togliere come su un mixer**: ogni livello tiene la sua manopola (②–⑦) finché non è sparito, anche mentre esce; gli altri non scalano. La card che esce resta al suo posto con «ESCE» e il conto alla rovescia (un clic sulla card la tiene). Il tasto togli e ⇧⌘⌫ valgono solo per il livello scelto; una seconda pressione non annulla.
- **«Entra tra» torna a 1** dopo ogni GO LIVE, cambio di scena e passaggio di brano. Quando non è a 1 resta in ambra.
- **Avvio della base**: il live carica in anticipo i campioni di quello che provi in cuffia, della voce scelta e del beat dei due brani del CUE (il primo colpo c'è); la scena nuova del beat non eredita il muto; accanto a GO LIVE si legge sempre cosa parte e quando.
- Dopo «ferma tutto» il beat del prossimo brano entra subito, senza la transizione di 8 cicli.
- **Volume d'ingresso** anche sulle scene del beat (scritto in `// @scena`, come per le clip), sull'apertura e sullo scratch (lì non si salva).
- Avviso «va live senza il BEAT», con la card BEAT che resta in ambra.

### CUE e controller
- **Manopola 1**: il BEAT resta in vista in cima alla lista, la voce scelta ha margine sopra e sotto e si legge da lontano (anche la scena del beat). Il cursore di testo non si riprende più la scelta.
- X-Touch: modalità MC richiesta a ogni ricollegamento, tasti tenuti rilasciati se il controller sparisce, luci e volume generale riallineati.
- Le scritte «a fine frase» ora dicono «a fine ciclo».

### Solidità
- Un errore imprevisto in un motore, in un comando o nel proiettore non ferma il resto, e si legge nel CUE.
- Salvataggi sicuri (file provvisorio e poi rinomina); un `stash.json` rovinato non viene sovrascritto.
- **Stash**: se il disco sparisce mentre suoni compare la fascia «stash non collegato», il live continua con uscita, offset e suoni di prima, e quando il disco torna riprende da solo.
- **Scheda audio**: se sparisce si suona sull'uscita predefinita; quando torna si riprende, con una dissolvenza corta al cambio (niente schiocco).
- Proiettore staccato: la finestra si chiude e torna da sola.

### Noti, da sistemare nella 5.1
- Quattro prove automatiche rosse: `solidita` (dopo un crash dell'interfaccia il testo del CUE torna ma manca la scritta che lo dice), `strudel` (vuole una cartella di suoni non data nel giro completo), `linguette` e `finestra` (falliscono in coda al giro lungo, passano da sole).
- Non provato coi cavi: proiettore, SSD vero con stem grossi (vedi `docs/PROVE-BETA5.md`).
- La scheda DRUM (griglia a passi per la batteria) arriva nella 5.1.

## 0.4.0-beta.4 «CUTX_04» (4/11/2026)

CUTX SYNTH (vista ⌘2), A/B, init, MUTATE, → CUE, pianoroll, X-Touch nel SYNTH. Dettagli nelle note della release su GitHub.
