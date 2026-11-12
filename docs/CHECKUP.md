# CHECK-UP verso la beta 5

12/11/2026 · ramo `checkup-beta5` · stato di partenza segnato col tag `pre-checkup-beta5`.

Sola lettura: nessun file di codice toccato, app mai lanciata, nessuna prova con l'audio.
Quindi tutto quello che qui è «si sente» è ragionamento sul codice, non ascolto.

**Come è stato fatto.** Cinque letture a zone (motori audio, stato CUE/LIVE, controller, synth, proiezione e resto).
I rapporti completi, con più dettagli di questo riassunto, sono in `.claude/checkup/` (A…E).
I punti più gravi li ho ricontrollati io riga per riga: sono quelli segnati ✔.

**Sicurezza di ogni voce:** **certo** = si legge nel codice senza dubbi · **probabile** = il ragionamento regge ma dipende dalla situazione · **a mano** = va provato con hardware o a orecchio.

**Prove automatiche oggi:** `npm test` → 330 su 330 passano (1,6 s). Non esiste un lint. `npm run prova` non lanciato (suona).

Percorsi: dove non è scritto altro, i file sono in `src/renderer/`.

---

## 1. Mappa

### Le parti

| Parte | File | Cosa fa |
|---|---|---|
| Processo principale | `src/main/main.js` | Apre le finestre, fa da postino dei canali tra loro, serve i file (`cutx://`), guardiano che riavvia chi crasha |
| Stash e preferenze | `src/main/stash.js`, `preferenze.js` | Cartella del set, `stash.json`, copia di sicurezza sul Mac |
| Interfaccia (controllo) | `app.js` (1818 righe) | Il direttore: tiene lo stato, traduce i gesti in messaggi ai motori |
| CUE | `cue.js` | Card del brano (apertura, BEAT con scene, clip), scratch libero, costruisce il «pezzo» da mandare |
| LIVE | `pila.js` | Disegna le card dei livelli che suonano. Non decide niente |
| Motori | `motore.js` + `riproduttore.js` + `tempo.js` | Stessa pagina nascosta due volte: **live** (casse) e **cuffia**. Compila il codice, lo suona a tempo |
| Controller | `controller.js`, `controller-mc.js`, `controller-mappa.js`, `controller-colpi.js`, `controller-synth.js` | X-Touch Mini: MIDI → azioni, luci |
| SYNTH | `synth-vista.js`, `synth-roll.js`, `synth-note.js`, `synth-codice.js`, `synth-modello.js` | Pannello del suono e pianoroll. Lavora sempre su una copia, solo in cuffia |
| Pubblico | `uscita.js`, `scorri.js`, `aspetto.js`, `testi-pubblico.js`, `sfondo.js` | Finestra del proiettore: codice live scritto a macchina |
| Brani | `brano.js`, `coda.js`, `set.js` | Formato `.cutx`, code di effetti, ordine della serata (moduli puri, testati) |
| Ableton | `src/ableton/`, `src/main/ableton.js` | Importazione dei progetti `.als` |
| Prove | `src/main/prova.js` (5937 righe), `test/` | Prove con l'app vera (suonano) e test puri |

### Come girano i dati

1. **Canali.** Ogni finestra, appena caricata, riceve dal processo principale un canale diretto con le altre (`main.js:196-218`). Se una finestra si ricarica, i canali si rifanno. Non restano ascoltatori doppi (controllato).
2. **CUE → cuffia.** `app.js manda()` → messaggio `valuta` → il motore cuffia compila e suona subito. Il tempo lo copia dal live (mappa del tempo ogni secondo).
3. **CUE → LIVE (GO LIVE).** `goLive` (`app.js:226`) prende **solo la card attiva** del CUE e manda `entra` al motore live con: codice, nome, «entra tra» (`cicli`), volume, dissolvenza. Il motore (`motore.js:431`): compila → prova i primi 16 cicli (se si rompe non entra) → calcola il ciclo d'ingresso → se c'è già un livello con lo stesso nome lo sostituisce lì → risponde.
4. **Il suono.** Ogni 50 ms il motore guarda avanti 150 ms, chiede a ogni livello quali note cadono lì e le passa a superdough (Strudel). Il riproduttore **gira sempre**, anche a live vuoto: non c'è niente da «far partire».
5. **LIVE → interfaccia.** La verità sta nel motore live (lista `livelli`). La manda all'interfaccia e al proiettore a ogni cambio e in ogni risposta al ping (ogni 500 ms). L'interfaccia ridisegna ogni 100 ms.
6. **LIVE → pubblico.** Il motore live manda direttamente alla finestra del proiettore livelli e tempo. Il proiettore non può mai disturbare l'audio (messaggi a senso unico).
7. **Controller.** Web MIDI → `controller.js riceve()` → azione di `app.js` (le stesse della tastiera) → messaggio ai motori. Le luci si aggiornano ogni 150 ms.
8. **Guardiano.** Interfaccia crashata → ricaricata, riprende lo stato dai motori. Cuffia crashata o bloccata → riavviata. Live crashato → riavviato e i livelli rimessi. **Live bloccato → solo un avviso** (vedi rischio R4).

---

## 2. Bug trovati, in ordine di gravità

