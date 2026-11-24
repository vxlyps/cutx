# CUTX · CANALI — la pagina da tenere accanto ai controller

Il LIVE ha **8 canali fissi (CH1–CH8)**. Ogni clip sta in **un canale solo**: quello del suo tipo. Il numero e il nome sono sempre in vista («CH2 PURR»).

## I canali

| Canale | Nome | Cosa prende (tipo) |
|---|---|---|
| CH1 | THUMP | `drum` e il beat con le sue scene (una cosa sola alla volta) |
| CH2 | PURR | `keys`, `arp` |
| CH3 | GROWL | `bass` |
| CH4 | HOWL | `lead` |
| CH5 | FUR | `pad` |
| CH6 | CLAW | `perc` |
| CH7 | HISS | `fx` |
| CH8 | STRAY | `stray`, scratch, jam, kit (qui le clip si impilano) |

La mappa è una sola per tutti i PROJ (file `canali.json` nella radice dello stash). I nomi si cambiano dalle impostazioni, a live fermo.

## Le 5 regole

1. **Il nano decide cosa suona, l'X-Touch decide come suona.** La tastiera è la penna.
2. **Una clip senza tipo non entra live.** Sta in «DA ASSEGNARE» in cima al CUE: scegli il canale dal menu della card (o dal go live), oppure «usa i suggeriti».
3. **Guardare non arma.** Solo la manopola (o il tasto NEXT di una card) sceglie cosa entra; R lo manda.
4. **Quello che non tocchi non cambia.** Un canale resta com'è finché non lo cambi tu; STOP annulla solo ciò che non è ancora cominciato.
5. **Un volume solo per canale.** Fader del nano, slider della griglia e slider della card sono la stessa cosa. La cuffia sente la clip dopo il fader (il muto M non la zittisce).

## Il nano (korg nanoKONTROL2) — la regia

**Ogni canale (le 8 strisce):**
- **Manopola**: sceglie cosa entra (NEXT). A sinistra OUT, poi le clip del canale nell'ordine del file.
- **R**: esegue NEXT (entra / esce / annulla). Tenuto 1 secondo: esce subito.
- **S**: tenuto = senti in cuffia la clip in NEXT, lasciato = smette. Se giri la manopola con S giù, la cuffia segue.
- **M**: muto del canale (non tocca la cuffia).
- **Fader**: volume del canale. Si aggancia solo se il canale suona o aspetta (tacca sullo schermo = dove portarlo).

**Trasporto:**
- **PLAY**: fa partire tutto ciò che è armato, sullo stesso ciclo.
- **STOP**: annulla ciò che non è cominciato. **Tenuto 1 secondo = paracadute.**
- **TRACK ◀ ▶**: brano prima / dopo nel PROSSIMO. Se il PROSSIMO ha modifiche non salvate: avvisa, ripremi entro 2 secondi per buttarle.
- **SET**: passa da una linguetta all'altra del CUE.
- **MARKER ◀ ▶**: scena del beat indietro / avanti.
- **CYCLE**: «entra tra» 1 → 2 → 4 → 8 battute.
- **REC**: registra nel SYNTH.

## L'X-Touch Mini (MANI) — come suona
Si accende da solo quando il nano è stato visto, nella vista LIVE (SYNTH e DRUM non cambiano). Senza nano restano le pagine A e B di sempre.

- **Tasti in alto 1–8**: FOCUS sul canale (si accende il suo tasto). All'inizio CH1.
- **Layer A**: le manopole lavorano sul canale in FOCUS.
  1 **SWEEP** (a sinistra taglia gli alti, a destra i bassi, al centro niente) · 2 risonanza · 3 eco · 4 riverbero · 5 velocità (a scatti) · 6 sporco · 7 altezza · **8 volume generale**.
- **Layer B**: le stesse manopole su **tutto**.
- **Spinta di una manopola**: la riga esce.
- **Fila in basso**: i colpi. **Fader**: effetto globale. Come prima.
- Le righe messe dalle manopole sono **del canale**: la clip che entra dopo le eredita.
- Canale in FOCUS vuoto: le manopole non fanno niente e lo schermo dice «CHn vuoto».
- STRAY (CH8): la riga va su tutte le clip che ci suonano.
- **Il paracadute sta solo sul nano** (STOP tenuto): il tasto 8 dell'X-Touch è il FOCUS di CH8.
