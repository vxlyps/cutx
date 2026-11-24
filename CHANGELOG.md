# Novità di CUTX

## 0.6.0-beta.1 «CUTX_06 · CANALI» (24/11/2026)

Il LIVE a **8 canali fissi** (CH1 THUMP … CH8 STRAY), il **nanoKONTROL2 come regia**, l'**X-Touch Mini MANI**. Come provarli: `docs/NOVITA-6.0.md`; la pagina da stampare: `docs/CANALI.md`.

- **Canali fissi**, mappa unica nello stash; una clip senza tipo sta in «DA ASSEGNARE» e chiede il canale; tipo `stray` per il CH8.
- **Nano**: manopola = NEXT, R, PLAY sullo stesso ciclo, STOP (annulla attese e scelte; tenuto 1,5 s = paracadute), S tenuto = cuffia, M, fader, TRACK, SET, MARKER, CYCLE, REC.
- **Un volume solo** per canale (fader, griglia, card); la cuffia suona clip × canale.
- **X-Touch MANI**: FOCUS sul canale, SWEEP (rispetta il filtro della clip), risonanza, eco, riverbero, velocità, sporco, altezza; layer B su tutto; le clip nuove ereditano le righe. SYNTH: gruppo MOD sull'X-Touch.
- **Cambia dalla beta 4**: una clip senza tipo non entra da sola; la vista di partenza del LIVE è la griglia; senza nano tutto come prima.

## 0.5.1-beta.4 «CUTX_05_1_4» (17/11/2026)

ARPEGGIO e MOD nel SYNTH, specchietto animato, **CASSE nella scheda DRUM**, pulsante **synth su ogni clip**. Come provarli: `docs/NOVITA-5.1.4.md`.

- **«synth» su ogni clip** (CUE e LIVE), anche scritta a mano. Se il pannello non la riscrive uguale si apre lo stesso, con un avviso, senza «aggiorna» (solo → CUE come clip nuova): la clip originale non si tocca.
- **DRUM: tasto CASSE** (stesso interruttore del SYNTH): la griglia, i tasti e il REC suonano dalle casse.
- **Specchietto animato**: la forma d'onda scorre, la curva del filtro segue gli LFO a tempo col live.
- **ARPEGGIO** (modi, ottave, swing, accenti, POLY, CHANCE, JUMP, ROTATE, RETRIG, fino a 1/64 e terzine) e **MOD** (due LFO).
- Barra e schede ferme tra suono, note e drum; CLEAR svuota anche il codice; ottave fino a 5.
- Fader del filtro: il filtro del livello fa da tetto/pavimento. Cimice: intensità e crescita regolabili, HACK con scena finale.

## 0.5.1-beta.3 «CUTX_05_1_3» (15/11/2026)

Nella scheda DRUM i tasti del Mac suonano le righe e c'è il REC; il pulsante **synth/drum** su ogni clip che si riscrive uguale; «→ CUE» anche come scena del beat. Come provarli: `docs/NOVITA-5.1.3.md`.

