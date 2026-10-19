# DANEEL · contesto operativo

App per Mac di live coding musicale basata su Strudel, usata come un CDJ. Progetto di Valerio (vxlyps), poi regalato alla community. Repo: https://github.com/vxlyps/daneel (pubblico, `main`). Roadmap e criteri: `docs/PIANO.md`.

## Regole di lavoro
- Italiano, diretto, conciso. Niente linguaggio corporate.
- Codice dell'app: prima spiego cosa voglio fare, aspetto l'ok, poi scrivo.
- Soluzione più semplice che funziona. Niente over-engineering, niente dipendenze inutili.
- Si lavora per fasi. Ogni fase finisce con qualcosa che si può suonare. A fine fase: mi fermo, dico cosa provare e come, aspetto. Mai saltare le fermate.
- Azioni fisiche o di sistema (cavi, Impostazioni macOS, Configurazione MIDI Audio): passaggi numerati, uno per volta.
- Commit piccoli, messaggi in italiano. Push ogni volta che un passo funziona.
- Non fidarsi della memoria su Strudel/Electron/Web Audio: leggere `node_modules`, docs ufficiali, sorgente https://codeberg.org/uzu/strudel.
- Se un'idea è cattiva o impossibile, dirlo subito con un'alternativa.
- Valigetta di prova: `~/Progetti/daneel-valigetta-test` (fuori dal repo).

## Cosa non fare
- Niente suoni, stem o video personali nel repo (`.gitignore` li blocca, tranne `esempi/`).
- Niente AI o servizi online nel cuore.
- Niente tracciamenti, analytics, account.
- Niente fork di Strudel; pacchetti npm ufficiali non modificati. Se serve cambiarne il comportamento, prima se ne parla.

## Concetto
Tre zone: **Libreria** (sample di codice con nome, colore, BPM), **Cuffia** (editor che sento solo io, a tempo col live), **Live** (casse + proiezione). Gesto: prendo/scrivo → sento in cuffia → mando live, entra alla battuta successiva → tolgo con un tasto o sfumo. Proiettore: solo codice live enorme sopra Hydra.

