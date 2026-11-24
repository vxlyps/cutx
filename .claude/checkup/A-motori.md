# Check-up A — motori audio, tempo, processo principale

Sola lettura. Branch `checkup-beta5`. Nessun file del progetto toccato, nessuna app lanciata.
`node --test test/riproduttore.test.js test/tempo.test.js`: 10/10 passano.
Strudel guardato in `node_modules` (core 1.2.6, superdough/webaudio 1.3.0).
Percorsi: `src/renderer/` salvo diversa indicazione. Righe = stato attuale dei file.

Legenda sicurezza: CERTO = dimostrato dal codice; PROBABILE = il ragionamento regge ma dipende da uno scenario; DA VERIFICARE = serve una prova a mano.

---------------------------------------------------------------------
## 1. MAPPA

### File
- `motore.html` (14 righe): pagina nascosta, CSP, carica `motore.js`. Stessa pagina per live e cuffia (`?ruolo=`).
- `motore.js` (1294): il motore. Contiene: compilazione (repl di Strudel usato solo per compilare, 161-185), livelli e coda (239-430), GO LIVE `entra` (431), paracadute (503), togli/ferma (543-592), mixer per livello (628-690), guardiano a runtime (720), mappa del tempo (775-819), giro (892), uscita audio (912-942), configurazione stash (947), tastiera SYNTH solo cuffia (1009-1116), smistamento messaggi `ricevi` (1118-1251), ponte porte (1253), hook di prova (1269-1286), avvio (1288-1293).
- `riproduttore.js` (152): `Riproduttore`. `tick()` ogni 50 ms guarda avanti 100+50 ms, `programma()` interroga ogni sorgente (livello) e chiama `uscita` (= `getTrigger` di Strudel -> superdough). Gestisce mappa del tempo, cambi di tempo futuri, `fine` (fin dove ha già programmato).
- `tempo.js` (91): `Orologio` (contesto audio <-> epoca assoluta) e funzioni pure della mappa `{ciclo0, epoca0, cps, cambi}`.
- `motori.js` (84): lato interfaccia: classe `Motore` (porta, ping ogni 500 ms, `viva` se pong < 1,5 s, `valuta`/`richiesta` con timeout 5 s).
- `dissolvenza.js` (88): curve di entrata/uscita su GainNode + due Biquad per livello.
- `ascolto.js` (123): `Sentinella` e `Anello`, solo per le prove (attive solo con `eco`).
- `sfasamento.js` (123): `Misuratore` live-cuffia, solo interfaccia/prove.
- `bpm.js` (151): il numero BPM in alto (UI), manda `{tipo:'tempo'}`.
- `colpi.js` (126): parser puro di `colpi.cutx`.
- `moviola.js` (renderer, 86): scatola nera lato pagina, pacchetti ogni 250 ms.
- `src/main/main.js` (672): finestre, protocollo `cutx://`, canali, guardiano, IPC.
- `src/main/stash.js` (268): stash, config, mappa suoni, copia di sicurezza.
- `src/main/moviola.js` (111): scrittura asincrona del registro (stream), tetto 8 MB in coda.
- `src/main/preload.cjs`: espone `window.cutx` (ponte IPC) e gira `porta` -> `window.postMessage`.

### Percorso dei dati: codice dall'interfaccia al suono

Canali (main.js):
1. Una finestra finisce di caricarsi -> `did-finish-load` (main.js:218) -> `pronte[nome]=true` -> `collega(nome)` (205).
2. `collega` crea un `MessageChannelMain` per ogni coppia pronta (COPPIE, 196-202) e manda le due porte con `webContents.postMessage('porta', altro, [porta])` (210-211).
3. `preload.cjs:59` converte in `window.postMessage({porta: con}, '*', ports)`.
4. Motore: `window.addEventListener('message')` (motore.js:1253) salva `porte[con]` e imposta `onmessage -> ricevi(con, data)`. Il live, a ogni porta nuova, rimanda `pubblicaMappa()`, `aggiornaLivelli()`, `mandaGlobali()` (1260-1264).
5. Interfaccia: `Motore.collega(porta)` (motori.js:29) + `ping()` + `suCollegato()`. In `app.js` `live.suCollegato` (1465) e `cuffia.suCollegato` (1471) rimettono lo stato ai motori rinati.

