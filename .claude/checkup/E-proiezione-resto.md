# Check-up E · proiezione per il pubblico + resto (sola lettura)

Data: 12/11/2026, ramo `checkup-beta5`. Nessun file del progetto toccato. Non ho lanciato l'app, né `npm run prova`, né `vite build`
(avrebbe svuotato `dist/`, che può essere in uso da altri). Ho lanciato solo `npm test`.
Dove scrivo "stima" i numeri sono calcolati a mano dal CSS/JS, non misurati: vanno verificati con `--foto` o a occhio.

Legenda sicurezza: **certo** = letto nel codice, il comportamento è questo; **probabile** = segue dal codice ma dipende da come reagisce macOS/Electron; **da verificare** = ipotesi.

---------------------------------------------------------------------------------------------------------------------------
## ZONA 1 · PROIEZIONE PER IL PUBBLICO
---------------------------------------------------------------------------------------------------------------------------

### a. MAPPA (come il codice arriva al pubblico)

**Chi manda, cosa, quando** (motore LIVE → finestra uscita, canale diretto MessageChannelMain, `manda('uscita', …)`):
- `livelli` — `motore.js:754-756` (`aggiornaLivelli()`): TUTTI i livelli, con il codice intero (`descrivi`, `motore.js:602-621`: id, nome, codice, coda,
  scivola, inizio, da, a, richiesto, volume, muto, scritto, sfuma…). Mandato a ogni cambio (entra, esce, muto, volume, `pulisci()`), e subito quando l'uscita si (ri)collega (`motore.js:1257-1262`).
- `mappa` del tempo — `motore.js:773-783` (`pubblicaMappa`): ogni secondo + a ogni cambio di tempo. L'uscita non ha un orologio suo: calcola il ciclo da `mappa` + `performance.timeOrigin+now()` (`uscita.js:224`).
- `globali` (righe `all(x => …)`) `motore.js:314-316`; `strisce` (note vere del ciclo) `motore.js:869-871`; `misure` solo se chieste (`motore.js:886-888`); `onda` solo se lo sfondo è «oscilloscopio».
- Dall'INTERFACCIA (controllo → uscita): solo `bozze` (quello che sto scrivendo nel LIVE e il jam), `app.js:1214-1271`. Errori e avvisi non arrivano mai (`uscita.js:2-3`).
- Dal main: nessuno. Il main fa solo da postino delle porte (`main.js:196-216`, coppie `['live','uscita']` e `['controllo','uscita']`) e ricarica la pagina se crasha.

**Dentro `uscita.js`** (559 righe): `disegna()` gira due volte: ogni frame (`giro()` con `requestAnimationFrame`, `uscita.js:486-489`) e ogni 100 ms (`setInterval`, `uscita.js:541`).
Per ogni frame:
1. `vistaCodice()` (`:164-171`) applica `filtraCodice` (`testi-pubblico.js:108-134`): toglie `// @synth` sempre, commenti e preambolo se spenti (di default SPENTI, `testi-pubblico.js:20-21`).
2. `sostituente()` (`:256`): se un livello è già sostituito da un altro con lo stesso nome, si disegna solo il nuovo.
3. `aspetto()` (`aspetto.js:21-44`) dice se il livello arriva (si scrive a macchina fino all'istante di ingresso), suona, o esce (si cancella a ritroso fino all'istante di uscita).
4. Se in LIVE sto riscrivendo quel livello (bozza diversa dal live) si mostra la BOZZA al posto del codice che suona (`:263-276`).
5. Codice evidenziato: `evidenzia.js` rivaluta il codice nella pagina uscita con Strudel (`analisi.valuta`) e colora le note che suonano (`:300`).
6. Coda (`.lpf(1200)`, `.gain()`) sotto il codice, striscia delle note sotto la coda, tag sopra (`mostraTag`).
7. `adatta()` (`:398-442`): misura l'area libera (due disposizioni: «ampia» sopra l'angolo neon/gatto/frase, «stretta» a sinistra dell'angolo ma più alta, `:409-415`), cerca il carattere più grande che ci sta (`trovaScala`, bisezione 9 passi, `scorri.js:9-20`) fino a un MINIMO di 1,9% dell'altezza finestra (`:348`, 20 px a 1080p). Se non ci sta neanche al minimo: `scorre.attivo` e `Scorrimento` (`scorri.js:62-125`) scorre una riga ogni 1,8 s, avanti e indietro, pause di 4 s agli estremi, si ferma 14 s sul livello appena entrato; il bordo basso è tagliato con `clip-path` per non mostrare righe a metà (`:441`).

**Macchina da scrivere**: `scrittura.js` (puro) → `Scrittore.stato()/cancella()` (`:283, :297`); il testo non ancora scritto resta nel DOM come `<span class="nascosto">` con `visibility:hidden` (`uscita.css:95-97`), così l'altezza del livello è già quella finale e il carattere non cambia. Velocità e imperfezione da preferenze (`scrittura`).

**Quando un livello entra/esce**: entra → arriva `livelli` con `da` futuro → blocco `.arriva` col tag «nome · tra N cicli» e testo che si scrive in modo da finire al ciclo `da`; `ultimaNovita` (`:361-366`) → lo scorrimento si porta lì. Esce → `a` valorizzato → testo cancellato a ritroso fino a `a`; `pulisci()` del motore (`motore.js:743-751`) lo toglie dalla lista; l'uscita rimuove il blocco dal DOM quando non è più tra i livelli (`:330-335`).

