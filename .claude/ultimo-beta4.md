> **ATTENZIONE: il lavoro CANALI è ripartito in ~/Progetti/cutx-canali (ramo `canali`); leggere LÌ `.claude/ultimo.md`. Questo file è il vecchio stato di studio.**
# Ultimo stato - 19/11/2026

## Obiettivo
Nuovo paradigma «CANALI»: il LIVE passa da pila di livelli a 8 corsie fisse con un ruolo (BEAT, BASS, LEAD, ARP, PAD, KEYS, FX + EXTRA). Superficie fisica: Korg nanoKONTROL2 (mixer) insieme all'X-Touch Mini (scolpisce il canale scelto). Valerio ha provato la beta.4: «funziona da paura». Si lavora su un ramo/worktree `canali`, `main` e il tag `v0.5.1-beta.4` restano la base intatta.

## Decisioni prese (non rimettere in discussione)
- Nano e X-Touch lavorano INSIEME, entrambi collegati.
- Nomi canali: i tipi già esistenti in `src/renderer/categorie.js` (bass, lead, arp, pad, keys, fx) + EXTRA; il DRUM va sul canale 1 (BEAT). Un canale suona una clip alla volta.
- Il fisico è la verità: il volume di un canale è la posizione del fader, il software non lo sposta mai (niente «ripresa»). Clip lanciata a fader 0 = «live ma muta», avviso ben visibile a schermo; si alza a mano. M = muto fisico.
- R = LANCIA; ripremuto = esce al prossimo «entra tra»; tenuto 2 s = esce subito. Luci R: spenta vuoto, accesa suona, lampeggio = clip nuova in CUE. Lampeggio fatto da software (le luci hardware sono solo on/off).
- Manopola per canale = filtro DJ; tenendo S e girando si scorrono gli effetti del canale; il nuovo effetto parte neutro e prende il comando solo quando si muove la manopola.
- Fader 8 / manopola 8 = master e filtro master. PLAY = lancia tutti i canali che lampeggiano; STOP tenuto = paracadute.
- Niente Editor Korg e niente coupon: serve solo la modalità nativa via SysEx, senza scrivere nella memoria del nano.
- Valerio ha detto «fai quello che vuoi» sull'installazione, ma non serve installare nulla.

## Fatto
- Studio, nessun codice, nessun commit. Scaricato il MIDI Implementation ufficiale Korg in `/private/tmp/claude-501/korg/midiimp.txt` (da rileggere dal sito se la cartella è sparita: https://www.korg.com/us/support/download/manual/0/159/2710/).
- Mappa nativa (dal documento Korg, messaggi su canale 16 = 0xBF): fader CC 0–7, manopole 16–23, S 32–39, M 48–55, R 64–71; trasporto: PLAY 41, STOP 42, REW 43, FF 44, REC 45, CYCLE 46; track 58/59, marker set 60, marker 61/62. Luci: si rimanda lo stesso CC (≥ 0x41 acceso). Entrata in modalità nativa: SysEx «Native mode In Request» (F0 42 4g 00 01 13 00 00 00 01 F7).

## Da fare (in ordine)
1. Aspettare l'ok di Valerio sulla fase 0 e sulle due domande: il nano è visibile in macOS? S = preascolto in cuffia va bene o ha un uso migliore?
2. Creare il worktree/ramo `canali` (mai due sessioni nella stessa cartella).
3. Fase 0: piccolo monitor MIDI in sola lettura per confermare numeri, modalità nativa e luci sul nano vero (nessun motore audio; il flag nuovo va in `PER_PROVE` in `main.js`).
4. Fase 1: modulo puro dei ruoli con test (adatto a Codex, brief preciso) + 8 corsie a schermo usabili col mouse. FERMATA: decide Valerio se il paradigma regge.
5. Poi: fase 2 nano (fader, muto, LANCIA/ESCE, luci), fase 3 passaggio da brano a brano canale per canale, fase 4 effetti per canale e X-Touch sul canale toccato per ultimo.

## File toccati / importanti
Nessuno toccato. Da leggere: `src/renderer/categorie.js` (tipi clip), `src/renderer/brano.js` (@beat/@scena/@clip), `src/renderer/controller.js` (porta MIDI, NOME_PORTA riga ~106), `controller-mc.js`, `controller-ruoli.js`, `docs/CONTROLLER-5.2.md`, `docs/PROSSIMI.md`.

## Provato e non funziona
- Da questa sessione `system_profiler`/`ioreg` non mostrano nessun dispositivo USB (nemmeno la MiniFuse): non è prova che il nano non funzioni, va verificato dall'app.

## Note
- Rischio da verificare prima di promettere gli effetti per canale: come i motori accettano parametri per livello (oggi volume = velocity; le «code» dei livelli in `app.js` ~riga 280).
- MOD, arpeggio (ramo `arpeggio-wip`), tastiera MIDI e SHOW slittano; MOD per corsia sarà più naturale.
- Test noto fallito: `controller-synth` (manopole MOD senza posto sul controller). Giro lungo prove: 58 falli, in gran parte MiniFuse scollegata.
