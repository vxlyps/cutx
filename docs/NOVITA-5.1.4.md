# CUTX 0.5.1-beta.4 · ARPEGGIO, MOD, specchietto animato, DRUM con CASSE, «synth» su ogni clip: come provarli

Volume basso. Nel SYNTH (⌘2):

## Il tasto «synth» su ogni clip
1. Nel CUE e nel LIVE, **ogni clip con del codice** ha il pulsante **synth** (o **drum**), anche se scritta a mano: clic = si apre nel pannello.
2. Se il pannello la riscrive uguale (come prima) c'è **«aggiorna «nome»»**. Se è un codice libero (es. `s("bd*4").gain(.5)`) il synth lo legge a modo suo e lo dice: lì **niente «aggiorna»**, la clip originale non si tocca; per tenere il lavoro usa **→ CUE come clip nuova**.

## Scheda DRUM: ora ha CASSE
3. Nella barra del DRUM, tra ▶ e REC, c'è **CASSE**, come nel SYNTH: è lo stesso interruttore (acceso nel DRUM resta acceso nelle altre schede, si spegne da solo uscendo dal SYNTH). Acceso, griglia, tasti e REC suonano dalle casse e si sommano al live.

## Specchietto animato
4. Nella scheda suono: la **forma d'onda scorre** e la **curva del filtro si muove con gli LFO**, a tempo col live (un punto segue il cutoff di adesso). Si ferma da solo quando esci dal SYNTH.

## ARPEGGIO e MOD
5. **ARPEGGIO**: modi (CONVERGE, DIVERGE, PINKY, THUMB, PULSE, ORDER, EVOLVE…), ottave, swing, accenti, umanizza, POLY, CHANCE, JUMP, ROTATE, RETRIG, passo fino a 1/64 e terzine. Il codice è Strudel vero.
6. **MOD**: due LFO (cutoff, q, pan, gain, fm, shape, room, delay): forma, velocità in battute, profondità; scrivono `.lpf(sine.range(a, b).slow(n))`.
7. Barra e schede ferme tra suono, note e drum; **CLEAR** svuota il pianoroll e il codice; pianoroll vuoto con un clic; ottave fino a 5; valori a step come fila di tasti.

## Altro
8. Fader del filtro: il filtro proprio del livello fa da tetto (lpf) o da pavimento (hpf). Cimice: intensità e crescita regolabili, HACK con la scena finale.

Limiti: glide e OSC2 non ci sono (non sono funzioni native di Strudel); il pianoroll non legge ritmi euclidei e `?`; l'animazione dello specchietto usa un tempo di ciclo preso dal live (2 s se il live è fermo).
