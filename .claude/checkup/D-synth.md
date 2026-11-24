# Check-up D · SYNTH e pianoroll (sola lettura)

Fatto leggendo il codice e lanciando `node --test test/synth.test.js test/synth-note.test.js` (63 prove, tutte passano) più due piccoli script in scratchpad che chiamano i moduli puri (`leggiCodice`, `eventiDaMini`). Non ho lanciato l'app, né `npm run prova`, né toccato file del progetto.

Legenda sicurezza: **certo** = riprodotto o letto senza dubbi; **probabile** = dal codice, ma non provato nell'app; **da verificare a mano**.

---

## 0. Cosa c'è da sapere subito

- Il SYNTH **non riscrive mai il codice di un livello o di una card**. Lavora su una copia: lo stato del pannello (oggetto `stato`), da cui `codice()` rigenera il testo da zero. «apri nel synth» apre una copia; «→ CUE» aggiunge una clip NUOVA (`cue.js:444-453`, nome reso unico). Quindi un errore del synth non può rompere un livello che suona. Il live non riceve nemmeno i messaggi del synth (`motore.js:1228-1242`: tutti `if (LIVE) return`).
- Il rischio vero è un altro: il synth **rigenera** il codice invece di modificare quello vecchio. Quello che il pannello non capisce lo perde, o lo sposta in fondo (vedi bug 1-4).
- La tastiera del Mac suona il synth **sempre**, appena la vista è SYNTH e il fuoco non è in un campo di testo. Non c'è un interruttore.

---

## 1. MAPPA

### File
| File | Cosa fa |
|---|---|
| `synth-modello.js` (329) | Lo stato del suono come dati: `PARAMETRI` (`:26`), `iniziale()` (`:85`), `pulisci()` (`:180`, ogni valore nel suo intervallo, mai eval), `imposta()` (`:198`, tetti di peso), `costo()`, `spento()` (`:127`, cosa suona il motore se il codice non nomina un parametro), `mutate/sorprendi`. Validatori: `noteValide` (`:100`), `testaValida` (`:177`), `introValida` (`:176`), `manoValida` (`:173`). |
| `synth-codice.js` (368) | Stato → codice (`codice()` `:46`, `clip()` `:122`, `rigaSynth()` `:113`). Codice → stato: `spezza()` (`:148`, divide `testa.chiamata().chiamata()` a livello zero), `leggiCodice()` (`:236`). `leggiRiga()` (`:128`) legge la riga `// @synth {…}`; `haRigaSynth` (`:139`) decide se la card ha il tasto. |
| `synth-note.js` (562) | Puro: mini-notazione ⇄ eventi `{i,l,n}` (`eventiDaMini` `:~270`, `miniDaEventi`), scale, accordi, selezione, incolla/duplica, scrittura a passi, velocity. Non legge `? / . \| ( )` (`:~228`, lancia "non si legge nel pianoroll"). |
| `synth-roll.js` (781) | Il pianoroll su `<canvas>`: mouse (selezione/matita/passi/velocity), tastiera con il canvas in primo piano (`tasto` `:519`), disegno (`disegna` `:608`), testina con requestAnimationFrame (`testina` `:766`). |
| `synth-vista.js` (849) | La vista: barra, manopole, scheda suono/note, pannello codice (textarea), A/B, storia ⌘Z, REC, tastiera del Mac (`tastoGiu` `:411`, `tastoSu` `:439`), invio alla cuffia (`suona` `:~690`). |
| `synth-tastiera.js` (27) | Puro: tasto fisico (`event.code`) → nota midi; Z/X ottava; `inCampoDiTesto` (`:24`). |
| `synth-rec.js` (66) | Puro: il registratore (1 ciclo di conteggio, poi `cicli` cicli, quantizza alla griglia). |
| `controller-synth.js` (79) | Puro: cosa fa ogni manopola/tasto dell'X-Touch nel SYNTH. |
| `synth.css` (471) | Stile ambra (il verde resta del live). |

