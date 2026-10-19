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
- **Due motori audio**: live → scheda casse (MiniFuse 1), cuffia → jack del Mac. Stesso tempo, con misuratore di sfasamento in ms (schermo + log). Piano B: dispositivo aggregato macOS, un AudioContext multicanale (live 1-2, cuffia 3-4).
- Suoni dalla valigetta via protocollo personalizzato sicuro.
- Finestre: controllo (portatile); in fase 3 proiezione a schermo intero sul secondo monitor.
- Fase 4: terza uscita (dongle USB) per sync PO-33: impulso breve sul canale sinistro, 2 per quarto (SY2).
- Fase 5: `.dmg` da GitHub Actions (runner macOS) nelle Release.

## Grafica
Nero, rosso, cromo. Direzione **CROMO**: nero puro, bianco sporco `#E8E6E1`, rosso solo sul live, grotesk condensato enorme per i titoli, monospace pulito per il codice, logo in cromo, etichette libreria tipo targhetta industriale. Niente gradienti, niente animazioni decorative. Fasi 0-1: minimale nero + rosso; grafica vera in fase 3.

## Hardware
Mac mini M4 (sviluppo), MacBook Pro di un amico (serate), Arturia MiniFuse 1 (la sua uscita cuffie copia le casse: NON è il preascolto), PO-33 K.O., Akai APC mini mk2, Ableton Live per gli stem.

## Stato
- Fase attuale: **setup fatto, in attesa di ok sull'architettura prima della fase 0.**
