# CUTX 0.5.1-beta.3 · DRUM (tasti del Mac e REC), synth al volo, → CUE come scena del beat: come provarli

Volume basso, nel SYNTH (⌘2), scheda DRUM, con due o tre righe (es. bd, sd, hh) e qualcosa che suona nel live (serve un tempo):

1. **Tasti del Mac**: A S D F G H J K suonano le prime otto righe in cuffia (la lettera è scritta accanto a ogni riga); Q W E R T Y U I le altre otto.
2. **REC**: clic sul pulsante REC nella barra. Una battuta di conteggio (numeri 4 3 2 1 e click), poi «● REC» per un giro. Suona i tasti a tempo: diventano passi, al più vicino. I passi già accesi restano.
3. Un altro clic su REC: durante il conteggio annulla, durante la registrazione ferma e tiene quello che hai fatto. ⌘Z toglie tutto il giro.
4. Con l'X-Touch (layer A di nuovo = pad) i pad registrano allo stesso modo mentre REC è acceso. Il REC si avvia col mouse, non dal controller.
5. Con 32 passi o più cicli il giro dura quanti cicli ha la griglia.

Limiti: la latenza della cuffia non è compensata (i colpi possono risultare un po' fuori rispetto al click, come nel REC del SYNTH). Il REC si annulla se lasci la scheda DRUM.

## Synth al volo
6. In una clip del CUE (o del kit) che il pannello sa riscrivere uguale compare il pulsante **synth** (o **drum**): clic = la apre nel pannello.
7. Cambia qualcosa nel pannello e premi **«aggiorna «nome»»**: la clip si riscrive dov'è. Nel CUE ⌘Z la rifà. Il live non si tocca.
8. Una clip come `s("bd*4").gain(.5)` non ha il pulsante (diventerebbe un synth diverso): è voluto.

## DRUM → CUE come scena del beat
9. Nella scheda DRUM, «→ CUE»: oltre a «clip» puoi scegliere «attivo · beat» o «prossimo · beat»: il pattern entra come scena del beat.
