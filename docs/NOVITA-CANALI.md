# CUTX CANALI (bozza, ramo `canali`, non ancora una release): come provarli

La pagina da stampare con le mappe di nano e X-Touch è `docs/CANALI.md`. Prove col volume del Mac al 20%.

## Il LIVE a canali (CH1–CH8)
1. **8 canali fissi**: THUMP, PURR, GROWL, HOWL, FUR, CLAW, HISS, STRAY. «CH2 PURR» è scritto ovunque. La mappa è una sola per tutti i PROJ (`canali.json` nella radice dello stash).
2. **Clip senza tipo = DA ASSEGNARE**: un gruppo ambra in cima al CUE. Non entra live finché non ha un canale. Dal go live (o ⇧⌘↵) si apre il menu del canale e la clip entra a «entra tra». Dal tasto «CHn ▾» della card il menu scrive solo il tipo. In cuffia si può ascoltare lo stesso.
3. **«usa i suggeriti»** (in testa a DA ASSEGNARE): dà a ogni clip il tipo suggerito dal nome, con un solo ⌘Z per toglierli. Il tipo `stray` manda una clip nel CH8.

## Il nano (la regia)
4. Manopola = sceglie cosa entra. R = lo manda. PLAY = tutto insieme. STOP = annulla ciò che non è cominciato (tenuto 1 s = paracadute).
5. **S tenuto** = cuffia sul NEXT, lasciato = smette. Girando la manopola con S giù la cuffia segue. Lo stesso col tasto CUE a schermo: tieni il clic.
6. **TRACK** con il PROSSIMO modificato: non apre e avvisa; ripremuto entro 2 secondi apre (e butta le modifiche).

## Un volume solo
7. Lo slider della card di una clip (e quello della card BEAT) **è** il volume del canale, con la scritta «CHn» sotto: stessa cosa del fader e dello slider della griglia. Non scrive niente nel file. Il `· volume 0.8` nella riga della clip resta, scritto a mano.
8. La **cuffia** suona a volume clip × volume del canale e segue il fader. **M non la zittisce.**

## X-Touch MANI (solo vista LIVE, dopo aver visto il nano)
9. Tasti in alto 1–8 = FOCUS sul canale. Manopole 1 SWEEP, 2 risonanza, 3 eco, 4 riverbero, 5 velocità, 6 sporco, 7 altezza, 8 volume generale. Layer B = su tutto. Spinta = la riga esce. La clip che entra nel canale eredita le righe.
10. Il paracadute dell'X-Touch non c'è più (il tasto 8 è il FOCUS): resta sul nano.

## Grafica
11. Gli slider della griglia sono una linea sottile con una tacca dritta (verde solo se il canale suona). Una scena del beat che suona ha il contorno verde e la scritta leggibile (prima diventava una fascia verde piena).

## Prova automatica
`npm run prova:parte -- serata`: A (170), B (174), C (140) con eventi finti di nano e X-Touch, da capo a fondo.
