# CUTX · contesto operativo

App per Mac di live coding musicale basata su Strudel, usata come un CDJ. Progetto di Valerio (vxlyps), poi regalato alla community. Si chiamava DANEEL. Repo: https://github.com/vxlyps/cutx (pubblico, `main`). Roadmap e criteri: `docs/PIANO.md`. **Fase 1 in corso: piano approvato e decisioni in `docs/FASE-1.md`, da leggere prima di tutto.** Grafica: `design/DESIGN.md` e le tavole in `design/riferimenti/`.

## Regole di lavoro
- Italiano, diretto, conciso. Niente linguaggio corporate.
- Codice dell'app: prima spiego cosa voglio fare, aspetto l'ok, poi scrivo.
- Soluzione più semplice che funziona. Niente over-engineering, niente dipendenze inutili.
- Si lavora per fasi. Ogni fase finisce con qualcosa che si può suonare. A fine fase: mi fermo, dico cosa provare e come, aspetto. Mai saltare le fermate.
- Dentro una fase si va un passo alla volta: a fine passo commit, push, dico cosa provare e mi fermo.
- Azioni fisiche o di sistema (cavi, Impostazioni macOS, Configurazione MIDI Audio): passaggi numerati, uno per volta.
- Commit piccoli, messaggi in italiano. Push ogni volta che un passo funziona.
- Non fidarsi della memoria su Strudel/Electron/Web Audio: leggere `node_modules`, docs ufficiali, sorgente https://codeberg.org/uzu/strudel.
- Se un'idea è cattiva o impossibile, dirlo subito con un'alternativa.
- Stash di prova: `~/Progetti/cutx-stash-test` (fuori dal repo).

## Cosa non fare
- Niente suoni, stem o video personali nel repo (`.gitignore` li blocca, tranne `esempi/`).
- Niente AI o servizi online nel cuore.
- Niente tracciamenti, analytics, account.
- Niente fork di Strudel; pacchetti npm ufficiali non modificati. Se serve cambiarne il comportamento, prima se ne parla.

## Concetto
Postazione a tre colonne: **browser** a sinistra (suoni, libreria, help), **CUE** al centro (provo in cuffia, a tempo col live), **LIVE** a destra (pila di livelli, casse + proiezione). Gesto: carico/scrivo → sento in cuffia → mando live, entra a tempo scritto a macchina → tolgo con un tasto o sfumo. Proiettore: solo codice live enorme sopra Hydra. Dettagli in `docs/FASE-1.md`.