### Gravi: possono lasciare muti o senza controllo in serata

| # | Cosa succede | Dove | Sicurezza |
|---|---|---|---|
| G1 | **I primi colpi di un suono nuovo vengono scartati.** I campioni si caricano al primo colpo; se il caricamento dura più dei 100-150 ms di anticipo, Strudel butta via il colpo. Live e cuffia hanno memorie separate: averlo sentito in cuffia non serve. Con uno stem lungo (un evento per giro) resta muto **tutto il primo giro**. | `node_modules/superdough/sampler.mjs:297`, nessun precaricamento nel progetto | ✔ certo il meccanismo, probabile come causa della «base che non parte» |
| G2 | **Togliere una cosa che sta ancora entrando al posto di un'altra lascia il silenzio.** Mando la versione B di «basso» (entra tra 4), mi pento e la tolgo: esce comunque anche la A che suonava. | `motore.js:447-466` e `543-558` | ✔ certo |
| G3 | **Controller morto dopo uno scollega/ricollega.** Se l'X-Touch torna in modalità standard, CUTX gli chiede di passare a MC una sola volta per tutta la sessione. Alla seconda resta muto fino al riavvio dell'app. | `controller.js:142-143` | ✔ certo il difetto, a mano l'effetto |
| G4 | **Il motore non parte ma sembra vivo.** Se lo stash non si legge all'avvio (SSD in sola lettura, cartella mancante) o l'uscita audio resta appesa, il motore non comincia mai a suonare ma risponde ai ping: il guardiano non lo tocca e nessun messaggio lo dice. | `motore.js:949` e `1288` | ✔ certo |
| G5 | **Colpo o manopola tenuti restano bloccati** se il controller si stacca mentre li premo. Uno «stop» bloccato tiene muti anche i livelli nuovi. | `controller.js:78-90`, `motore.js:638` | certo la logica, a mano l'evento |
| G6 | **`stash.json` illeggibile viene riscritto vuoto** al primo salvataggio: si perdono uscite audio e offset della cuffia. Nessun file importante è salvato in modo sicuro (prima su file provvisorio, poi rinominato): se l'app muore a metà scrittura il file resta troncato, e preferenze troncate = si riparte dai valori di fabbrica. | `src/main/stash.js:60-75`, `preferenze.js:55-59` | ✔ certo |

### Medi: comportamento sbagliato, ma si continua a suonare

| # | Cosa succede | Dove | Sicurezza |
|---|---|---|---|
| M1 | **Modificare il beat dalla sua card LIVE (⌘↵) gli fa perdere le scene.** Da lì in poi ◀ ▶ dicono «non c'è un beat», il CUE spegne le pillole live, il passaggio al brano dopo non lo riconosce. L'audio continua. | `app.js:1254` (manca `beat`), `motore.js:444` | ✔ certo |
| M2 | **Tasto TOGLI del controller, due pressioni.** Lente: toglie due livelli diversi (dopo la prima la scelta si azzera e la seconda prende «l'ultimo entrato»). Veloci: la seconda **annulla** la prima. Nessuna luce dice quale. | `app.js:1724` e `397-410`, `motore.js:550` | ✔ certo la logica |
| M3 | **⇧⌘⌫ toglie l'ultimo entrato**, anche se ho scelto un altro livello, anche se è il beat o il paracadute. Il controller invece usa il livello scelto: due regole diverse. | `app.js:723`, `399-400` | certo |
| M4 | **Scena o clip vuota va live come silenzio** e prende il posto di quella che suonava («+ scena» crea una scena vuota). | `cue.js:245-257`, `motore.js:178` | certo |
| M5 | **Il nuovo beat eredita muto e volume del vecchio.** Se avevo messo in muto il beat, la scena nuova entra muta. Nel CUE non si vede. | `motore.js:451-452`, `461-462` | certo |
| M6 | **GO LIVE su una scena `@beat` scritta nello scratch** può far partire il passaggio al brano prossimo invece del mio scratch. | `app.js:233` (non controlla il modo) | probabile |
| M7 | **Volume generale che salta** dopo una ricarica dell'interfaccia: la manopola 8 riparte da 1 senza leggere il valore vero. E dopo un riavvio del live il master torna a 1. | `controller.js:32`, `app.js:1152` | probabile |
| M8 | **Un errore dentro il motore non dà risposta.** L'interfaccia aspetta 5 secondi e dice solo «nessuna risposta», senza il motivo. A volte poi il livello entra lo stesso, in ritardo. | `motore.js:1118` (nessuna protezione), `motori.js:53-60` | ✔ certo |
| M9 | **Tempo fantasma.** Un brano a 140 mandato con «entra tra 8» e poi sostituito prima di entrare lascia in coda il suo cambio di tempo: al ciclo 8 il tempo salta a 140 anche se quel brano non suona. Solo a live vuoto. | `motore.js:478`, `riproduttore.js:90-94` | certo |
| M10 | **Proiettore staccato:** nessuna gestione. La finestra può finire sul monitor di controllo e CUTX si ricorda quello come schermo del pubblico. | `main.js:328-337`, nessun `display-removed` | ✔ certo che manca, a mano l'effetto |
| M11 | **Proiettore congelato:** se il disegno incontra un dato strano si ferma sull'ultima immagine e riempie il registro di errori 60 volte al secondo. Se la finestra si blocca nessuno la ricarica. | `uscita.js:486-489` | ✔ certo |
| M12 | **Un campione non caricato (SSD staccato un attimo) resta muto fino al riavvio** anche quando il disco torna. È dentro Strudel: si aggira precaricando noi. | `superdough/sampler.mjs:92-103` | certo |
| M13 | **Con una dissolvenza d'uscita impostata, un doppio clic sulla × annulla l'uscita.** | `motore.js:550`, `pila.js:211` | certo (voluto, ma traditore) |

### Piccoli

| # | Cosa succede | Dove | Sicurezza |
|---|---|---|---|
| P1 | L'interruttore «striscia» delle impostazioni non arriva al live fino al riavvio (confronta un valore con sé stesso). | `app.js:1785` | ✔ certo |
| P2 | I testi dicono «a fine frase» ma la scena entra tra N cicli. | `cue.js:519`, `534` | certo |
| P3 | Nel CUE la clip tolta torna «pronta» subito mentre suona ancora; il beat invece resta «live» fino alla fine. Due regole. | `app.js:1296` | certo |
| P4 | Dopo ⌘. (ferma tutto) riser e colpi del controller puntano a un livello che non c'è più: il riser non rientra fino al rilascio dopo. | `app.js:536-541` | certo |
| P5 | Le luci del controller non si riallineano dopo una ricarica finché non tocco qualcosa. | `controller.js:28`, `877` | certo la logica |
| P6 | Tasto cuffia tenuto + cambio pagina: resta «tenuto», e ◀ ▶ cambiano brano invece di scena. | `controller.js:540-551` | probabile, raro |
| P7 | SYNTH: incollare codice con più istruzioni (`$:` o `;`) ne perde una senza avviso; `s("bd sd")` diventa un triangolo; i commenti in mezzo spariscono. Mai sul livello che suona (lavora su una copia). | `synth-codice.js:70`, `148-201` | certo (provato) |
| P8 | SYNTH: un pattern annidato tipo `[[[c3*32]*32]*32]*32` crea un milione di note e può bloccare l'interfaccia (non l'audio). | `synth-note.js` (`espandi`) | probabile |
| P9 | `npm run prova` lancia solo 11 parti su circa 48: non è la sequenza completa che crediamo. | `main.js:24`, `prova.js:65` | certo |
| P10 | Lavorando sulla copia dello stash (SSD staccato), al ritorno dell'SSD le modifiche fatte possono essere sovrascritte. | `stash.js:240-243` | probabile |
| P11 | Tasto alto 7 del controller: promette «piano» ma non fa niente. | `controller.js:638` | certo |
| P12 | ⌘W e ⌘Q chiudono tutto senza conferma, anche con il live che suona. | `main.js:248-253`, `581` | certo che non c'è conferma |

