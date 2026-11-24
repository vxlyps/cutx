# Check-up C · controller MIDI e navigazione (sola lettura)

Letti per intero: controller.js, controller-mappa.js, controller-mc.js, controller-colpi.js, controller-synth.js, scorri.js, i 3 test, FASE-4-MANI.md. Letti a pezzi: app.js, cue.js, pila.js, motore.js, stile.css. NON letti per intero: impostazioni-controller.js (solo grep), colpi.js (solo intestazione). Test puri eseguiti: 51 passano (controller, controller-synth, scorri). Niente app avviata, niente file toccati.
Tutti i percorsi sono in src/renderer/ salvo diversa indicazione.

## 1. MAPPA

### Il percorso di un messaggio
Web MIDI `navigator.requestMIDIAccess({sysex:false})` (controller.js:74) -> `cerca()` sceglie la prima porta il cui nome combacia con /x-?touch mini/i (controller-mc.js:13; controller.js:79-85) -> `ingresso.onmidimessage` (:84) -> `riceve(bytes)` (:134) -> `decodifica()` (controller-mc.js:45: canale 11 = "standard", CC16-23 = manopola relativa, note 32-39 = push, note dei tasti da `tab`, 0xE0 = fader 14 bit) -> deduce `modo` (:136) -> MOVIOLA `registra` (:148) -> tasto SEGNA / scelta tasto SEGNA (:149-159) -> monitor impostazioni (:160) -> calibrazione (:161) -> se `modo !== 'MC'` si ferma (:162) -> `esegui(e)` (:166) -> `giraManopola` / `premiPush` / `premiTasto` / `muoviFader` / `vaiA` -> `this.azioni.*` (app.js:1632-1760) -> `live.manda(...)` ai motori.
Uscita: `luci()` ogni 150 ms (:93, :867) confronta le luci desiderate con le ultime mandate (`ultime`) e manda solo le differenze.
Lo stato `nelSynth` (vista SYNTH e preferenza != 'live', app.js:1743) sposta tutto su `giraSynth/premiPushSynth/premiTastoSynth`.

Numerazione: il file usa tasto n = 1..8 fila alta, 9..16 fila bassa (note predefinite controller-mc.js:18). Layer A = nota 84, B = nota 85.

### Modalità LIVE, pagina A (controller.js:283-293, 473-514, 518-640)
| Elemento | Azione |
|---|---|
| Manopola 1 gira | `scorriCue(passi)` (:304) -> `cueSposta(sign)` -> `spostaSelezione` app.js:989: una voce per messaggio |
| Manopola 1 push | `ascoltaScelta` (:312): cuffia on/off |
| Manopole 2-7 giro | volume del livello del posto (2=beat, 3-7 clip), passo 0.02 (mappa:121) |
| Manopole 2-7 push breve | muto (:510); tenuta >=350 ms = seleziona il livello, il muto non scatta |
| Manopole 2-7 tenuta + giro | filtro (`lpf`) del livello (:288) |
| Manopola 8 giro | volume generale (`giraMaster` :326); push 8: avviso "niente muto" |
| Tasto alto 1 / 2 | scena indietro / avanti (:614), a fine frase |
| Tasto alto 3 | tocco: cambia linguetta CUE; tenuto 1 s: passa al prossimo brano (:571) |
| Tasto alto 4 | tocco: cuffia on/off (al rilascio); tenuto + tasti 1/2: brano precedente/successivo del set (:552) |
| Tasto alto 5 | GO LIVE (:627) |
| Tasto alto 6 | TOGLI (:632) = `togliLivello(pila.selezionato ?? undefined)` app.js:1724 |
| Tasto alto 7 | "piano": NON implementato, scrive "piano: arriva presto" (:638) |
| Tasto alto 8 | paracadute, tenuto 1 s (:556) |
| Tasti bassi 9-16 | i colpi di colpi.cutx (otto predefiniti: roll, stop, mezzo, doppio, indietro, spezza, sale, eco), controller-colpi.js |
| Layer A / B | cambia pagina; B di nuovo in B = alterna livello/globale (:226) |
| Fader | 1 solo effetto su tutto (impostazioni: filtro, lavaggio, break, riser, eco, cattedrale, rottame), riga globale `all(x => ...)` (mappa:46-100) |