## Decisioni
- **Valigetta** (SSD esterno, DANEEL si scarica vuoto e ricorda l'ultima):
  ```
  VALIGETTA/
    daneel.json   nome set, versione formato, impostazioni (uscite, controller, preferenze)
    suoni/        sottocartelle → suoni Strudel automatici
    libreria/     un file per pezzo, nome/colore/BPM in un commento in testa
    video/        materiale per Hydra
    estensioni/   estensioni e pacchi del set
  ```
- **Cuore piccolo + estensioni.** Cuore: valigetta, libreria, cuffia, live, proiezione. Punti di aggancio stabili: pannello, comando/scorciatoia, tipo di pezzo in libreria, uscita/ingresso. L'AI è un'estensione, mai nel cuore.
- **Pacchi** = cartella con `daneel-pack.json` (nome, autore, versione, tipo, contenuto); stessa forma delle estensioni; si installano trascinandoli nella valigetta. Formato definito in fase 1.
- **Rosso = live.** Solo ciò che è live è rosso.
- **Tutto offline.** Internet solo per l'estensione AI.

## Tecnica
- **Electron** (serve Chromium: `AudioContext.setSinkId()` e Web MIDI). Sicurezza: `contextIsolation` on, `nodeIntegration` off, disco solo via preload.
- Pacchetti: `@strudel/core`, `mini`, `transpiler`, `webaudio`, `codemirror`; poi `midi`, `hydra`, `draw`, `soundfonts`.
- **Electron 44** (Chromium 152), verificato: `setSinkId`, nomi delle uscite e Web MIDI funzionano, ma solo in contesto sicuro (app servita da `daneel://`, mai `data:`). Permesso MIDI in Electron = `midiSysex`.
- **Solo Apple Silicon (arm64).** Niente Intel, niente build universali.
- **Due motori audio (strada A, approvata).** Il **live è il riferimento del tempo**: orologio Strudel unico (Cyclist) e motore live (superdough) nella finestra di controllo, verso la MiniFuse. La **cuffia insegue**: motore superdough in una finestra nascosta separata (processo separato, perché superdough tiene un solo AudioContext per pagina), verso il jack del Mac. Gli eventi passano su un MessagePort con l'orario in tempo assoluto (`performance.timeOrigin + now`), convertito da ciascun motore con `getOutputTimestamp()`; eventi arrivati tardi in cuffia si scartano. Se la cuffia si blocca o crasha, il live non se ne accorge e la cuffia viene riavviata.
- **Misuratore di sfasamento**: stima software continua (schermo + log) e prova vera ad anello col cavo nell'ingresso della MiniFuse. Regolazione manuale `offsetCuffiaMs` in `daneel.json`.
- **Piano B (pronto, non attivo)**: dispositivo aggregato macOS, un solo AudioContext multicanale (live 1-2, cuffia 3-4, Strudel lo sa già fare con `channels`).
- Volume/sfumata per livello: ogni livello ha la sua orbit, si regola il guadagno dell'orbit (API semi-interna di superdough, da ricontrollare quando si aggiorna Strudel).
- Campioni caricati al primo uso (lazy), in cuffia e in live. Stem da Ableton in **WAV**.
- Suoni dalla valigetta via protocollo `daneel://app/valigetta/...`, che serve solo file dentro la valigetta. Ogni sottocartella di `suoni/` diventa un suono (come `@strudel/sampler`).
- **Suoni base** (bd, sd, hh…) offline: vanno nella valigetta. Prima di metterli in un pacco pubblico, controllare la licenza di ogni banca.
- **Estensioni** = codice che gira nell'app: installarle vuol dire fidarsi dell'autore. Avviso chiaro nella documentazione. `daneel.cuffia` lettura/scrittura, `daneel.live` solo lettura.
- Finestre: controllo sul monitor piccolo (schermo principale); in fase 3 proiezione a schermo intero sul proiettore (secondo schermo).
- Fase 4: terza uscita (dongle USB) per sync PO-33: impulso breve sul canale sinistro, 2 per quarto (SY2).
- Fase 5: `.dmg` solo arm64, **senza firma Apple**, costruito da GitHub Actions (runner macOS) e pubblicato nelle Release per chi lo scarica.

## Grafica
- Logo: `risorse/icona.svg` (R. Daneel in cromo, occhio destro rosso = live), PNG in `risorse/icona.png`, usato come icona del Dock e del lanciatore.
- Lanciatore: `strumenti/DANEEL.command` (copia sulla Scrivania, doppio clic). Una sola istanza dell'app alla volta.
Nero, rosso, cromo. Direzione **CROMO**: nero puro, bianco sporco `#E8E6E1`, rosso solo sul live, grotesk condensato enorme per i titoli, monospace pulito per il codice, logo in cromo, etichette libreria tipo targhetta industriale. Niente gradienti, niente animazioni decorative. Fasi 0-1: minimale nero + rosso; grafica vera in fase 3.

## Hardware
Mac mini M4, per sviluppare **e per le serate**. Setup da serata: Mac mini, cuffie nel jack frontale (= cuffia), MiniFuse 1 alle casse (= live), un monitor piccolo per me (controllo), proiettore come secondo schermo. Arturia MiniFuse 1 (la sua uscita cuffie copia le casse: NON è il preascolto), PO-33 K.O., Akai APC mini mk2, Ableton Live per gli stem.

## Stato
- Architettura approvata (strada A). **Fase 0 costruita, in attesa di verifica di Valerio.** Verificato da Claude: avvio da clone pulito, stem WAV dalla valigetta, blocco e crash della cuffia senza effetti sul live. AIFF non decodificabile da Chromium (solo WAV). Da verificare: test di 10 minuti con MiniFuse + jack, anello col cavo.