---

## 3. Rischi di stabilità in serata

**Cosa regge bene** (controllato): nessun ascoltatore o timer che si moltiplica, nemmeno dopo ricariche e riconnessioni; registro a rotazione; codice sbagliato al GO LIVE non entra e quello di prima continua; errore dopo l'ingresso → il guardiano rimette la versione di prima; il proiettore non può toccare l'audio; il limiter protegge le casse.

**I rischi veri:**

| # | Rischio | Sicurezza |
|---|---|---|
| R1 | **Colpi saltati a ogni GO LIVE.** L'ingresso prova il codice per 16 cicli, due volte, sullo stesso filo che programma l'audio, con soli 100 ms di margine. Con codice denso può far saltare qualche colpo agli altri livelli. Mai misurato. (`motore.js:435-437`, `riproduttore.js:10`) | a mano (da misurare) |
| R2 | **Il giro del motore non è protetto.** Se un passaggio lancia un errore a metà, le stesse note vengono riprogrammate ogni 50 ms (colpi doppi). Nessun innesco trovato oggi, ma è il punto più fragile e proteggerlo costa niente. (`motore.js:892`, `riproduttore.js:119-146`) | a mano |
| R3 | **Errori che nessuno vede.** Gli errori di una singola nota (suono sbagliato, parametro non valido) finiscono solo nella console del motore: né nel registro né a schermo. Il livello sembra vivo ma tace. Nell'interfaccia non c'è nessuna rete per gli errori imprevisti: un gesto può «morire» in silenzio. E `mostra()` (ogni 100 ms) non è protetta: se un pezzo si rompe, si ferma l'aggiornamento di tutta la postazione. (`app.js:1338-1349`) | certo |
| R4 | **Live bloccato = nessun rimedio.** Un codice con un ciclo infinito congela il live; il guardiano avvisa e basta, e non c'è un comando «riavvia il live». | certo |
| R5 | **Memoria in 40 minuti.** Tre crescite lente: i campioni non si scaricano mai (uno stem di 3 minuti ≈ 70 MB, due volte perché live e cuffia sono separati); ogni cambio di scena tiene vivo il livello vecchio (`motore.js:476`); il proiettore accumula una chiave per ciclo per livello (`uscita.js:72`). Le ultime due sono poca roba ma si chiudono in due righe. Gli stem lunghi sono da pesare con un set vero. | probabile |
| R6 | **Uscita audio che sparisce.** La logica c'è (passa all'uscita predefinita e avvisa) ma è stata provata solo con un elenco finto. Tre dubbi: l'uscita predefinita può essere il jack delle cuffie (il pubblico finirebbe in cuffia); il cambio d'uscita non ha un tempo massimo; nessuno controlla che l'audio stia davvero avanzando. | a mano |
| R7 | **SSD che balbetta.** Alcune letture dello stash sono bloccanti nel processo principale: con un disco montato ma appeso si fermano guardiano e caricamento dei campioni. Staccato del tutto invece si passa bene alla copia. | a mano |
| R8 | **Registro intasato.** Ogni errore viene scritto subito su disco, uno alla volta. Un errore che si ripete (R2, M11) impasta il processo principale e cancella lo storico utile in pochi minuti. | probabile |
| R9 | **Stati che non tornano dopo una ricarica dell'interfaccia:** stop tenuto, break del fader, master, «entra tra». Il motore li ha ancora, l'interfaccia nuova non lo sa. | certo |
| R10 | **Tastiera nel SYNTH che tocca il live senza farlo vedere:** le cifre 1 2 4 8 cambiano «entra tra»; Tab cambia la linguetta del CUE; Esc toglie la scelta del livello; ⇧⌘⌫ toglie un livello. | probabile |

