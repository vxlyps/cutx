# Ultimo stato - 23/11/2026 (LAVORARE IN ~/Progetti/cutx-canali, ramo `canali`; main = beta 4 intatta, non si tocca)

## Obiettivo
LIVE a canali (CH1…CH8) col piano approvato da Valerio in 5 passi, UNO alla volta (5 righe → ok di Valerio → scrivo, test, commit, push, cosa provare, mi fermo). Passi 1, 1.1 e 2 FATTI (commit f8cc7aa, 0afdb98, 1d68a23). Il motore lo scrivo io, mai Codex. Prove col volume al 20% poi rimesso.

## Il modello (non si discute)
- NANO = la regia: gira = scegli NEXT · R = fai · PLAY = fai tutto insieme · STOP = annulla. X-TOUCH = le mani (come suona il CH in FOCUS, righe di codice visibili; SYNTH e DRUM invariati). TASTIERA = la penna. Senza nano CUTX si comporta come la beta 4.
- Nomi: THUMP·PURR·GROWL·HOWL·FUR·CLAW·HISS·STRAY (CH1-8). Niente colori nei canali: verde marcio = suona, bianco/grigi, scritte.

## Fatto
- Ritocchi al passo 2 (23/11): aggancio del fader solo se il CH suona o ha un'attesa (CH vuoto = comanda subito); `chDelLivello(config, l)` in canali.js è l'unica regola STRAY, usata da app.js (pila, ripristino, modifica dalla pila). Test 47/47 (canali+nano). Prova automatica `fader` in prova.js NON rilanciata: può assumere il fader sganciato a CH vuoto.
- Passo 1: R esegue NEXT (GO/OUT/ANNULLA/LIVE/«—»). NEXT di default = ciò che suona; OUT = prima zona manopola e primo chip (`scegliAlt(i,k)`, k=0 OUT); scelte per brano; guardare non arma (tolto `cue.suAttiva`); tasto NEXT su ogni card (e uno nella testa del BEAT per la scena scelta). Motore: `togli` con `cicli`, `riprendi` (ANNULLA di un OUT), `gruppo` (PLAY: un solo ciclo d'arrivo); `goLive` diviso in `preparaLive`/`finisciLive`.
- Passo 1.1: la scelta eseguita si cancella in `sincronizza`; `tieniBrani` cancella le scelte dei brani fuori dalle due linguette del CUE.
- Passo 2: `mixer.js`; il motore live tiene `mixer[8]` (volume, pos, muto), messaggio `ch`, guadagno = clip × CH × break; cuffia pre-fader (non riceve mai `ch`); mixer nella fotografia di `ripristinaLive` e rimandato a ogni live rinato; `riprendi()` lo rilegge. StatoCanali: aggancio fader ±3% o passaggio sopra, `sliderSchermo`, `sganciaTutti` (avvio, slider, ripristino, nano ricollegato, PROJ), avvisi MUTE / fader a zero / clip muta; tacca del valore vero in griglia. Fader 8 = CH8 STRAY.
- Prove: test 534/535 (resta il MOD noto in `controller-synth`); entrata 29 ok, livelli+robustezza 44 ok, 5 parti insieme 115 ok. Una volta su prova combinata robustezza «click 0/0», non ripetuta (guasti sparsi noti).

## Da fare (in ordine)
1. PASSO 3 · Trasporto del nano (nano.js, app.js). CC di fabbrica: TRACK◀ 58 ▶ 59 · CYCLE 46 · SET 60 · MARKER◀ 61 ▶ 62 · REW 43 · FF 44 · STOP 42 · PLAY 41 · REC 45. TRACK = brano prec./succ. del set nella linguetta PROSSIMO (come `cueBrano` dell'X-Touch) · SET = il CUE passa tra brano che suona e prossimo · MARKER = scena del beat indietro/avanti a fine frase (`muoviScena`) · CYCLE = entra tra 1→2→4→8→1, grande a schermo, una sola fonte (`entraTra` dell'app) · PLAY = GO ALL · STOP = annulla tutte le attese, tenuto 1 s = paracadute · REC = piano/registra · REW/FF liberi. Luci: PLAY lampeggia se c'è qualcosa armato, CYCLE acceso se entra tra > 1, REC acceso mentre registra, STOP col paracadute aperto. `riceve()` dentro `sicuro()` come l'X-Touch. PRIMA 5 righe a Valerio e aspettare l'ok.
2. Passo 4 · Passaggio a canali (THUMP che lancia scena di altro brano = passaggio col tempo di `passaBrano`; bug 7: l'effetto go ha bpm ma `eseguiCanali` lo ignora e `goLive` toglie i setcpm; gli altri CH armati nello stesso PLAY sulla stessa battuta; CH non toccati restano «vecchia»).
3. Passo 5 · X-Touch MANI (solo vista LIVE, solo col nano collegato): tasti 1-8 = FOCUS; manopole 1 SWEEP, 2 risonanza, 3 eco, 4 riverbero, 5 velocità, 6 sporco, 7 altezza, 8 volume generale; layer B = su tutto; paracadute dal nano. Senza nano: pagine A e B di oggi.
4. Nano vero (Valerio, volume 20%): manopola↔CUE con OUT a sinistra, R, S cuffia, M, PLAY, fader con aggancio. LED: serve l'Editor Korg (LED External, Momentary, un canale solo, Write Scene); il nano ignora i sysex; software pronto (`luciNano`).
5. Prima di un merge: togliere il blocco `CANALI` in `main.js`; il lanciatore sul Desktop punta a cutx-canali.

## File toccati (passi 1-2)
src/renderer/canali.js, mixer.js (nuovo), motore.js (`preparaEntra`/`applicaEntra`, `gruppo`, `riprendi`, `mixer`, `ch`), app.js (`preparaLive`/`finisciLive`, `eseguiCanali`, ripristino), cue.js (tasto NEXT), griglia.js, nano.js, stile.css, testi/it.json, src/main/prova.js (3c e fader), test/canali.test.js, test/nano.test.js.

## Provato e non funziona
- Controlli di prova con uscita a 1 ciclo: il livello viene pulito prima del controllo; usare `cicli: 2` o più.

## Note
- Il NEXT del BEAT è un tasto solo (scena scelta), non uno per pillola; CH vuoto senza scelta mostra «—» (Valerio ha approvato entrambi).
- Valerio ha cambiato il volume del Mac a 44 durante la sessione: lo rimetto sempre com'era a inizio prova.
- Le card dei livelli si provano nella vista «pila» (la prova la apre da sola). Dati del ramo separati («CUTX canali»). Backup stash in ~/Progetti/backup/cutx-stash-2026-11-19.
- Non toccare: main, blocco CANALI in main.js, file dello stash oltre a quello che scrive il menu del CH.