### Pagina B (:294-300, 518-533)
Manopole 2-8: filtro, risonanza, eco, riverbero, velocità (a scatti ×¼..×4, 3 passi per scatto), sporco, altezza (±12 st) del bersaglio (`PAGINA_B`, mappa:16). Push = reset del parametro (:502). Manopola 1 = navigazione CUE anche qui. Tasti alti 2-7 = scelgono il bersaglio, 1 non fa niente, 8 = paracadute. Quindi in pagina B il tasto TOGLI NON esiste. Bersaglio "globale" (B due volte): manopola 2 = BPM, 4 = eco, 5 = riverbero di tutti (:439). Tasti bassi = colpi (sul livello selezionato).

### Modalità SYNTH (:667-712, controller-synth.js)
Manopole 1-7 = parametri del gruppo/pagina, push = reset (INIT), push tenuto + giro = fine (1/10); manopola 8 = master LIVE. Tasti alti 1-5 = gruppo (osc, filtro, amp, drive, space; premuto di nuovo = pagina 2), 6-7 liberi, 8 = paracadute. Tasti bassi = cue, mutate, annulla, ripeti, ab, stop, play, rec. Layer A/B ignorati (:169). Fader e paracadute restano del LIVE.

### Modalità MC vs standard
Solo MC è usata: in standard (canale 11) `riceve` mette `modo='standard'`, chiede UNA volta di passare a MC (CC 127, :142-146) e poi ignora tutto (:162). Calibrazione tasti in impostazioni (:723-755).

## 2. BUG (in ordine di gravità)

1. **Dopo uno scollega/ricollega a metà set il controller può restare morto fino al riavvio dell'app.** controller.js:142 `if (nuovoModo === 'standard' && !this.provatoMC)`; `provatoMC` (:143) non viene mai riportato a `false`, nemmeno in `cerca()` (:78-90). Il messaggio stesso dice (:145) che l'X-Touch va in MC tenendo premuto il tasto MC "mentre colleghi l'USB": quindi a ogni ricollegamento a caldo il controller tipicamente torna in standard. L'app chiede MC una sola volta in tutta la vita della sessione. Se il primo CC 127 non basta, o se è già stato usato prima, nessun secondo tentativo. Sicurezza: probabile (dipende da cosa fa l'hardware al ricollegamento; il flag che non si azzera è certo).
2. **Tasto TOGLI premuto due volte di fila può togliere due livelli, o rimettere quello appena tolto.** app.js:1724 `togli: () => togliLivello(pila.selezionato ?? undefined)`; app.js:397-410. Dettaglio nella domanda 4a. Sicurezza: probabile (logica letta, race da verificare a mano).
3. **Colpo o manopola "tenuti" restano bloccati se il controller sparisce mentre sono premuti.** `cerca()` (:78-90) non rilascia niente: `colpi.attivi` (controller-colpi.js:14), `push` (:32), `cuffiaTenuta`, `passaTenuto`, `paracaduteTenuto`. Un colpo "stop" (taglia tutto) o "sale" tenuto resta attivo nel live; il rilascio non arriverà mai. Si libera solo ripremendo e rilasciando lo stesso tasto. In più `bersagliBeat()` (controller-colpi.js:49) usa le manopole rimaste "giu" come bersaglio: i colpi successivi finirebbero sulla clip sbagliata. Sicurezza: certo come logica; probabile come evento (serve staccare il cavo con un tasto premuto).
4. **Volume generale: salto udibile dopo ricarica dell'interfaccia o riavvio del controller object.** controller.js:32 `this.master = 1` e :326-330: la manopola 8 è relativa e parte da 1 invece di leggere il valore reale del live (nessuno sincronizza `controllerMidi.master`, grep in app.js: solo :1709). Se il master del live era a 0.5, il primo scatto lo porta a ~1.0. Si verifica dopo un crash/ricarica (guardiano) o a ogni avvio se il live conserva un valore. Sicurezza: probabile (da verificare a mano: dove nasce il valore iniziale del master in motore.js:1172).
5. **Dopo ricarica dell'interfaccia (o riconnessione) le luci non si riallineano finché non tocchi qualcosa.** `modo` parte `'sconosciuto'` (:28) e `luci()` esce se `modo !== 'MC'` (:877); `modo` diventa MC solo al primo messaggio ricevuto. Anelli e tasti restano come li ha lasciati l'hardware (o spenti dopo un ricollegamento) finché non muovi qualcosa. Inoltre `pagina` torna 'A' (:29) mentre il tasto layer B poteva essere acceso. Sicurezza: certo come logica; effetto reale da verificare a mano.
6. **Tasto "cuffia" tenuto e pagina cambiata: stato bloccato.** :540-551: `cuffiaTenuta` si azzera solo al rilascio del tasto 4 in pagina A; se tengo la cuffia, premo layer B e rilascio, il rilascio entra in `if (n <= 7 && this.pagina === 'B')` (:522) e ritorna senza azzerare. Dopo, in pagina A, ◀ ▶ cambiano brano invece di scena finché non rifai tocco sul tasto 4. Sicurezza: probabile, raro.
7. **Il tasto 7 della fila alta è promesso ("piano/registra", mappa:18, FASE-4-MANI.md) ma non fa niente**: :638 scrive solo "arriva presto". Non è un bug di stabilità, è un tasto libero con un'etichetta bugiarda. Certo.
8. **Nessun feedback a fine lista della navigazione**: `spostaSelezione` (app.js:989-995) clampa a 0..n-1 e rilancia la stessa voce: la manopola gira a vuoto e rifà tutto il lavoro DOM sulla stessa voce. Piccolo.

