# CUTX 5.1: tutto quello che è nuovo o cambiato (per il manuale stampato)

Ogni voce dice **dove sta**, **cosa fa**. Le scorciatoie si cambiano in Impostazioni → scorciatoie.

## 1. PROJ (un progetto per volta)

**Cosa sono.** Ogni PROJ è una cartella `PROJ/PROJ NN/` nello stash, con i suoi brani (`libreria/`), il suo set (`set.cutx`), il suo kit (`kit.cutx`) e `proj.json` (numero e sottotitolo). Restano comuni a tutti: i suoni (`suoni/`), i video, le estensioni e `colpi.cutx`. Alla prima apertura la libreria e il set di prima vengono **copiati** (non spostati) in PROJ 01.

| Dove | Cosa | Che fa |
|---|---|---|
| Barra in alto, tasto **PROJ** (scritta «PROJ 03 · sottotitolo», oppure «PROJ –» senza stash) | clic | Apre la schermata dei PROJ. Il live non si ferma. |
| Schermata dei PROJ, all'avvio | schede **PROJ 01, 02…** | Una scheda per PROJ: numero (Fragment Mono), sottotitolo, quanti brani. Gatto verde in basso a sinistra, logo e stencil come il resto di CUTX. |
| Numero sulla scheda | colore | **Verde** solo se da quel PROJ suona qualcosa nel live; bianco altrimenti. Il PROJ aperto ma fermo resta bianco con la scritta **«aperto»**; «ultimo» segna l'ultimo usato. |
| Sottotitolo («scrivi cos'è») | campo di testo | Descrizione libera del PROJ; si salva in `proj.json`. |
| Pulsante **apri** | clic | Apre quel PROJ: cambiano libreria, set e kit. Se il live suona, il primo clic dice «il live suona e continua: cambiano libreria, set e kit · premi di nuovo per confermare» e il pulsante diventa **«apri comunque»**. Sul PROJ già aperto il pulsante è **«torna»**. Al passaggio del mouse il contorno diventa bianco. |
| Pulsante **+ nuovo PROJ** | clic | Crea PROJ NN+1. Chiede un sottotitolo («cos'è (si cambia dopo)») e dice da dove prende il kit: **«kit da PROJ NN»** (copiato dall'ultimo aperto) o **«kit vuoto»**. |
| Tasto **esc** | tastiera | Chiude la schermata dei PROJ. |
| Impostazioni → **riapri l'ultimo PROJ** | interruttore | Se acceso, all'avvio si apre da solo l'ultimo PROJ usato, senza la schermata. Il PROJ si cambia sempre dal tasto PROJ. |
| Browser (libreria) → **altri PROJ** | sezione | I brani e le clip degli altri PROJ. **copia** porta un brano nella libreria del PROJ aperto (avviso «copiato in libreria: …»). Le clip hanno **→ brano** (in fondo al brano aperto nel CUE, ⌘S per salvarlo) e **→ kit**; senza brano aperto c'è solo → kit. Ogni clip copiata porta la riga `// viene da PROJ 01 · nome`. |

## 2. DRUM (scheda della vista SYNTH)

**Dove.** Vista **SYNTH** (tasto SYNTH in alto, o ⌘2) → terza scheda **drum**, accanto a **suono** e **note**. Sostituisce le manopole con una griglia a passi.

| Elemento | Che fa |
|---|---|
| Schede **suono · note · drum** | Cambiano scheda. Dalla scheda drum si torna alle altre dallo stesso posto. |
| Campo nome (stencil) | Il nome della clip quando la mandi al CUE. |
| **▶ cuffia** (⌘↵, oppure **Spazio** a campo di testo non attivo) | Suona la griglia nella cuffia, a tempo col live; ricliccando ferma. Una **testina** (contorno ambra) corre sulle colonne. Toccando un passo mentre suona la cuffia riparte col codice nuovo. |
| Menu **16 passi / 32 passi** e **1 / 2 / 4 cicli** | Il formato. Se un cambio fa perdere passi lo dice («N passi persi (⌘Z per tornare)»). 2 cicli = `.slow(2)` nel codice. |
| Righe della griglia | Una riga per suono. Il menu a sinistra sceglie il suono: gruppi **stash**, **Strudel** (bd sd hh oh cp rim lt mt ht cb cr rd) e, se serve, **altro**. **×** toglie la riga. |
| Celle | **Clic**: accende (velocity .8) o spegne. **Trascina su e giù**: velocity (la barretta dentro la cella). Il contorno bianco al passaggio del mouse; ogni quarto ha un fondo più chiaro. |
| **+ suono** (sotto la griglia) | Aggiunge una riga spenta con quel suono. Massimo 16 righe. |
| Pannello **codice** (a destra) | Mostra il codice vero e **si può scrivere**: quello che si legge muove la griglia. Le righe che non si leggono (ritmi `bd*2`, `[ ]`, altri effetti come `.lpf`, commenti scritti a mano su una riga con passi) **restano com'erano**, mostrate come testo con la scritta «non si legge: resta nel testo», e un avviso «riga N: non si legge, resta nel testo». Un testo che non è una griglia dà «codice: …» e non cambia niente. |
| **Destinazione** + **→ CUE** | Manda la clip (con la riga `// @drum` e la marca **· drum** sul nome) al brano attivo, al prossimo brano o al kit. Il nome non si ripete (aggiunge « 2»). |
| **⌘Z / ⇧⌘Z** | Annulla e rifà un gesto alla volta (un trascinamento intero è un gesto). |
| Card con la clip | Il pulsante **drum** sulla card (CUE e LIVE) riapre la clip nella griglia. Sulle clip del synth il pulsante resta **synth**. |
| Sotto il BEAT e le clip · drum | L'onda LED (vedi sotto). |

**Non c'è ancora** (5.2): REC e tasti del Mac che suonano le righe, → CUE come scena del beat, controller a ruoli.

## 3. Onda sotto la batteria

| Dove | Cosa | Che fa |
|---|---|---|
| Card del BEAT e card delle clip segnate **· drum** (riga `// @clip nome · drum`) | striscia | Al posto delle note, un'**onda LED** del suono vero, grande, con il radar fisso sul ciclo (il giro nuovo riscrive il vecchio). Più alta della striscia delle note. |
| Clic sulla striscia | alterna | **Onda ↔ note**, per ogni card. |
| Proiettore | segue | Ogni card mostra quello che hai scelto sulla postazione. |
| Impostazioni → proiezione → testi per il pubblico → **onda sotto la batteria** | interruttore | Se spento non c'è onda da nessuna parte (né postazione né proiettore). |
| Se il live è sotto sforzo | automatico | L'onda si ridisegna più piano, prima sulla postazione e poi sul proiettore. |

## 4. Mani (sperimentale, spente di serie)

**Cosa fanno.** La webcam vede la tua mano (MediaPipe, tutto in locale, nessuna immagine esce dal Mac) e la usa come un Kaoss Pad. Lavora su tutto il live (una riga `all(x => …) // mano`) o sul livello scelto.

| Dove | Cosa | Che fa |
|---|---|---|
| Tasto **M** (fuori dagli editor) | scorciatoia «mani on / off» | Accende e spegne. Da spente la camera è chiusa del tutto. Ci vogliono ~7 secondi prima della prima lettura. La prima volta macOS chiede il permesso della camera: consenti. |
| Tasto **⇧M** | scorciatoia «mani: modo dopo» | Passa FILTRO → SPAZIO → CTX → FILTRO. Si riparte da neutro e va riagganciata la mano. |
| **Aggancio** | gesto | Mano **aperta e ferma** verso la camera per ~½ s (tarabile): un anello si riempie e compare **AGGANCIATA**. Una mano che passa non aggancia. Al momento dell'aggancio il valore non salta: la mano lo sposta da dov'è. |
| **Pugno** | gesto | **Blocca**: il valore resta dov'era un attimo prima di chiudere la mano e la riga resta nel live. Per riprendere: mano aperta e ferma. |
| **Mano persa** | automatico | Il valore resta fermo 2 secondi, poi torna a neutro piano in 2 cicli. Se rientri e la tieni ferma ¼ s riagganci da dov'eri. |
| Modo **FILTRO** | | altezza = taglio (200–16000 Hz), destra-sinistra = risonanza. |
| Modo **SPAZIO** | | altezza = riverbero, apertura delle dita = eco. |
| Modo **CTX** | | altezza = crush, destra-sinistra = distorsione. |
| **Finestrella** (colonna a sinistra, sopra l'aiuto) | | Camera a specchio con lo scheletro, **nome del modo** grande, anello dell'aggancio, due barre (i due valori), stato (AGGANCIATA, «mano persa · valore fermo», BLOCCATA…) e valore. Verde mentre comanda, ambra mentre aspetta o torna a neutro. **Trascina sull'immagine** per disegnare la **zona** (conta solo la mano il cui centro è dentro, la più grande); **doppio clic** = tutta l'inquadratura. |
| Impostazioni → **MANI** | sezione | **mani pronte all'avvio** (spento) · **modo di partenza** · **su cosa agisce** (su tutto il live / sul livello scelto) · **durata dell'aggancio** (0,3–1,5 s) · **riconosci fino a 2 mani** (più pesante: ~48% di un core contro ~27%) · **camera** · **sensibilità** (quanta strada fa la mano). |
| Proiettore | la mano | Solo la mano (scheletro verde col bagliore), **a destra** dove sono l'insegna e il gatto (che si spengono finché la mano si vede), **senza riquadro**, con sotto piccoli i **valori** che sta muovendo. Mai l'immagine della camera, non specchiata. Prima dell'aggancio grigia e tenue, agganciata verde piena, col pugno ferma e spenta. Non si taglia mai: al bordo si ferma, se è vicinissima alla camera si rimpicciolisce. |
| Impostazioni → proiezione → testi per il pubblico → **la mano sul proiettore** | interruttore | Acceso di serie (vale quando le mani sono accese). |

## 5. Card, icona e altre rifiniture

- **Card dei livelli** (BEAT, APERTURA, scene, clip): niente più striscia verde a sinistra; tutti i bordi uguali, la card scelta ha un contorno. Il **verde** compare su una card solo quando quella cosa suona nel live.
- **Icona**: gli angoli sono arrotondati (prima nel Dock usciva un quadrato bianco) con un bordo verde sottile.
- **Pulsante «apri» dei PROJ**: non salta più in alto quando lo premi.
- **Prove**: `npm run prova:tutto` è il giro lungo (volume al 20% e poi rimesso); `npm run prova:parte -- nome` una parte sola. Una prova alla volta: se un'altra gira, aspettano (con `CUTX_PROVA_NOME=altro` si usano dati di prova separati).
