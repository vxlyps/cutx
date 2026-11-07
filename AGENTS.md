# CUTX · istruzioni per Codex

**Regola unica: esegui solo il brief.** Fai quello che chiede il brief, niente di più. Il capo progetto è Claude: decide architettura, approccio e priorità. Tu implementi.

## Cosa NON fare
- Non cambiare l'architettura e non spostare o rinominare file.
- Non aggiungere dipendenze (npm). Nemmeno dev.
- Non toccare file fuori da quelli indicati nel brief.
- Non fare refactoring, pulizie o «miglioramenti» non richiesti.
- Non toccare i motori audio (`src/renderer/motore.js`, `motore.html`, `motori.js`, `riproduttore.js`, `tempo.js`), `src/main/prova.js`, `package.json`, `vite.config.js`, `design/`.
- Non lanciare `npm run prova`, `npm start` o altro che apra l'app o suoni: sono prove audio e le fa Claude. Tu usi solo test puri (vedi sotto).
- Non fare commit, push o cambi di branch: li fa Claude.
- Se il brief è ambiguo o impossibile, fermati e dillo nel rapporto finale. Non indovinare.

## Cos'è
App per Mac di live coding musicale basata su Strudel, usata come un CDJ. Electron 44, solo Apple Silicon. JavaScript puro (ES modules, `"type": "module"`), niente TypeScript, niente framework. Vite per la parte interfaccia. Licenza AGPL-3.0.

## Cartelle
- `src/main/` processo principale Electron (`main.js`, `preload.cjs` unico ponte verso il disco, stash, preferenze, log).
- `src/renderer/` interfaccia e motori (un file per funzione: `cue.js`, `brano.js`, `browser.js`, `controller-*.js`, `synth-*.js`, …).
- `src/ableton/` import dei progetti Ableton (`.als`).
- `test/` test puri con `node:test`. Un file per modulo: `test/<nome>.test.js`.
- `docs/` documentazione. `design/` grafica (non toccare).

## Stile del codice
- Soluzione più semplice che funziona. Niente over-engineering.
- Imita lo stile del file vicino: nomi, rientri, commenti.
- Nomi e commenti **in italiano**, brevi e chiari. Niente gergo inutile.
- Funzioni piccole. Logica pura separata dalla parte che tocca il DOM o Electron, così si prova con un test puro.
- Sicurezza Electron: `contextIsolation` on, `nodeIntegration` off. Il disco si tocca solo dal preload (`window.cutx`).
- Niente servizi online, tracciamenti, analytics, account.
- Niente suoni, stem, video o progetti `.als` personali nel repo.
- File grandi: prima `grep -n`, poi leggi solo le righe che servono.

## Come si prova
- Solo test puri: `node --test test/<file>.test.js` per il file che tocchi. Se il brief chiede test nuovi, mettili in `test/<nome>.test.js`.
- Prima di finire, lancia il test del pezzo toccato e riporta l'esito vero (anche se fallisce).

## Rapporto finale (breve)
1. File toccati (elenco).
2. Cosa hai fatto, in 3-5 righe.
3. Esito dei test lanciati, con l'errore vero se falliscono.
4. Dubbi o cose del brief che non hai potuto fare.