**Le tue due domande.**
- *Controller scollegato a metà set:* si riaggancia da solo, senza ascoltatori doppi. Ma può tornare in modalità standard e restare muto (G3), e quello che tenevo premuto resta premuto (G5). Luci spente finché non tocco qualcosa (P5).
- *Errore nel codice mentre è live:* gestito bene in tre casi su quattro (errore di scrittura, errore nei primi 16 cicli, errore più tardi con una versione precedente a cui tornare). Il quarto è R3: errori nota per nota, invisibili.

---

## 4. Qualità del codice (solo quello che vale)

1. **Nessun test puro sul cuore del gesto.** Cosa è in CUE, cosa è live, cosa entra, cosa esce: sta in `app.js` e `motore.js` mescolato a schermo e audio, quindi si prova solo suonando. Estrarre quella logica in un modulo puro è la mossa che rende sicure tutte le correzioni di sotto.
2. **Tre «entra» quasi uguali** (`goLive`, `muoviScena`, `passaBrano` in `app.js:257`, `296`, `353`) e **quattro costruttori di «pezzo»** in `cue.js`: le differenze tra loro sono già bug (volume che manca, scena vuota). Una funzione sola.
3. **`app.js` (1818 righe) e `motore.js` (1294):** non li rifarei. Solo due tagli: il blocco del controller fuori da `app.js`, la tastiera del SYNTH fuori da `motore.js`.
4. **`prova.js` (5937 righe) con due elenchi di parti diversi** (P9): un elenco solo.
5. **Ganci di prova nell'app vera** (`crasha`, `blocca`, `cutxProva`): metterli dietro il flag di prova.
6. **Codice morto verificato:** `haApertura`, `eBersaglioBeat`, `senzaCiclo`, `eEffettoFader`, `dieciTasti`; la scelta delle clip del kit (`serata.scelta`, mai usata); le preferenze `hydra` e `logoSopraHydra` (Hydra non esiste ancora).
7. **Slider del volume scritto due volte** (`cue.js:688-727`, `pila.js:219-234`) con gli stessi difetti.
8. **Parole dell'interfaccia nel codice** invece che in `it.json`: già in lista; il file più indietro è `suoni-vista.js`.
9. **Lavoro sprecato a schermo:** il pianoroll ridisegna 10 volte al secondo anche nascosto; le strisce delle note rifanno un confronto pesante a ogni fotogramma; il proiettore disegna due volte.

---

## 5. Le tue domande

### a. Come parte la base ritmica? Bug o sbaglio io?

**Tutti e due, ma soprattutto è il programma che non ti aiuta.**

Come funziona davvero:
- Il BEAT è una sezione del brano fatta di scene. Una scena va live come un livello normale che si chiama `beat`.
- **GO LIVE manda solo la card attiva del CUE**, cioè l'ultima su cui hai cliccato o che hai scelto con la manopola. Se è una clip, parte la clip. Il beat non parte mai da solo insieme a una clip, e niente te lo dice.
- Entra al prossimo confine di ciclo, più «entra tra» − 1 cicli.

Perché «non parte», dal più probabile:

1. **La card attiva era una clip, non la scena del beat.** Voluto, ma senza nessun avviso. *(sbaglio indotto)*
2. **I campioni non erano ancora caricati nel live** (G1): i primi colpi, o il primo giro di uno stem, saltano. *(bug)*
3. **«Entra tra» era rimasto su 4 o 8** da prima: la base arriva dopo, anche 19 secondi. Non torna mai a 1 da solo (`app.js:78`). Idem la dissolvenza d'entrata. *(sbaglio indotto)*
4. **Il beat di prima era in muto o a volume basso:** quello nuovo eredita (M5). *(bug)*
5. **La scena era vuota** (M4). *(bug)*
6. **Eri sulla linguetta «prossimo» con un altro brano attivo:** la scena del beat non entra normale, fa il passaggio di brano; se un passaggio è già in arrivo non manda niente (M6). *(metà e metà)*
7. Più rari: uno stop rimasto bloccato (G5), un test di sfasamento lasciato acceso che blocca GO LIVE in silenzio (`app.js:227`), il motore non ancora pronto nei primi secondi (G4).

