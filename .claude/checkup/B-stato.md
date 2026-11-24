# Check-up B · interfaccia e logica di stato CUE/LIVE

Sola lettura. Letti per intero: app.js, cue.js, pila.js, coda.js, brano.js, set.js, set-vista.js, dialogo.js, editor.js, scorciatoie.js, motori.js; letti a pezzi: scrittura.js, striscia*.js, browser.js, aiuto.js, importa.js, index.html (solo grep sui bottoni). Di motore.js solo `entra` (431), `togli` (543), `salva` (561), `dissolvi` (265), `aggiornaLivelli` (750), `ricevi` (1118). I test puri (brano, coda, scrittura, set) passano: 62/62. Nessuna prova audio lanciata, quindi tutto cio' che e' "audibile" qui sotto e' ragionamento sul codice, non verificato a orecchio.

Cartella: tutti i file sono in `src/renderer/`.

---------------------------------------------------------------------------
## 1. MAPPA

### File
- `app.js` (1818): il direttore. Crea i due `Motore` (live, cuffia), il `Cue`, la `Pila`, il `Controller`; tiene lo stato globale; traduce i gesti in messaggi ai motori.
- `motori.js` (84): lato interfaccia di un motore. `manda` (fire and forget), `valuta` (risposta = errore o null), `richiesta` (risposta oggetto), ping ogni 500 ms, "viva" se pong < 1,5 s. Timeout di 5 s su ogni attesa.
- `cue.js` (1190): il CUE. Due modi: libero (un editor, `// @clip` dividono) e brano (card: apertura, beat con scene, clip). Costruisce il "pezzo" da mandare (`pezzo()` 213, `pezzoLibero` 217, `pezzoScena` 245, `pezzoApertura` 261, `pezzoBrano` 277). Slider volume per clip (688-727). Colora le card con quello che suona (`mostraBrano` 481).
- `pila.js` (523): le card del LIVE e il jam. Non decide niente: disegna `livelliLive` (`aggiorna` 81, `disegna` 412). Volume/muto/× (166-237), modifica sul posto (`apriModifica` 322, `applica` 371).
- `brano.js` (403): formato `.cutx` puro (`leggi` 72, `scrivi` 110, `codice` 181, `codiceScena` 211, `daLivelli` 367).
- `coda.js` (180), `set.js` (116): moduli puri (code `.lpf(...)`, ordine della serata).
- `set-vista.js` (228): scheda SET e KIT del browser (`Serata`).
- `scorciatoie.js` (132): tabella tasti (puro). Tutti gli id di AZIONI hanno un `FA[...]` in app.js:719 (controllato a mano).
- `editor.js` (146): wrapper CodeMirror (`creaEditor`), fasce colorate per sezione.
- `dialogo.js` (130): `chiediNome`, `conferma` (uno alla volta: aprirne uno chiude l'altro con "no").
- `aiuto.js` (133): suggerimenti al passaggio del mouse (listener su document, una volta sola).
- `browser.js` (271): schede suoni/set/libreria/ableton/help; anteprima in cuffia con `ascoltando`/`inPartenza`.
- `importa.js` (460): procedura guidata Ableton (3 passi); anteprima in cuffia.
- `scrittura.js`, `striscia.js`, `striscia-vista.js`: funzioni pure/grafiche (macchina da scrivere del proiettore, striscia delle note).
- `index.html`: bottoni `data-entra` (124-127), `data-diss` (133-136), `#go-live` (130), `#manda-live` (103).

### Dove vive lo stato
- IN CUE (solo interfaccia): `cue.slot.{attivo,prossimo}` = `{file, modello, sporco, scenaScelta, aperturaModo...}` (cue.js:42); `cue.libero` (testo); `cue.cartaAttiva` (la card che GO LIVE manderebbe, cue.js:48); `cue.linguetta` (43); `cue.stati` = copia di cosa suona (141); `cue.beat` = stato del beat (191).
- IN CUFFIA: `pezzoCuffia` (app.js:73) = ultima cosa mandata; `cuffia.stato` (ultimo pong); `dovaCuffia` per l'evidenziazione.
- LIVE (verita' = motore live): array `livelli` del motore (motore.js:151). Ogni livello: `id,nome,provenienza,codice,coda,da,a,volume,muto,beat,sfuma`. `da` = ciclo in cui entra, `a` = ciclo in cui esce (Infinity = resta). Arriva all'interfaccia in due modi: spinta `{tipo:'livelli'}` a ogni `aggiornaLivelli` (motore.js:750 -> app.js:1433) e dentro ogni pong (500 ms). In app.js e' `livelliLive` (75); `mostraLive` (1287) sceglie il piu' recente.
- "Sta entrando" = `a === null && da > ciclo` (nel motore `a === Infinity`, nell'interfaccia `a:null`; `da:null` = -Infinity). "Sta uscendo" = `a !== null` (finche' non viene potato da `pulisci`, motore.js:762); se c'e' dissolvenza anche `sfuma.verso === 'esce'`.
- Preferenze di gesto: `entraTra` (app.js:78), `dissEntra` (77), mai salvati su disco; `preferenze` (82) dai dati dell'app.
- Beat: non e' un campo a parte: e' il livello con nome `beat` (o `spina`, `eNomeBeat` in nomi.js) e con `l.beat = {base, indice, scene}`. Sta sempre in cima alla pila (pila.js:98), sul posto 2 del controller (pila.js:159). `statoBeat()` (app.js:267) lo ricava; `mostraBeat` (304) lo passa al CUE.

### Chi modifica cosa
- `goLive` (app.js:226): CUE -> `live.richiesta({tipo:'entra'...})` (unico ingresso dei livelli, insieme a `muoviScena` 276, `passaBrano` 327, `pila.applica` 1247, `gestisciTemp` 1596, `ripristinaLive` 1152).
- `togliLivello` (397) -> `{tipo:'togli'}`; `fermaTutto` (536) -> `{tipo:'ferma'}` a entrambi; `lanciaParacadute` (470).
- Volume/muto/coda: `{tipo:'livello'|'coda'}` (pila 1236-1245, controller 1635-1655, coda 196, 412, 426).
- Il motore risponde `risposta {da, livello | errore}` (a `richiesta`) e spinge `livelli`, `mappa`, `globali`, `strisce`, `misure`, `suoni-mancanti`, `guardiano` (app.js:1430-1450).
- Ritorno all'interfaccia: `setInterval(mostra, 100)` (1773) -> `mostraLive` (pila), `mostraCue` (1293: `cue.aggiornaStati`, `mostraBeat`, `controllaPassaggio`, `serata.segnaLive`), `disegnaTempo`. In piu' `requestAnimationFrame(mostraTempo)`.
- Recupero: se il live rinasce vuoto (`live.suCollegato` 1465) `ripristinaLive` rimette i livelli dall'istantanea (`aggiornaIstantanea` 1144). Se l'interfaccia rinasce: `riprendi` (1097) e `localStorage` per la bozza (115-136).

---------------------------------------------------------------------------
## 2. BUG (in ordine di gravita')

### B1 · Togliere un livello che sta ancora entrando come sostituto lascia un buco (silenzio) — CERTO nel codice, effetto audio da verificare a mano
- `motore.js:449-466` (`entra`): quando un livello nuovo sostituisce uno con lo stesso nome, il VECCHIO riceve `vecchio.a = da + d.cicli` (esce quando entra il nuovo). `motore.js:543-558` (`togli`): se si toglie il nuovo prima che entri (`l.da > ciclo` -> `parte = 0`, `a = fine`) NESSUNO rimette il vecchio. Il campo `l.sostituisce` (476) lo usa solo il guardiano degli errori (722-736).
- Per chi suona: mando live la versione B di "basso" (entra tra 4), mi pento, premo × sulla card che sta entrando: ma anche il "basso" A che suonava esce comunque a fine finestra. Resta il silenzio. Vale anche per il beat (cambio scena) e per ogni GO LIVE-sostituzione, anche con ⇧⌘⌫ (che prende proprio l'ultimo entrato, cioe' il nuovo).
- Rimedio: in `togli`, se `l.sostituisce` esiste, `l.da > ciclo attuale` e `vecchio.a !== Infinity`: `vecchio.a = Infinity; annullaDissolvi(vecchio)`. 6 righe in motore.js (zona C/motori, non mia).

### B2 · Modificare il beat dalla sua card LIVE (⌘↵) gli fa perdere `beat` (scene) — CERTO nel codice
- `app.js:1254-1262` (`pila.azioni.applica`): `entra` senza campo `beat`; `motore.js:431,444`: `beat = null` di default, e `l.beat = beat`; il ciclo `scambi` (447-466) copia volume, muto, coda, inizio ma NON `beat`.
- Conseguenze: `statoBeat()` (app.js:269 filtra `l.beat`) non vede piu' il beat -> il CUE spegne le pillole "live" (`aggiornaBeat(null)`), ◀ ▶ dicono "non c'e' un beat nel live" (280), `passaBrano` non riconosce piu' `suona.beat.base` (375) quindi il brano "prossimo" non diventa mai "attivo" da solo, `salvaLiveComeBrano` (501) salva il beat come clip normale chiamata "beat". L'audio continua. Stessa cosa con una clip chiamata "beat" rimessa nel CUE da ⌘Z dopo un togli (app.js:404-406 -> `cue.reinserisci` 460 crea una clip di nome `beat`; mandata live sostituisce il vero beat per nome, senza `.beat`).
- Rimedio: passare `beat: livello?.beat ?? null` in applica (1 riga) e/o far copiare `l.beat` al motore quando sostituisce un livello con lo stesso nome e `beat === null`.

### B3 · GO LIVE di una scena del beat dal testo libero puo' fare un "passaggio di brano" — PROBABILE (dipende dallo scenario: scratch con `// @beat`)
- `app.js:233`: `if (daCue && p.beat && cue.linguetta === 'prossimo' && cue.slot.attivo && cue.slot.prossimo) return passaBrano(p.beat.indice);`. Non controlla `cue.modo`. `cue.linguetta` vale 'prossimo' di default (cue.js:43) e `cambiaModo('libero')` (316) non la cambia. In una serata normale `attivo` e `prossimo` sono entrambi pieni (`caricaProssimoDopo` 1022).
- Per chi suona: scrivo nello scratch un `// @beat` con scene e premo ⇧⌘↵ sulla scena: invece di entrare nel mio scratch parte la transizione verso il PROSSIMO brano (sweep, gli altri livelli escono, `T.perIlLive` app.js:353). Il testo dello scratch non viene nemmeno mandato.
- Rimedio: aggiungere `cue.modo === 'brano'` alla condizione (1 riga).

### B4 · Con dissolvenza in uscita > 0 un secondo clic sulla × (anche un doppio clic) annulla l'uscita — CERTO, voluto ma pericoloso
- `motore.js:550`: `if (l.sfuma?.verso === 'esce' && l.a !== Infinity) return salva(l)`; `app.js:397-408` non distingue; `pila.js:211` la × resta cliccabile sulla card che sta sfumando. Un doppio clic accidentale (o un trascinamento) = "togli e subito rimetti". Con dissolvenza 0 (default) il secondo clic non fa niente (`l.sfuma` e' null, motore.js:551 esce) quindi il problema appare solo con dissolvenza in uscita impostata.
- Il testo sulla card dice "sfuma a fine ciclo · clic per tenerlo" (pila.js:428) ma la × non dice niente di diverso.

### B5 · La preferenza "striscia" non arriva al live finche' non si riavvia — CERTO
- `app.js:1778-1785`: `preferenze = p;` e SUBITO DOPO `if (p.striscia !== (preferenze.striscia))` -> sempre falso (p e' preferenze). Il messaggio `strisce-on` parte solo in `live.suCollegato` (1467). Spegnere/accendere la striscia dalle impostazioni non cambia il live (che continua a calcolare le note, o a non calcolarle) fino a un riavvio del motore.
- Rimedio: confrontare con il valore preso prima di assegnare (come si fa per `dissPrima` due righe sopra).

### B6 · Scena (o clip) vuota: va live come livello silenzioso e SOSTITUISCE quello che suonava — CERTO nel codice
- `cue.js:245-257` (`pezzoScena`), `pezzoBrano` 277: nessun controllo di corpo vuoto (a differenza dell'apertura, 264). `motore.js:178`: `codice.trim() ? evaluate : silence`. `entra` (431-487) accetta `silence`.
- "+ scena" crea una scena con corpo `[]` (cue.js:840, brano.js:228). Se ci si dimentica di scriverla e si preme GO LIVE: la card BEAT diventa "live", il beat vecchio esce, la base sparisce. Questa e' una causa plausibile del "la base non parte" (vedi 4a).
- Rimedio: rifiutare se il corpo (senza commenti) e' vuoto: "la scena e' vuota" (4 righe in `goLive` o in `pezzoScena`).

### B7 · I testi dicono "a fine frase", il codice entra tra `entraTra` cicli — CERTO (incoerenza che inganna)
- `cue.js:519` ("→ «x» entra a fine frase"), `cue.js:534` (titolo bottone: "a fine frase, se il beat suona già"), `app.js:275` (commento ◀ ▶). `muoviScena` (app.js:296) e `goLive` usano `cicli: entraTra`; il motore (440) calcola `prossimoConfine() + cicli - 1`. Nessuna allineatura alla frase (16 cicli): solo la scena "armata" (`alle`, 256) aggancia le clip.
- Per chi suona: pensa che la scena cambi "sul 16", in realta' cambia dopo 1 ciclo (o 4, o 8).

### B8 · Il tasto "togli" da tastiera e dal CUE e' diverso da quello del controller — CERTO
- `app.js:723` FA.togli -> `togliLivello()` senza id -> `attivi.at(-1)` (399-400): l'ULTIMO ENTRATO tra quelli `a===null`, anche se e' il beat, il paracadute, un riser/colpo del controller (`provenienza:'controller'`) o un livello non ancora entrato. Il controller (1724) usa `pila.selezionato ?? undefined`, la tastiera ignora la selezione (ctrl+cifra).
- Per chi suona: sceglie con ⌃3 il basso, preme ⇧⌘⌫: esce l'ultimo entrato (magari la batteria). La scorciatoia in impostazioni dice solo "togli livello a fine ciclo" (scorciatoie.js:9).
- Rimedio: `FA.togli: () => togliLivello(pila.selezionato ?? undefined)` e escludere paracadute e temporanei dal "ultimo".

### B9 · Stato CUE incoerente: la clip che esce torna "pronta" subito, il beat resta "live" finche' non smette — CERTO
- `app.js:1296`: `inLive = livelliLive.filter(a === null)` -> clip e apertura risultano non-live nel CUE appena premo × (poi suonano ancora fino a fine ciclo + eventuale dissolvenza). `statoBeat` (270) invece considera `l.a > ciclo` come "suona". Quindi una clip tolta puo' essere ri-mandata (nuovo GO LIVE: motore.js:447 -> la nuova entra e la vecchia che sta uscendo e' trattata come "sostituita": `vecchio.a <= da` la salta se gia' finita) mentre il CUE dice "pronta" e il LIVE dice "esce a fine ciclo". Non e' un disastro ma il riscontro visivo e' contraddittorio.

### B10 · `muto` salvato nell'intestazione della clip non viene mai applicato al GO LIVE — CERTO, impatto basso
- `cue.js:463` e `brano.js:386` scrivono `· muto` nel `.cutx`, ma `goLive` non lo legge e il motore non ha un parametro `muto` in `entra` (motore.js:431). Una clip salvata muta rientra col suono.

### B11 · Due GO LIVE di fila dallo scratch senza sezioni creano due livelli identici — CERTO (voluto, ma pericoloso)
- `app.js:215-223,257`: `nomeLiberoNuovo()` -> "scratch", poi "scratch 2" se il primo e' gia' arrivato nella lista. Un doppio ⇧⌘↵ (piu' lento di ~50 ms) somma due copie dello stesso codice (+6 dB prima del limiter). Se invece il secondo parte entro il primo push, si sostituiscono (stesso nome, `vecchio.da >= da`).

### B12 · `richiesta` scade dopo 5 s ma il motore puo' entrare dopo — PROBABILE (da verificare a mano con motore carico)
- `motori.js:53-60`: dopo 5 s risponde `{errore:'live: nessuna risposta'}`; `goLive` mostra l'errore (258) e l'utente riprova, ma `entra` e' serializzata su `compila` (motore.js:170-185: coda di promesse, aspetta `pronto`): puo' entrare comunque dopo. Risultato: entrata doppia/ritardata e CUE che ha detto "errore". Nessun feedback immediato in 0-5 s: il primo segno e' la card che compare nella pila.

### B13 · Piccoli difetti reali
- `app.js:1785` vedi B5. `app.js:77-78`: commento attaccato male ("// GO LIVE entra al confine ... // la mappa del tempo del live" e' un commento fuso di due righe).
- `cue.js:703-727`: lo slider volume non gestisce `pointercancel`: se il puntatore viene interrotto, `volume.onpointermove` resta impostato (innocuo ma lascia aggiornare il volume al passaggio del mouse). Lo stesso in `pila.js:225-234` (qui `volumeFine` non parte e `volumePrima` resta con l'id vecchio fino al prossimo gesto).
- `cue.js:693`: lo slider mostra min(1, volume): un volume 1,2 (possibile da controller, `motore.js:475` accetta fino a 1,5, `daLivelli` lo scrive) appare al 100%.
- `app.js:536-541` `fermaTutto` non azzera `passaggio` ne' `temporanei` (1595): dopo ⌘. con un riser/colpo attivo, `t.id` punta a un livello che non esiste; fino al rilascio successivo il riser non rientra (`gestisciTemp` 1606 manda la coda a un id inesistente, il motore la ignora in silenzio). Dopo un riavvio del live (ripristinaLive) vale lo stesso.
- Un `.cutx` scritto a mano con `// @beat` DOPO le clip non viene letto come beat: `brano.js:100-106` il ciclo delle sezioni non riconosce `@beat`, il testo (e il suo codice) finisce nel corpo dell'ultima clip e suona dentro di essa. File salvati da CUTX hanno sempre l'ordine giusto (`scrivi` 110), quindi succede solo a mano o da altri strumenti.

---------------------------------------------------------------------------
## 3. RISCHI DI STABILITA' (set da 40 minuti)

### Eccezioni e promise
- Nessun `unhandledrejection` / `window.onerror` nel renderer (grep). I gesti sono async senza catch: `keydown` (app.js:795) `FA[a.id](r)`, `$('go-live').onclick = goLive` (1505), `salvaLiveComeBrano`, `passaBrano`. Un'eccezione dentro `goLive` (es. `p.codice` mancante) finisce solo in console: il gesto "muore" senza dire niente a chi suona. Da verificare dove va la console (log del processo principale?).
- `mostra()` (app.js:1338-1349), eseguita ogni 100 ms, non ha try/catch: se `mostraLive` o `pila.aggiorna` lancia, `mostraCue`, `disegnaTempo`, `synth.aggiorna` non girano piu' finche' l'errore dura (il ciclo `requestAnimationFrame` di `mostraTempo` invece e' protetto perche' si richiama prima). Un try/catch per passo con `console.error` una volta sola isolerebbe i guasti.
- Il blocco finale (app.js:1802-1818) usa `await` al livello del modulo: se `apriStash` (che chiama IPC `libreria`, `leggiSet`...) lancia, `SuoniVista` non viene creato e l'avviso dei suoni mancanti non appare; da verificare quanto e' facile (IPC che fallisce con stash scollegato a meta').
- `setInterval(async () => ... apriStash(await window.cutx.stash()), 3000)` (833): se l'IPC lancia, una rejection ogni 3 s finche' lo stash manca. Innocuo ma rumoroso.
- `pezzoCuffia` viene impostato PRIMA della valutazione (app.js:143): se il codice ha un errore, la cuffia continua col suono di prima ma `pezzoCuffia` ha il codice sbagliato; se la cuffia viene riavviata dal guardiano (1471-1487) le viene rimandato quello sbagliato (nessun suono, solo errore).

### Listener / timer (tutti i controllati)
- OK (una volta sola): `window message` in `Motore` (motori.js:22), in app.js:1217; `Aiuto` su document (aiuto.js:23-28); `Pila` mouseenter/leave (pila.js:46-47); keydown globale (778); `navigator.mediaDevices devicechange` (1525).
- `setInterval` mai chiusi ma di vita app: `mostra` 100 ms, `Motore.ping` x2 500 ms, `specchio` x2 100 ms (1760-1762), stash 3 s. Nessuno cresce.
- Le card del CUE (`creaCarte` cue.js:605) distruggono i vecchi editor (`distruggi`) e ricreano; i listener sono sugli elementi buttati. OK.
- `motore.js: liberaGuadagno` 15 s di timeout per livello: ok.
- `Motore.attese`: Map pulita dal `setTimeout` (motori.js:48,58). OK.
- Crescita illimitata (piccola): `pila.strisce` (Map `id -> 2 cicli`, mai svuotata, pila.js:38, 484: uno per livello mai creato, qualche KB in tutto); `cronologia` limitata a 20; `moviola` (solo se accesa; da verificare il tetto in moviola.js).
- CPU: `disegnaNote` (striscia-vista.js:121-133) fa `JSON.stringify(eventi)` a ogni fotogramma per ogni livello (firma) e legge `clientWidth/clientHeight` (layout) dentro il ciclo di disegno `pila.disegna`: con 8 livelli e molte note e' lavoro sprecato 60 volte al secondo. `pila.aggiorna` gira anche 10 volte al secondo oltre che a ogni spinta, e `cue.aggiornaStati` fa 2 `JSON.stringify` ogni 100 ms (141-147). Non e' un guasto ma e' il punto dove l'interfaccia puo' impallarsi con tanti livelli (il live non ne risente: processo a parte).

### Desincronizzazioni interfaccia/motori
1. "Mostrato live ma non suona": un livello `entra` che e' in coda ma il motore risponde errore dopo (guardiano, `verificaPattern` 16 cicli): l'interfaccia lo vede solo dalla lista spinta; non c'e' stato locale ottimistico -> OK.
2. "Suona ma mostrato non-live": B9 (clip che esce) e B2 (beat senza `.beat`).
3. `livelliLive` e' scritto da due posti (`suMessaggio` 1435 e `mostraLive` 1289). Il controllo `ultimoPong > spintaLivelli` e' corretto grazie all'ordine dei messaggi sulla stessa porta. L'handler non controlla `m === live` su `livelli` (1433-1437): se la cuffia mandasse `tipo:'livelli'` sovrascriverebbe la lista; oggi non lo fa (da verificare in motore.js che solo il LIVE chiama `manda('controllo', {tipo:'livelli'})`: lo fa `aggiornaLivelli` 750, usato solo in LIVE).
4. L'interfaccia modifica a mano `l.volume`/`l.muto` dei livelli ricevuti (app.js:1647,1654) per non aspettare l'eco: se il motore scarta il messaggio, la card mostra un valore falso fino al prossimo push (max 500 ms).
5. `ripristinaLive` (1152-1177): aspetta fino a 40 s un motore `pronto`; nel frattempo `istantaneaLive` non si aggiorna. Se l'utente fa GO LIVE durante l'attesa, `ripristinando` lo ignora in `aggiornaIstantanea` e poi il ripristino `entra` per nome SOSTITUISCE il livello appena mandato (stesso nome, `cicli:1`). Da verificare, scenario raro (crash del live + GO LIVE nei secondi dopo).

### Corse tra azioni ravvicinate
- Due GO LIVE di fila: stessa clip -> la seconda sostituisce la prima se la prima e' ancora "in arrivo" (motore.js:450), altrimenti scambio normale; scratch libero -> due livelli (B11). `entra` e' serializzata da `compila`, quindi non si scambiano l'ordine.
- Togli mentre sta entrando: B1 (se era una sostituzione, buco). Se era un livello nuovo (nessuna sostituzione) `togli` lo cancella senza suonare (`parte = 0`): corretto.
- Togli due cose di fila: ognuna esce a `prossimoConfine()`: se premute entro lo stesso ciclo escono insieme; se a cavallo di un confine escono a cicli diversi (sfasate). Con ⇧⌘⌫ ripetuto si tolgono dall'ultimo al primo (beat per ultimo, se e' entrato per primo). Il messaggio `togli` e' fire-and-forget (nessun riscontro): il feedback e' solo la pila.
- ⌘Z dopo un togli (app.js:404-406): riporta nel CUE, non nel live. Chiaro dal messaggio ("lo rimandi tu col go live").
- `passaBrano` due volte: protetto da `passaggio` + doppio tasto (578) + pulsante tenuto 1 s. Il flag `passaggio` si azzera solo quando il beat nuovo suona o `ciclo > da+2` (379): dopo ⌘. resta "in arrivo" fino a quel ciclo.
- `muoviScena` mentre c'e' gia' un cambio pendente: parte dalla scena pendente (278-281), sostituisce il pendente. OK.
- Doppia pressione di `entraTra` mentre un GO LIVE e' in volo: `cicli: entraTra` e' letto prima dell'`await`, quindi vale quello al momento del gesto. OK.

---------------------------------------------------------------------------
## 4. DOMANDE PRECISE

### 4a. Come parte la base ritmica (BEAT) quando mando live qualcosa? Bug o errore suo?
Struttura (brano.js:1-17, 72-108): un `.cutx` ha testa, preambolo (`setcpm` ecc., valutato con OGNI pezzo), poi opzionali `// @apertura`, `// @beat` con scene `// @scena nome`, poi le clip `// @clip`. Il BEAT e' quindi una SEZIONE DEL BRANO fatta di SCENE (versioni del codice della base). Una scena va live come un livello speciale di nome `beat`, con `provenienza` "brano ◆k" e con il campo `beat = {base, indice, scene[]}` (cue.js:245-257). Nel motore e' un livello come gli altri (stesso `entra`), solo che per nome e' trattato come base: sempre in cima alla pila (pila.js:98), non scende col "break" del fader (motore.js:320,660), posto 2 del controller (pila.js:159), sostituito per nome da ogni scena nuova con scambio a tempo (motore.js:447-466).
Percorso del GO LIVE (tasto ⇧⌘↵ / bottone GO LIVE / bottone della card):
1. `FA.goLive` (app.js:721) o `$('go-live').onclick` (1505) -> `goLive()` (226).
2. `pezzo = serata.pezzoScelto()` (228): sempre null oggi (vedi 6, codice morto) -> `cue.pezzo()` (213): in modo libero `pezzoLibero`, in modo brano `pezzoBrano` che manda SOLO la card attiva `cue.cartaAttiva` (cue.js:278-297): scena del beat, apertura o UNA clip.
3. `app.js:233`: eccezione "passaggio di brano" (B3).
4. Se il testo e' solo righe `.lpf(...)` -> e' una coda, non un livello (235-236).
5. Se il brano e' a un altro BPM e il live suona: tolte le righe `setcpm` (243-251).
6. `live.richiesta({tipo:'entra', ..., cicli: entraTra, volume: p.volume, dissolvenza: dissolvenza(dissEntra)})` (257).
7. Motore: compila (serializzato), `verificaPattern` 16 cicli, `da = prossimoConfine() + cicli - 1` (motore.js:440), sostituisce per nome, dissolvenza d'entrata, risponde `{da, livello}`.
8. `cue.dopoGoLive()` (260): il primo brano mandato live diventa "attivo".

NON parte da solo in questi casi (nessuno e' un errore del codice, ma pochi hanno un avviso):
- **Il GO LIVE di una clip manda solo quella clip.** Non c'e' nessuna regola "se il brano ha un beat, manda anche il beat". `statoBeat().pendente` serve solo ad agganciare le clip a una scena gia' armata (256). Se il brano ha un beat e nessuno lo ha mandato, il CUE non avvisa. Questa e' la causa piu' probabile del "la base non parte" (comportamento voluto, ma non segnalato).
- Va premuto GO LIVE con la card del BEAT come card attiva: ⇧⌘↵ usa `cartaAttiva` (l'ultima card in cui hai cliccato/scritto), non "il beat". Se l'ultimo clic era su una clip, parte la clip.
- **"Entra tra" resta com'era** (4c): se era su 4 o 8 la base arriva dopo 4-8 cicli (la card dice "entra tra N" nella pila, ma il CUE no).
- **La dissolvenza d'entrata resta com'era** (`dissEntra`, app.js:77, 526): con 4 la base sale per 4 cicli quasi inudibile.
- **Scena vuota o solo commenti**: entra come silenzio e sostituisce il beat vecchio (B6).
- **Brano senza `// @beat`**: la card BEAT dice "niente beat in questo brano" (cue.js:826); la "base" e' semplicemente la prima clip e va mandata a mano.
- **Linguetta "prossimo" con un brano "attivo" gia' in corso**: la scena del beat non entra come GO LIVE normale ma come passaggio di brano (233, 327-368): scambia i livelli con la transizione, il tempo puo' saltare o fare rampa, e se un passaggio e' gia' in arrivo risponde solo "il passaggio a X e' gia' in arrivo" (334) senza mandare niente.
- Se il beat vecchio era in muto (o a volume basso), il nuovo eredita muto e volume (motore.js:452-453,461-462; per la scena `volume` e' undefined, 257): sembra "non parte" e invece suona muto. La card in pila mostra "muto" ma nel CUE non si vede.
- `muoviScena` (◀ ▶) e `passaBrano` usano `entraTra` come `goLive` (app.js:296,353).
- Il motore non risponde in 5 s (motori.js:58): errore "live: nessuna risposta" ma l'ingresso puo' avvenire dopo (B12).

Verdetto: nella maggior parte dei casi e' "errore dell'utente indotto dal design" (nessun avviso quando si manda una clip senza base; due stati appiccicosi, `entraTra` e `dissEntra`, che non tornano a default). I bug veri che possono impedire la base sono B6 (scena vuota) e B3 (passaggio per sbaglio dal libero).

### 4b. La chiusura (uscita) delle tracce live
Modi per togliere:
1. × sulla card LIVE (pila.js:185,211) -> `togliLivello(id)`.
2. Tasto ⇧⌘⌫ (scorciatoie.js:9; FA.togli) -> `togliLivello()` senza id = ultimo entrato (B8).
3. Controller: azione `togli` (app.js:1724) = livello scelto o l'ultimo.
4. × sulla card di una clip nel CUE (cue.js:734-736 -> `togliClip` 1041): se la clip e' live la toglie prima dal live (`togliDalLive`, app.js:90) e poi la cancella dal brano (⌘Z la riprende solo nel brano).
5. Clic sulla card che sta sfumando (pila.js:215-217) o 2^ clic sulla ×: `salva` = ANNULLA l'uscita (solo se dissolvenza > 0).
6. Sostituzione: stesso nome in GO LIVE -> il vecchio esce (con la dissolvenza d'entrata, `dissEntra`).
7. Transizione di brano (`passaBrano`): `chiEsce` fa uscire tutti gli altri tranne il livello scelto (transizioni.js:38-41).
8. Paracadute (470), ⌘. `fermaTutto` (536): panico, tutto si zittisce subito (30 ms) senza dissolvenza, e `livelli = []`.
9. Temporanei del controller (riser, colpi): `togli` con `subito:true` (app.js:1602).
Cosa succede:
- Il messaggio e' `{tipo:'togli', livello, dissolvenza: dissolvenza(preferenze.dissolvenzaUscita ?? 0)}` (app.js:408). Il motore (543-558) fa uscire il livello a `fine = max(da, prossimoConfine())`, cioe' al prossimo confine di ciclo non ancora programmato, MAI "tra N cicli" (`entraTra` non vale per l'uscita). Con dissolvenza D > 0 continua a suonare e sfuma per D cicli dopo quel confine (`a = fine + D`); un livello non ancora entrato sparisce subito (`parte = 0`, B1 se era un sostituto).
- La dissolvenza di uscita e' una sola per tutti, sta solo nelle Impostazioni (impostazioni.js:310); nel CUE c'e' solo quella d'entrata (4c/1-8 bottoni `data-diss`).
- Chiusure ravvicinate: non si accavallano nello stato (ognuna ha il suo `a`); se cadono nello stesso ciclo escono insieme, se a cavallo di un confine escono sfasate di un ciclo. Il limite e' B4 (2^ × = annulla) e B1/B8.
- Cosa vede chi suona: pila.js:412-460. Senza dissolvenza: classe `in-uscita`, scritta "esce a fine ciclo", il codice sul proiettore si cancella; la card sparisce quando `pulisci` la elimina (dopo che il riproduttore ha programmato fino a `a`). Con dissolvenza: card attenuata, barra che scende, conto alla rovescia "-N", scritta "sfuma a fine ciclo · clic per tenerlo" poi "sfuma · clic per tenerlo". Nel CUE la clip torna "pronta" SUBITO (B9). Se il mouse e' sulla zona LIVE, il posto della card tolta resta vuoto (segnaposto, pila.js:84-94) finche' non esce il mouse. Il contatore "N live" (app.js:1398) include le card che sfumano.

### 4c. "Entra tra N cicli"
- Il valore sta in `let entraTra = 1` (app.js:78), impostato da `scegliEntraTra(n)` (531-534) che accende il bottone `.on` tra i `data-entra` (index.html:124-127); i tasti 1, 2, 4, 8 (scorciatoie.js:10-13, solo fuori dagli editor). Default 1 (HTML e variabile).
- NON si azzera dopo il GO LIVE: resta finche' non lo cambi. Lo usano `goLive` (257), `muoviScena` (296) e `passaBrano` (353). Non lo usano modifiche in LIVE/jam (`cicli: 1` fisso, app.js:1260), riser/colpi, ripristino. Non e' salvato su disco: a ogni avvio torna 1. Le prove lo ripongono a mano a 1 ogni volta (prova.js:262, 523, 607, 973…), segno che lo stato appiccicoso e' noto.
- Significato esatto: "al N-esimo confine di ciclo da adesso" (`prossimoConfine() + N - 1`), non allineato a multipli di N.

### 4d. A che volume entra un livello live; esiste un volume per livello nel CUE?
- Default 1 (motore.js:258). Se sostituisce uno con lo stesso nome eredita il suo volume e muto (452-453, 461-462). Se la clip ha `volume` scritto nell'intestazione (`// @clip basso · volume 0.8`), quel valore VINCE su tutto (motore.js:475, clamp 0-1,5): anche se in LIVE l'avevo abbassato a mano, il GO LIVE successivo lo riporta a 0,8 (e se nel CUE lo slider e' a 100% la chiave viene tolta, cue.js:699, quindi "100%" = "eredita", non "100"). La dissolvenza d'entrata (`dissEntra`) lavora sul volume (o sul filtro, `dissolvenzaTipo`).
- SI', esiste gia' nel CUE: slider per le CLIP di un brano (cue.js:688-727), scritto nel file e annullabile con ⌘Z; `pezzoBrano` lo passa (cue.js:293) e `goLive` lo manda (app.js:257). NON c'e' per: scene del beat (`pezzoScena` non passa `volume`, anche se l'intestazione `// @scena x · volume 0.8` si legge in `scena.info`, brano.js:97), apertura, scratch libero (c'e' solo se si scrive a mano l'intestazione, cue.js:241), clip del kit (set-vista.js:78 lo legge dal file ma non c'e' slider). `muoviScena` e `passaBrano` (quest'ultimo con `p.volume` che per la scena e' undefined) non applicano nessun volume di scena.
- In cuffia il volume non si applica mai (provaPezzo 172-176).

### 4e. Il tasto SYNTH ("apri nel synth"): su quali card/scene compare e dove e' deciso
- Non e' deciso per tipo di card ma per CONTENUTO: compare solo se il codice contiene la riga marcatore `// @synth {json}` (`haRigaSynth`, synth-codice.js:128-139), che scrive il pannello SYNTH quando manda una clip al CUE/kit (`mandaCue`, app.js:672 -> `cue.aggiungiClip` 445).
- CUE: solo sulle card delle CLIP (`carta(i)`, cue.js:729-733: `apriSynth.hidden = !haRigaSynth(...)`, aggiornato a ogni tasto, 653). NON sulla card BEAT/scene (`cartaScena` 888, nessun bottone), NON sull'APERTURA (745), NON nello scratch libero (nessun bottone), NON sul preambolo.
- LIVE: la card di ogni livello ha il bottone, nascosto se non c'e' marcatore (pila.js:175-177,188,212, aggiornato in 451-454): quindi anche un beat potrebbe averlo, solo se il suo codice ha il marcatore (oggi impossibile da fare col pannello: il SYNTH manda solo "clip" in `attivo`/`prossimo`/`kit`, app.js:667-672).
- `apriNelSynth` (app.js:677-682) senza marcatore risponde con un messaggio (`it.synth.msg.apriNonSynth`).

---------------------------------------------------------------------------
## 5. PROPOSTE

### P1 · Slider "a che volume entra" nel CUE
- Gia' c'e' per le clip (cue.js:688-727). Mancano scene del beat, apertura, scratch.
- Come: estrarre lo slider in una funzione `creaVolumeCue({leggi, scrivi, registra})` (oggi e' inline in `carta(i)`, 40 righe) e usarla in `carta(i)`, nella testa di `cartaBeat` (per la scena scelta, `B.conInfoScena` nuova in brano.js, ~8 righe, simmetrica a `conInfo` 246) e in `cartaApertura` (apertura ha `riga` ma non `info`: serve `info` o un'intestazione `volume`). `pezzoScena` aggiunge `volume: scene[k].info?.volume`; `muoviScena` e `passaBrano` passano `volume` (oggi non lo fanno).
- Taglia: ~70 righe tra cue.js (-40 +60), brano.js (+10), app.js (+2). Nessun cambio ai motori.
- Rischi: (1) il valore e' nel `.cutx` e rende il brano "sporco"; (2) "100% = nessun valore" e il fatto che un volume scritto VINCE su quello abbassato a mano in LIVE (motore.js:475): se si vuole che il GO LIVE di una clip gia' live non riporti il volume, serve separare "volume d'entrata" (solo per livelli nuovi) da "volume ereditato"; (3) il test di prova `fader`/`cue-vista` toccano questi elementi; (4) lo slider arriva solo a 100% mentre il motore accetta 150%.
- Variante piccola senza toccare il file: uno slider unico "entra a" accanto a "entra tra", stato di sessione in app.js (come `entraTra`), ~25 righe (index.html + app.js), si azzera dopo il GO LIVE come P2.

### P2 · "Entra tra" sempre 1, torna a 1 dopo il GO LIVE
- Come: in `goLive`, `muoviScena`, `passaBrano` leggere `const cicli = entraTra; scegliEntraTra(1);` PRIMA dell'`await` e usare `cicli`. 3 punti, ~6 righe in app.js. Si lascia il valore alto solo se il tasto e' premuto con shift (opzionale, +4 righe).
- Rischi: le prove che impostano `scegliEntraTra(N)` e poi chiamano `goLive` piu' volte (prova.js:260-262, 479, 523, 1476, 2305…) vanno rilette: alcune possono contare sulla persistenza. Il reset va fatto anche se il GO LIVE va in errore? Meglio solo se ha successo, ma leggendo prima dell'`await`: se fallisce il valore e' gia' tornato a 1 (accettabile e piu' prevedibile). Segnalare nella pila "entra tra N" gia' c'e' (pila.js:441).
- Contemporaneamente correggere i testi "a fine frase" (B7).

### P3 · Tasto synth su ogni scena, in CUE e in LIVE, anche per il beat
- Come: (a) mostrare sempre il bottone sulle card `carta(i)`, `cartaScena`, `cartaApertura` (cue.js) e in pila.js:175-188; (b) in `apriNelSynth` (app.js:677) senza marcatore usare il parser "dal testo al pannello" (synth-codice.js:141+, che tiene il resto come `mano`) invece del messaggio d'errore; (c) per scrivere ritorno su una scena aggiungere una destinazione "scena" a `destinazioni` (app.js:667-672) e un `cue.sostituisciScena(k, codice)` (che usa `B.conCorpoScena`).
- Taglia: (a)+(b) ~40 righe su 4 file; (c) altre ~50. Fare prima (a)+(b) con il bottone che apre solo in lettura.
- Rischi: aprire nel pannello una scena di batteria a piu' voci puo' deformarla (il parser tiene "mano" ma il pannello e' mono-voce); il ritorno con "scrivi sulla scena" sovrascrive il codice del brano: servirebbe ⌘Z (`cue.modifica` con etichetta lo da' gia'). Il marcatore `// @synth` non va scritto nelle scene (resta nel testo, innocuo, ma `daLivelli` e il proiettore lo vedono).

### P4 · Logica chiara per togliere le tracce dal live
Cosa sta uscendo, quando, con riscontro visibile:
1. Un solo bersaglio per tastiera e controller: `pila.selezionato ?? ultimo`, escludendo paracadute e temporanei (B8). 2 righe in app.js:723 + 397-400.
2. B1: ripristinare il vecchio quando si toglie un sostituto in attesa (motore.js, ~6 righe).
3. B4: ignorare un secondo clic sulla × entro ~600 ms dal primo, e/o rendere "tieni" un bottone esplicito sulla card che sfuma (pila.js:211,215-217; ~10 righe).
4. Riscontro visibile: nel CUE usare lo stesso criterio del LIVE ("esce tra N" mentre `a !== null` e `a > ciclo`): in `mostraCue` (app.js:1296) passare anche i livelli in uscita con un campo `esce:true`, e in `cue.statoSezione` (cue.js:199-204) e `statoScena` restituire `'esce'`; classe CSS `.esce` accanto a `e-live`. ~25 righe in cue.js, 5 in app.js, un po' di CSS. Cosi' il beat e le clip hanno lo stesso comportamento (B9).
5. Opzionale: dissolvenza d'uscita scelta nel CUE accanto a `data-diss` (stesso meccanismo di `scegliDiss`, ~10 righe) e una voce "tutto fuori al prossimo ciclo" che manda un `togli` per ogni id con la stessa `fine` (oggi due × a cavallo di un confine escono sfasate di un ciclo).
- Rischi: i test `card-togli`, `cue-vista`, `linguette`, e la sentinella di prova.js contano le card/le classi `e-live`; il proiettore (uscita.js, fuori zona) legge `a`/`sfuma` allo stesso modo, nessun cambio di protocollo.

### P5 · Avvio prevedibile della base ritmica
1. Avviso subito (8 righe in `goLive`): se `!p.beat`, il brano in vista ha scene (`cue.brano?.modello.beat?.scene.length`) e nel live non c'e' ne' un beat che suona ne' uno pendente -> `cue.avviso('nessun beat live: ⇧⌘↵ sulla card BEAT per far partire la base')`. Non cambia nessun suono.
2. Rifiutare scene e clip vuote (B6), 4 righe.
3. Segnalare sulla card BEAT, in `mostraBrano` (cue.js:502-521), lo stato "nessun beat live" (giallo) quando altre clip del brano suonano e il beat no; ~10 righe.
4. Correggere B2 (applica senza `beat`) e B3 (condizione `cue.modo === 'brano'`).
5. Mostrare nel CUE, accanto al bottone, "entra tra N · diss D" cosi' e' chiaro cosa partira' (index.html + 5 righe); con P2 sparisce il problema dell'appiccicoso.
6. Opzione, spenta di default: `preferenze.beatAutomatico` -> il primo GO LIVE di una clip del brano, se il beat non suona, manda prima la scena scelta con lo stesso `cicli` e poi la clip con `alle = r.da` (usare `alle` e non due `entraTra` separati: tra le due `await` il confine puo' spostarsi di un ciclo). ~30 righe in `goLive`. Rischio: suono non voluto, quindi solo su richiesta.

---------------------------------------------------------------------------
## 6. QUALITA' (max 10)
1. `app.js` 1818 righe: stato globale, motori, passaggio brano, paracadute, controller, impostazioni, disegno tempo e hook di prova nello stesso file. Candidati ovvi a uscire: il blocco `controllerMidi` (1632-1757) e i gesti sul live (goLive, muoviScena, passaBrano, togliLivello) in un `gesti-live.js`.
2. `globalThis.cutxProva` (1528-1591) e' esportato anche nell'app vera (60 righe di scorciatoie a funzioni interne, compreso `goLive`, `valuta`). Non c'e' contenuto remoto (contextIsolation) ma conviene attivarlo solo con un flag di prova.
3. Tre `entra` quasi identiche in `goLive` (257), `muoviScena` (288), `passaBrano` (353) (separaCoda, dissolvenza, entraTra, nome/provenienza): una funzione `entraLive({pezzo, ...})` toglierebbe le divergenze di oggi (volume mancante in muoviScena, B6/B7).
4. Quattro costruttori di "pezzo" (`pezzoLibero`, `pezzoScena`, `pezzoApertura`, `pezzoBrano` in cue.js:217-298, piu' `pezzoKit` in set-vista.js:76) con campi quasi uguali; i controlli (vuoto, volume, bpm) andrebbero in un punto.
5. Codice morto: `serata.scelta`/`scegliKit(i)`/`pezzoScelto()`/`segnaScelta` (set-vista.js:35,82-98): nessuno chiama `scegliKit` con un numero (grep: solo `null` in app.js:994,1018), quindi `pezzoScelto()` e' sempre null e il ramo `pezzo ??= serata.pezzoScelto()` in `goLive`/`provaInCuffia` non serve; inoltre i bottoni passano l'evento click come `pezzo` (app.js:1504-1505), che con la scelta attiva avrebbe ignorato il kit. Anche `cue.mostraLive` e `#riga-live` (cue.js:49,490,623-626: nascosta sempre), `cue.sceltaIniziale` (1176).
6. Helper DOM duplicati: `el`/`crea` in cue.js, pila.js, set-vista.js, browser.js, importa.js; `tasto` in cue.js, set-vista.js, browser.js. Un `dom.js` da 20 righe.
7. Slider del volume scritto due volte (cue.js:688-727, pila.js:219-234) con gli stessi difetti (nessun `pointercancel`).
8. `mostraBrano` (cue.js:481-534) ricalcola e riscrive il DOM di ogni card a ogni cambio di stato, con `JSON.stringify` per confrontare (141, 192): funziona, ma e' il punto piu' costoso del CUE; un confronto per firma di stringa piu' semplice basterebbe.
9. Testi italiani sparsi nel codice (app.js: messaggi di `cue.avviso` ovunque, cue.js, pila.js) invece di `testi/it.json` (gia' nella lista "Da fare" di CLAUDE.md).
10. Incoerenza di nomi: `sezione`/`clip`/`pezzo`, `scena`/`momento`, `beat`/`spina` convivono nel codice (`brano.js` dice che le clip sono "internamente ancora sezioni"); i commenti di app.js usano ancora "fine frase" (B7) e "a fine ciclo" per cose diverse.

Test: nessun test puro copre `goLive`/`togliLivello`/`statoBeat` (sono in app.js e li copre solo `src/main/prova.js` con l'audio). Se si estraessero `statoBeat`, la scelta del bersaglio di `togli` e la costruzione del messaggio `entra` in un modulo puro, B2, B3, B6, B8 diventerebbero test da 10 righe senza audio.