## 3. RISCHI DI STABILITÀ IN SERATA

**Scollega/ricollega.**
- `access.onstatechange = cerca` (:91): un solo handler, sostituito, mai duplicato. `collega()` è chiamata una volta sola (app.js:1765). Non ci sono listener doppi, e `setInterval(luci)` (:93) è creato una volta sola (mai chiuso, ma unico).
- `cerca()` riassegna `onmidimessage` solo se l'oggetto porta è diverso (:81). Se Chrome riusa lo stesso oggetto MIDIInput al ricollegamento (comportamento da verificare a mano), il vecchio handler resta e per spec dovrebbe riprendere a funzionare; se è un oggetto nuovo, il vecchio handler viene azzerato (:82) e il nuovo agganciato: giusto. Non c'è rischio di messaggi doppi.
- `statechange` scatta per QUALSIASI porta MIDI (MiniFuse, ecc.): ogni volta `ultime.clear()` e `cambiato()` ridisegnano tutto. Innocuo, ma ogni lampo dell'interfaccia di impostazioni.
- Se la porta sparisce dalla mappa: `modo='sconosciuto'` (:87) e nessun messaggio viene più interpretato finché il controller non riparla: ok. Se Chrome la tiene in mappa come 'disconnected': `modo` resta 'MC' e `manda()` scrive nel vuoto (catch :105-109, silenzioso, bene).
- Stati "tenuti" bloccati: vedi bug 3 e 6. Il fader non manda stato dopo il ricollegamento: nessun salto, perché l'effetto cambia solo quando muovi il fader (`muoviFader`); ma il valore "vecchio" di `this.fader`/la riga globale nel live resta quello di prima. Il fader NON comanda un volume, comanda un effetto (filtro predefinito): un salto è un filtro che si chiude, non un picco.
- Ricollegamento in standard: vedi bug 1.

