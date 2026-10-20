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
- **Due motori audio (strada A, approvata).** Fase 0: il **live è il riferimento del tempo**, orologio Strudel unico (Cyclist) e motore live (superdough) nella finestra di controllo, verso la MiniFuse; la **cuffia insegue** in una finestra nascosta separata (processo separato, perché superdough tiene un solo AudioContext per pagina), verso il jack del Mac. Eventi su MessagePort con orario assoluto (`performance.timeOrigin + now`), convertito con `getOutputTimestamp()`; eventi tardi in cuffia si scartano.
- **Fase 1, passo 2 (approvato):** live e cuffia diventano due motori uguali, ognuno nel suo processo nascosto, che valutano il codice da soli. Il live pubblica la mappa del tempo e la cuffia la segue. L'interfaccia disegna e basta. Regola d'oro: se interfaccia o cuffia si bloccano o crashano, le casse non se ne accorgono.
- **Misuratore di sfasamento**: stima software continua (schermo + log) e prova vera ad anello col cavo nell'ingresso della MiniFuse. Regolazione manuale `offsetCuffiaMs` in `stash.json`. In fase 1 va nelle impostazioni, sezione audio.
- **Piano B (pronto, non attivo)**: dispositivo aggregato macOS, un solo AudioContext multicanale (live 1-2, cuffia 3-4, Strudel lo sa già fare con `channels`).
- Volume/sfumata per livello: ogni livello ha la sua orbit, si regola il guadagno dell'orbit (API semi-interna di superdough, da ricontrollare quando si aggiorna Strudel).
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
- Lanciatore: `strumenti/CUTX.command` (copia sulla Scrivania, doppio clic). Una sola istanza dell'app alla volta.

## Hardware
Mac mini M4, per sviluppare **e per le serate**. Setup da serata: Mac mini, cuffie nel jack frontale (= cuffia), MiniFuse 1 alle casse (= live), un monitor piccolo per me (controllo), proiettore come secondo schermo. Arturia MiniFuse 1 (la sua uscita cuffie copia le casse: NON è il preascolto), PO-33 K.O., Akai APC mini mk2, Ableton Live per gli stem.

## Stato
- Fase 0 chiusa. AIFF non decodificabile da Chromium (solo WAV).
- Fase 1, passo 1 (rinomina, stash, icona, migrazione dei dati): fatto e verificato da Valerio.
- **Passo 2 in corso: motore live separato e test di robustezza** (vedi `docs/FASE-1.md`, sezioni 2 e 9). Piano proposto, in attesa dell'ok di Valerio.