**Finestra** (`main.js:307-352`): BrowserWindow normale, apre sullo schermo ricordato oppure sul secondo schermo a tutto schermo (`dove-uscita.js`), `showInactive()`, ricorda posizione/schermo con un timer di 400 ms (`:328-337`), `render-process-gone` → `reload()` dopo 300 ms (`:338-342`). Hydra: NON esiste (`grep` dà solo il pulsante disattivato in `index.html:45`, un commento in `uscita.html`, la preferenza `hydra:true`/`logoSopraHydra` in `preferenze.js:30-31` e testi in `it.json`). Lo sfondo è un canvas 2D (`sfondo.js`): niente, note, oscilloscopio.

### b. Perché il pubblico NON vede tutto il codice (cause, con file:riga)

Ordinate da «più probabile che sia quello che vede Valerio» a «raro».

**B1. Commenti e preambolo tolti di DEFAULT** (scelta voluta, ma è la prima cosa che «manca»)
- `testi-pubblico.js:20` `commenti: { acceso: false }`, `:21` `preambolo: { acceso: false }`; test che lo fissa: `test/testi-pubblico.test.js` ("i predefiniti scelti: tutto acceso tranne commenti, preambolo…").
- `filtraCodice` `testi-pubblico.js:118-125`: toglie le righe `// @synth`, le righe prima di `inizio` (il preambolo: titolo del brano, `setcpm(...)`), le righe di solo commento, i commenti in coda alla riga (`tieni = riga.slice(0, c).trimEnd()`), e le righe vuote all'inizio.
- Quindi di un brano `.cutx` caricato dalla libreria NON si vede la testa del brano né il `setcpm` iniziale; di uno scratch con commenti si vedono solo le righe di codice. Si attiva da Impostazioni → proiezione → testi per il pubblico. **Certo.**
- Sempre nascosta, anche con tutto acceso: `// @synth …` (`testi-pubblico.js:107, :118`): voluto (è lo stato del pannello SYNTH).
- Limite del filtro: `inizioCommento` (`:90-101`) segue le virgolette riga per riga; una stringa a backtick su più righe che contiene `//` viene tagliata a metà. **Probabile, raro.**

**B2. Si rimpicciolisce fino a un minimo e POI si scorre: il codice fuori finestra non si vede** (la causa strutturale)
- `uscita.css:76` `.livelli { overflow: hidden }` con altezza fissata dalla geometria (`top:110u`, `bottom: var(--basso)`).
- `uscita.js:348` `MINIMO_ALTEZZA = 0.019` (20 px a 1080p); `scorri.js:11` se `altezzaA(minima) > disponibile` → `ci:false` → `scorre.attivo` (`uscita.js:429`).
- Scorrimento: 1 riga ogni 1,8 s (`uscita.js:350` `passoS: 1.8`), con pausa 4 s agli estremi e 14 s di sosta sul livello nuovo (`scorri.js:102-121`). Il bordo basso è tagliato con `clip-path: inset(...)` (`uscita.js:441`) → le righe sotto non esistono visivamente. Con 60-80 righe e una finestra da 8-20 righe, un passaggio completo dura 1-2 minuti: **per lunghi tratti parte del codice non si vede.**
- È una scelta di progetto confermata dalla prova: `prova.js:2013-2017` verifica che con 5 livelli lunghi `scorre === true && ci === false`, cioè la prova considera normale che non ci stia tutto.
- **Le dimensioni che NON scalano col carattere** mangiano spazio e fanno scattare lo scorrimento molto prima del dovuto (stima a 1920×1080):
  - striscia sotto ogni livello `uscita.css:288-294`: `height: 30u` + `margin-top 4u` ≈ 45 px, acceso di default (`testi-pubblico.js:18`);
  - tag `uscita.css:99-105` 15u ≈ 20 px + interlinea ≈ 28 px;
  - `gap` tra livelli `uscita.css:84` 30u ≈ 40 px; gap interno `:92` 6u ×2 ≈ 16 px.
  - Totale ≈ **130 px per livello, indipendente dal carattere** (solo `.codice`/`.coda` usano `--scala`: `uscita.css:120, :130`).
  - Area disponibile (stima): «ampia» ≈ 1770×490 px, «stretta» ≈ 1120×815 px. Al carattere minimo una riga è ≈ 27 px. Quindi 3 livelli da 4 righe (3×(130+107)=711) ci stanno nella «stretta»; **4 livelli da 4 righe (944) già no → si scorre**, anche se il codice è cortissimo.
- Anche le righe tagliate a metà sono evitate col `clip-path`, ma questo significa che una riga che non ci sta intera sparisce del tutto (`bordoInBasso`, `scorri.js:46-51`).

**B3. Il livello sostituito sparisce subito** (voluto)
- `uscita.js:256` `if (sostituente(l, viste)) continue;` e `aspetto.js:9-13`: appena un livello con lo stesso nome è in coda per prendere il posto, il vecchio (che suona ancora fino a `a`) non si disegna più: il pubblico vede il nuovo che si scrive come differenza (`:283`). Per quella battuta il codice che suona non è sul proiettore. **Certo, per scelta.**

**B4. Bozza al posto del codice che suona** (voluto)
- `uscita.js:263-276`: se la bozza del LIVE differisce dal testo del livello, si mostra la bozza con tag «in scrittura» e il codice che suona sparisce finché non entra la modifica. **Certo.**

**B5. Livelli che escono: il testo si cancella PRIMA che il suono finisca?** No: la cancellazione finisce quando il suono esce (`aspetto.js:36-41`, `scrittura.js` sincrono col tempo), quindi è coerente. Ma `pulisci()` può togliere un livello di colpo e il blocco sparisce (`uscita.js:330-335`).