**Raffica di messaggi (manopola girata veloce).**
- Volume/parametri: la coda al live è limitata a ~30 al secondo (`mandaCoda` :460, "l'ultima vince"); il fader uguale (:204). Il volume delle manopole 2-7 NON è limitato: `azioni.volume` (app.js:1635) manda un messaggio al live per ogni scatto, ma lo stato locale `l.volume = v` (:1648) tiene il passo coerente. Accettabile.
- Navigazione manopola 1: nessuna limitazione né raggruppamento; ogni messaggio fa `vociNav()` (rilegge e parsa il brano con `B.blocchi`), `attiva`, `mostraBrano(false)`, `mostraModo`, scorrimento, tutto in modo sincrono (cue.js:949-994). In raffica si accumulano; i messaggi non si perdono (Chrome li accoda) ma l'interfaccia può rallentare. Da verificare a mano con una girata a tutta velocità sul brano più grosso.
- Eccezioni dentro l'handler: `onmidimessage = (e) => this.riceve(...)` (:84) non ha try/catch. Un'eccezione ferma SOLO quel messaggio (il browser la segnala e il prossimo messaggio arriva normale), non il controller. Ma può lasciare lo stato a metà (esempio: `riceve` ha già aggiornato `modo`/push prima di un'azione che lancia). `luci()` idem: un'eccezione in `desiderate()` si ripete ogni 150 ms ma l'intervallo non muore. Quindi la domanda "ferma tutto?" = no, ma errori ripetuti restano nel log senza un avviso.

**Interfaccia ricaricata dal guardiano.** Il `Controller` è creato nella pagina (app.js:1632) e chiama `collega()` a ogni caricamento (:1765): quindi si riaggancia da solo con un nuovo `MIDIAccess`. Perso: master a 1 (bug 4), pagina A, tenute, bersaglio, `x` (valori in corso). Le righe globali del fader/colpi già scritte nel live restano (il live non si tocca), con il nuovo controller ignaro: un colpo "stop" bloccato non si vede nell'interfaccia nuova. Luci: bug 5. Il vecchio `MIDIAccess` e i vecchi intervalli muoiono con la pagina (nessuna perdita).

**Timer e listener mai chiusi.** `timerLuci` (:93), `specchio` ogni 100 ms (app.js:1760, 1763), `setInterval(mostra,100)`: vivono tutta la sessione, sono unici, ok. `controller.quandoCambia` accumula ascoltatori senza rimozione (:61): ok perché sono 2, ma `PaginaController` registra il suo una volta sola. Nessun `removeEventListener` necessario oggi. `provaLuci` (:888) usa `setTimeout` sciolti: irrilevante.

## 4. DOMANDE PRECISE

### a. Chiusura delle tracce live dal controller
Sì, esiste: **tasto alto 6, nota 43 ("PLUG-IN")**, solo in modalità LIVE pagina A (in pagina B e nel SYNTH quel tasto fa altro).
Percorso: controller-mappa.js:19 (`TASTI_A[5] = 'togli'`) -> controller.js:632-636 (`lampo`, `azioni.togli()`, scritta "TOGLI") -> app.js:1724 `togli: () => togliLivello(pila.selezionato ?? undefined)` -> app.js:397:
```
const attivi = livelliLive.filter((l) => l.a === null);
const l = id !== undefined ? livelliLive.find((x) => x.id === id) : attivi.at(-1);
...
live.manda({ tipo: 'togli', livello: l.id, dissolvenza: dissolvenza(preferenze.dissolvenzaUscita ?? 0) });
```
- Agisce sul livello **selezionato** (bordo verde: clic sulla card, manopola tenuta, pagina B); se **niente è selezionato** agisce sull'**ultimo entrato** (anche se è il beat o la clip che non intendevi). Nessuna conferma, esce a fine ciclo con la dissolvenza di uscita (predefinita 0 cicli = a fine ciclo). Annullabile solo con ⌘Z che lo rimette **nel CUE**, non nel live (app.js:403-405).
- Cosa succede premendo più volte di fila (motore.js:543-558, pila.js:289):
  1. Primo tocco: il livello selezionato riceve `togli`. Appena il live risponde, quel livello ha `a !== null` e `pila.mostraSelezione()` azzera `selezionato` (la riga `!this.livelli.some(l => l.id === selezionato && l.a === null)`).
  2. Secondo tocco, dopo l'eco: `pila.selezionato` è `null`, quindi `attivi.at(-1)` = **l'ultimo livello entrato**, un altro: viene tolto anche quello. Tre tocchi = tre livelli, fino a svuotare il live. Questo è il caso peggiore in serata.
  3. Secondo tocco molto veloce, prima dell'eco: l'id selezionato è ancora lo stesso; `l.a === null` ancora vero, quindi si registra **una seconda voce nella cronologia** (⌘Z reinserirebbe due copie nel CUE) e il live riceve un secondo `togli` per lo stesso livello; motore.js:550 `if (l.sfuma?.verso === 'esce' && l.a !== Infinity) return salva(l)` => **il secondo togli ANNULLA l'uscita** (il livello resta). Quindi due tocchi rapidi = niente. Il tasto si comporta come un interruttore, senza che nessun LED lo dica.
- Riscontro oggi: solo un lampo di 300 ms sul tasto (:633) e la scritta "TOGLI" senza dire QUALE livello.
- Test: test/controller.test.js:97-104 e :171 verificano solo che `togli` venga chiamato; nessun test sul bersaglio.

### b. Manopola 1 per navigare nel menu: perché è imprecisa
Logica attuale:
- **Encoder relativo** (MC, CC 16): `passiRelativi(v)` (controller-mc.js:35): bit 6 = segno, bit 0-5 = grandezza. Non c'è accumulo, né soglia, né accelerazione per la manopola 1: `scorriCue` (controller.js:304) fa `cueSposta(Math.sign(passi))`: **ogni messaggio MIDI = una voce**, qualunque sia la grandezza (di proposito: test controller.test.js:326-336, "uno scatto, una voce, anche se il giro è veloce (2, 3 passi insieme)", commit d8e9e0f). La manopola X-Touch è senza tacche meccaniche vere e manda un messaggio per ogni piccolissimo angolo: una girata modesta = molti messaggi = molte voci. Il "divisore" che esiste per la velocità (PASSI_PER_SCATTO = 3, mappa:33) non è applicato alla navigazione.
- Indice ricalcolato ogni volta dal DOM: `spostaSelezione` (app.js:989) legge `cue.indiceControllo()` (cue.js:1034 circa) dalla card attiva/dal cursore, non da un contatore. Se lo scatto precedente non ha ancora cambiato lo stato (card nascosta, brano in ricostruzione, `scegliSezione` che torna `null` per card non trovata, cue.js:955-957) il messaggio dopo riparte dalla vecchia posizione: salti persi o ripetuti.
- Raffica: ogni messaggio fa tutto il lavoro (parse del brano, `attiva`, `mostraBrano(false)`, `mostraModo`, `mostraInVista`) in modo sincrono. Con messaggi persi o molto ravvicinati non c'è recupero: nessun contatore interno che dica "avrei dovuto essere alla voce 7".
- Estremi: clamp senza avviso (nessun "inizio/fine"), nessun giro.
- Nota: scorri.js NON c'entra con la navigazione del CUE: gestisce lo scorrimento del codice sul proiettore. Il file che conta è cue.js.

Scorrimento che tiene in vista la voce (cue.js:997-1011, aggiunto in d8e9e0f):
```
const corpo = el.closest('.corpo');
const visibili = [...el.parentElement.children].filter(x => !x.hidden && !preambolo && !senza-apertura && !senza-beat);
if (visibili[0] === el) corpo.scrollTop = 0;
if (r.top < c.top + respiro || r.height > c.height) corpo.scrollTop += r.top - c.top - respiro;
else if (r.bottom > c.bottom - respiro) corpo.scrollTop += r.bottom - c.bottom + respiro;
```
**Causa più probabile del BEAT coperto in alto** (da verificare a mano, non ho potuto vedere lo schermo):
- Non c'è nessun `position: sticky`, `scroll-margin` o `scroll-padding` nella lista del CUE (grep su stile.css: l'unico sticky è `.anteprima` alla riga 2216, nelle impostazioni). Quindi non è una intestazione fissa che copre la voce: è lo scorrimento che porta la voce al bordo alto e fa **uscire sopra il resto**.
- La card BEAT (cue.js:822) e l'APERTURA sono figli di `#carte` insieme alle clip (cue.js:615-616); dentro BEAT, le scene stanno in `.beat-corpo`. Per le clip, `visibili[0]` è sempre la card apertura/BEAT (non è esclusa dal filtro se c'è almeno una scena), quindi la **prima clip non è mai "la prima voce"**, `scrollTop = 0` non scatta, e la clip viene allineata a 6 px dal bordo alto: la card BEAT e l'apertura scompaiono sopra. Chi naviga a clip con la manopola vede il BEAT sparire; tornando indietro alla scena lo rivede (scrollTop=0 perché la scena è l'unica visibile nel suo contenitore).
- In più il titolo di gruppo (`.gruppo-clip`, cue.js:620) non è escluso dal filtro e non viene mai considerato: una clip allineata a 6 px dal bordo lascia fuori il suo titolo di categoria.
- Altra causa possibile: la card BEAT espansa può essere più alta della lista (`r.height > c.height` -> allinea l'alto: nasconde sia la parte sopra sia il fondo).
- Il gradino `.mappa` e `.linguette` stanno FUORI da `.corpo` (index.html:109-119), quindi non sono coperti da scroll.

### c. Tasti liberi oggi
(Fila alta, pagina A LIVE: tutti assegnati tranne uno.)
- **Tasto alto 7 (nota 44, "EQ")**: assegnato a 'piano', ma non fa niente (controller.js:638). È il candidato naturale.
- Pagina B: i tasti alti 2-7 scelgono il livello, 1 non fa niente (:522-524, ma serve per futuro?), 8 paracadute.
- SYNTH: tasti 6 e 7 liberi (:705), ma lì il LIVE non c'entra.
- Fila bassa: 8 colpi, in colpi.cutx; i colpi non definiti sono i tasti "non assegnati" (:67), ma sono dell'utente.
- Layer A/B e push manopole: occupati. Tenuta di una manopola + tasto: combinazione libera (usata solo per i colpi).

## 5. PROPOSTE

### 5.1 Navigazione con la manopola 1 più precisa + BEAT sempre in vista
Come la farei (piccola, ~40-60 righe, tutte in controller.js e cue.js):
1. **Divisore con accumulo** in `scorriCue` (controller.js:304): accumulare i messaggi e muovere di una voce ogni N (N=3 come `PASSI_PER_SCATTO`, regolabile), con accumulatore azzerato dopo 300-400 ms di fermo o a ogni cambio di verso. Si può anche tener conto della grandezza (`Math.abs(passi)`) per non perdere scatti veloci, al contrario di oggi.
2. **Contatore interno** della voce scelta (`this.cueK`) invece di rileggere il DOM a ogni messaggio; si riallinea al DOM solo dopo che l'utente ha cliccato col mouse o dopo un cambio brano. Così messaggi ravvicinati non rileggono lo stato prima che il precedente sia disegnato.
3. **Raggruppare il disegno** con `requestAnimationFrame`: per ogni frame si fa un solo `scegliControllo(k)` con il k finale (la raffica diventa un unico lavoro DOM).
4. **Scorrimento**: in `mostraInVista` (cue.js:997) trattare come "in cima" qualsiasi voce che abbia sopra solo card non-voce (apertura vuota, BEAT, titoli di gruppo): per la prima clip fare `scrollTop = 0`, e per le altre includere sopra la voce anche il suo titolo `.gruppo-clip` (`el.previousElementSibling` se è un titolo). Se la card BEAT è alta, preferire tenere visibile il BEAT in cima.
5. Un segnale a fine lista (breve scritta "FINE"/"INIZIO").
Rischi: tocca lo stesso `spostaSelezione` usato dai test 'cue-vista' (src/main/prova.js, non letto); il test controller.test.js:326-336 dice esplicitamente "uno scatto, una voce" e andrebbe riscritto. Il divisore cambia la sensibilità appena acquisita nel commit d8e9e0f: va deciso con Valerio il numero di messaggi per voce provandolo sul controller vero.

### 5.2 Tasto dedicato "togli dal live" con logica chiara e LED
Oggi un tasto c'è già (6) ma con i difetti del punto 4a. Come la farei (piccola, ~50 righe in controller.js + app.js:1724 + test):
1. **Nessun "ultimo entrato" di ripiego**: se non c'è selezione, il tasto non toglie niente e dice "TOGLI · nessun livello scelto". Si toglie solo ciò che si è scelto di proposito (selezione o manopola tenuta).
2. **Bersaglio esplicito con la mano**: tasto tenuto + push di una manopola 2-7 (o manopola tenuta + tasto) = toglie quel livello (stesso schema dei colpi, controller-colpi.js:49).
3. **Armare, poi confermare**: primo tocco = il livello (nome nella scritta e sullo specchio) lampeggia sulla card e sul tasto; secondo tocco entro ~2 s = conferma e parte `togli`; passato il tempo, si disarma. Evita il tocco doppio involontario e rende tutto visibile.
4. **Stato dal live, non dalla selezione**: `togliLivello` si fa su un id preciso (già lo sa fare); ignorare il tocco se quell'id ha già `a !== null` (non rilanciare il togli, che nel motore equivale a "salva", motore.js:550). Tasto separato per "salva l'uscita" solo se serve davvero.
5. **LED**: tasto 6 lampeggia mentre c'è un livello armato; acceso fisso finché esiste un livello in uscita (come `inAttesa` per go live, :853); si spegne a uscita finita. In `desiderate()` (:821) basta aggiungere due righe agli `stati`.
6. Il tasto 7 libero può restare riserva (es. "togli tutto tranne il beat", ma solo se Valerio lo vuole); non lo userei per questo senza richiesta.
Rischi: cambia un gesto già imparato; il test controller.test.js:97-104/171 va aggiornato; la cronologia (⌘Z) va registrata una sola volta (oggi può duplicarsi).

## 6. QUALITÀ (da sistemare, max 8)
1. `provatoMC` (controller.js:142-143): azzerarlo quando la porta sparisce/riappare, con un massimo di 2-3 tentativi, e avviso in cima all'interfaccia se il controller resta in standard.
2. `cerca()` (:78-90): alla scomparsa della porta, rilasciare tutto quello che è "tenuto" (`colpi.attivi` con `togli`, `push`, `cuffiaTenuta`, `passaTenuto`, `paracaduteTenuto`).
3. Master: leggere il valore reale del live e metterlo in `this.master` all'avvio e dopo ogni ricarica (:32).
4. Luci: al primo `collega()` e a ogni `statechange` inviare le luci anche in `modo === 'sconosciuto'` (o chiedere a MC e poi accendere), non solo dopo il primo messaggio (:877).
5. `try/catch` con log nell'`onmidimessage` e in `luci()` (:84, :867) per non lasciare errori silenziosi e per avere righe nel log delle serate.
6. Tasto TOGLI: correggere come al punto 5.2 (bersaglio, doppio tocco, LED, cronologia unica).
7. Navigazione: divisore/accumulo + `mostraInVista` che include BEAT, titoli di gruppo e prima clip (5.1).
8. Allineare doc e codice sul tasto 7 ("piano/registra" non esiste ancora) e sul tasto 1 della pagina B, per non lasciare tasti che promettono senza fare nulla (mappa:18, FASE-4-MANI.md).