LIVE (go live):
- `app.js goLive` (226) -> `live.richiesta({tipo:'entra', codice, coda, inizio, nome, cicli: entraTra, volume, dissolvenza, beat, alle, rampa, transizione})` (app.js:257) -> `Motore.richiesta` (motori.js:53): manda, aspetta `{tipo:'risposta', id}` max 5 s.
- Motore live `ricevi` case `'entra'` (motore.js:1124) -> `entra()` (431):
  1. `compila(codice)` (171): coda di promesse (una sola valutazione alla volta), `compilatore.evaluate(codice,false)`; errori di sintassi/runtime -> `onEvalError` -> `{errore}` (nessun livello nuovo, il vecchio continua).
  2. `verificaPattern` (699): interroga i primi 16 cicli, sincrono, con `query()` (non `queryArc`, che inghiotte gli errori).
  3. `avvisaSuoniMancanti` (189): altra interrogazione di 16 cicli, avvisa l'interfaccia (`suoni-mancanti`).
  4. `da = rip.prossimoConfine() + max(1,cicli) - 1` (440). `prossimoConfine` = `ceil(rip.fine)` (riproduttore.js:71).
  5. Sostituzione dei livelli con lo stesso nome (447-466), transizione (469-471), coda (473-474), volume (475), `livelli.push(l)` (477), tempo `setcpm` (478), `iniziaSet` (480), `aggiornaLivelli` (481), dissolvenze (482-484), micro-entrata (485).
  6. `aggiornaLivelli` (750): `applicaGuadagni` (crea la catena audio del livello: orbita 1000+id -> lp -> hp -> gain -> taglio -> fade -> micro -> casse, 628-663) e `rip.sorgenti = livelli`; poi messaggio `livelli` a controllo+uscita e `livelli-live` alla cuffia.
  7. Risposta `{tipo:'risposta', da, livello}` sulla porta di chi ha chiesto (1126).