**B6. Pezzi del livello nascosti per scelta del pubblico**
- La coda si vede solo se `testi.coda.acceso` (default true) `:301`; il volume appare come `.gain(x)` (`coda.js:62-67`). Le righe globali solo se `testi.globale.acceso` (`:319`).
- Il tag del livello sparisce se l'etichetta è stata azzerata (`testi-pubblico.js:60-72`), `paracadute` mai in etichetta (il codice invece si vede).
- Le righe del preambolo di un `setcpm` messo da fuori (brano/CUE) non sono in nessun livello (`inizio`, `uscita.js:167`).

**B7. Righe lunghe**: NON sono tagliate. `uscita.css:122-123` `white-space: pre-wrap; word-break: break-word;` va a capo; ma una riga lunga a capo conta più righe e accelera B2. **Certo (non è una causa di taglio, è un amplificatore).**

**B8. Dati non ancora arrivati**: `disegna()` esce se `mappa` è nulla (`uscita.js:223`): dopo un reload dell'uscita lo schermo è vuoto finché il live non rimanda la mappa (subito al collegamento: `motore.js:1259-1260`; di norma < 1 s). **Certo, trascurabile.**

#### Come mostrarlo TUTTO (proposta, in ordine di costo)

0. **Subito, senza codice**: Impostazioni → proiezione → testi per il pubblico: commenti ON, preambolo ON, striscia OFF (risparmia ≈ 45 px × livelli). Per farlo di default: cambiare `testi-pubblico.js:18, :20, :21` e il test che li fissa. Rischio: nessuno sul suono; cambia solo cosa si vede (compaiono commenti e la testa del brano).
1. **Far scalare anche tag, gap e striscia con `--scala`** (e nascondere la striscia se non ci sta nemmeno così). In CSS: `font-size: calc(15 * var(--u) * var(--scala,1))`, `gap: calc(30 * var(--u) * var(--scala,1))`, `.striscia-viva height: calc(30*var(--u)*var(--scala,1))` (≈ 10 righe CSS, nessun JS; `adatta()` rimisura già tutto con `--scala`, `uscita.js:417`). Effetto: a parità di livelli, il carattere scende meno e lo scorrimento scatta molto più tardi (da ~4 livelli a ~6-7, stima). **Piccolo (30 min). Rischio:** la prova `uscita` (`prova.js:2010-2030`) misura soglie su «5 livelli lunghi: carattere = minimo»: i numeri cambiano; da rilanciare. La striscia usa canvas: va ridisegnata alla nuova altezza (`striscia-vista.js`, da controllare).
2. **Colonne** prima di arrendersi allo scorrimento: se con 1 colonna al carattere minimo non ci sta, provare 2 (poi 3) colonne con `column-width`/`columns` su `#scorri`, `break-inside: avoid` sui livelli, `column-fill: auto`. `trovaScala` va generalizzata (oggi misura solo l'altezza: `uscita.js:417`) per misurare `scrollWidth <= clientWidth`. Il carattere resta ≥ minimo, e a 1920 px di larghezza due colonne da 60 caratteri sono leggibili. **Medio (~100 righe + test, mezza giornata-una giornata).** Rischi: `misuraRighe()` (`:368-396`) e `Scorrimento` assumono UNA colonna (offsetTop verticale continuo); `seguito` (cursore che scrive) idem; la crescita del testo mentre si scrive può far saltare un livello da una colonna all'altra (mitigato: il testo non scritto è già nel DOM, `nascosto`); un livello più alto di una colonna deve poter spezzarsi (niente `avoid`). Lo scorrimento resta come ultima risorsa e va coordinato (o spento se le colonne bastano).
3. **Scorrimento a pagine** invece che a riga (se proprio si vuole tenerlo): salto di una «schermata» ogni ~6 s con indicatore «2/4» (`Scorrimento` ha già i punti di fermata, `puntiDiScorrimento`, `scorri.js:38-43`). Piccolo-medio; non mostra tutto insieme ma garantisce che ogni riga compaia entro N secondi e che il pubblico sappia che c'è dell'altro.
4. NON consiglio: abbassare `MINIMO_ALTEZZA` (20 px da proiettore non si leggono già bene), né troncare con «…» (il contrario di quello che serve).

Consiglio: 0 subito, poi 1 (basta quasi sempre), poi 2 solo se serve. Tutto va provato con `npm run prova:parte -- uscita` (silenzioso, ma suona: volume al 20% come da regole) e foto `--foto`.

### c. BUG e RISCHI DI STABILITÀ della proiezione (40 minuti e oltre)

**C1. Nessuna gestione di `display-removed` / `display-added` / `display-metrics-changed`** (`grep display- src/main` → vuoto). **Certo.**
- Proiettore scollegato a metà serata con la finestra a tutto schermo: cosa fa macOS non è codificato qui. **Probabile**: la finestra viene spostata sullo schermo restante (spazio a tutto schermo che si sposta sul monitor di controllo = copre la postazione) o resta orfana. **Da verificare a mano** (staccare il cavo con l'uscita aperta).
- Peggio: `ricorda()` (`main.js:328-337`) salva a ogni `move`/`resize` `schermo: screen.getDisplayMatching(...).id` e `schermoIntero`. Se la finestra viene spostata sul monitor principale per lo scollegamento, la preferenza `uscita` viene SOVRASCRITTA (schermo = principale, bordi normali): al ricollegamento la finestra si riapre sul monitor sbagliato (`dove-uscita.js:7-9`: lo schermo ricordato esiste → apre lì, non più sul proiettore). **Probabile.** Rimedio: ascoltare `display-removed` e non salvare mentre uno schermo sparisce; su `display-added` riportare la finestra sullo schermo salvato.
- Ricollegamento: nessuna azione; l'utente deve richiudere e riaprire con ⌃⌘F. Il `scale factor` cambia → `adatta()` riparte da solo perché `innerWidth x innerHeight` è nella firma (`uscita.js:339`). OK.
- Macchina a riposo / schermo che si spegne: `backgroundThrottling:false` (`main.js:166`) e il doppio giro rAF+`setInterval` tengono vivo il disegno. OK.

**C2. Crash/blocco della finestra del pubblico**
- Crash: coperto (`main.js:338-342`: `reload()` dopo 300 ms; le porte si rifanno a `did-finish-load` via `collega`; il live ri-manda `livelli`+`mappa` subito; le bozze le rimanda il controllo, `app.js:1218-1220`). Il guardiano non conta i riavvii: se la pagina crasha all'avvio, ricarica ogni 300 ms per sempre (log pieno). **Certo, basso.**
- BLOCCO (`unresponsive`): nessun gestore per la finestra uscita (esiste per controllo e motori, `main.js:246, :270`, non qui). Il proiettore resterebbe congelato senza che nessuno se ne accorga. **Certo.** Aggiungere `on('unresponsive')` che dopo ~10 s fa `reload()`.
- Chiusura accidentale (⌘W, bottone rosso): la finestra si chiude, nessun riapri automatico; l'interfaccia aggiorna il tasto «uscita» (`app.js:1224`). OK.
- Il live non sente mai l'uscita (nessuna dipendenza in audio): confermato leggendo `manda('uscita', …)`: è `postMessage` a porta, a fuoco e dimentica (`motore.js:93`).

**C3. Un'eccezione dentro `disegna()` congela il proiettore e inonda il log**
- `giro()` richiama `requestAnimationFrame(giro)` PRIMA di `disegna()` (`uscita.js:487-488`): se `disegna()` lancia (es. un livello con dati inattesi: `l.codice` non stringa in `aspetto.js:23` `.replace`, `vistaCodice`, `evidenzia`), il ciclo continua ma ogni frame rilancia: schermo fermo all'ultimo disegno ben riuscito + ~60 errori/s. In più `setInterval(disegna,100)` (`:541`) idem.
- Ogni errore di pagina finisce nel log del main in modo SINCRONO (`main.js:176-184` `inoltraConsole` → `log.scrivi` con `statSync`+`appendFileSync`, `log.js:33-40`): un loop di errori a 60 Hz sono 60 scritture sincrone al secondo sul thread principale e il file ruota a 2 MB (con un solo file di scorta) in pochi minuti, cancellando la storia utile. **Probabile.** Rimedio: `try/catch` per livello dentro il ciclo `for (const l of viste)` (`uscita.js:255-304`), e deduplicare i messaggi identici nel log.
- Nessuna validazione dei dati in arrivo (`uscita.js:65-75`): `data.livelli`, `data.righe` sono presi così come sono.

**C4. Timer / animazioni / DOM**
- Nessun `requestAnimationFrame` o timer che cresce senza fine: un solo `giro` + un `setInterval` fissi (`uscita.js:486-489, :541`), `avviaGatto` ricorsivo con un solo timer (`:97-108`), insegna neon con `ferma()` quando cambia il testo (`:517-524`). Il doppio giro (60 Hz + 10 Hz) fa fare `disegna()` due volte quando la finestra è in primo piano: lavoro doppio inutile. **Certo, basso** (spegnere l'`setInterval` quando `document.visibilityState==='visible'`, oppure tenerlo solo come rete di sicurezza).
- DOM: le righe scritte a macchina NON si accumulano: `scrivi()` rimpiazza `textContent` e ricrea 1-3 span (`uscita.js:134-160`), `riempi()` fa `replaceChildren` (`evidenzia.js:59-78`); i blocchi dei livelli usciti vengono rimossi (`:330-335`). **Nessuna crescita del DOM trovata.**
- Memoria piccola ma illimitata (si stringe solo con i riavvii), **certo, basso**:
  - `strisceU` (`uscita.js:72`): per ogni livello `{...prev, [ciclo]: ev, [ciclo-2]: undefined}` → le chiavi non si tolgono mai (il valore diventa `undefined` ma la chiave resta): ~1 chiave per ciclo per livello; `Object.values(e).some(...)` (`:189`) le scorre a ogni frame. A 120 BPM e 40 min ≈ 1200 chiavi/livello. Rimedio: `delete` invece di `= undefined`.
  - `strisceU`, `misureU`, `statiU`, `inizioUscita`, `novita` (`:33-39, :351`) tengono gli id dei livelli già usciti per sempre.
  - `cacheViste` e le cache di `scrittura.js`/`evidenzia.js` hanno un tetto (200/120/60): bene. Ma `evidenzia.pattern` espelle il PIÙ VECCHIO inserito (non il meno usato, `evidenzia.js:14`): un livello che dura più di 60 modifiche altrui viene rivalutato, e per un attimo perde l'evidenziazione. **Da verificare, basso.**
- Hydra/WebGL: **non c'è** (vedi a). Quando arriverà (fase 3) servirà `webglcontextlost`/`restored`, un tetto di memoria video e un `child-process-gone` per la GPU (oggi `main.js:99` lo registra soltanto).
- Canvas: lo sfondo è 2D a metà risoluzione, 30 fps (`sfondo.js:10, :40-48`); lo ridimensiona solo se cambia la finestra. OK.

**C5. Desincronia tra ciò che suona e ciò che è mostrato**
- Il tempo mostrato = mappa dal live + orologio locale (`uscita.js:224`): corretto ogni secondo (`motore.js:773`). Se il motore LIVE è bloccato (non crashato), l'uscita continua a estrapolare con l'ultima mappa e mostra livelli che entrano/escono come se andasse tutto bene (nessun indicatore «dati vecchi»). **Certo, medio-basso.** Rimedio: se non arriva una `mappa` da > 3-5 s, mostrare un segno discreto (o spegnere il verde).
- `performance.timeOrigin + performance.now()` (uscita) vs orologio del live (`orologio.aggiorna`): stesso principio, due processi; corretto di continuo. **Da verificare** lo scarto reale a 40 min (il test di robustezza lo misura per la cuffia, non per l'uscita).
- Il codice mostrato per i livelli `sostituito` e per le bozze (B3, B4) è deliberatamente diverso da quello che suona.
- L'evidenziazione delle note rivaluta il codice DENTRO la pagina uscita (`analisi.js`, nuovo repl Strudel) e non dal motore: è un'altra valutazione. Se un codice dipende da qualcosa che il motore ha e l'uscita no (un suono, `samples` finto: `analisi.js:17`) l'evidenziazione può non combaciare; non è il suono. Stessa cosa nel pianoroll di `sfondo.js`. **Certo, per progetto.**
- Il `repl` d'analisi gira anche nell'uscita e valuta il codice utente (`evidenzia.js:13` → `analisi.valuta`): un loop infinito nel codice bloccherebbe quella pagina (non l'audio). Nessun timeout. **Da verificare, basso.**

**C6. Altro**
- `uscita:crasha` (`main.js:367`) è un canale di prova che il preload NON espone (`preload.cjs`), quindi morto in produzione; il canale generico `crasha` (`preload.cjs`, `main.js` ~ `ipcMain.on('crasha')`) invece è esposto a ogni pagina: lo schianto del LIVE da una pagina è un pulsante ad alto rischio, anche se oggi lo usano solo le prove. **Certo, basso** (togliere dal preload quando non è `PER_PROVE`).
- `immagine:leggi` (`main.js:425-430`) legge qualunque percorso con estensione immagine ≤ 5 MB: ok per un'app locale, ma accetta un percorso qualsiasi dalla pagina. **Certo, basso.**

---------------------------------------------------------------------------------------------------------------------------
## ZONA 2 · IL RESTO
---------------------------------------------------------------------------------------------------------------------------

### d. BUG (con sicurezza)

**D1. `salvaConfig` può azzerare `stash.json` (certo nel codice, probabile nei fatti)**
`stash.js:61-67` `leggiConfig()`: se la lettura o il parse falliscono, per QUALSIASI motivo (SSD che balbetta, file troncato, JSON rovinato) ritorna la configurazione vuota `{ nome, formato, uscite: {}, offsetCuffiaMs: 0 }` senza dirlo. `stash.js:71-75` `salvaConfig` fa `{...(await leggiConfig()), ...modifiche}` e riscrive: una sola scrittura (es. cambio uscita o offset cuffia) con un `stash.json` illeggibile cancella uscite scelte, offset e tutto il resto. **Rimedio**: in `salvaConfig` distinguere «file mancante» da «file illeggibile» e in quel caso non scrivere (e avvisare), più scrittura atomica (D4).

**D2. Modifiche fatte mentre si lavora sulla COPIA dello stash vengono perse alla copia successiva (probabile)**
`stash.js:26-31` `attivo()` torna alla copia sul Mac se l'SSD non c'è e si continua a lavorare (salvare brani, `set.cutx`, `kit.cutx`, `stash.json`): le scritture vanno nella copia (`:173-195`). Al ritorno dell'SSD `copiaStash` (`:240-243`) considera «uguale» un file solo se `size` uguale e copia non più vecchia; se la dimensione cambia → il file della copia viene SOVRASCRITTO con quello dell'SSD: le modifiche fatte in copia spariscono, senza avviso (e il verso opposto non è mai fatto). **Probabile.** Rimedio: avviso «hai lavorato sulla copia» + copia in senso inverso o conflitto esplicito.

**D3. Scritture non atomiche di preferenze e stash (certo)**
- `preferenze.js:55-59` `writeFile` diretto: se l'app muore a metà o due `salva` si accavallano (es. il timer di posizione della finestra uscita, `main.js:334`, più un clic) il file può restare troncato/misto. All'avvio `leggi()` (`:44-53`) ignora l'errore e riparte dai PREDEFINITI: si perdono cartelle Ableton, scorciatoie, uscita, e `cartellaSuoni:null` → all'avvio compare la finestra modale «Dove metto i suoni di Strudel?» (`suoni-vista.js:46-52`) e i suoni non suonano. Il `salva` successivo sovrascrive per sempre.
- Idem `stash.json` (`stash.js:69`), `impostazioni.json` (`:47`, se manca `carica()` dimentica lo stash scelto, `:35-41`), `set.cutx`/`kit.cutx` (`:173-177`), `.cutx` dei brani (`:189-197`).
- Rimedio unico: funzione `scriviAtomico(file, testo)` = scrivi `file.tmp` + `rename` (come già fa `suoni-strudel.js:67-68` per i suoni). ~10 righe, testabile con test puro.

**D4. `preferenze.salva` senza `catch` dal timer dell'uscita**: `main.js:334` chiama `preferenze.salva(...)` senza `await`/`catch`; se il disco è pieno diventa `unhandledRejection` (finisce nel log, non fa danni). **Certo, basso.** In memoria `preferenze` è già cambiata prima della scrittura (`preferenze.js:56`), quindi il disco e la memoria divergono.

**D5. `imposta()` cambia `percorso` prima di sapere se funziona** (`stash.js:44-48`): `percorso = nuovo; await prepara()` — se `mkdir` fallisce (volume in sola lettura) resta lo stash nuovo in memoria ma non su disco. **Certo, basso.**

**D6. Lettore Ableton: nessun limite di tempo né di memoria** (`ableton.js:15-37`): il worker legge tutto con `gunzipSync` (`leggi.js`) senza `resourceLimits` né timeout; un `.als` enorme o rovinato può restare in lettura per sempre e la coda `coda = lavoro.catch(...)` (`:37`) si ferma dietro: nessun altro progetto si apre finché non si riavvia. **Probabile, basso** (succede solo con file anomali). Rimedio: timeout 60 s con `worker.terminate()`.

**D7. WAV: `Buffer.alloc(dimensione)` con la dimensione del blocco `fmt ` letta dal file** (`ableton.js:158`): un file rovinato con dimensione enorme fa allocare GB. **Probabile, basso.** Limitare a 64 byte.

**D8. Importazione Ableton: `copyFile`/`ritagliaWav` su file già esistenti li sovrascrive in silenzio** (`ableton.js` `copiaSuoni`, `copyFile(percorso, destinazione)`): stessa cartella `suoni/<nome>/` e stesso nome di file → il campione di Valerio viene sostituito (il commento dice «mai una cancellazione», ma sovrascrivere è peggio). E un file copiato a metà (SSD staccato) resta lì troncato e suonerebbe come un loop corto. **Probabile, basso.** Rimedio: copiare su `.parte` e rinominare; non sovrascrivere senza avviso.

**D9. `suoni:sposta`** (`suoni-strudel-ipc.js:93-101`): se la copia fallisce a metà (errore, disco pieno, SSD staccato) `nuova` parziale resta sul disco (si cancella solo se `verifica` dice «non ok»); e si fa `rm(vecchia, {recursive})` appena dopo: se la verifica riporta `ok` ma i file sono quelli di `verifica` (controlla solo la dimensione di ogni file), va bene; **ma** se `nuova` esisteva già con altri contenuti chiamata «Suoni di Strudel», il ramo di errore (`:96`) la cancella. **Certo, molto basso.**

**D10. UI: `scarica()` senza `try/finally`** (`suoni-vista.js:118-132`): se `suoniScarica()` rifiuta, la finestra di avanzamento resta aperta per sempre (modale su tutta la postazione); se risponde `{errore: 'lo scarico è già in corso'}` si mostra «errore di rete» (`:135`). **Certo, basso.** Il download non ha timeout per richiesta (`suoni-strudel.js:63`): una connessione appesa blocca uno degli 8 lavoratori finché non si preme annulla.

**D11. «npm run prova» non è la sequenza completa**: `main.js:24` con `--prova` senza valore esegue solo 11 parti (robustezza…uscita); `prova.js:65` ne ha un'altra lista (12, con `moviola`) ma non si usa mai perché main passa la sua. Esistono ~48 parti (`parti.includes('…')` in `prova.js`): `synth, cuffia, controller, coda, passaggio, set, guardiano, dissolvenze, scrittura, colpi, testi, suoni-ui, fader…` NON girano con `npm run prova`. CLAUDE.md dice «da rifare a ogni modifica dei motori» e «sequenza completa»: la sequenza reale è un sottoinsieme. **Certo.** Rimedio: una sola lista in un posto solo (esportata da `prova.js` e letta da main), o un elenco `PARTI` che i due file importano.

**D12. `process.on('uncaughtException')`** (`main.js:96-97`): gestori presenti e sicuri (scrivono nel log, `log.scrivi` non lancia mai, `log.js:26-46`). OK. Ma la `app.whenReady().then(async …)` (`main.js:646-671`) non ha `catch`: un errore in `stash.carica()`/`creaMotore` a freddo resta come `unhandledRejection` loggata e l'app resta mezza accesa. **Probabile, basso.**

### e. RISCHI DI STABILITÀ (disco, finestre, serata)

1. **SSD staccato**: `attivo()` (`stash.js:26-31`) fa `existsSync(percorso)` SINCRONO sul processo principale, ed è chiamata da quasi ogni funzione dello stash (`radice()`, `fileConfig`, `serviFile` per ogni campione `cutx://app/stash/…`, `main.js:150-152`). Con il volume smontato dà `false` in fretta (ottimo: si passa alla copia). Con il volume ancora montato ma bloccato (cavo a metà, SSD che va in sleep), `existsSync`/`readFile` possono restare appesi: i sync bloccano il main thread = guardiano e protocollo `cutx://` fermi (nessun campione carica, nessuna finestra riavviata). **Probabile, da verificare a mano** (staccare il cavo durante un caricamento).
2. **File mancante / JSON rovinato**: i cammini di lettura hanno quasi tutti un `try/catch` con ripiego (`stash.js:61-67, :135-141, :159-167`, `suoni-strudel.js:127-163`, `elencoLibreria` ignora i file illeggibili). Il ripiego per `stash.json` è però pericoloso (D1), per `preferenze.json` e `impostazioni.json` è silenzioso (D3).
3. **Salvataggi non atomici**: D3. Nessuno dei file importanti usa `.tmp` + `rename` (l'unico è il download dei suoni).
4. **Handler di processo**: ci sono (D12). Guardiano finestre: controllo ricaricato, live riavviato solo se muore (non se blocca), cuffia riavviata anche se blocca, uscita ricaricata se crasha (`main.js:241-292, :338-342`). `child-process-gone` (GPU, utility) solo registrato (`main.js:99`): una GPU che muore non ha rimedio visibile.
5. **Log**: sincrono, 2 MB + 1 di scorta (`log.js`), nessuna deduplicazione (C3).
6. **IPC `log`** (`main.js:541-546`): una pagina può accodare righe senza limite a un file nella cartella log (nome ridotto a basename): con un bug a 60 Hz riempie il disco. **Certo, basso.**
7. **Cartella dei suoni di Strudel**: `suoni:mappe` fa `stat` su ogni file ogni volta che un motore ricarica (`verifica`, `suoni-strudel.js:111-123`, ~migliaia di file) e `suoni:stato` anche: sul disco interno è trascurabile; se `cartellaSuoni` è su un SSD esterno e quest'ultimo sparisce, `firma` cambia e i motori ricaricano le mappe (corretto), ma i campioni già registrati puntano a file che non ci sono (404 a runtime: silenzio dei suoni non ancora in cache). **Probabile, medio** se i suoni stanno su disco esterno.
8. **Una sola `protocol.handle('cutx')` con `decodeURIComponent` non protetto** (`main.js:149`): un URL malformato lancia `URIError`; non è raggiungibile dalle pagine proprie. Basso.
9. **Permessi**: solo `PERMESSI` per pagine `cutx://` (`main.js:649-652`), contextIsolation/sandbox attivi, nodeIntegration off. Niente da segnalare.

### f. STATO DELLE PROVE

**`npm test`**: `tests 330, pass 330, fail 0`, 1,6 s (node --test, 38 file in `test/*.test.js`). `test:app` (`test/app/chiusura.test.js`) e `npm run prova` non lanciati (suonano / aprono l'app).
**Lint**: NON esiste (nessun ESLint/Prettier, nessuno script `lint` in `package.json`; nessuna config nella radice). Un `node --check` o ESLint con poche regole (`no-undef`, `no-unused-vars`) troverebbe subito le cose di g.
**Build.files**: `test/pacchetto.test.js` controlla che ogni file importato dal main sia in `build.files`; passa. L'elenco ha `src/renderer/{brano,categorie,coda,colpi,testi-pubblico}.js` ed esclude `prova.js`.

**Come sono organizzate le prove con l'app** (`src/main/prova.js`, 5937 righe, SOLO `grep`): ~48 parti `provaXxx()` (funzioni a riga 355, 462, 581, 774, 895, 1077, … 5884); ognuna è chiamata se `parti.includes('nome')` nel dispatcher `prova()` (riga 65-250). Si lanciano con `npm run prova` (solo 11 parti, vedi D11), `npm run prova:parte -- synth,tempo` (via `scripts/prova-silenziosa.mjs`: stampa solo le righe `[prova]`), più modalità `--foto`, `--schermate`, `--sfondo`, `--saltino`, `--chiusura`. Girano su dati a parte `CUTX-prova` (controllo in `main.js:85-88`). Il file è un unico blocco di 5900 righe (g).

**NON coperto da nessun test automatico puro** (verificato con grep sugli import in `test/`):
- **Stato CUE/LIVE**: `cue.js` (1190 righe: cosa è in cue, modi, entra-tra), `pila.js` (523: card live, togli, buchi), `motore.js` (1294: livelli entrano/escono, `pulisci`, sostituzione, `descrivi`, guardiano a tempo di esecuzione `suErroreSorgente`), `app.js` (1818). Si provano solo da `prova.js` con l'app vera (lente, suonano, soggette ai «guasti sparsi» noti).
- **Coda (`coda.js`)**: coperta (`test/coda.test.js`, `controller.test.js`). **Controller**: `controller.js`, `controller-mc.js`, `controller-synth.js` coperti; `controller-colpi.js` (158) e `impostazioni-controller.js` (214) no.
- Mai testati: `aspetto.js` (44 righe, puro: esattamente la funzione che decide cosa vede il pubblico e la pila), `uscita.js` (la geometria `adatta`), `stash.js` e `preferenze.js` (importano `electron` e per questo non si caricano da `node --test`), `suoni-vista.js` (`frase()` è pura), `suoni-strudel-ipc.js`, `browser.js`, `set-vista.js`, `sfasamento.js`, `limiter.js`, `striscia-vista.js`, `synth-roll.js` (781), `dialogo.js`, `editor.js`, `aiuto.js`.
- **Dove sarebbe facile aggiungere test puri** (valore alto, costo basso):
  1. `aspetto.js` + `sostituente/sostituito`: un file di test di ~60 righe (arriva/suona/esce/sostituito con mappa finta).
  2. `testi-pubblico.filtraCodice` con casi limite (backtick multi-riga, `inizio` a metà riga, `/* */`): l'unico filtro che nasconde codice al pubblico.
  3. Un nuovo modulo `scrittura-sicura.js` (`scriviAtomico`, `leggiConfigSicura`) togliendo la logica di file da `stash.js`/`preferenze.js` così si prova senza `electron`; test su file troncato, JSON rovinato, rename.
  4. `scorri.js` con i casi di B2 (geometria con overhead) e, se si fa la proposta 2, `trovaColonne`.
  5. `suoni-vista.frase()` e `suoni-strudel.pianoFonte` (c'è già `suoni-strudel.test.js`).
  6. Estrarre da `cue.js`/`motore.js` la parte «lista di livelli → cosa è in cue / live / in arrivo / in uscita» in un modulo puro (es. `livelli.js`): è il cuore del gesto e oggi è provabile solo suonando.

### g. QUALITÀ DEL PROGETTO (solo ciò che vale, 11 voci)

1. **`prova.js` 5937 righe** in un file solo, con due liste di parti diverse (D11). Spezzare per area (`prove/uscita.js`, `prove/synth.js`…) con un `index` che esporta l'elenco unico `PARTI`. Beneficio: nessun errore di elenco, file apribili.
2. **`app.js` 1818, `motore.js` 1294, `cue.js` 1190, `stile.css` 3329 righe**: i grossi sono ancora leggibili ma `app.js` e `motore.js` mescolano stato e DOM/audio, per questo non si provano (f.6). Non vale rifare tutto: estrarre solo la «lista livelli» pura.
3. **`stile.css` 3329 + `synth.css` 471 + `neon.css` + `uscita.css`**: un CSS unico gigante per l'interfaccia; ok finché non cresce, ma i colori ripetuti (`rgba(159,194,58,…)` ovunque: `uscita.css:21, 104, 135, 146…`, `sfondo.js:9`) andrebbero in variabili (`--marcio-rgb`).
4. **Codice morto verificato** (definito ed esportato ma usato 0 volte, controllato con grep su `src` e `test`): `haApertura` (`brano.js`), `eBersaglioBeat` (`nomi.js`), `senzaCiclo` (`synth-note.js`), `eEffettoFader` (`controller-mappa.js`), `dieciTasti` (`colpi.js`). Esportati ma usati solo dentro il proprio file (non morti, solo `export` inutile): `codiceSuono`, `codiceProva` (`browser.js`), `rigaScena` (`brano.js`), `curvaMorbida` (`limiter.js`), `manoValida`, `ANTEPRIME` (`synth-modello.js`), `leggiVelocita` (`synth-note.js`), `valoreDa` (`controller-mappa.js`), `disegnaAnello` (`specchio.js`), `suoniUsati` (`analisi.js`). Elenco più lungo di costanti `export const` mai importate (soglie in `striscia.js`, `sfasamento.js`, `controller-mc.js`…): innocue.
5. **Preferenze morte**: `hydra: true` e `logoSopraHydra: true` in `preferenze.js:30-31` non sono lette da nessun codice (Hydra non c'è); `PREDEFINITE.aperturaFantasma` sì. Rischio: un interruttore «hydra» nelle impostazioni che non fa niente. Tenere o togliere finché non c'è la fase 3.
6. **Parole dell'interfaccia nel codice invece che in `testi/it.json`** (`it.json` ha 678 righe ed è usato da `aiuto, app, browser, cue, importa, impostazioni(-controller), set-vista, pila, specchio, synth-*`): **`suoni-vista.js` non lo usa affatto** (tutte le frasi scritte nel file: `:14-20, :56, :95-132, :150-190`); `suoni-strudel-ipc.js` e `main.js` hanno titoli di finestre e messaggi in italiano nel codice (`'Dove metto i suoni di Strudel?'`, `'Scegli lo stash'`, `'nessuno stash'`, `main.js:405-415, :492`); `testi-pubblico.js` ha i testi predefiniti nel codice (ma sono i predefiniti modificabili: va bene); `cue.js` ha ~66 frasi nel codice contro 5 usi di `it`, `app.js` ~39, `impostazioni.js` ~44 (conteggio grezzo). È la voce di «PROSSIMI» già nota; aggiungo solo che `suoni-vista.js` è il file più indietro.
7. **Incoerenza di nomi**: la stessa cosa si chiama `uscita` (finestra del pubblico, `main.js`, `uscita.js`), `proiettore` (CLAUDE.md, CSS, `sfondoProiettore`), «pubblico» (`testi-pubblico.js`) e `uscita` anche per l'uscita audio (`uscite.js`, `uscitaVoluta` in `motore.js:908`, `config.uscite`). Cercare «uscita» dà due mondi. Meglio `finestra-pubblico` o `proiezione` per quella visiva, `uscitaAudio` per l'altra (rinomina costosa: solo per i nuovi file, o lasciar perdere).
8. **Duplicazioni**: `crea`/`el` (helper `document.createElement`) ripetuto in `impostazioni.js:14`, `suoni-vista.js:5`, e altrove; `leggiAlsFile`/`interpretaWav`/`durataWav` ripetono il parsing dei chunk WAV (`ableton.js:103-125` e `:143-171`); `specchio.js` ha due funzioni quasi uguali `aggiornaSynth`/`aggiorna` (`:60-159`) che disegnano le manopole con lo stesso blocco. Piccoli guadagni, nessuna urgenza.
9. **Doppio giro in `uscita.js`** (rAF + `setInterval(…,100)`): lavoro doppio (C4).
10. **Dipendenze**: `package.json` pulito (1 dipendenza `fast-xml-parser`, 10 dev: Strudel pinned, electron, electron-builder, vite). `@strudel/draw` e `@strudel/tonal` sono usati (`analisi.js:11-13`); `@strudel/codemirror` anche. Nessuna inutile trovata. `electron` e `vite` con `^`: per un'app da serata meglio versione fissa e `package-lock.json` bloccato (c'è).
11. **Canali di prova esposti in produzione**: `crasha` nel preload e `ipcMain.on('crasha')`/`'uscita:crasha'` (`main.js:367, ~516`) restano nell'app impacchettata (C6). Condizionarli a `PER_PROVE`.
12. **`CLAUDE.md` dice «npm run prova = prova automatica di robustezza… da rifare a ogni modifica dei motori»**: va chiarito che gira solo 11 parti su ~48 (D11), altrimenti sembra più copertura di quella che c'è.

---------------------------------------------------------------------------------------------------------------------------
## Priorità consigliate (cosa farei prima, in ordine)

1. **Subito, senza codice**: commenti ON, preambolo ON, striscia OFF nei testi per il pubblico (B1, B2). Poi decidere se cambiare i predefiniti.
2. **Scrittura atomica** di `preferenze.json`, `stash.json`, `impostazioni.json`, `.cutx`, `set/kit.cutx` + `salvaConfig` che non scrive se il file è illeggibile (D1, D3). Piccolo, alto valore in serata.
3. **Proiettore**: `try/catch` per livello in `disegna()` (C3); `unresponsive` → reload (C2); `display-removed/added` (C1) e non salvare la posizione durante lo scollegamento.
4. **Mostrare tutto il codice**: scalare tag/gap/striscia con `--scala` (B2 proposta 1), poi colonne se serve.
5. Una sola lista delle parti di prova (D11) e dire la verità in CLAUDE.md.
6. Test puri per `aspetto.js`, `filtraCodice` e la futura `scrittura-sicura.js` (f).
7. Avviso «hai lavorato sulla copia dello stash» (D2) e timeout del lettore Ableton (D6).