### b. Chiusura delle tracce live

Modi oggi: × sulla card · ⇧⌘⌫ · tasto del controller · × sulla clip nel CUE · sostituzione con lo stesso nome · passaggio di brano · ⌘. (tutto, subito).

- **Sul controller il tasto c'è: fila alta, tasto 6, solo in pagina A.** In pagina B e nel SYNTH quel tasto fa altro.
- **Funziona, ma in modo traditore** (M2). Toglie il livello scelto; se non ne hai scelto nessuno toglie l'ultimo entrato. Riscontro: un lampo di 300 ms e la scritta «TOGLI», senza dire cosa.
- L'uscita è sempre al prossimo confine di ciclo («entra tra» non vale per uscire). Due chiusure a cavallo di un confine escono a un ciclo di distanza.
- **Perché sembrano accavallarsi:** (1) dopo la prima pressione la scelta si azzera, quindi la seconda colpisce un altro livello; (2) due pressioni veloci si annullano; (3) nel CUE la clip torna «pronta» subito mentre suona ancora (P3); (4) tastiera e controller scelgono il bersaglio con regole diverse (M3); (5) togliere un sostituto in arrivo fa uscire anche l'originale (G2).

### c. Manopola 1

- È un encoder relativo: manda «un passo a destra/sinistra». La regola attuale è **un messaggio MIDI = una voce**, senza soglia né accumulo (`controller.js:304`, scelta del commit `d8e9e0f`).
- **Perché è imprecisa:** la manopola dell'X-Touch non ha scatti meccanici veri e manda un messaggio per ogni piccolo angolo, quindi una girata leggera salta più voci. In più a ogni messaggio la posizione viene riletta dallo schermo invece che da un contatore: se lo schermo non ha ancora finito di aggiornarsi, il passo dopo riparte dal posto vecchio (passi persi o ripetuti). E ogni passo rifà tutto il disegno del CUE, quindi in raffica rallenta.
- **BEAT coperto in alto:** non c'è niente di fisso che lo copre. È lo scorrimento (`cue.js:999-1009`): porta la clip scelta a 6 px dal bordo alto, e la regola «la prima voce riporta in cima» non scatta mai per la prima clip perché sopra di lei c'è la card del BEAT. Così il BEAT (e il titolo del gruppo) scorrono via sopra. *(probabile: da confermare guardando lo schermo)*

### d. Pianoroll e tastiera del Mac

- **Sì, funziona.** A S D F G H J K = tasti bianchi (da do), W E T Y U = neri, Z e X = ottava giù e su. Usa la posizione fisica dei tasti, quindi va uguale con la tastiera italiana. Suona **solo in cuffia**.
- **Scrive nel pianoroll in due modi:** con **REC** (un ciclo di conteggio, poi registra) o con **passi** acceso (ogni tasto scrive una nota e il cursore avanza; Spazio = pausa, ⌫ = indietro, ←/→ = cursore, Esc = esci).
- **Non c'è un interruttore.** È attiva sempre quando sei nella vista SYNTH e il cursore non è in un campo di testo, in un menu o su uno slider. L'unico segno è la scritta «tasti C3», che resta uguale anche quando la tastiera è «morta» perché hai appena usato un menu: sembra rotta e invece basta cliccare altrove.
- **Conflitti veri:**
  - `1` `2` `4` `8` da soli cambiano «entra tra» senza che tu lo veda (il più pericoloso in serata);
  - Tab e ⇧Tab cambiano la linguetta del CUE che sta sotto, e non si può girare tra le manopole con Tab;
  - Esc, oltre a uscire dai passi, toglie la scelta del livello live;
  - con «passi» acceso le frecce muovono sia il cursore sia la manopola che ha il fuoco;
  - con le Impostazioni aperte sopra il SYNTH, Spazio e le lettere suonano lo stesso *(a mano)*.
- Nessun conflitto su ⌘Z (nel SYNTH annulla le mosse del SYNTH), ⌘C/⌘V, Spazio. All'editor di codice non arriva nessun tasto mentre il SYNTH è aperto.

---

## 6. I punti della FASE 3