### Come il pianoroll legge, modifica, riscrive
1. **Lettura.** La clip ha in testa `// @synth {json}`. «synth» sulla card → `apriNelSynth` (`app.js:677`) → `leggiRigaSynth(codice)` legge **solo il JSON**, non il corpo del codice → `synth.apri(stato)` (`synth-vista.js:~555`).
2. **Note.** `disegnaNote` (`synth-vista.js:~800`) prende `noteEffettive(stato)` (la stringa `note`), la passa a `eventiDaMini` → eventi → `roll.imposta`. Se la testa è scritta a mano (`stato.testa`) il pianoroll è spento ("note a mano nel codice").
3. **Modifica.** Un gesto sul canvas → `roll.opz.cambia(eventi, cicli)` → `cambiaNote` (`synth-vista.js:~507`) → `miniDaEventi` riscrive la stringa **in forma canonica** (es. `c3*4` diventa `c3 c3 c3 c3`) → `imponi({...stato, note, anteprima:'clip'})`.
4. **Riscrittura.** `imponi` → `cambiato()` → `disegna()` rigenera il textarea con `codice(stato)`.
5. **Mano → motore.** La modifica va solo alla **cuffia**: `programmaAnteprima` (90 ms) → `suona()` → `opz.suona` (`app.js:647`) → `cuffia.valuta(codice)`. Se Strudel dà errore, il motore tiene il suono di prima e la vista mostra l'errore (`synth-vista.js:~700`). Per i tasti: `synth-suono` + `synth-nota` (`app.js:660-663`), solo cuffia.
6. **Verso il CUE.** «→ CUE» = `clip(stato)` (`synth-codice.js:122`) aggiunta in fondo al brano attivo/prossimo/kit. Per il LIVE serve poi il normale go live.
7. **Codice scritto a mano nel textarea.** `oninput` → 350 ms → `daCodice` → `leggiCodice`. Le chiamate note spostano le manopole, le altre vanno in `stato.mano` e vengono riscritte in fondo (`codice()` `:107`). Al `blur` il textarea viene sovrascritto con `codice(stato)` (`synth-vista.js:~139`).

---

## 2. BUG (in ordine di gravità)

### B1. Codice a più istruzioni: le istruzioni dopo la prima spariscono senza avviso · **certo** (provato in node)
`synth-codice.js:148-201` (`spezza`) e `:339-341`. Provato:
```
note("c3 e3")\n  .s("sawtooth")\n$: s("bd*4")   →  note("c3 e3").s("triangle")      (il $: s("bd*4") è sparito)
note("c3").s("sawtooth"); note("e3").s("sine")  →  note("c3").s("sine")             (la prima istruzione è sparita)
```
Perché: `;` e `$:` non sono chiamate a catena, quindi la regex di `:196` ingoia tutto nell'ultimo argomento; la chiamata finisce in `mano`, ma `pulisci()` la scarta (contiene `\n`/non rispetta `manoValida`) oppure il `continue` di `:280` la salta come "doppione". Nessun errore, nessun avviso. Il textarea viene poi riscritto al `blur` con il testo ridotto. Colpisce chi incolla nel synth un blocco con più `$:`. **Non** tocca il livello originale (è una copia), ma se poi preme «→ CUE» manda la clip amputata. Il `.s("triangle")` è il valore "spento" (`spento()` `:127`), quindi anche il suono cambia.

### B2. Una testa di batteria `s("bd sd")` viene sovrascritta da `.s("triangle")` · **certo** (provato)
`synth-codice.js:70` scrive sempre `.s("${forma}")` dopo la testa. Se incolli `s("bd sd hh*4")` ottieni:
```
s("bd sd hh*4")
  .s("triangle")          ← il secondo .s vince: suona un triangolo, non la batteria
```
Così anche `s("bd sd").bank("RolandTR909")`. Il pannello dice "a mano" solo per la testa, ma il `.s` extra rompe il suono. È anche il motivo per cui il synth non è offerto sul beat (vedi §5).

### B3. «apri nel synth» ignora le modifiche fatte a mano alla card · **probabile** (letto, non provato nell'app)
`app.js:677-682`, `synth-codice.js:128-137`. Se in una clip con `// @synth {…}` modifichi il corpo a mano nel CUE (es. `.lpf(300)` → `.lpf(900)`) senza toccare la riga `@synth`, il tasto «synth» apre lo stato **vecchio** del JSON. Poi «→ CUE» crea una clip nuova con i valori vecchi. Nessun avviso che il corpo e la riga non coincidono. Nel LIVE succede uguale (`pila.js:212`): la card live può dire una cosa e il synth aprirne un'altra.

