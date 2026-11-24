# CUTX 0.6.0-beta.1 «CUTX_06 · CANALI»: il LIVE a canali, il nano e l'X-Touch MANI

Volume basso (20%). La pagina da stampare con le mappe dei controller è `docs/CANALI.md`.

## Cosa è nuovo
1. **8 canali fissi** nel LIVE: CH1 THUMP (drum e beat), CH2 PURR (keys, arp), CH3 GROWL (bass), CH4 HOWL (lead), CH5 FUR (pad), CH6 CLAW (perc), CH7 HISS (fx), CH8 STRAY (stray, scratch, jam, kit: qui le clip si impilano). «CH2 PURR» è scritto ovunque. La mappa è una sola per tutti i PROJ (`canali.json` nello stash). I nomi si cambiano dalle impostazioni, a live fermo.
2. **Il nano (korg nanoKONTROL2) è la regia**: la manopola sceglie cosa entra (NEXT, a sinistra OUT), **R** lo manda, **PLAY** manda tutto quello che è armato sullo stesso ciclo, **STOP** annulla tutto ciò che non è ancora successo (attese e scelte armate); **STOP tenuto 1,5 s = paracadute** (il gatto si riempie). **S tenuto** = cuffia sul NEXT. **M** = muto. **Fader** = volume del canale. TRACK ◀ ▶ = brano prima/dopo nel PROSSIMO (se ha modifiche non salvate avvisa: ripremi entro 2 s). SET = linguetta del CUE. MARKER = scena del beat. CYCLE = «entra tra» 1→2→4→8. REC = REC del SYNTH.
3. **Un volume solo per canale**: fader del nano, slider della griglia e slider della card sono la stessa cosa (con «CHn» sotto lo slider). La cuffia suona clip × canale e segue il fader; M non la zittisce.
4. **X-Touch MANI** (solo vista LIVE, dopo che il nano è stato visto): tasti in alto 1–8 = FOCUS sul canale; manopole 1 SWEEP (a sinistra passa-basso, a destra passa-alto; il filtro scritto nella clip fa da limite), 2 risonanza, 3 eco, 4 riverbero, 5 velocità, 6 sporco, 7 altezza, 8 volume generale. Layer B = le stesse manopole su tutto. Spinta = la riga esce. La clip che entra nel canale eredita le righe. L'X-Touch non sceglie mai cosa entra.
5. **SYNTH sull'X-Touch**: nuovo gruppo **MOD** (tasto 6, due pagine: un LFO l'una).

## Cosa è cambiato rispetto alla beta 4
- **Una clip senza tipo non entra più live da sola**: sta in «DA ASSEGNARE» (gruppo ambra in cima al CUE). Dal go live (o ⇧⌘↵) si apre il menu del canale e la clip entra a «entra tra» nel canale scelto; dal tasto «CHn ▾» della card si scrive solo il tipo. In cuffia si può ascoltare lo stesso. «usa i suggeriti» dà a ogni clip il tipo suggerito dal nome (un solo ⌘Z per annullare).
- **La vista di partenza del LIVE è la griglia dei canali.**
- Con l'X-Touch MANI attivo il **paracadute sta solo sul nano** (STOP tenuto): il tasto 8 dell'X-Touch è il FOCUS di CH8.
- Senza nano collegato CUTX si comporta come la beta 4 (l'X-Touch ha le pagine A e B di sempre).
- Lo slider della card non scrive più niente nel file; il `· volume 0.8` nella riga `// @clip` resta, scritto a mano.
- Le scene del beat che suonano hanno il contorno verde (non più una fascia piena).

## Come si prova
1. **Editor Korg** (una volta sola, col nano): LED Mode = External; i pulsanti in Momentary; un solo canale MIDI (1); tipo CC; poi «Write Scene Data» per scrivere sul nano. Senza questo le luci non seguono e i tasti non sono quelli attesi.
2. Collega nano e X-Touch (modalità MC). In alto compare **NANO**.
3. Gira la manopola di CH2, premi R: la clip entra. Con CH vuoto e senza aver girato niente, R dice «CH2 PURR: gira la manopola per scegliere».
4. Una clip senza tipo: go live → menu canale → entra da sola.
5. Tieni S su un canale: senti la clip in NEXT; lascia: silenzio.
6. Muovi un fader: si muove anche lo slider della griglia e della card.
7. X-Touch: premi il tasto 3 (FOCUS CH3), gira SWEEP; cambia clip in CH3: ha lo stesso filtro.
8. STOP breve con due canali armati: smettono di lampeggiare. STOP tenuto: paracadute.

## Prova automatica
`npm run prova:parte -- serata`: A (170), B (174), C (140) con eventi finti di nano e X-Touch, da capo a fondo.
