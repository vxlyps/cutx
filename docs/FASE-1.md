# CUTX · fase 1

Andiamo in produzione. La fase 0 è chiusa e funziona. In questa fase il progetto cambia nome, il motore live diventa indipendente dall'interfaccia, e costruiamo la postazione vera, quella con cui suonerò alle serate.

Prima di tutto leggi `CLAUDE.md` del repo e `design/DESIGN.md` di questo pacchetto. Le regole di lavoro restano quelle di sempre: italiano, diretto, la cosa più semplice che funziona, piano prima e codice solo dopo il mio ok.

---

## Stato e decisioni già prese

Questo file sostituisce il prompt originale della fase 1, che stava in `cutx-fase1/` (cancellata dopo aver spostato `design/`). Il piano in nove passi della sezione 9 è già stato approvato. Decisioni prese dopo il piano, già riportate qui sotto:

- **Licenza**: `design/LICENSE` è fatto e committato. Logo CUTX, font Canaglia Stencil e disegni dei gatti sono © Michele Ciavarella (DCBstudio), usati con il suo permesso; il design dell'interfaccia è © Valerio Francini. Tutti esclusi dall'AGPL. Va scritto anche nel README, in una riga.
- **Scorciatoie**: prova in cuffia ⌘↵, go live ⇧⌘↵, togli livello ⇧⌘⌫. ⌘→ e ⌘⌫ restano all'editor. Muto livello ⌃1–9 (controlla il conflitto con Mission Control su questo Mac). Help on/off ⌘I. esc per uscire dall'editor.
- **Estensione dei brani**: `.cutx`, testo semplice. In fase 5 registriamo il tipo di file su macOS con l'icona del gatto e apertura con doppio clic: segnalo in `docs/PIANO.md`.
- **Cuffia**: per ora solo la sezione in prova. Prevedi nel motore un mix cuffia/live come sui mixer DJ, da attivare più avanti (in fase 4 diventa un fader dell'APC).
- **Formato del brano**: il nome della sezione diventa il nome del livello; il codice prima della prima `@sezione` è un preambolo valutato con ogni sezione; in modalità libero il livello prende il nome da `// @sezione` se c'è, altrimenti libero 1, libero 2…
- **Cartella di prova dello stash**: `~/Progetti/cutx-stash-test`.

## 0. Come procediamo

1. Leggi le tavole in `design/riferimenti/` (sono il riferimento approvato per layout, misure, colori e testi) e `design/DESIGN.md`.
2. Riprendi dal passo in corso della sezione 9, senza rifare quello che è già nel repo.
3. Lavora un passo alla volta. A fine passo: commit, push, mi dici cosa provare e ti fermi.
4. Aggiorna `CLAUDE.md` e `docs/PIANO.md` con tutto quello che cambia qui sotto, e scrivi in `CLAUDE.md` a che passo sei arrivato, così una sessione nuova riparte da lì.

---

## 1. Nuovo nome: CUTX

- DANEEL diventa **CUTX** ovunque: nome dell'app, titolo della finestra, `package.json` (nome pacchetto `cutx`), README, CLAUDE.md, log, lanciatore.
- **Wordmark**: la scritta CUTX è un logo disegnato, non un testo. Usa i file in `design/risorse/logo/` (SVG per l'app, PNG per README e social). Nell'interfaccia va la versione `cutx_bianco`: il verde resta riservato a ciò che suona live.
- **Logo e icona**: il gatto seduto (`design/risorse/gatti/gatto_seduto_logo_marcio.svg`) su fondo `#050604` con angoli arrotondati, come in `design/riferimenti/icona.html`. Genera l'`.icns` per il Dock al posto dell'icona di R. Daneel, e togli quella vecchia.
- **Repository**: rinominalo da `vxlyps/daneel` a `vxlyps/cutx` con `gh repo rename` e aggiorna il remote. GitHub tiene il reindirizzamento dal vecchio indirizzo.
- **Cartella locale**: da `~/Progetti/daneel` a `~/Progetti/cutx`. Questa sessione gira lì dentro, quindi chiedimi prima di spostarla e dimmi come riaprire la sessione dopo.
- **Lanciatore**: `CUTX.command` sulla Scrivania al posto di `DANEEL.command`, stessa logica di prima (una sola istanza, installa le dipendenze se mancano).
- **Dati dell'app**: impostazioni e log passano alla nuova cartella in `~/Library/Application Support/`. Al primo avvio, se trovi la vecchia cartella di DANEEL, sposta i dati.
- **Valigetta diventa stash.** Nell'interfaccia si chiama "stash" (lo stash mostrato è "STASH 01 · SSD"). Il file `daneel.json` diventa `stash.json`; se trovi quello vecchio, migralo. La struttura delle cartelle resta: `suoni/`, `libreria/`, `video/`, `estensioni/`.
- **README**: logo CUTX in cima (`design/risorse/logo/cutx_nero_1024.png` per il tema chiaro di GitHub, oppure entrambe le versioni con `<picture>` per chiaro e scuro).

---

## 2. Motore live separato

È la proposta che mi hai fatto tu, approvata. La scrivo qui perché vale come decisione:

- Live e cuffia sono **due motori uguali**, ognuno in un proprio processo nascosto con Strudel, orologio e superdough. Ricevono il codice e lo valutano loro.
- **Il live comanda il tempo**: pubblica la mappa del tempo (ciclo, istante, velocità). La cuffia la segue e calcola i suoi eventi da sola. La stessa mappa servirà a entrata in battuta, scrittura a macchina, proiettore e sync del PO.
- **L'interfaccia disegna e basta**: valuta lo stesso codice solo per evidenziare le note che suonano e per il pianoroll. Strudel è deterministico, quindi vede esattamente quello che suona.
- Le funzioni con effetti collaterali (`samples()`, `setcpm`, ecc.) devono essere innocue quando vengono valutate più volte.
- **Regola d'oro**: se l'interfaccia o la cuffia si bloccano o crashano, le casse non se ne accorgono. Rifai i test della fase 0 e aggiungi "blocca interfaccia 5 s".
- Per ora rinunciamo a `.scope()` e simili dentro l'editor. Va bene.

---

## 3. La postazione

Riferimento: `design/riferimenti/main.html`. Tre colonne: browser a sinistra, CUE al centro, LIVE a destra, più una barra in alto e una in fondo al LIVE.

**Barra in alto**: gatto animato e wordmark CUTX, insegna TECNOLOGIA CANAGLIA che si accende quando il gatto si muove, tasto dello stash, BPM, quattro pallini delle battute, numero del ciclo, tasti cuffia on/off, hydra on/off, proiettore on/off, impostazioni.

**Il brano.** Un brano preparato a casa è un file di testo nella libreria dello stash, leggibile e modificabile con qualsiasi editor. Proposta di formato (se hai un'idea migliore dimmela, ma resta testo semplice):

```
// @brano notte
// @bpm 140
// @sezione intro
s("bd*4, ~ hh").bank("RolandTR909")
// @sezione melodia
n("0 3 7 <10 12>").scale("C:minor").s("triangle")
// @sezione drop
s("jungle_break").fit().chop(16)
```

**CUE (centro), due modalità.**
- **Brano**: in alto la mappa del brano, una barra con le sezioni in fila. Verde = già live, bordo bianco = la stai sentendo in cuffia, grigio = pronta. Sotto, le sezioni come card, ognuna con i tasti `cuffia ⌘↵` e `go live ⇧⌘↵`. Si può anche selezionare solo qualche riga di una sezione e mandare solo quelle. Le sezioni già live si richiudono in una riga sola in alto, così vedo subito cosa mi manca.
- **Libero**: un editor vuoto per scrivere da zero.
- Le note che suonano in cuffia sono evidenziate in bianco.

**GO LIVE.**
- Scelta "entra tra 1 · 2 · 4 · 8 cicli", predefinito 1.
- **Scrittura a macchina**: il codice viene scritto nel LIVE lettera per lettera, a una velocità calcolata per finire esattamente quando entra. Lo sparo durante il terzo ciclo, si scrive durante il terzo, al quarto parte. Se il tempo che resta è troppo poco, scrive più veloce, ma entra comunque a tempo. Durante la scrittura il livello mostra "entra al ciclo N", una barra di avanzamento e il conto alla rovescia.
- Un livello con lo stesso nome di uno già live lo sostituisce al confine del ciclo.
- Togliere un livello (×) lo fa uscire a fine ciclo, con il codice che si cancella lettera per lettera all'indietro.
- La scrittura a macchina si può spegnere dalle impostazioni: in quel caso il codice appare subito ed entra comunque a tempo.

**LIVE (destra).**
- Pila di livelli. Ognuno mostra: nome, provenienza (`notte §2` o `jam`), volume, muto, ×, il codice con le note che suonano evidenziate in verde con bagliore, una piccola griglia ritmica.
- Il volume e la sfumata passano dal guadagno dell'orbit di ogni livello, come avevi proposto.
- In fondo alla pila il livello **jam**: si scrive direttamente live per improvvisare, `⌘↵` applica al ciclo successivo.
- Barra in fondo: avanzamento del ciclo in quarti, conteggio "2 live · 1 in arrivo".

**Browser (sinistra), tre schede.**
- **suoni**: tutto quello che c'è nello stash, per cartelle, con ricerca. `▶` lo fa sentire in cuffia, `+` lo inserisce nel CUE dove c'è il cursore.
- **libreria**: brani e pezzi dello stash. Un clic carica il brano nel CUE.
- **help?**: la guida di Strudel fatta bene, prendendo ispirazione dal pannello di destra di Strudel. Funzioni con una spiegazione corta in italiano ed esempi da copiare o inserire con un clic. Il contenuto sta in un file locale, così funziona offline.

---

## 4. Help

- Suggerimento al passaggio del mouse: dopo circa 800 ms di mouse fermo su un comando compare un riquadro chiaro con nome, spiegazione in una riga e scorciatoia.
- Riquadro **help?** in basso a sinistra, come l'Info View di Ableton: spiega quello che hai sotto il mouse.
- Si spengono separatamente dalle impostazioni, o con `⌘I`.
- Tutti i testi dell'interfaccia stanno in un solo file (per esempio `testi/it.json`), pronti per una traduzione inglese per la community.

---

## 5. Impostazioni

Riferimento: `design/riferimenti/impostazioni.html`. Sezioni: generale, audio, scorciatoie, proiezione, stash, estensioni.

- **Audio**: uscite live e cuffia, offset cuffia, il test di sfasamento, la prova col cavo e i pulsanti di robustezza. Tutta la roba di test della fase 0 va qui, fuori dalla postazione.
- **Scorciatoie**: tutte le azioni sono rimappabili. Clicchi sulla scorciatoia, premi la combinazione nuova, si salva. Se la combinazione è già usata, avvisa. Tasto "ripristina".
- **Proiezione**: hydra on/off (spento = sul proiettore solo il codice, per i set easy), scrittura a macchina on/off, gatto on/off, insegna TECNOLOGIA CANAGLIA on/off, logo sopra hydra on/off (gatto, CUTX e insegna). Alcune avranno effetto solo dalla fase 3, ma salvale già adesso.
- **Help**: suggerimenti al passaggio on/off, riquadro help on/off.
- Le preferenze della macchina (uscite audio, scorciatoie, interruttori) stanno nei dati dell'app. Quelle del set (BPM predefinito, ecc.) stanno in `stash.json`.

Scorciatoie predefinite:

| Azione | Tasto |
| --- | --- |
| prova in cuffia | ⌘↵ |
| go live | ⇧⌘↵ |
| entra tra 1 · 2 · 4 · 8 cicli | 1 · 2 · 4 · 8 (fuori dall'editor) |
| togli livello a fine ciclo | ⇧⌘⌫ |
| muto livello | ⌃1–9 |
| ferma tutto | ⌘. |
| cuffia on / off | ⌘K |
| passa da CUE a LIVE | tab (fuori dall'editor) |
| help on / off | ⌘I |
| esci dall'editor | esc |
| impostazioni | ⌘, |
| salva il brano | ⌘S |
| salva il live come brano | ⇧⌘S |
| + sezione dalle righe selezionate | ⌘E |
| frase da capo al prossimo ciclo | ⌘0 |
| paracadute "CUTX, scelgo te!" (e ritorno) | ⌘P due volte di fila |

---

## 6. Grafica

Segui `design/DESIGN.md` alla lettera: colori, il verde marcio solo per ciò che è live, tasti a keycap, Canaglia Stencil per wordmark e titoli, Fragment Mono per tutto il resto. I font vanno inclusi nell'app come file locali. Il gatto cambia posa da solo secondo la sequenza indicata e si spegne dalle impostazioni.

---

## 7. Fuori dalla fase 1

Finestra del proiettore e Hydra (fase 3: le tavole `proiettore.html` e `proiettorehydra.html` sono già pronte), APC mini e Pocket Operator (fase 4), `.dmg` (fase 5), estensione AI (fase 7).

---

## 8. Fatto quando

- L'app si chiama CUTX ovunque, il repo è `vxlyps/cutx`, il Dock mostra il gatto.
- Carico un brano dalla libreria, provo le sezioni in cuffia mentre altre suonano, e le mando live una alla volta: entrano a tempo, scritte a macchina.
- Mando live solo alcune righe di una sezione.
- Improvviso nel livello jam mentre il brano suona.
- Suono 20 minuti di fila solo da tastiera, senza buchi.
- Cambio una scorciatoia nelle impostazioni e funziona subito.
- Blocco o faccio crashare interfaccia e cuffia: le casse non perdono un colpo.
- La postazione corrisponde a `design/riferimenti/main.html`.

---

## 10. Aggiunte approvate dopo il passo 3

Valerio ha approvato la grafica dei passi 2 e 3 ("è come il canvas"). Queste aggiunte valgono come decisioni.

**Ritocchi grafici (subito).**
- Negli editor niente barra di scorrimento orizzontale: le righe lunghe vanno a capo. Le barre verticali, se servono, scure come in DESIGN.md.
- Insegna TECNOLOGIA CANAGLIA come un neon: sempre visibile, spenta (verde scuro, senza bagliore). A intervalli casuali tra 20 e 60 secondi si accende con un tremolio da neon, resta accesa qualche secondo e torna spenta. Discreta. Non è più legata al gatto.

**Conteggio a frasi (subito: barra in alto, barra del LIVE; poi proiettore).**
- Il ciclo interno di Strudel non si tocca mai (`<a b c>` dipende da lui).
- Si vede la posizione nella frase: numero grande da 1 a 16 che poi ricomincia, più i quattro pallini delle battute.
- Accanto, piccolo, il tempo del set da quando è partito il primo livello live (mm:ss, poi h:mm:ss).
- Clic sul numero, o ⌘0 (rimappabile), fa ripartire la frase da 1 al prossimo ciclo. Azzera solo la visualizzazione.
- Lunghezza della frase 8, 16 o 32, predefinita 16.

**Il CUE come editor musicale (passo 4).** È il cuore di CUTX, va fatto curatissimo.
- Due modi di creare le sezioni, stesso risultato: scrivere a mano `// @sezione nome`, oppure selezionare delle righe e premere "+ sezione" (⌘E, rimappabile). Compare un menu rapido con i nomi più usati (intro, drum, basso, melodia, break, drop, outro) e uno libero. Le righe selezionate diventano quella sezione e la riga `// @sezione` si inserisce da sola.
- Le sezioni si vedono anche in modalità libero: etichetta col nome a inizio blocco e fascia sottile sul margine sinistro. Si rinominano, uniscono, dividono e riordinano trascinandole nella mappa del brano.
- ⌘S salva come brano `.cutx` nella libreria dello stash (la prima volta chiede il nome); in modalità brano salva le modifiche fatte sulle card.
- Il file torna indietro identico: stesse sezioni, stesso ordine, stessi nomi, commenti e preambolo; la mappa si ricostruisce da sola.
- In testa al file: nome, BPM, data, elenco dei suoni dello stash che usa. Se lo stash non ha dei suoni del brano, lo dice subito, prima di suonare.
- "Salva il live come brano" (⇧⌘S, rimappabile): i livelli che suonano diventano un brano nuovo, un livello per sezione, col loro nome, nell'ordine di entrata. Volume e muto si salvano come informazioni della sezione. Serve a catturare una jam fatta a casa.
- Il brano salvato compare subito nella scheda libreria.
- Test automatici che salvano e riaprono brani di prova e verificano che non si perda niente.

**Paracadute "CUTX, scelgo te!" (comportamento al passo 6, impostazioni al passo 9).**
- Pulsante piccolo nella barra del LIVE con il gatto in piedi (`gatto_in_piedi_logo_marcio.svg`). Solo per le emergenze: si attiva tenendolo premuto un secondo, o con ⌘P premuto due volte di fila (rimappabile).
- Al battito successivo tutti i livelli escono ed entra il codice paracadute, subito, senza scrittura a macchina. I livelli tolti si conservano: lo stesso comando, ripetuto, li rimette com'erano al ciclo successivo.
- Il codice paracadute si scrive nelle impostazioni, in un editor con "prova in cuffia", e si salva in `stash.json` (ogni set ha il suo). Interruttore per toglierlo del tutto (spento = il pulsante non c'è).
- Collegato: se il codice di un livello live ha un errore, continua a suonare la versione precedente. L'errore si vede solo sul mio schermo, mai sul proiettore.

**Hydra che ascolta (fase 3).** Oltre al tempo, i video reagiscono al volume reale della cassa e dei bassi, letto dal motore live.

## 9. Ordine dei passi

1. Rinomina, stash, icona, migrazione dei dati.
2. Motore live separato e test di robustezza.
3. Struttura della postazione e base grafica (colori, font, tasti, gatto, insegna). Più i ritocchi grafici e il conteggio a frasi della sezione 10.
4. Formato brano, CUE con mappa e sezioni, modalità libero, salvataggio ed esportazione (sezione 10).
5. GO LIVE con entrata a tempo e scrittura a macchina.
6. Livelli live, volume, muto, uscita, jam, note evidenziate, paracadute.
7. Browser: suoni, libreria, help.
8. Help al passaggio e riquadro help.
9. Impostazioni e scorciatoie personalizzabili (compresi lunghezza della frase e paracadute).

Daje.