### DRUM: tasti del Mac e REC
- **Una riga per tasto**: A S D F G H J K suonano le prime otto righe, Q W E R T Y U I le altre otto (la lettera è scritta accanto alla riga). Suonano in cuffia.
- **REC** nella barra della scheda DRUM: una battuta di conteggio con il click, poi un giro (quanti cicli ha la griglia) a tempo col live. I colpi (tasti del Mac e pad dell'X-Touch) diventano passi, al più vicino; i passi già accesi restano. Un altro clic ferma; ⌘Z annulla tutto il giro.

### Synth al volo
- Su ogni clip che il pannello può **riscrivere uguale** compare il pulsante **synth** (o **drum**): la apre nel pannello. Con la sua riga `// @synth` / `// @drum` sempre; scritta a mano solo se il giro codice → pannello → codice non cambia il suono (un `s("bd*4").gain(.5)` diventerebbe un triangle: lì il pulsante non c'è).
- **«aggiorna «nome»»** riscrive la clip dov'è (nel CUE ⌘Z la rifà; nel kit niente ⌘Z) e **non tocca il live**.
- Un livello live risale alla sua clip dalla provenienza (`brano §N`, `kit §N`). Scratch, browser e Ableton non hanno origine: restano solo «→ CUE come clip nuova».

### DRUM → CUE come scena del beat
- «→ CUE» dalla scheda DRUM può mettere il pattern anche come **scena del beat** («attivo · beat», «prossimo · beat»), oltre che come clip.

### Una sola linea (da 0.5.1-beta.3)
- Tutto il lavoro (PROJ, DRUM, mani, X-Touch, **cimice**) sta in un solo ramo, `main`. Per lavorare in parallelo si usa una cartella a parte (`git worktree`), mai due sessioni sulla stessa cartella. L'arpeggio incompleto è nel ramo `arpeggio-wip` e non è in questa versione.

## 0.5.1-beta.2 «CUTX_05_1_2» (15/11/2026)

L'X-Touch Mini diventa uno **strumento** nel SYNTH, più l'interruttore **CASSE**. Come provarlo: `docs/NOVITA-5.1.2.md`.

### X-Touch come strumento (layer A / B)
- **Layer A = batteria**: lo schermo passa alla scheda DRUM e i 16 tasti sono il **sequencer** (un tocco = passo acceso/spento, la luce corre sui passi; manopola 1 = riga, 2 = suono; passo tenuto + manopola 1 = velocity; spinta della manopola 3 = pagina 17–32). Premuto di nuovo: **pad** (ogni tasto suona la sua riga in cuffia).
- **Layer B = synth**: lo schermo passa all'ultima scheda suono/note e i tasti sono il **piano** (bianchi in basso, neri in alto; manopola 1 = ottava; le manopole 2–7 restano i parametri). Premuto di nuovo: **parametri** (tasti in alto = gruppi, come prima).
- Nel DRUM e nel piano niente paracadute dal controller (resta nel LIVE). Fader e volume generale restano sempre del LIVE.
- La riga cliccata col mouse nella griglia è anche quella del controller; luci aggiornate subito e ogni 50 ms mentre suona il sequencer.

### CASSE
- Nuovo interruttore nella barra del SYNTH: il suono del SYNTH (▶, tasti del Mac, piano e pad) esce dall'uscita del live invece che in cuffia. Si somma al live. Parte spento e si spegne da solo uscendo dal SYNTH. Cambia solo il motore cuffia, il live non si tocca.

## 0.5.1-beta.1 «CUTX_05_1_1» (15/11/2026)

Una cosa sola, ma grossa: la **CIMICE**, una creatura di linee che cammina sul codice **sul proiettore** (mai nella schermata dove lavori). Dettagli in `docs/CIMICE.md`; la prova guidata in `docs/NOVITA-5.1.1.md`.

### La cimice
- **Solo disegno**: un canvas trasparente sopra il codice del proiettore; non tocca mai il codice, il set, l'audio. 7 zampe (non equilibrate, apposta), antenne che toccano solo le note che suonano, firma «idea by @rybinfx» (di @rybinfx, la citazione non si spegne).
- **Decide da sola** leggendo i dati veri: livelli live, volumi, ritorno della cassa, scena `drop`, fader che si riapre di scatto. Sul drop impazzisce.
- **Impostazioni CIMICE**: attiva, quanto spesso, quanto resta, drop e sensibilità, grandezza (×0.5–×2), velocità, lampi, corrompe le parole, tremito.
- **Dispetti** (spenti di serie): ogni tanto, mentre tocca una nota, fa un glitch VERO sul suono di quel livello (filtro, eco, balbettio, buchi, fuori tempo…), da 0.5 a 2 secondi, a tempo sulla griglia, poi tutto torna com'era. Si vede nella card (riga in ruggine). ⌥⌘X li ferma, il paracadute pure.
- **Finale HACK**: il bottone **HACK** (due clic) o **⌥⌘⇧H** due volte. Dura 1–3 minuti (di serie 2): dispetti sempre più fitti, volumi che scendono, cimici fino a 8, il codice «mangiato» anche nel tuo editor (solo un disegno sopra), poi il set si chiude nel silenzio e il proiettore resta nero con la sola scritta TECNOLOGIA CANAGLIA. Solo in memoria; il paracadute lo ferma e rimette tutto.

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