| # | Punto | Come lo farei | Quanto è grosso | Cosa rischia |
|---|---|---|---|---|
| 1 | **Pubblico: tutto il codice** | Tre cause. (a) Commenti e intestazione del brano sono spenti di fabbrica: si accendono dalle impostazioni, o cambio i valori di fabbrica. (b) Titoli, spazi e striscia delle note non rimpiccioliscono col carattere (circa 130 px fissi per livello): li faccio scalare, e la striscia si nasconde se non ci sta. (c) Se ancora non basta: due colonne prima di arrendersi allo scorrimento. | (a) niente · (b) ~10 righe di CSS · (c) ~100 righe, mezza giornata | (b) la prova `uscita` ha soglie da rimisurare. (c) lo scorrimento e la scrittura a macchina danno per scontata una colonna: è il pezzo delicato |
| 2 | **Slider volume d'ingresso nel CUE** | C'è già sulle clip. Manca su scene del beat, apertura e scratch: lo porto lì, stesso slider. Va deciso un dettaglio: oggi il volume scritto nella clip vince anche su quello che hai abbassato a mano nel live quando rimandi la stessa clip. | ~70 righe, 3 file, motori non toccati | Il valore si salva nel `.cutx` (è già così per le clip: intestazione `· volume 0.8`), quindi **nessun cambio di formato**, ma serve il tuo ok lo stesso |
| 3 | **«Entra tra» torna a 1** | Leggo il valore al momento del GO LIVE e subito lo riporto a 1. Vale per GO LIVE, ◀ ▶ e passaggio di brano. Correggo i testi «a fine frase». | ~10 righe | Alcune prove automatiche contano sul valore che resta: da rileggere |
| 4 | **Tasto synth su ogni scena** | È il punto grosso. Oggi il synth riapre solo quello che ha creato lui e **rigenera** il codice: su un beat lo romperebbe (P7). Serve: modificare solo il pezzetto di note lasciando intatto il resto; un pianoroll a righe con i nomi dei suoni per la batteria; scrivere sulla card invece di creare una clip nuova. Dal LIVE mai scrivere diretto nel livello che suona: si passa dal solito ⌘↵. | Tutto: circa una settimana. Primo passo utile (tasto su ogni clip e scena con note, resto intatto): 1-2 giorni | Ritmi euclidei e `?` non si leggono: lì il tasto apre in sola lettura. Rischio più alto di tutta la fase 3: lo farei per ultimo e a pezzi |
| 5 | **Togliere dal live, chiaro** | Proposta sotto | ~100 righe + test | Cambia un gesto che hai già in mano |
| 6 | **Manopola 1** | Proposta sotto | ~50 righe + test | Cambia la sensibilità: il numero giusto si trova solo col controller in mano |
| 7 | **Avvio della base** | Proposta sotto | ~60 righe, più il precaricamento (~80) | Il precaricamento tocca i motori: prova di robustezza da rifare |