## Decisioni
- **Stash** (si chiamava valigetta; SSD esterno, CUTX si scarica vuoto e ricorda l'ultimo):
  ```
  STASH/
    stash.json    nome set, versione formato, preferenze del set (BPM, uscite, offset cuffia)
    suoni/        sottocartelle → suoni Strudel automatici
    libreria/     brani `.cutx` (testo semplice, sezioni `// @sezione`) e pezzi
    video/        materiale per Hydra
    estensioni/   estensioni e pacchi del set
  ```
  Un vecchio `daneel.json` viene rinominato in `stash.json`. Le preferenze della macchina (uscite, scorciatoie, interruttori) stanno nei dati dell'app.
- **Dati dell'app** in `~/Library/Application Support/CUTX`, log in `~/Library/Logs/CUTX`. Al primo avvio impostazioni e log di DANEEL vengono spostati lì.
- **Cuore piccolo + estensioni.** Cuore: stash, libreria, cuffia, live, proiezione. Punti di aggancio stabili: pannello, comando/scorciatoia, tipo di pezzo in libreria, uscita/ingresso. L'AI è un'estensione, mai nel cuore.
- **Pacchi** = cartella con `cutx-pack.json` (nome, autore, versione, tipo, contenuto); stessa forma delle estensioni; si installano trascinandoli nello stash.
- **Verde marcio = live.** Solo ciò che suona live è verde.
- **Tutto offline.** Internet solo per l'estensione AI.

## Tecnica
- **Electron** (serve Chromium: `AudioContext.setSinkId()` e Web MIDI). Sicurezza: `contextIsolation` on, `nodeIntegration` off, disco solo via preload (`window.cutx`).
- Pacchetti: `@strudel/core`, `mini`, `transpiler`, `webaudio`, `codemirror`; poi `midi`, `hydra`, `draw`, `soundfonts`.
- **Electron 44** (Chromium 152), verificato: `setSinkId`, nomi delle uscite e Web MIDI funzionano, ma solo in contesto sicuro (app servita da `cutx://`, mai `data:`). Permesso MIDI in Electron = `midiSysex`.
- **Solo Apple Silicon (arm64).** Niente Intel, niente build universali.
- **Tre processi (fase 1, passo 2).** Controllo (interfaccia), **live** e **cuffia**: i due motori sono la stessa pagina nascosta (`motore.html?ruolo=live|cuffia`), ognuno col suo AudioContext e superdough (superdough tiene un solo AudioContext per pagina). Ogni motore valuta il codice da solo: il `repl` di Strudel lo compila e basta, a suonarlo a tempo è il nostro `Riproduttore` (giro ogni 50 ms, anticipo 100 ms), non il Cyclist. Canali diretti tra tutte e tre le finestre (MessageChannelMain), rifatti a ogni (ri)caricamento.
- **Il live comanda il tempo**: pubblica alla cuffia la mappa del tempo (ciclo, epoca, cps) ogni secondo e a ogni cambio; la cuffia la porta nel suo contesto con `Orologio` (`getOutputTimestamp()`) e calcola da sola gli eventi. `setcpm` e `cps` cambiano il tempo solo nel live. La cuffia ha già il codice live e un parametro `mix` (fermo a 0) per il futuro mix cuffia/live.
- I motori leggono stash, suoni, uscite e offset da soli (preload `cutx.stash()`, avviso `stash-cambiato`), non dall'interfaccia.
- **Guardiano** nel processo principale: interfaccia crashata → ricaricata, riprende dai motori cosa suona; cuffia bloccata o crashata → riavviata, l'interfaccia le ridà il codice; il live non si tocca mai.
- **`npm run prova`** (`--prova=robustezza` o `--prova=brani` per una parte sola; gira con dati a parte in `CUTX-prova`): prova automatica di robustezza (blocca/crasha interfaccia e cuffia, cambio tempo, codice sbagliato). Una **sentinella** in ogni motore ascolta il segnale digitale in uscita e conta i click programmati che escono davvero e in orario. Log in `~/Library/Application Support/CUTX/log/prova-*.log`. Da rifare a ogni modifica dei motori.
- **Misuratore di sfasamento**: stima software continua (schermo + log) e prova vera ad anello col cavo nell'ingresso della MiniFuse (misurata dal motore live). Regolazione manuale `offsetCuffiaMs` in `stash.json`. In fase 1 va nelle impostazioni, sezione audio.
- **Piano B (pronto, non attivo)**: dispositivo aggregato macOS, un solo AudioContext multicanale (live 1-2, cuffia 3-4, Strudel lo sa già fare con `channels`).
- Volume/sfumata per livello: moltiplica la `velocity` di ogni evento (superdough: gain *= velocity). Semplice e senza API interne; limite: una nota lunga già partita non sfuma a metà.
- Campioni caricati al primo uso (lazy), in cuffia e in live. Stem da Ableton in **WAV**.
- Suoni dallo stash via protocollo `cutx://app/stash/...`, che serve solo file dentro lo stash. Ogni sottocartella di `suoni/` diventa un suono (come `@strudel/sampler`).
- **Suoni base** (bd, sd, hh…) offline: vanno nello stash. Prima di metterli in un pacco pubblico, controllare la licenza di ogni banca.
- **Estensioni** = codice che gira nell'app: installarle vuol dire fidarsi dell'autore. Avviso chiaro nella documentazione. `cutx.cuffia` lettura/scrittura, `cutx.live` solo lettura.
- Finestre: controllo sul monitor piccolo (schermo principale); in fase 3 proiezione a schermo intero sul proiettore (secondo schermo).
- Fase 4: terza uscita (dongle USB) per sync PO-33: impulso breve sul canale sinistro, 2 per quarto (SY2).
- Fase 5: `.dmg` solo arm64, **senza firma Apple**, costruito da GitHub Actions (runner macOS) e pubblicato nelle Release per chi lo scarica. Tipo di file `.cutx` registrato su macOS, icona del gatto, apertura con doppio clic.

## Grafica
- Riferimento: `design/DESIGN.md` alla lettera, tavole approvate in `design/riferimenti/`. Canaglia Stencil per wordmark e titoli, Fragment Mono per il resto, font inclusi come file locali.
- Wordmark CUTX: file in `design/risorse/logo/`, nell'interfaccia `cutx_bianco`.
- Icona: gatto seduto su fondo `#050604`, in `risorse/icona/` (`cutx.svg`, `cutx.png` per il Dock, `cutx.icns`).
- Logo, font, gatti e design dell'interfaccia sono fuori dall'AGPL: `design/LICENSE`, `risorse/icona/LICENSE`.
- Postazione (passo 3): `index.html` + `stile.css` con i colori di DESIGN.md come variabili CSS. Fragment Mono in `src/renderer/public/font/` (con `OFL.txt`); Canaglia Stencil, logo e gatti presi direttamente da `design/risorse/` (Vite li include nella build), mai copiati in `src/`. Gatto e insegna in `gatto.js`; l'insegna tiene il suo posto anche spenta, così la barra non salta.
- Provvisori fino al passo 9: le impostazioni (⌘,) sono un pannello sopra la postazione con uscite, test di sfasamento e robustezza della fase 0. Tasti di passi futuri (brano, entra tra, hydra, proiettore) ci sono ma disattivati, con il passo nel suggerimento.
- `electron . --foto=file.png`: foto della postazione (e `file-impostazioni.png`), per confrontarla con le tavole.
- Lanciatore: `strumenti/CUTX.command` (copia sulla Scrivania, doppio clic). Una sola istanza dell'app alla volta.

## Hardware
Mac mini M4, per sviluppare **e per le serate**. Setup da serata: Mac mini, cuffie nel jack frontale (= cuffia), MiniFuse 1 alle casse (= live), un monitor piccolo per me (controllo), proiettore come secondo schermo. Arturia MiniFuse 1 (la sua uscita cuffie copia le casse: NON è il preascolto), PO-33 K.O., Akai APC mini mk2, Ableton Live per gli stem.

## Stato
- Fase 0 chiusa. AIFF non decodificabile da Chromium (solo WAV).
- Fase 1, passo 1 (rinomina, stash, icona, migrazione dei dati): fatto e verificato da Valerio.
- Fase 1, passo 2 (motore live separato e test di robustezza): fatto. `npm run prova` superata: in tutte le fasi 0 click persi dal live, scarto max 0,16 ms, cuffia di nuovo a tempo dopo il crash (sfasamento stimato < 0,02 ms). Rinuncia temporanea: niente note evidenziate nell'editor fino al passo 6.
- Fase 1, passo 3 (struttura della postazione e base grafica): fatto. Tre colonne, barra con gatto animato, wordmark, insegna, stash, BPM, battute e ciclo dal live; CUE in modalità libero con cuffia ⌘↵ e go live ⇧⌘↵; LIVE con un livello solo; scorciatoie ⌘. ⌘K ⌘, ⇧⌘⌫ esc. `npm run prova` superata anche con le scorciatoie premute davvero.
- Grafica dei passi 2 e 3 approvata da Valerio. Prove con MiniFuse e cuffie: le fa lui appena ha tutto collegato.
- Aggiunte approvate dopo il passo 3 (ritocchi grafici, conteggio a frasi, CUE come editor musicale, salvataggio, paracadute, livelli live modificabili sul posto, finestra di uscita, Hydra che ascolta): `docs/FASE-1.md` sezione 10, con le scorciatoie nuove nella tabella.
- Ritocchi grafici e conteggio a frasi: fatti.
- Fase 1, passo 4 (formato brano, CUE con mappa e sezioni, modalità libero, salvataggio): fatto. Formato `.cutx` in `src/renderer/brano.js` (puro, tenuto riga per riga: riletto e riscritto è identico byte per byte), test in `test/brano.test.js` (`npm test`). CUE in `cue.js`: libero (un editor con fasce ed etichette delle sezioni) e brano (mappa trascinabile, card con editor, preambolo, sezioni live richiuse). ⌘E + sezione, ⌘S salva in `libreria/` dello stash (testa con nome, BPM dal codice, data, suoni dello stash usati; avviso se mancano). `npm run prova` (o `--prova=brani`) salva, riapre, modifica e manda live dall'interfaccia vera. Manca "salva il live come brano" (⇧⌘S): arriva al passo 6 con i livelli; formato già pronto (`daLivelli`).
- Fase 1, passo 5 (GO LIVE con entrata a tempo e scrittura a macchina): fatto. Il motore live tiene una pila di livelli (`motore.js`), ognuno con la sua finestra di cicli [da, a); il `Riproduttore` suona più sorgenti e applica i cambi di tempo (setcpm di un livello) esattamente al ciclo di entrata. GO LIVE entra al confine tra 1·2·4·8 cicli (tasti 1 2 4 8 fuori dall'editor); stesso nome = sostituzione al confine; × e ⇧⌘⌫ tolgono a fine ciclo; un errore lascia suonare il livello di prima. Volume del livello via `velocity` (superdough la moltiplica nel guadagno), non più via orbit. La pila nel LIVE (`pila.js`) si ricava solo da stato del live + mappa: scrive a macchina chi arriva, cancella chi esce. Scrittura a macchina spegnibile (preferenze, provvisoria nelle impostazioni). `--prova=entrata` misura che il primo suono di ogni livello cada esattamente sul ciclo di entrata.
- **Passo 6 in corso (interrotto per limite di uso, 2026-10-20).** Scritto ma NON ancora provato: volume (barra), muto (m e ⌥1–9: ⌃1–5 su questo Mac sono di Mission Control), griglia ritmica e note evidenziate in verde (`evidenzia.js`), modifica sul posto dei livelli (clic sul codice, ⌘↵ applica al prossimo ciclo, esc annulla), jam in fondo al LIVE, tab CUE↔LIVE, paracadute (motore: `lanciaParacadute`, pulsante col gatto tenuto 1 s o ⌘P due volte), salva il live come brano (⇧⌘S), finestra di uscita (`uscita.html/js/css`, tasto "uscita", ⌃⌘F, ricorda schermo e modalità in preferenze). Da fare: provarli tutti (estendere `prova.js`), note bianche in cuffia nel CUE, foto dell'uscita, sistemare il controllo instabile "mentre esce, il livello si vede in uscita" (passa da solo, a volte fallisce nella prova completa), poi commit del passo 6 e fermata. (test, commit, push e CLAUDE.md a fine di ogni passo). Fermarsi alla fine del passo 6, o prima se un test fallisce e non si risolve.