### B4. Commenti in mezzo alla catena cancellati (documentato, ma silenzioso) · **certo**
`synth-codice.js:166-171`: solo i commenti in cima si tengono. Provato: `// filtro` e `// dopo` spariscono. È scelto di proposito (c'è un test, `synth.test.js:402`), ma non c'è nessun avviso all'utente. Per un codice da proiettare i commenti contano.

### B5. Pattern gigante blocca l'interfaccia · **probabile** (calcolo provato, blocco non visto nell'app)
`synth-note.js` (`leggiMini`/`espandi` `:~230`): ogni `*n` è limitato a 32 ma l'annidamento no. Provato in node: `[[[c3*32]*32]*32]*32` (21 caratteri) → 1.048.576 eventi in 171 ms; `[[[[c3*32]*32]*32]*32]*4` → 4,2 milioni in 0,8 s; a 5 livelli (33 milioni) memoria/blocco quasi certi. Poi `disegna()` li cicla tutti, e `aggiorna()` ridisegna 10 volte al secondo (S2). `leggiCodice` invece è veloce (1 ms), il costo scatta quando la stringa entra in `note` e il pianoroll la apre. Può succedere per errore di battitura nel campo "mini" (`synth-vista.js:~533`) o aprendo un `.cutx` strano. Manca un tetto al numero di eventi.

### B6. Con le impostazioni aperte sopra il synth, Spazio e le lettere suonano il synth · **da verificare a mano**
`app.js:703-708`: il controllo è `vista === 'synth' && !dialogoAperto() && !imp.catturando`; il pannello `#impostazioni` (`index.html:218`) è fuori da `.postazione` quindi non è `inert`. Se in Impostazioni il fuoco è su un bottone (non su un input) e premo Spazio: `tastoGiu` lo prende, fa ▶/■ della cuffia e `preventDefault` (il bottone non scatta). Le lettere A S D… suonano note. Da provare.

### B7. Dopo aver usato un menu/slider il fuoco ci resta e la tastiera «si spegne» senza segno · **probabile**
`inCampoDiTesto` (`synth-tastiera.js:24`) include `select` e `input`. Dopo aver scelto griglia/scala/accordo/categoria/schema (tutti `<select>`) o mosso lo slider «quanto» o scritto il nome, il fuoco rimane lì: A S D F… non suonano e Spazio non parte, finché non si clicca altrove. Non c'è nessun indicatore. (L'etichetta `tasti C3` è sempre visibile, `synth-vista.js:464`, quindi sembra attiva.)

### B8. Con «passi» acceso, le frecce muovono anche le manopole · **probabile**
`synth-vista.js:296-307` (frecce su manopola in fuoco: `preventDefault` ma niente `stopPropagation`) + `:414-420` (con `passiAttivi` ←/→ muovono il cursore). Se una manopola ha il fuoco e `passi` è acceso (e la scheda è "note"), ←/→ cambiano il cursore **e** la manopola.

### B9. Il pianoroll ridisegna tutto 10 volte al secondo anche fermo e nascosto · **certo** (peso, non rottura)
`synth-vista.js:846` → `roll.testina(false)` → `synth-roll.js:767` `if (!viva) return this.disegna();`. `aggiorna()` è chiamata ogni 100 ms (`app.js:1347`) finché la vista è SYNTH. `disegna()` fa 7 `getComputedStyle` + ~36 righe + griglia + tutte le note. Succede anche con la scheda "suono" (canvas nascosto). Il live è in un altro processo, quindi non lo disturba; però consuma CPU nella finestra di controllo per niente. Aggiungere `if (this.r.hidden) return` o ridisegnare solo se cambia qualcosa.

### B10. `manoValida` accetta stringhe con parentesi sbilanciate · **da verificare** (bassa)
`synth-modello.js:172-173`: `/^\.[A-Za-z_]\w*\(.*\)$/` non controlla l'equilibrio. Una riga `// @synth` modificata a mano (o un `.cutx` di altri) può portare `mano:[".a(1)).b(2"]` e produrre una clip con codice rotto. Effetto limitato: se la clip va live il motore rifiuta il codice e tiene il precedente (non si pianta); la clip però non parte.

### Cosa succede se il codice del synth è sbagliato mentre il livello è live
Niente di grave per costruzione. (1) Il synth non scrive nei livelli. (2) Il codice di prova va solo alla cuffia. (3) Una clip sbagliata mandata al CUE e poi live passa dal controllo normale del motore, che con codice errato tiene il suono di prima (`app.js:~652`, commento "se il codice ha un errore il motore tiene il suono di prima"). L'unico effetto indiretto sul live sono i tasti globali che passano anche dalla vista SYNTH (§4.3, C1-C4).