**Proposta 5, togliere.** Un bersaglio solo e sempre visibile: il tasto toglie **solo il livello scelto** (niente più «l'ultimo entrato»); senza scelta dice «nessun livello scelto». Mentre esce, la card mostra «ESCE» col conto alla rovescia, il CUE mostra lo stesso stato, il tasto 6 resta acceso finché qualcosa sta uscendo. Una seconda pressione sullo stesso livello non fa niente (non annulla più). Stessa regola per ⇧⌘⌫. In più correggo G2.
Da decidere tu: se vuoi «tasto tenuto + premo la manopola del livello» per togliere senza scegliere prima, e se il tasto 7 (oggi vuoto) deve diventare «annulla l'uscita».

**Proposta 6, manopola.** Una voce ogni N messaggi (parto da 3, poi lo regoliamo sul controller), con un contatore interno invece di rileggere lo schermo, e un solo ridisegno per fotogramma. Scorrimento: la prima clip riporta la lista in cima, e una voce scelta porta in vista anche il suo titolo e, se ci sta, il BEAT.

**Proposta 7, base.** (1) Precarico i campioni nel live appena un pezzo viene caricato o provato in cuffia, così il primo colpo c'è. (2) La scena nuova non eredita più il muto. (3) Scene vuote rifiutate con un messaggio. (4) Se mandi una clip di un brano che ha un beat e nessun beat suona, avviso «nessun beat live». (5) Accanto a GO LIVE si legge sempre cosa partirà e quando.
Da decidere tu: se vuoi anche l'opzione «il primo GO LIVE di una clip fa partire anche il beat». Io la lascerei spenta: è un suono che non hai chiesto.

---

## 7. Cosa propongo per la FASE 2

In quest'ordine, un commit ciascuno:

1. **Rete di sicurezza:** protezione sul giro del motore, sulla ricezione dei messaggi, su `mostra()` e sul disegno del proiettore; errori imprevisti a schermo e nel registro, con limite alle ripetizioni (R2, R3, R8, M8, M11).
2. **Salvataggi sicuri** e `stash.json` illeggibile mai sovrascritto (G6).
3. **Motore che parte comunque** e dice cosa non va (G4).
4. **Controller:** richiesta MC a ogni ricollegamento, rilascio di ciò che era tenuto, master e luci riallineati (G3, G5, M7, P5, P6).
5. **Stato CUE/LIVE:** G2, M1, M4, M6, M9, P1, P4 (M5 lo tengo per la proposta 7).
6. **Proiettore:** staccato e riattaccato, finestra bloccata (M10, M11).
7. **Memoria:** le due crescite piccole (R5).
8. **Test puri** sulla logica di stato: prima estraggo in un modulo «lista dei livelli → cosa è in CUE / live / in arrivo / in uscita» e la scelta del bersaglio del togli, poi i test.
9. Alla fine: build, `npm test`, e le parti di prova toccate (a volume 20%, dati separati).

**Fuori dalla fase 2**, perché cambiano come suoni e vanno decisi con te: M2, M3, M13 (sono la proposta 5), G1 e M5 (proposta 7), conferma su ⌘Q (P12), comando «riavvia il live» (R4), margine d'anticipo del motore (R1), tasti del SYNTH che toccano il live (R10).

**Non tocco:** sicurezza, nomi a schermo, formato `.cutx`.

---

## 8. Cose da provare a mano (non si capiscono dal codice)

1. Staccare e riattaccare l'X-Touch mentre suona: torna? In che modalità?
2. Staccare la MiniFuse mentre suona: dove va il suono?
3. Staccare il proiettore con la finestra del pubblico aperta.
4. Primo GO LIVE di un beat mai sentito dopo l'avvio: manca il primo colpo?
5. Girare la manopola 1 piano: quante voci salta per ogni «tacca» sentita con le dita?
6. Staccare l'SSD dello stash a metà.

---

## 9. FASE 2: cosa è stato corretto (12/11/2026)

Un commit per gruppo di correzioni, tutti sul ramo `checkup-beta5`.

| Commit | Cosa | Voci del check-up |
|---|---|---|
| Rete di sicurezza | Un errore imprevisto nel giro del motore, in un comando, nello schermo o nel proiettore non ferma il resto; un comando rotto risponde subito; gli errori imprevisti si leggono nel CUE; lo stesso errore a raffica entra nel registro una volta | R2, R3, R8, M8, M11 (in parte) |
| Salvataggi sicuri | Preferenze, `stash.json`, set, kit e brani scritti su file provvisorio e poi rinominati; un file rovinato si mette da parte (`.illeggibile`) prima di ripartire | G6 |
| Motore che parte comunque | Tempo massimo su stash e cambio di uscita; il motore gira lo stesso e dice cosa manca; GO LIVE troppo presto risponde col motivo | G4 |
| Controller | Modalità MC richiesta a ogni ricollegamento; tasti e colpi tenuti rilasciati quando sparisce; volume generale dal valore vero; luci riallineate; tasto cuffia non resta «tenuto» | G3, G5, M7, P5, P6 |
| Live | Togliere un sostituto in arrivo non lascia il silenzio; niente tempo fantasma; il beat modificato tiene le scene; memoria dei livelli sostituiti | G2, M9, M1, R5 |
| CUE e LIVE | Scene vuote rifiutate; passaggio per sbaglio dallo scratch; striscia; riser dopo ferma tutto; **avviso «va live senza il BEAT»** con la card BEAT che lampeggia; **«entra tra» in ambra e lampeggiante quando cambia, e i tasti 1 2 4 8 spenti nel SYNTH** | M4, M6, P1, P4, R10 (in parte) + le due richieste nuove |
| Proiettore | Staccato: la finestra si chiude e torna da sola; bloccato: riparte dopo 10 s; la posizione non si salva mentre gli schermi cambiano | M10, M11 |
| Proiettore, memoria | Ricordi dei livelli usciti e dei cicli passati buttati | R5 |

**Test puri nuovi:** `stato-live` (cosa suona, cosa arriva, cosa esce, il beat, la clip senza beat, il pezzo vuoto), `scrivi-sicuro`, `guasto`, più casi nuovi in `controller`, `riproduttore`, `log`. Totale `npm test`: 349 su 349.

**Prove con l'app vera** (volume 20%, dati separati): robustezza, entrata, livelli, guardiano, tempo, beat, controller, cue-controller, cue-vista, uscita, colpi, passaggio, linguette, dissolvenze, coda, fader → passano. Due note oneste:
- alcune prove sono fallite la prima volta e sono passate rilanciate da sole (livelli, beat). Ho confrontato col codice di partenza: non è un guasto delle correzioni. La finestra di prova prende il fuoco, e se nel frattempo si usano tastiera e mouse la prova si rompe;
- `card-togli` fallisce una volta su due **anche sul codice di partenza** (dipende da dove sta il mouse). Guasto vecchio della prova, da sistemare a parte.

**Non provato, perché serve l'hardware:** controller staccato e riattaccato, proiettore staccato, uscita audio che sparisce, stash illeggibile su SSD vero. Sono nelle prove a mano del capitolo 8.

**Rimasto fuori dalla fase 2** (come da capitolo 7): togliere dal live (proposta 5), precaricamento dei campioni ed eredità del muto (proposta 7), conferma su ⌘Q, comando «riavvia il live», margine d'anticipo del motore, Tab ed Esc nel SYNTH, errori nota per nota a schermo.

---

## 10. Appunti per la FASE 3, punto 1 (proiettore) — richieste del 12/11

Da fare insieme a «mostrare tutto il codice»:
1. **Batteria con la forma d'onda** (tipo `_scope`) al posto del pianoroll; le melodie restano col pianoroll. Si può: il motore live misura già il suono di ogni livello. Vale per il proiettore e per le card del LIVE.
2. **Angolo «tecnologia canaglia» e gatto più piccolo**, per dare spazio al codice. È anche la mossa più efficace per far stare tutto il codice (capitolo 6, punto 1).
3. **Pianoroll del pubblico più spesso** (note più alte).
4. **Numeri dei cicli**: si spengono già da Impostazioni → proiezione → testi per il pubblico; da valutare se spegnerli di fabbrica.

Tutto impaginato con le regole di `design/DESIGN.md`. Prima di scrivere: due o tre foto di prova da farti scegliere.

---

## 11. Serate come progetti (SOLO PROGETTO, nessun codice toccato)

### Com'è oggi

Uno stash solo con tutto dentro: `suoni/`, `libreria/` (tutti i brani), un solo `set.cutx` (l'ordine della serata), un solo `kit.cutx`, `colpi.cutx`, `stash.json`. Tra sei mesi la libreria è un mucchio e il set è uno solo.

### Come lo farei

**L'idea:** lo stash resta la valigia dei suoni; dentro ci sono le **serate**, una cartella ciascuna, con i suoi brani, il suo ordine e il suo kit. I suoni sono di tutte.

```
STASH/
  stash.json        uscite audio, offset cuffia, ultima serata aperta
  suoni/            comuni a tutte le serate
  video/            comuni
  estensioni/       comuni
  colpi.cutx        comune (i colpi sono abitudini delle mani, non di una serata)
  serate/
    Serata 1/
      serata.json   nome, data di creazione, ultima apertura, note
      set.cutx      l'ordine dei brani (come oggi)
      kit.cutx      le clip sempre pronte (come oggi)
      brani/        i .cutx di questa serata
    Compleanno di Tizia/
      …
  libreria/         quella di oggi: resta dov'è, intatta (vedi sotto)
```

**All'avvio:** una finestra sola, come Ableton. Elenco delle serate, la più recente in cima, con data e numero di brani. Invio apre l'ultima (un tasto e sei dentro, come oggi). «Nuova serata»: scrivi il nome, parte vuota e già collegata ai suoni dello stash. La stessa finestra si richiama dal menu per cambiare serata; mai mentre il live suona senza una conferma.

**Riprendere da un'altra serata:** nel browser, scheda libreria, in alto un menu «questa serata / altre serate».
- Un brano intero: lo scegli e fai «porta qui». Viene **copiato** nella serata aperta (se il nome c'è già diventa «nome 2»). Copia e non collegamento: se lo cambi qui, là resta com'era. È la scelta sicura per chi suona.
- Un pezzo di codice: apri il brano dell'altra serata in sola lettura, scegli una clip o una scena, «porta questa clip» → finisce in un brano della serata aperta o nel kit.
- Sentire prima in cuffia funziona come oggi con la libreria.

### Cosa cambia nei file `.cutx`

**Niente.** Un brano resta un file di testo che sta in piedi da solo: i suoni li chiama per nome e i suoni sono comuni. Cambia solo la cartella in cui vive. Anche `set.cutx` e `kit.cutx` restano uguali.

Unica aggiunta possibile, **solo se la vuoi**: una riga di commento in testa ai brani copiati, `// @da Serata 1 · brano.cutx`, per ricordare da dove viene. È un commento: le versioni vecchie di CUTX lo ignorano. Da decidere tu.

### Come porto dentro i brani che hai già, senza perdere niente

Al primo avvio della versione nuova, una volta sola:
1. crea `serate/Serata 1/`;
2. **copia** dentro tutti i `.cutx` di `libreria/`, più `set.cutx` e `kit.cutx`;
3. controlla che ogni copia sia uguale all'originale (stessa dimensione e stesso contenuto);
4. solo allora segna in `stash.json` che lo stash è al formato nuovo.

`libreria/`, `set.cutx` e `kit.cutx` di oggi **non vengono toccati né cancellati**. Restano lì come copia di prima: se qualcosa va storto, o se riapri lo stash con una CUTX vecchia, trovi tutto com'era. Li togli tu a mano quando sei sicuro, o mai.
Se la copia si interrompe a metà (disco staccato), al prossimo avvio riparte da capo: lo stash non risulta mai «convertito a metà».

### Quanto è grosso

Medio-grosso: circa 4-6 giorni, in quattro passi, ognuno suonabile.

| Passo | Cosa | Quanto | Rischio |
|---|---|---|---|
| 1 | Cartelle nuove, migrazione, «serata aperta». Da fuori non cambia niente: si apre l'ultima serata e tutto funziona come oggi | ~250 righe + test puri sulla migrazione | Tocca tutti i percorsi dello stash (libreria, set, kit, copia di sicurezza, importazione Ableton). È il passo delicato: migrazione provata su una copia dello stash, mai sul tuo vero |
| 2 | Finestra d'avvio: elenco, apri, nuova serata | ~250 righe | Basso. Va disegnata con le tavole di `design/` |
| 3 | «Altre serate» nel browser: porta qui un brano, porta una clip | ~200 righe | Medio: nomi doppi, brano aperto in sola lettura |
| 4 | Rinominare, duplicare, archiviare una serata (mai cancellare: si sposta in `serate/_archivio/`) | ~120 righe | Basso |

Non tocca: motori, tempo, controller, proiettore. I suoni restano serviti come oggi.

### Da decidere tu

1. **Il nome.** «Set» oggi è già l'ordine dei brani. Proposte: **SERATA** (la più chiara in italiano), **LIVE SET** (come Ableton, ma si confonde con SET), **SHOW** (ma SHOW è già un lavoro in lista).
2. **Il kit:** uno per serata (proposta) o uno solo comune a tutte?
3. **La riga `// @da …`** nei brani copiati: sì o no?
4. **Quando:** dopo la beta 5, come lavoro a sé. Dentro la beta 5 allargherebbe troppo le prove.
