# Novità di CUTX

## 0.5.1-beta «CUTX_05_1» (15/11/2026)

Cinque cose nuove: i PROJ, la scheda DRUM, l'onda sotto la batteria, le mani (sperimentale) e qualche rifinitura. Dettaglio tasto per tasto in `docs/NOVITA-5.1.md`.

### PROJ
- **Un progetto per volta**: libreria, set e kit stanno in `PROJ/PROJ NN/` (brani, `set.cutx`, `kit.cutx`, `proj.json`); suoni, video, estensioni e `colpi.cutx` restano comuni a tutti. La libreria e il set di prima finiscono in PROJ 01 **copiati, non spostati**.
- **Schermata dei PROJ** all'avvio (e dal tasto **PROJ** in alto, che mostra «PROJ 03 · sottotitolo»): schede numerate con sottotitolo libero, «apri», «+ nuovo PROJ» (il kit si copia dall'ultimo aperto). Il numero è verde solo se da quel PROJ suona qualcosa nel live. Cambiare PROJ non ferma il live.
- Interruttore **«riapri l'ultimo PROJ»** nelle impostazioni.
- **«altri PROJ»** in libreria: copia di brani e di clip (→ brano, → kit) con la riga `// viene da PROJ 01 · nome`.

### DRUM
- Terza scheda della vista SYNTH (⌘2), accanto a «suono» e «note»: **griglia a passi** per la batteria. Righe = suoni dello stash e di Strudel; 16 o 32 passi; 1, 2 o 4 cicli; clic accende e spegne, trascinando su e giù cambia la velocity.
- **Scrive codice vero** (`stack(s("bd ~ …").gain(".8 ~ …"), …)`) e lo rilegge anche se lo scrivi a mano; quello che non sa leggere resta nel testo con un avviso, mai cancellato.
- ▶ cuffia a tempo col live con la testina, → CUE come clip segnata **· drum**, «drum» sulle card per riaprirla, annulla con ⌘Z.

### Onda
- Sotto il BEAT e le clip **· drum** la striscia delle note diventa un'**onda LED** del suono vero (radar fisso sul ciclo); un clic sulla striscia alterna onda e note. Sul proiettore segue il clic di ogni card, e c'è l'interruttore «onda sotto la batteria» nei testi per il pubblico.

### Mani (sperimentale, spente di serie)
- **M** accende, **⇧M** cambia modo: **FILTRO** (altezza = taglio, destra-sinistra = risonanza), **SPAZIO** (altezza = riverbero, dita aperte = eco), **CTX** (altezza = crush, destra-sinistra = distorsione).
- **Aggancio** (mano aperta e ferma ½ s), niente salto, mano persa = valore fermo 2 s poi neutro piano, **pugno = blocca**, zona disegnabile, la più grande delle mani dentro la zona.
- Sezione **MANI** nelle impostazioni; finestrella a sinistra; **sul proiettore la mano** (solo scheletro e valori, mai la camera) con interruttore tra i testi per il pubblico. Dettagli e numeri in `docs/MANI.md`.

### Rifiniture
- Card senza la striscia a sinistra: tutti i bordi uguali, selezione con un contorno; il verde solo su quello che suona live.
- Icona con gli angoli arrotondati e un bordo verde sottile.
- Il pulsante «apri» dei PROJ non salta più in alto quando lo premi.
- La prova automatica «passaggio» non è più ballerina; `solidita` è rossa solo se la MiniFuse non è collegata.

### Noti, per la 5.2
- DRUM: REC e tasti del Mac nella griglia, → CUE come scena del beat; controller a ruoli (X-Touch) e arpeggio (`docs/PROSSIMI.md`).
- Mani: non provato il permesso della camera dal `.dmg` installato; con la luce di una serata il riconoscimento può perdere la mano più spesso.

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
