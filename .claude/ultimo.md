# Ultimo stato - 24/11/2026

## Obiettivo
Chiusura e release di CUTX 0.6.0-beta.1 «CUTX_06 · CANALI»: il LIVE a 8 canali fissi, il nano come regia, X-Touch MANI. Fatta e pubblicata.

## Decisioni prese (non rimettere in discussione)
- Una clip senza tipo non entra live: chiede il canale (menu) o sta in DA ASSEGNARE.
- L'X-Touch non sceglie mai cosa entra: lo decidono solo la manopola del nano e il tasto NEXT della card.
- Senza nano visto, l'X-Touch è la beta 4 (pagine A e B). Con il nano visto, nella vista LIVE, è MANI.
- STOP breve annulla attese E scelte armate; STOP tenuto 1,5 s = paracadute con carica visibile.
- Nomi di prova e di test: tecnici da macchina («test 1», «test 2»), mai emotivi né finto-cyberpunk. I nomi con carattere sono solo per le funzioni di CUTX che sceglie lui (memoria feedback_nomi-belli).
- Volume Mac: 20% nelle prove, poi rimesso (ora 81).

## Fatto
- A1–A5 e merge di `canali` in `main` (blocco CANALI tolto da main.js), versione 0.6.0-beta.1, CHANGELOG, docs/NOVITA-6.0.md, README (Editor Korg), docs/PROSSIMI.md (appunti di Valerio, ragnetto compreso).
- Release pre-release: https://github.com/vxlyps/cutx/releases/tag/v0.6.0-beta.1 (`.dmg` arm64). Commit main: bd343f0 (versione), poi ultimo.md.
- npm test 586/586; npm run prova superata; serata 30 ok ×2; app impacchettata verificata con nano + X-Touch (MIDI visto, MANI attiva).
- Prove vecchie allineate: ogni parte parte come la beta 4 (`nanoVistoForza(false)`, vista pila in `PARTI_PILA` di prova.js), clip di prova tipizzate.

## Da fare
1. Valerio fa le 10 prove a mano col nano e l'X-Touch veri (volume 20%), a partire dall'Editor Korg (vedi docs/NOVITA-6.0.md).
2. Il giro lungo `npm run prova:tutto` ha ~61 falli: quelli di main (MiniFuse non collegata, cattura schermo) più 4 prove di tempi/onda sparse. Da riguardare se serve (colpi «dura da mezzo secondo…», beat «armare il drop» a volte).
3. Poi la versione dopo: ACIDO+AUTO, CAOS/RANDOM, codice al pubblico, cimice più forte, ragnetto che scorre il codice (tutto in docs/PROSSIMI.md, in cima).

## File toccati
src/renderer/{controller,controller-mani,controller-synth,coda,canali,nano,app,cue,editor}.js, src/main/{main,prova}.js, test/{controller-mani,nano,canali}.test.js, docs/{NOVITA-6.0,PROSSIMI,CANALI}.md, CHANGELOG.md, README.md, strumenti/CUTX.command.

## Provato e non funziona
- Prove vecchie con il nano vero collegato alla macchina: vedevano MANI. Soluzione: nanoVistoForza(false) a inizio parte.
- Test «tutti i livelli la suonano» (controller): fallisce anche su main, preesistente.

## Note
- Il nano vero è sempre collegato alla macchina di prova di Valerio.
- Volume attuale 81 (non 100): chiedere se lo vuole a 100.
- ultimo-beta4.md = l'ultimo.md di main prima del merge.