- Ogni 50 ms `giro()` (892) -> `rip.tick()` (riproduttore.js:96) -> `programma(fine, fino)` (119): per ogni sorgente `interroga` (= `interrogaVisibile`, motore.js:693) i cicli [max(da,s.da), min(fino,s.a)); per ogni hap con onset: `t = tempo(ciclo)`; se `t <= ora+5 ms` e` saltato (`tardi++`, 137-140); altrimenti `hap.withValue(orbit = s.orbita)` e `this.uscita(h, t-ora, durata, cps, t)` (146).
- `uscita` = `getTrigger({getTime, defaultOutput: webaudioOutput})` (motore.js:167; core/repl.mjs:295) -> `webaudioOutput` -> `superdough(value, t, durata, cps, ciclo)` (superdough.mjs:439): carica il campione se serve, crea il suono, catena di effetti, orbita 1000+id -> catena del livello (guadagno/dissolvenza) -> `destinationGain` -> limiter (`limiter.js`) -> `ac.destination`.

Tempo:
- Il live ha la mappa: `rip.mappa = {ciclo0:0, t0, cps:0.5}` creata solo a fine avvio (motore.js:1290). `pubblicaMappa()` (775) la manda a cuffia/controllo/uscita ogni 1000 ms (1291) e a ogni cambio (`rip.suMappa`, 807).
- `cambiaTempo` (789) e' l'unico punto che cambia il tempo (setcpm di un livello dal suo ciclo, evento con `cps`, BPM in alto `{tipo:'tempo'}` all'inizio del ciclo dopo, rampa).
- Cuffia: `ricevi 'mappa'` -> `mappaLive` (1204); `giro()` -> `seguiLive()` (814) riporta la mappa nel proprio contesto (`Orologio`, `offsetMs`) e rifa' `rip.mappa` e `rip.cambiTempo` a ogni giro.

CUFFIA (CUE):
- `app.js manda(cuffia, codice)` (141) -> `motore.valuta` -> `{tipo:'valuta'}` -> `valuta()` (204): `compila`, poi `rip.pattern = pattern` (una sorgente da -Infinity a +Infinity: parte al tick successivo, non su un confine). `anteprima` (Ableton) suona una volta e si ferma da sola.

Guardiano (main.js):
- interfaccia crashata -> `reload` dopo 300 ms (241-245); cuffia crashata/bloccata -> `riavviaMotore` (283); live crashato -> `riavviaMotore` (267); live bloccato -> solo avviso (272). Dopo il riavvio `collega()` rifa' i canali, l'interfaccia rimette codice (cuffia, 1471) o livelli (live, `ripristinaLive`, app.js:1152).

---------------------------------------------------------------------
## 4. DOMANDA PRECISA: come parte la base ritmica quando la mando live

(Metto questa sezione prima perche' e' quella che serve a Valerio.)

### Come entra un livello (lato motore)
- Non c'e' un "riproduttore fermo": il Riproduttore gira sempre (`setInterval(giro, 50)`, motore.js:1293), anche senza livelli. Dopo l'avvio non c'e' niente da "far partire". Il tempo e' sempre in marcia dal secondo in cui il live e' pronto.
- Un livello entra SEMPRE a un confine di ciclo, mai subito: `da = ceil(rip.fine) + max(1,cicli) - 1` (motore.js:440). `rip.fine` e' ~150 ms nel futuro (riproduttore.js:99-101), quindi l'attesa e' tra ~0 e 1 ciclo, piu' (cicli-1) cicli interi. Un ciclo = 4 quarti: a 120 bpm 2 s, a 90 bpm 2,7 s. `entraTra` (default 1, app.js:78) puo' essere 1/2/4/8: a 8 cicli e 100 bpm sono fino a ~19 s di silenzio apparente.
- Eccezioni che cambiano `da`: `subito` (colpi/riser, 440), `alle` (441-442: se in interfaccia c'e' un cambio scena "in attesa" - `statoBeat().pendente`, app.js:253 - ogni clip NON beat entra insieme a quel cambio, fino a 64 cicli dopo), transizione (469-471).
- Il livello suona solo se: `rip.mappa` esiste, `giro` gira, `programma` trova hap con onset in [da, a), `t > ora+5 ms`, e il suono esce dalla catena (volume x muto x taglio x fade x micro x master x limiter x uscita audio).

### Condizioni in cui un livello mandato live resta muto o in attesa (ognuna con la riga)
Ordinate per probabilita' reale di capitare in serata.

1. CAMPIONI AL PRIMO USO: i primi colpi di un suono nuovo vengono SALTATI. Nessun precaricamento esiste (grep: niente `prebake`, `loadBuffer`, `getSampleBuffer` nel progetto). Superdough carica il file nel momento in cui arriva il colpo (`sampler.mjs:289`, `getSampleBufferSource`), ma il colpo e' programmato ~100-150 ms prima (riproduttore.js:99-101); se il caricamento+decodifica dura di piu', `sampler.mjs:299` ("took too long") o `superdough.mjs:476-479` ("skip hap: still loading") scartano il colpo. Gli stessi colpi successivi (stesso file) partono quando il buffer e' in cache. Cuffia e live hanno cache SEPARATE (due pagine): aver provato il beat in cuffia NON scalda il live. Effetto: la cassa del primo battuto (o le prime battute) manca; con uno stem WAV lungo da 1 evento per loop (tipico Ableton) il primo giro intero e' muto. Sicurezza: CERTO per il meccanismo, PROBABILE come causa del "la base non parte" (dipende da quali suoni usa). `avvisaSuoniMancanti` (motore.js:189) controlla solo che il nome sia registrato (`getSound`), non che il file sia caricato.
   - Idea di correzione (non applicata): all'`entra` e alla `valuta` della cuffia, interrogare i primi cicli, raccogliere `s`/`n`/`bank` e chiamare il caricamento (`getSampleBuffer`/`loadBuffer` di superdough) PRIMA di `entra`, oppure mandare dalla cuffia al live un messaggio `precarica` con i nomi dei suoni appena provati. Per gli stem lunghi, precaricare quando il CUE li carica.
2. EREDITA' DEL LIVELLO CON LO STESSO NOME: il beat si chiama sempre `beat` (app.js:353, 296). Se c'e' gia' un `beat`, il nuovo prende volume e muto del vecchio (motore.js:451-452 se il vecchio era in attesa, 461-462 se suonava) e la coda (463). Se il vecchio era mutato (`muto:true`) o col fader a 0, il nuovo entra MUTO/a 0 senza nessun avviso. Poi `if (Number.isFinite(volume)) l.volume = ...` (475) vince solo se la sezione scrive un volume. CERTO dal codice; capita se il beat e' stato mutato/abbassato prima.
3. STOP / TAGLIO BLOCCATO: `tagliato` (motore.js:627) e `taglio` GainNode (638) restano a 0 se arriva `globale taglio:'giu'` ma il `'su'` si perde (interfaccia ricaricata o finestra che perde il tasto mentre e' premuto). I livelli NUOVI nascono con `taglio.gain = tagliato ? 0 : 1` (638): tutto muto, anche i nuovi. Nessun timeout di sicurezza. Stesso discorso per la riga globale dello stop: `colpi.js:40` "stop · tutto · .gain(0)" va in `globali` (motore.js:311, 1138) e in `entra` `if (l.coda.length || globali.size) metteCoda(l)` (474): ogni livello nuovo eredita `all(x => x.gain(0))` finche' non arriva la riga `null`. L'interfaccia, ricaricata, non azzera niente (`app.js:1439` mostra soltanto). DA VERIFICARE dal lato controller; il motore non ha difese.
4. BREAK: `breakFattore` (312, 660, 1150) moltiplica il volume di tutto tranne il beat. Se resta < 1, le clip non-beat suonano basse/mute. Il beat e' escluso da `eBeatVera` (320). Stesso problema di messaggio perso.
5. MASTER A 0: `master` (1172) usa `destinationGain` del live; vale fino a nuovo messaggio. Dopo il riavvio del live torna a 1 (vedi rischi), non a 0.
6. `inTest` BLOCCA TUTTO IN SILENZIO (fuori dal motore, ma risponde alla domanda): `app.js:227` `if (inTest) return;` e `app.js:1103-1105`: se il live ha `eco` acceso (test di sfasamento lasciato attivo, anche prima di un ricaricamento dell'interfaccia) l'interfaccia riparte con `inTest=true` e `goLive`, `muoviScena` (277), ecc. non fanno nulla, senza messaggio. CERTO dal codice; capita solo dopo un test lasciato acceso.
7. MOTORE NON PRONTO: `rip.mappa` e' null fino a fine `configura()` (motore.js:1288-1290). Se `entra` arriva prima: `rip.prossimoConfine()` -> `ciclo()` -> `m.ciclo0` su null -> TypeError (riproduttore.js:40-41, 71-72) dentro `ricevi`, che non ha try/catch: nessuna risposta, l'interfaccia dopo 5 s scrive "live: nessuna risposta" (motori.js:56). `goLive` non controlla `live.stato.pronto` (app.js non lo usa mai a quel punto). CERTO; finestra di pochi secondi all'avvio o dopo il riavvio del live. Peggio: se `configura()` lancia (vedi bug 3), il live non diventa mai pronto, ma risponde ai ping, quindi sembra "vivo".
8. ERRORI INGHIOTTITI: gli errori di singole note (suono inesistente non rilevato, parametro NaN, `value` non oggetto) finiscono in `getTrigger` (core/repl.mjs:308) -> `errorLogger` -> `logger` -> `console.log` (core/logger.mjs:25), debounce 1 s. `main.js:186` inoltra al registro solo `error`/`warning`, quindi NON arrivano in `cutx.log` ne' all'interfaccia. Il livello sembra vivo ma non suona. CERTO come meccanismo.
9. COMPILAZIONE BLOCCATA: `compila` e' una coda unica (171-185). Se una valutazione precedente non finisce (codice che fa `await samples('github:...')` senza rete, loop, valutazione lunga), le `entra` successive aspettano; l'interfaccia scade a 5 s ("nessuna risposta") ma il livello poi entra lo stesso, in ritardo, quando la coda si libera (stato diverso da quello che l'utente crede). PROBABILE.
10. AUDIOCONTEXT SOSPESO / USCITA: se `ac.state` non e' `running` `ac.currentTime` si ferma e non si programma niente (riproduttore.js:113-114). `controllaUscita` prova `ac.resume()` ogni 3 s (motore.js:927, 942). Silenzio fino a 3 s. DA VERIFICARE con hardware vero (la prova automatica finge l'elenco dei dispositivi).
11. VOLUME NaN (basso): `case 'livello'` (1159) e `case 'master'` (1173) non controllano `Number.isFinite`. Un volume NaN fa lanciare `setTargetAtTime` in `applicaGuadagni` (661), `aggiornaLivelli` si interrompe PRIMA di `rip.sorgenti = livelli` (752): se poi `pulisci()` ha creato un array nuovo (`livelli = restano`, 765), i livelli nuovi finiscono in un array che il Riproduttore non guarda piu' -> silenzio totale dei nuovi livelli. DA VERIFICARE (serve un volume NaN dal controller; improbabile ma gravissimo).
12. Colori: nessuna condizione `volume 0` per default: `nuovoLivello` mette volume 1, muto false (motore.js:257-258). Una sezione che scrive volume 0 entra a 0 (475).

Riepilogo pratico: nell'ordine, io controllerei (1) e (2) per primi; poi (3)/(6) se "non succede proprio niente".

---------------------------------------------------------------------
## 2. BUG (in ordine di gravita')

### B1 — Il motore non parte mai se `configura()` lancia (CERTO)
`motore.js:1288` `await configura();` e' al livello del modulo. `configura` (947) fa `await window.cutx.stash()` (949) FUORI da ogni try/catch. `stash:stato` -> `stash.stato()` -> `prepara()` (stash.js:130-142) che fa `mkdir` delle 4 cartelle e, se manca, scrive `stash.json`. Su uno stash in sola lettura (SSD NTFS montato read-only, volume protetto) o con una cartella mancante, `mkdir`/`writeFile` lanciano, `stato()` rifiuta, `configura` rifiuta, il modulo fallisce: `rip.mappa` resta null, il `giro` non parte, `pubblicaMappa` non parte. La finestra continua a rispondere ai ping (listener gia' registrato, 1253) con `pronto:false`: l'interfaccia la vede "viva", il guardiano non la tocca. Per chi suona: tutto muto, nessun messaggio chiaro; `goLive` -> "nessuna risposta". Vale per live e cuffia. Stessa conseguenza se `controllaUscita` (chiamata dentro `configura`, 952) resta appesa su `ac.setSinkId` (nessun timeout).
Correzione di principio: try/catch su `window.cutx.stash()`, avviare `giro` e la mappa PRIMA (o a prescindere) da `configura`, timeout su `setSinkId`.

### B2 — `ricevi` non ha try/catch: un errore in un handler = nessuna risposta (CERTO)
`motore.js:1118-1251`. Ogni throw dentro un `case` (es. `entra` con mappa null, `metteCoda`, nodi audio) diventa una "unhandled rejection" (finisce in `cutx.log` come errore, bene) ma NON manda la risposta attesa: l'interfaccia aspetta 5 s e dice "nessuna risposta" senza il motivo. Stato parziale: es. `entra` che lancia dopo `livelli.push(l)` (477) lascia il livello in `livelli` ma senza `aggiornaLivelli`: la UI non lo vede, il motore lo suona (a `aggiornaLivelli` successivo compare). Correzione: try/catch generale in `ricevi` che risponde `{errore}` quando c'e' un `id`.

### B3 — Tempo di un livello annullato resta in coda (CERTO)
`entra` mette in coda il cambio di tempo del livello con `cambiaTempo(c.cps, da)` (478 -> `rip.cambiaCpsA`, riproduttore.js:90-94). Se quel livello viene poi sostituito prima di entrare (`vecchio.a = vecchio.da`, 450-451) o tolto (`togli`, 553-557), il suo cambio di tempo NON viene tolto da `rip.cambiTempo`. Scenario: live vuoto, brano A a 140 bpm con "entra tra 8", poi brano B a 120 bpm con "entra tra 1": B cambia a 120 al ciclo 1, ma al ciclo 8 il tempo passa a 140 senza che A suoni mai. Con live gia' in marcia l'interfaccia toglie le righe setcpm (app.js:243-250), quindi capita solo a live vuoto o con `setcpm` dentro la sezione. Correzione: quando un livello in attesa viene annullato/tolto, `rip.cambiTempo` va filtrato sul suo `da` (o conservare l'id del cambio).

### B4 — `controller.reset()`/orbita ricreata: il vecchio timer a 15 s taglia l'orbita di un livello riapparso (PROBABILE, stretta)
`liberaGuadagno` (737-748) cancella `guadagni[id]` e dopo 15 s fa `controller.nodes[g.orbita].disconnect()` + `delete`. Se nel frattempo il guardiano riporta il livello (`suErroreSorgente`: `livelli.push(vecchio)`, 727) `guadagnoDi` ricrea la catena con la STESSA orbita `1000+id` (631), poi il timer vecchio scollega proprio quell'orbita: il livello "rimesso a posto dal guardiano" tace dopo <= 15 s. Succede solo se il rollback avviene tra 0 e 15 s dopo la sua rimozione. Correzione: annullare il timer in `guadagnoDi` o usare un id di orbita nuovo.

### B5 — La cuffia e il live suonano diversamente un pattern con valori semplici (CERTO, bassa gravita')
`riproduttore.js:144`: il live riscrive il valore con `{...v, orbit}`. Se `v` e' una stringa o un numero (es. `"c3 e3"` senza `.note()`/`.s()`), `{...'c3'}` diventa `{0:'c',1:'3',orbit}` e superdough suona il suono predefinito `triangle` (superdough.mjs:181). In cuffia (`orbita` undefined, 144) l'hap passa intatto, `ensureObjectValue` lancia (hap.mjs:169) e resta muto/nel registro. Stesso codice, due risultati diversi: in cuffia silenzio, live note di triangolo.

### B6 — Tempo `Infinity` / NaN non filtrato da `setcpm` dell'utente (DA VERIFICARE, bassa)
`cambiaTempo` filtra `!(cps > 0)` (797) ma `Infinity` passa; i BPM della casella sono limitati a 20-300 (`bpm.js`, `ricevi 'tempo'` 1211), quelli di `setcpm()` nel codice no. Un `setcpm(1e9)` o `setcpm(0)`-derivato non e' ripulito. Poco probabile.

### B7 — Caricamento campioni: un errore di caricamento si ricorda per sempre (CERTO, dentro Strudel; impatto con stash staccato)
`superdough/sampler.mjs:92-103`: `loadCache[url] = fetch(url).then(res => res.arrayBuffer()).then(decodeAudioData)`. Non controlla `res.ok` e la promessa rifiutata resta in cache. Se l'SSD sparisce o `serviFile` risponde 404 (main.js:169, il corpo e' il testo "non trovato") il decode fallisce e quel file e' morto fino al riavvio dell'app anche quando l'SSD torna. Non si ripara dall'esterno senza fork (vietato): si puo' pre-caricare/ritentare noi con un fetch controllato prima di far suonare. Per chi suona: un suono "muto" dopo aver staccato/riattaccato il disco. Se la copia dello stash e' attiva (`usaCopiaStash`, stash.js:25) `attivo()` serve la copia e il problema non c'e'.

### B8 — Dopo il riavvio del live vanno persi master e stato "momentaneo" (PROBABILE)
`ripristinaLive` (app.js:1152) rimette livelli, volumi, muti e BPM, non: `master` (arriva solo sul movimento della manopola 8, app.js:1709), `globali`, `breakFattore`, `tagliato`, `paracadute`, tempo in arrivo. Dopo un crash del live il master torna a 1.0 mentre il controller mostra il vecchio valore. Il limiter protegge dal clip ma non dal salto di volume.

### B9 — Il progetto non guarda mai se il flusso audio e' fermo con `ac.state === 'running'` (DA VERIFICARE)
Si ascoltano solo `statechange` e `devicechange` (motore.js:940-941) e un controllo ogni 3 s dell'elenco. Se la scheda (o il servizio audio di Chromium) muore ma il contesto resta "running" con `currentTime` fermo o rumoroso, nessuno se ne accorge. `main.js:100` (`child-process-gone`) fa solo log. Idea: ogni secondo controllare che `ac.currentTime` avanzi con `performance.now()`; se no, `setSinkId('')` e di nuovo l'uscita voluta, e dirlo in interfaccia.

---------------------------------------------------------------------
## 3. RISCHI DI STABILITA' (set di 40 minuti)

### Giro del Riproduttore
- `giro()` (892) non ha try/catch e `programma` ha try/catch SOLO intorno a `interroga` (riproduttore.js:127-133). Fuori: `hap.whole.begin.valueOf()`, `withValue`, `this.uscita` (async, non lancia), `suEvento` (motore.js:829), `suCps` -> `cambiaTempo`. Se uno di questi lancia a meta' `programma`, `this.fine` NON avanza (riga 115-116) e al tick dopo gli stessi hap precedenti vengono riprogrammati (doppi colpi, "flam", ogni 50 ms) e i passi seguenti di `giro` (`pulisci`, `ripulisciCode`, `aggiornaStrisce`) saltano. Oggi non ho trovato un percorso reale che lanci, ma e' il punto piu' fragile: un try/catch per hap e uno per fase del giro costano nulla. Sicurezza: DA VERIFICARE (nessun innesco trovato).
- Errore dentro l'interrogazione di un livello: il motore LIVE cattura (`erroreDato`, 720-734), rimette il livello di prima se c'e' (`puoTornare`) e manda `guardiano` all'interfaccia (avviso persistente). Se il livello e' nuovo (non sostituzione) resta in pila ma non suona, con un solo avviso. La CUFFIA ignora l'errore (`if (!LIVE ...) return`, 721): resta solo `rip.errore`, che `programma` azzera a ogni tick (riproduttore.js:121): `stato().errore` della cuffia lampeggia e un errore saltuario non si vede mai.
- Stallo del thread principale: ANTICIPO e' 100 ms (riproduttore.js:10) e il tick 50 ms. Un blocco >~100-150 ms del thread del live (GC, valutazione, `verificaPattern`, messaggi pesanti) fa saltare i colpi che cadono in quel buco (`tardi++`, 137-140), non li ritarda. Il lavoro piu' pesante e' proprio nel gesto "go live": `entra` interroga il pattern per 16 cicli DUE volte in modo sincrono (`verificaPattern` 435 e `avvisaSuoniMancanti` 437) sullo stesso thread che programma l'audio. Con pattern densi (molti `stack`, `rand`, `ply`, `jux`) il tempo e' DA MISURARE (non ho potuto: `@strudel/core` non si carica in node puro). Se supera ~100 ms, ogni go-live fa saltare qualche colpo degli altri livelli. Mitigazioni: anticipo 200-250 ms (`ANTICIPO_S`), verifica a 4-8 cicli, oppure eseguire la verifica a pezzetti.
- `aggiornaLivelli` (750-758) manda a ogni cambio di coda (fino a 25 Hz mentre si gira una manopola, 289) l'elenco completo dei livelli con `codice`, `coda` e `beat.scene` (tutte le scene) a controllo + uscita + cuffia (la cuffia usa solo il conteggio, 1005). Anche `stato()` (971) lo rifa' a ogni ping (2 Hz, per due motori). Serializzazione sul thread audio: da misurare con `giroMax`. Idea: alla cuffia solo `length`; `beat.scene` una volta.
- `latencyHint`: `AudioContext` creato da superdough senza opzioni (superdough/audioContext.mjs:11) = "interactive". `latencyHint:'playback'` darebbe buffer piu' grande e meno rischio di glitch con molti livelli/riverberi; costa solo latenza fissa che l'offset cuffia compensa. DA VERIFICARE a orecchio.

### Timer, listener, canali
- Nessun listener si accumula quando i canali vengono rifatti: `porte[con].onmessage` e `Motore.porta.onmessage` si SOVRASCRIVONO (motore.js:1257-1258, motori.js:29-31). Le vecchie porte non vengono chiuse (`close()`), ma il capo opposto sparisce con la pagina ricaricata, quindi non restano vive. OK.
- Unici timer permanenti: `setInterval` misura 66 ms (890), giro 50 ms (1293), mappa 1000 ms (1291), uscita 3000 ms (942), `ping` 500 ms nell'interfaccia (motori.js:23). Nessuno si ripete due volte. `misuraMaster` (106) si ferma correttamente.
- `window.cutx.suStashCambiato(configura)` (1266): `configura` puo' girare due volte in parallelo (due eventi ravvicinati, es. `stash:salva` + `rileggi`): `samples(nuovi)` registrato due volte e doppio fetch. Innocuo, non corretto.
- `controllaUscita` ha la guardia `controllandoUscita` (913): se `setSinkId` (921, 924) non risolve mai, la guardia resta true per sempre e non si controlla piu' niente. Aggiungere un timeout.

### Memoria nel tempo
- `l.sostituisce = scambi[0]` (motore.js:476) non viene mai azzerato: ogni sostituzione di un livello con lo stesso nome (scene del beat) tiene vivo il livello vecchio (codice, pattern compilato, coda), a catena: dopo N scene ci sono N livelli vecchi raggiungibili. Poco ciascuno, ma crescente in una serata con molti cambi scena. PROBABILE (impatto basso/medio). Soluzione: azzerare `sostituisce` quando il vecchio e' stato purgato o dopo 64 cicli (la soglia che usa gia' il guardiano, 724).
- Cache dei campioni: `bufferCache` di superdough (sampler.mjs:14) non ha limite: ogni file decodificato resta per sempre (float32 stereo 48 kHz ~ 23 MB al minuto). Con stem Ableton lunghi (minuti) sono centinaia di MB per motore, e il live e la cuffia hanno cache separate. Su Mac mini non e' un problema per un set normale, ma con 8-10 stem da 3-5 minuti il rischio e' reale. DA VERIFICARE sul peso reale.
- Nodi audio: `liberaGuadagno` (737) pulisce lp/hp/fade/micro/analisi/gain e l'orbita dopo 15 s; NON stacca `g.taglio` (745: manca dalla lista). Orfano, finisce al garbage collector: ok. I `StereoPanner`+`Splitter` creati da `controller.output.connectToDestination(micro, ...)` (647) restano agganciati al `channelMerger` ma senza ingresso: ok.
- Registri: `registro` (828), `Sentinella.attesi`, `Serie.dati` (sfasamento.js, tetto 50.000) esistono solo durante le prove/`eco`; `Anello.click` tetto 64. Moviola: coda interfaccia tetto 4000, main tetto 8 MB. Il log (`log.js`) ruota a 2 MB (+1 scorta). Niente crescita senza limite trovata.
- Costo del log: `log.scrivi` (log.js:36-48) fa `statSync` + `appendFileSync` per OGNI riga di errore/avviso di ogni pagina, nel processo principale. Se un motore produce warning a raffica (superdough: "cannot schedule sounds in the past", superdough.mjs:463, e' un `console.warn` per colpo) il processo principale (guardiano, IPC) si impasta; l'audio no. Suggerimento: limitare (stesso messaggio max 1/s).

### Sincronizzazione interfaccia <-> motori
- Interfaccia ricaricata: riprende `pezzoCuffia`, udibile, `eco` dal pong (`riprendi`, app.js:1097). I livelli arrivano dal live con `aggiornaLivelli` alla connessione. NON ripresi: pausa della cuffia (la rimette `cuffiaInPausa=false` solo alla cuffia rinata, 1475), `entraTra` (resta il valore di avvio), `globali`/`tagliato`/`breakFattore` (restano nel motore senza che l'interfaccia lo sappia, vedi sez. 4 punti 3-4), e `inTest` se `eco` era acceso (sez. 4 punto 6).
- Cuffia riavviata: il live rimanda subito la mappa (1260-1264) e l'interfaccia rimanda il codice dopo che il motore e' `pronto` (app.js:1478). Corretto. Il tempo della cuffia segue il live comunque.
- Live riavviato: vedi B8.
- Il guardiano riavvia il live SOLO se il processo muore (`render-process-gone`); se e' bloccato ("unresponsive") lo aspetta per sempre (main.js:270-274). Un codice utente con ciclo infinito congela il live (e le sue casse) e non c'e' nessun comando "riavvia live" da usare in emergenza (ne' ⌘. funziona, il motore non risponde). Scelta voluta, ma e' il caso peggiore: serve almeno un comando esplicito che ammazza e ripristina il live (la funzione `ripristinaLive` c'e' gia').
- `Motore.valuta/richiesta` scadono a 5 s e poi dimenticano l'`id`, ma il comando e' gia' arrivato al motore: se la coda di compilazione e' lenta, l'interfaccia segnala errore e poi il livello entra comunque (sez. 4 punto 9).

### Codice Strudel con errori MENTRE e' live
- Errore di sintassi / eccezione di valutazione al go-live: `compilatore.evaluate` cattura (core/repl.mjs:235-241) -> `{errore}` -> nessun cambiamento nel live, il vecchio continua. L'interfaccia mostra "live: <messaggio>" persistente nel CUE (`mostraErrore`, app.js:150). BENE.
- Errore pigro entro i primi 16 cicli: preso da `verificaPattern` (435). Dopo il ciclo 16: guardiano a runtime (720): torna il livello di prima se la sostituzione e' recente (< 64 cicli) e dice `guardiano` (avviso persistente). Se non c'e' un "prima", il livello resta muto e c'e' un solo avviso.
- Errori di coda (`.lpf(...)` sbagliato): `applicaCoda` fa una prova `queryArc(0, 0.001)` (coda.js:85) e in caso di errore tiene la versione precedente (`codaErrore`, 325-327).
- Errori per singola nota (suono non trovato, parametro invalido): inghiottiti, vedi sez. 4 punto 8. Un `s("nomesbagliato")` e' coperto da `suoni-mancanti` (solo primi 16 cicli, solo nomi non registrati).
- La coda "commuta" (coda.js:139) non e' un vero Pattern (solo `queryArc`): gli errori dentro un cambio ritmico sono ingoiati da `queryArc` di Strudel e il guardiano non li vede (`interrogaVisibile` ripiega su `queryArc`, motore.js:694).

### Se l'uscita audio sparisce
- La logica c'e': `controllaUscita` ogni 3 s + `devicechange` + `statechange` (940-942): se il nome voluto non e' piu' nell'elenco passa a `setSinkId('')` (uscita predefinita di macOS), segna `uscita.ok=false` e l'interfaccia avvisa (app.js:1114-1130); quando torna, riprende. Prova automatica OK, ma con elenco FINTO.
- Cose da verificare a mano: (a) cosa fa Chromium davvero quando il sink scelto viene scollegato mentre suona (contesto `suspended`? `running` ma muto?); (b) l'uscita predefinita di macOS puo' essere il jack delle cuffie (la cuffia di Valerio): le casse del pubblico finirebbero in cuffia, o le casse del Mac a volume del sistema (il 20% delle prove, ma in serata?). Scelta "meglio che muti" da confermare; (c) `setSinkId` senza timeout (vedi sopra); (d) nessun controllo sul tempo che avanza (B9).
- Cuffia e live sulla stessa uscita predefinita dopo il fallback: nessun avviso che le due uscite coincidono (c'e' solo il controllo in `erroriUscite` sulla configurazione, app.js:1069).

### Processo principale
- `process.on('uncaughtException'|'unhandledRejection')` (main.js:96-97) ingoia tutto: l'app non cade, ma un errore ripetuto non si vede se non nel log.
- ⌘Q e ⌘W: il menu usa `role: 'appMenu'` e `role: 'windowMenu'` (main.js:563-582). Chiudere la finestra di controllo chiude tutta l'app senza conferma (`closed` -> `app.quit()`, 248-253). Un ⌘W/⌘Q per sbaglio mentre suona ferma il live. DA VERIFICARE se `windowMenu` su macOS contiene ⌘W (dipende dalla versione di Electron). Suggerimento: conferma se c'e' un livello live.
- Nessun handler per `did-fail-load` dei motori (main.js:218): se la pagina del motore non si carica (file mancante nel pacchetto), nessuno ritenta.
- `stash.stato()` (stash.js:146-151) ricrea le cartelle e rilegge TUTTI i suoni a ogni chiamata (3 pagine x ogni cambio di config). Non pesa durante il set, ma e' lo stesso percorso che puo' lanciare (B1).
- `stash.salvaConfig` (stash.js:95-100) legge con `leggiConfig`, che su JSON rotto/illeggibile RITORNA I VALORI DI DEFAULT (`uscite:{}`, offset 0), poi `writeFile` (non atomico) li scrive sopra: un `stash.json` troncato per un crash, o letto proprio mentre si scrive, fa perdere uscite e offset della cuffia al salvataggio successivo (e le uscite sparirebbero: tutto sull'uscita predefinita). Suggerimento: scrittura atomica (file temporaneo + rename) e, se il JSON non si legge, non sovrascrivere.
- Il codice dei brani (o dei pacchi scaricati da altri) viene valutato nei motori, che hanno `window.cutx` completo (scrivere set/brani, cambiare preferenze, `crasha`, `blocca` via porta). Per un progetto che sara' regalato alla community vale la pena dirlo nella documentazione (e togliere `crasha`/`uscita:crasha`/`blocca` dalla versione di produzione).

---------------------------------------------------------------------
## 5. QUALITA' (max 10)

1. `motore.js` (1294 righe) mescola motore, mixer del live, guardiano e tastiera SYNTH. La tastiera (1009-1116) e' solo cuffia e autonoma: estrarla in `motore-tastiera.js`.
2. Il ciclo di vita di un livello e' sparso: `entra`, `togli`, `lanciaParacadute`, `riprendiDalParacadute`, `suErroreSorgente`, `pulisci`, `liberaGuadagno` toccano tutti `a`/`da`/`guadagni` a mano. Un oggetto `Livello` con `esci(ciclo)`, `annulla()`, `libera()` eviterebbe errori come B3/B4.
3. `testoErrore` (motore.js:709) e il codice inline in `riproduttore.js:130` fanno la stessa cosa: usare una funzione sola.
4. Commento sbagliato: `riproduttore.js:30-31` ("Come si interroga un pattern... () => {}, quando la mappa cambia") mescola il commento di `interroga` con quello di `suMappa`. La riga 29 e 31 sono scambiate.
5. Intestazione doppia "configurazione dallo stash" (motore.js:903 e 944), una e' vuota.
6. `mix`, `livelliLive` (146, 143) e `inPausa/udibile` hanno stato ma `mix` non fa nulla: codice per un futuro che non c'e'. La cuffia riceve `livelli-live` completi solo per contarli (1005).
7. Ganci di prova in produzione: `case 'blocca'` (1197), `cutxStato/cutxHaps/cutxRegistro/cutxAzzeraMisure` su `globalThis`, `crasha` e `uscita:crasha` in `preload.cjs`/`main.js:367,521`. Meglio dietro un flag `--prova` (gia' c'e' `PER_PROVE`).
8. `valuta()` ha un ramo live (229-235) che serve solo a test/prove e duplica `entra` in piccolo (crea un livello a mano senza `entra`); il comportamento "un livello al posto di tutti" andrebbe in una funzione di prova.
9. Doppioni di calcolo del "prossimo battito/confine": `battitoDopo` (296), `prossimoConfine` (riproduttore.js:71), calcoli inline in `lanciaParacadute` (507) e `togli` (547). Un solo posto.
10. `dissolvenza.js` `programma` chiama `fade.gain.cancelScheduledValues(adesso)` + `setValueAtTime(0)`: se il livello e' a meta' di una entrata, lo spec cancella la curva in corso e il valore salta indietro (click/scalino). Basta `cancelAndHoldAtTime` come in `annulla`. Solo con dissolvenza > 0 (default 0).

Note sui punti positivi (per equilibrio): errori di valutazione contenuti (il vecchio suona), guardiano a runtime con rollback, risposta ai crash (interfaccia/cuffia/live), mappa del tempo unica e testata (`tempo-unico.test.js`), limiter sull'uscita, micro-fade all'entrata, nessun listener doppio, log a rotazione, protocollo `cutx://` con controllo dei percorsi (`dentro()`, main.js:146).