---

## 3. RISCHI DI STABILITÀ

**Listener globali** (tutti registrati **una volta**, a livello di modulo, non alla apertura del synth: nessuna perdita):
- `app.js:703` `window keydown` (bubble) e `:706` `keyup`, `:709` `blur`. Filtrano con `vista === 'synth'`.
- `app.js:779` `window keydown` in **capture** (scorciatoie globali).
- `impostazioni.js:64` `window keydown` capture (scelta di un tasto; `return` se non sta catturando).
- `aiuto.js:26` `document keydown` capture (nasconde l'help).
- Nel synth **nessun** `mousemove`/`mouseup`/`keydown` su `window`/`document`. Le manopole usano `setPointerCapture` con listener sul **loro** elemento, tolti a fine gesto (`synth-vista.js:260-282`); il pianoroll usa `pointer*` sul canvas con `setPointerCapture` (`synth-roll.js:140-143`). Se il pointer capture salta (finestra persa), `pointercancel` chiude il gesto: ok.
- `dialogo.js:123` aggiunge/toglie un keydown a ogni dialogo (tolto in `:112`): ok.

**Timer / animazioni:**
- `requestAnimationFrame` (`synth-roll.js:776-779`): gira solo con `testinaViva` (scheda "note" + prova che suona). Si ferma quando `aggiorna()` vede `suonaOra()` falso; uscendo dal SYNTH `mostraVista` chiama `fermaAnteprima()` (sincrono: `fermaCuffia` azzera `pezzoCuffia`, `app.js:157-162`) e subito `synth.aggiorna()` → il ciclo si ferma. Condizione di uscita `this.r.hidden` riguarda il contenitore delle note, non la vista intera: se `aggiorna()` non fosse chiamata, il RAF continuerebbe a vista chiusa. Oggi la sequenza regge. **Fragile ma ok.**
- `setInterval` REC a 20 ms (`synth-vista.js:473`): sempre ripulito in `fermaRec`; `attiva(false)` lo ferma. ok.
- `setTimeout` vari (`timerAnteprima`, `timerSuono`, `timerSalva`, `timerCodice`, `timerRuota`, `timerManopola`): tutti brevi e sovrascritti con `clearTimeout`. `provaNota` (`:451`) ha un `setTimeout` anonimo di 260 ms: innocuo.
- `ResizeObserver` sul roll (`synth-roll.js:~172`): creato una volta, mai scollegato. Ok, vive quanto l'app.
- `mostra()` (`app.js:1773`, ogni 100 ms) chiama `synth.aggiorna()`, che fa `JSON.stringify(destinazioni())` a ogni giro (`synth-vista.js:~815`). Costo piccolo.

**Canvas/DOM:** un solo canvas, ridimensionato solo se cambia la misura (`synth-roll.js:~622`). Niente DOM che cresce a ogni apertura (tutto costruito una volta nel constructor). `storia` limitata a 100 (`STORIA_MAX`). `negliAppunti` globale di modulo: una sola copia.

**Eccezioni non gestite:** `eventiDaMini` ha try/catch solo su `leggiMini`, non su `espandi` (memoria, B5). `leggiCodice`/`spezza` sono solo logica pura, non lanciano. `JSON.parse` in `leggiRiga` è dentro try. Nessun `await` senza gestione trovato nella zona; `suona()` (`synth-vista.js:~690`) aspetta `cuffia.valuta` che può restare appesa se la cuffia è bloccata: l'avviso resta com'era, nessuna eccezione.

**Salvataggio:** `salva` (preferenze `synthUltimo`) parte 800 ms dopo l'ultimo cambio; se l'app si chiude prima, l'ultimo gesto non è salvato. Marginale.

---

## 4. DOMANDA PRECISA: il pianoroll funziona con la tastiera del Mac?

### 4.i Sì: esiste la modalità «suona con i tasti»
`synth-tastiera.js:3-4`. Si usa `event.code` (posizione fisica, non la lettera), quindi vale uguale con la tastiera italiana.
```
bianchi: A=do  S=re  D=mi  F=fa  G=sol  H=la  J=si  K=do+1  L=re+1  ;(ò)=mi+1
neri:    W=do#  E=re#  T=fa#  Y=sol#  U=la#  O=do#+1  P=re#+1
ottava:  Z = giù   X = su     (da -1 a 7; di partenza A = do3, midi 48)
```
- **Suona** in cuffia col suono del pannello (`notaOn` → `cuffia synth-nota`, `synth-vista.js:333`), mai sulle casse.
- **Inserisce nel pianoroll** solo in due modi: (a) **REC** (`avviaRec` `:466`): conteggio di un ciclo poi registra, le note quantizzate finiscono nel pianoroll; (b) **passi** (`passiAttiva`): con il pulsante «passi» acceso e la scheda "note" aperta, il tasto scrive la nota al cursore lunga «lunghezza» e il cursore avanza; più tasti insieme = accordo, un solo ⌘Z (`synth-roll.js:~226`, `passiNota`). In passi: **Spazio** = pausa, **⌫** = indietro, **←/→** = cursore (`synth-vista.js:414-420`). **Esc** esce dai passi (`app.js:757-762`).
- Con il pianoroll in primo piano anche il mouse serve; il tasto **B** (solo con il canvas in fuoco) alterna matita/selezione, tenuto è temporaneo (`synth-roll.js:~540`).

### 4.ii Come si accende e si spegne, come si vede
- **Non c'è un interruttore.** È attiva quando: vista = SYNTH (⌘2 o tasto in barra), nessun dialogo aperto, non si sta catturando un tasto in Impostazioni (`app.js:703-708`), il fuoco non è in `input/textarea/select/contenteditable/.cm-editor` (`synth-tastiera.js:24`), nessun modificatore ⌘/⌃/⌥ premuto (`synth-vista.js:412`).
- Si "spegne" cambiando vista (`attiva(false)` ferma note e REC, `synth-vista.js:~312`), cliccando in un campo di testo/menu, o perdendo il fuoco della finestra (`blur` → `fermaNote`, `app.js:709`).
- **L'utente la vede** solo dall'etichetta «tasti C3» nella barra (`synth-vista.js:464`, testo `it.json: barra.tastiera`) e dall'help (`synth-tastiera`). L'etichetta c'è anche quando la tastiera è «morta» (fuoco in un menu: B7). Nessun segno per la modalità "passi" fuori dalla scheda note, tranne il pulsante acceso. Il canvas non ha anello di fuoco (`synth.css:402 outline:none`), quindi non si vede se ⌘A/⌘C/⌘V vanno al pianoroll (`inPrimoPiano` = canvas in fuoco, `synth-roll.js:~555`).

### 4.iii Tabella dei tasti: synth/pianoroll contro le scorciatoie globali

Ordine di arrivo di un tasto: **capture su window** (`app.js:779`, scorciatoie globali; se corrisponde fa `preventDefault+stopPropagation` e basta) → target (`keydown` su manopola/canvas) → **bubble su window** (`app.js:703`, tastiera del synth). Le scorciatoie con `soloFuori` o che scrivono un carattere (`scriveTesto`) NON scattano se il target è `.cm-editor/input/select/textarea`.

| Tasto | Synth/pianoroll | Globale (scorciatoie.js) | Conflitto? |
|---|---|---|---|
| A S D F G H J K L ; W E T Y U O P | note (`tastoGiu`) | nessuno | no |
| Z / X | ottava | nessuno | no (⌘Z/⌘X hanno ⌘: il synth li lascia) |
| **Spazio** | ▶/■ cuffia (`:430`); con passi = pausa | nessuna azione globale | **tolto ai pulsanti col fuoco** (voluto); in Impostazioni (B6) |
| **⌘Z / ⇧⌘Z** | `FA.annullaSet` → `synth.annulla/rifai` (`app.js:743-744`) | `annullaSet/rifaiSet`, `soloFuori` | **Nessun conflitto reale**: nel synth sostituisce l'annulla del set. In textarea/mini vale quello nativo. |
| ⌘C ⌘X ⌘V ⌘A | pianoroll se il canvas ha il fuoco (`suModifica` `app.js:711`; anche keydown, antirimbalzo 250 ms `synth-roll.js:~560`) | RISERVATE (non assegnabili) | no |
| ⌘D | duplica scelte (canvas in fuoco) | nessuno | no |
| B | matita (canvas in fuoco) | nessuno | no |
| ↑ ↓ / ⇧↑↓ | trasponi scelte (canvas in fuoco, con selezione) | nessuno | no. Senza selezione: scorrimento nativo |
| ← → | cursore (solo passi); sulle manopole cambiano valore | nessuno | **B8**: con passi le due cose insieme |
| ⌫ / Canc | togli scelte (canvas); con passi ⌫ = indietro | `⇧⌘⌫` = togli livello | no (modificatori diversi) |
| **Esc** | esce dai passi (`app.js:760`) | `esci` (`Escape`, non soloFuori: vale anche nei campi) | **C1**: dopo i passi, Esc fa `pila.annulla()` / `pila.seleziona(null)` / `blur`, cioè toglie la scelta del livello live senza che si veda |
| **Invio** | `⌘↵` = ▶/■ (`app.js:619`) | `provaCuffia` ⌘↵; `goLive` ⇧⌘↵ (nel synth = nulla, `app.js:721`) | no. Invio semplice: nativo (pulsanti) |
| **Tab / ⇧Tab** | nessuno | `cambiaLinguetta` (cambia ● attivo/▸ prossimo del CUE), `passaCueLive`, `soloFuori` | **C2** (vedi sotto) |
| **1 2 4 8** (da soli) | nessuno | `entra1/2/4/8` (`scegliEntraTra`) | **C3** (vedi sotto) |
| ⌥1-9 | nessuno | muto del livello n (agisce sul LIVE) | **C4** (da decidere) |
| ⌃1-9 | nessuno | sceglie il livello n | C4 |
| ⇧⌘⌫ | nessuno | togli l'ultimo livello live a fine ciclo (`togliLivello`, `app.js:397`) | C4: parte anche dal synth |
| ⌘1 / ⌘2 | — | cambio vista | no |
| ⌘. ⌘K ⇧⌘K ⌘P⌘P ⌘E ⌘S ⇧⌘S ⌘0 ⌘I ⌘, ⌃⌘F ⌃⌘B | nessuno | globali | ⌘E (`aggiungiSezione`) e ⌘S lavorano sul CUE anche a vista synth (invisibile) |

**Conflitti reali segnalati**
- **C1 · Esc nel synth** (`app.js:757-767`): oltre a uscire dai passi, toglie la scelta del livello live (`pila.seleziona(null)`), che decide a chi vanno le code da controller. Silenzioso. Gravità bassa.
- **C2 · Tab e ⇧Tab inghiottiti** (`app.js:790-796`): fuori dai campi di testo il Tab fa `preventDefault` e cambia la linguetta del CUE sotto (non la vedi). Il fuoco da tastiera non può spostarsi tra le manopole (che hanno `tabIndex=0`) né tra i pulsanti. Probabile.
- **C3 · Cifre da sole**: in SYNTH, premere `1`, `2`, `4` o `8` (magari volendo ⌘1/⌘2 e dimenticando ⌘) imposta in silenzio «entra tra N cicli» (`scegliEntraTra`, `app.js:531`). Tornato nel LIVE trovi un valore cambiato prima del go live. Probabile, e questo è l'unico che può sorprendere in serata.
- **C4 · Scorciatoie del LIVE attive dalla vista SYNTH**: muto (⌥1-9), togli livello (⇧⌘⌫), ferma tutto (⌘.), paracadute (⌘P⌘P), cuffia on/off. Sono azioni volute (il live "non si ferma e si comanda sempre") ma lì non vedi i livelli. Il rischio più concreto è ⇧⌘⌫ e ⌥1-9 premuti per sbaglio. Decisione di progetto, non bug.
- **Tasti che arrivano a CodeMirror mentre il synth è aperto: nessuno.** Tutta la postazione è `inert` (`app.js:690`), gli editor non possono ricevere fuoco né tasti. Per sicurezza `mostraVista` fa anche `activeElement.blur()` (`:693`). L'eccezione sono i campi in intestazione (non inerti): offset-cuffia, BPM; sono `input` quindi la tastiera del synth li rispetta.
- **Spazio** (non conflitto, ma regola da sapere): vale ▶/■ anche se un pulsante ha il fuoco; il `keyup` viene bloccato per non far scattare il click (`synth-vista.js:439-441`). Dentro textarea/mini/select/input è il carattere normale.
- **⌘Z**: ok. In textarea (`synth-pre`) l'annulla nativo del campo; al `blur` però il valore viene riscritto (`synth-vista.js:~139`) e **si perde la cronologia nativa** del campo.

### 4.iv Chi vince e perché
1. **Capture su window** (scorciatoie globali) vince su tutto: il synth e il canvas non vedono mai un tasto che corrisponde a un'azione (stopPropagation).
2. Le azioni `soloFuori` (Tab, ⇧Tab, ⌘Z) e quelle che scrivono caratteri (cifre da sole, Escape/Tab esclusi) cedono ai campi di testo (`app.js:782, 793`).
3. Poi parla il target: il `keydown` del canvas (`synth-roll.js:150`) gestisce ⌘A/C/X/V/D, B, ⌫/Canc, ↑/↓; quello delle manopole (`synth-vista.js:296`) le frecce.
4. Ultimo, il **bubble su window** (`app.js:703`): `tastoGiu` (piano, Spazio, ottava, comandi dei passi). Nessuno dei gestori precedenti ferma la propagazione (tranne il globale), per questo B8 può succedere.
5. Gli unici controlli "chi ha il fuoco" sono: `inCampoDiTesto` (synth), `scrivendo` (globale), `dialogoAperto()`, `imp.catturando`, `canvas === activeElement` (`inPrimoPiano`). Non c'è un controllo "pannello Impostazioni aperto" (B6).

---

## 5. Dove compare il tasto SYNTH e come averlo su ogni scena

### Oggi
- Compare solo se il codice contiene la riga `// @synth {json}` leggibile (`haRigaSynth`, `synth-codice.js:139`).
  - **CUE, card clip** (`cue.js:729-737`, aggiornato a ogni modifica `:653`). Solo clip `carta(i)` non preambolo.
  - **LIVE, card livello** (`pila.js:175-212`, visibilità `:453`).
- **Non compare** sulla card dell'apertura, sul preambolo, sulle scene del beat (`cartaScena` `cue.js:888`: non ha il bottone nel codice), né su qualunque clip scritta a mano. Sul livello `beat` del LIVE il bottone esiste ma resta nascosto (nessuna riga `@synth`).

### Perché: è sia limite tecnico sia scelta
1. **Scelta di progetto.** Il synth parte dallo stato JSON (`// @synth`), non dal codice. Non c'è un percorso "leggi il codice di questa card e modificalo". Il pulsante significa «riapri quello che ho fatto col synth».
2. **Limite tecnico del lettore.** `leggiCodice` si aspetta `note("…")` o `n("…").scale("…")` come testa; il pianoroll legge solo **altezze** (`notaDaNome`, `synth-note.js:~34`): `s("bd sd")` darebbe «`bd` non è una nota». Qualsiasi altra testa va in `stato.testa` e il pianoroll si spegne ("note a mano"). Inoltre B2: il `.s("triangle")` forzato romperebbe la batteria. E il pianoroll non legge `( ) ? / . |` (euclidei e casuali: tipici dei beat).
3. **Limite di destinazione.** «→ CUE» crea sempre una clip nuova; non esiste «applica a questa card».

### Proposta: «apri nel synth/pianoroll» su ogni card, CUE e LIVE, anche beat
Idea in tre pezzi, dal più sicuro al più grosso:

1. **Modifica sul posto, non rigenerazione** (il cuore, ~150-250 righe). Per le card senza `@synth` non usare `codice(stato)`. Usare `spezza()` (già c'è, `synth-codice.js:148`) per trovare i **letterali stringa** della testa (`note("…")`, `n("…")`, `s("…")`, `sound("…")`, anche dentro `stack(...)`/`$:`) e **sostituire solo quel testo**, lasciando tutto il resto carattere per carattere. Così non si perde niente (commenti, `$:`, `.bank`, `setcpm`). Risolve B1/B2/B4 per questo percorso e evita la "riscrittura che perde parti".
2. **Pianoroll a righe con nome per la batteria** (~300-500 righe + test, il pezzo grosso). Per `s("bd sd [hh hh]")` le righe non sono 36 semitoni ma i nomi dei suoni usati (bd, sd, hh, oh, cp…, in ordine fisso); un evento è `{i, l, s}`. Si riusa `leggiMini` (il parser è lo stesso: cambia solo cosa significa il token, `notaDaNome` → nome). Stesso griglia, stesse selezioni/matita/⌘Z. Per più tracce (`stack` di `s("bd*4")`, `s("~ sd")`) una riga per traccia. Il pezzo di parser/serializzatore è puro e testabile senza audio: candidato Codex (regola CLAUDE.md), la parte canvas la scrivo io.
3. **Destinazione = la card** (~80-150 righe). Per le card CUE: scrivere nell'editor della card (`carta.editor.codice = …`, come fa `suCambio`) invece di creare una clip. Per le card LIVE: **mai scrivere nel livello che suona**. Aprire una copia e offrire «mandalo come modifica» che passi per l'editor del livello e il normale ⌘↵ (`pila.js apriModifica`, applica al prossimo ciclo): lo stesso percorso sicuro di oggi.

**Taglia complessiva:** circa una settimana di lavoro a passi (1 → solo testa `note("…")` con tutto il resto intatto; 2 → batteria; 3 → destinazioni). Il passo 1 da solo dà già «tasto SYNTH su ogni clip con note».

**Cosa può rompere**
- I casi che il pianoroll non legge: euclidei `bd(3,8)`, `?`, `/`, `.`, `|`, `{polimetro}`. Regola: se la stringa non si legge **non si tocca** (come oggi, con avviso) e il pulsante apre solo la sola lettura, senza riscrivere.
- Ordine delle chiamate: la modifica sul posto non lo cambia (a differenza di oggi, dove `mano` finisce in fondo).
- Beat con più scene e `<a b>`: riusa la gestione cicli già presente (1/2/4/8).
- Il pulsante su LIVE non deve mai poter cambiare un livello in modo diretto. Se in un secondo momento si vuole "applica al live", servono la dissolvenza/ciclo di entrata già esistenti.
- Tetto sugli eventi (B5) da mettere prima: una batteria con `*16` annidati è normale.
- Le prove automatiche del synth (`prova.js` grosso) controllano che le note del pianoroll siano quelle suonate da Strudel: vanno estese al nuovo percorso.

---

## 6. QUALITÀ: cose che valgono la pena (max 8)

1. **Avviso quando `leggiCodice` scarta qualcosa** (B1, B4): se `spezza` ha trovato `;`, `$:` o commenti in mezzo, dirlo (riga ambra) e **non riscrivere** il textarea al `blur`. Piccolo e toglie la perdita silenziosa.
2. **Controllo corpo ≠ riga `@synth`** (B3): al click su «synth», confrontare `codice(leggiRiga)` con il corpo; se differiscono, avvisare («la clip è stata modificata a mano, il synth parte dal pannello originale»).
3. **Tetto agli eventi** in `espandi` (B5): rifiutare sopra, ad esempio, 4096 eventi con «troppi eventi per il pianoroll».
4. **Segno chiaro della tastiera attiva/morta**: sostituire/aggiungere all'etichetta «tasti C3» un punto acceso quando il fuoco è libero, spento quando è in un menu/campo. Dà anche un perché alla tastiera «che non suona» (B7).
5. **Anello di fuoco sul canvas** (`synth.css:402`): sapere se ⌘A/C/V vanno al pianoroll.
6. **Non far passare Tab, cifre, Esc sul LIVE da una vista che non lo mostra** (C1-C3): in `mostraVista('synth')` rendere `cambiaLinguetta`, `entra*`, e il tolgo-scelta di `esci` inattivi, oppure ricordare in un riquadro quali scorciatoie del live restano accese. Il resto (muto, ferma tutto, paracadute) è giusto che resti.
7. **Fermare il ridisegno inutile** (B9): in `testina(false)` ridisegnare solo se qualcosa è cambiato, o saltare quando `scheda !== 'note'`; e salvare i `getComputedStyle` in una cache.
8. **Controllo «Impostazioni aperte»** in `app.js:703-708` (B6): aggiungere `$('impostazioni').hidden` alla condizione.

---

### Prove fatte e non fatte
- Fatte: `node --test test/synth.test.js test/synth-note.test.js` → 63 ok, 0 falliti. Script in scratchpad su `leggiCodice` (B1, B2, B4) e `eventiDaMini` (B5).
- **Non fatte** (richiedono l'app o suono): focus/tasti reali (B6, B7, B8, C1-C3), blocco dell'interfaccia (B5), comportamento del RAF a vista chiusa. Vanno verificate a mano.
- Non coperto dalle prove automatiche (letto in `test/synth*.test.js`): `;`/`$:` nel textarea, testa `s("…")`, corpo ≠ riga `@synth`, tasti reali.
