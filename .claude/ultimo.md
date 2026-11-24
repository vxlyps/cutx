# Ultimo stato - 24/11/2026 (LAVORARE IN ~/Progetti/cutx-canali, ramo `canali`; main = beta 4 intatta, non si tocca)


## LISTA DELLA TIRATA (mandato completo in docs/CANALI-TIRATA.md: leggerlo dopo una compattazione). Spuntare a ogni lavoro.
- [x] 0 · bug del 4.1 corretto (pezzoBrano ora è pura; il blocco sta in preparaLive con `senzaCanale`)
- [x] 1 · ritocchi al 4.1 FATTO (test puri 47 canali; prova entrata 51 ok con 11 controlli nuovi nel blocco «7. clip senza tipo»)
- [x] 2 · S tenuto + TRACK sicuro FATTO (chiave per fonte nano/schermo; lasciaTutteS se il nano si ricollega; guardiaTrack 2 s; test puri 58 canali+nano; nessuna prova audio dedicata)
- [x] 3 · un volume solo FATTO (slider card = volume CH con «CHn» sotto; cuffia: guadagno-prova nel motore cuffia, M non la tocca; prova entrata+livelli 87 ok; slider griglia e pillole scena ridisegnati su richiesta di Valerio)
- [x] 4 · X-Touch MANI FATTO (controller-mani.js; 13 test puri; provato nell'app dalla serata: FOCUS, SWEEP, eredità riga al cambio clip)
- [x] 5 · serata finta FATTA (`npm run prova:parte -- serata`: 28 ok, passata 2 volte di fila; sentinella: click del beat tutti sentiti, nessuno fuori tempo; i «mancati» sono le clip silenziose)
- [x] 6 · revisione indipendente FATTA due volte (8 problemi veri sistemati; la seconda sulle correzioni: nessun grave, 2 minori sistemati)
- [x] 7 · chiusura FATTA: npm test 571/572 (resta il MOD noto), prova completa 351 ok 0 falliti (con la serata), build ok, docs/CANALI.md, docs/NOVITA-CANALI.md. NIENTE merge, NIENTE release.
**ORDINE DI VALERIO (24/11, a metà tirata): ALLA FINE DI TUTTO IL VOLUME DEL MAC VA A 100** (`osascript -e 'set volume output volume 100'`), non «com'era». Durante le prove: 20%.
Scostamenti dalla specifica da riportare a Valerio (vedi rapporto finale):
- Eredità delle righe: il motore non sa da dove viene una riga, quindi si ereditano solo quelle MANI tenute dall'app (non quelle delle vecchie manopole beta 4).
- Layer B = righe globali con chiave `mani:…` (non righe sui livelli).
- Sentinella nella serata: si misurano solo i click del beat (le altre clip sono silenziose).
- Slider di apertura e scratch: restano quelli d'ingresso di prima (la spec parla solo di clip con CH e BEAT).
- ⌘↵ nel CUE è la CUFFIA (invio() → provaInCuffia), quindi resta permesso su clip senza tipo; bloccati go live e ⇧⌘↵ (e PLAY non li riguarda: le clip dei CH hanno già un tipo). Selezione di righe persa quando il menu ridisegna le card: entra tutta la clip. (aggiungere qui)

## 5 righe
1. FATTO Passo 4.1 · canali fissi: mappa `canali.json` unica nella radice dello stash (la prima volta parte da quella del PROJ aperto; i vecchi non si toccano né si leggono); «CHn NOME» ovunque, tipi sotto il nome nella griglia; clip senza tipo = in nessun CH, gruppo ambra «DA ASSEGNARE» in cima al CUE; nuovo tipo `stray` per il CH8 (scratch e jam come prima).
2. Funziona (test): canali 45 + stash 1 nuovo; `npm test` 549/550 (resta il MOD noto), `vite build` ok. NON provato a mano nell'app né col nano.
3. Comportamento da confermare con Valerio: cuffia/go live/⌘↵/⇧⌘↵ su clip senza tipo → apre il menu CH con avviso; scelto il CH la clip va in NEXT di quel CH (NON parte da sola: poi R/PLAY). Se voleva che parta subito, va cambiato.
4. File toccati: stash.js, app.js (ripristinaCanali scrive le predefinite), canali.js, categorie.js, cue.js, griglia.js, stile.css, testi/it.json, test/canali.test.js, test/canali-stash.test.js (nuovo).
5. PROSSIMO: Passo 4.2 · un volume solo (slider card = volume del CH; cuffia dopo il fader con guadagno di prova nel motore cuffia; M non zittisce la cuffia; scritta del CH sotto ogni slider). 5 righe a Valerio e ok prima di scrivere. Poi passo 5 X-Touch MANI.

## Il modello (non si discute)
- NANO = la regia: gira = scegli NEXT · R = fai · PLAY = fai tutto insieme · STOP = annulla. X-TOUCH = le mani (come suona il CH in FOCUS, righe di codice visibili; SYNTH e DRUM invariati). TASTIERA = la penna. Senza nano CUTX si comporta come la beta 4.
- Nomi: THUMP·PURR·GROWL·HOWL·FUR·CLAW·HISS·STRAY (CH1-8). Niente colori nei canali: verde marcio = suona, bianco/grigi, scritte.

## STORICO · bug del 23/11 (1 = spiegato e risolto col 4.1; 2 e 3 → passo 4.1/4.2 decisi da Valerio il 24/11)
Provando col nano vero (passi 1-4 funzionano «live»), due problemi:
0. INDAGINE 23/11 (sessione 2, nessun codice toccato): ipotesi (c) e (d) ESCLUSE (menu CH → modello → `alternative` giusto anche riscritto su file; `aggiornaCanali` rilegge il modello a ogni giro; `pezzoAlt` passa `ch: e.ch`). Ipotesi (b) CONFERMATA dal codice: CH2 vuoto e senza scelta → R dà solo l'avviso «niente da fare per PURR» (`premiR`/`azioneR`, canali.js ~285). Resta da spiegare «finiva in STRAY» (serve sapere COME l'ha lanciata: R del nano, tasto live della card, o jam/scratch). Proposta a Valerio: CH vuoto con UNA sola clip → quella clip è il NEXT di default.
1. Una melodia finiva in STRAY. Cambiato il canale dal menu CH della card nel CUE (a PURR/CH2), ma col CH2 del nano non partiva niente e partiva solo col CH4 (HOWL, il tipo suggerito). Verificato: la catena pura `conTipo → alternative` è giusta (keys/arp → CH2, lead → CH4, nessun tipo → CH8). Ipotesi da controllare: (a) clip nello scratch = nessun tipo = STRAY; (b) il nano parte solo se prima giri la manopola del CH (guardare non arma, CH vuoto senza scelta mostra «—»); (c) `cue.modifica` aggiorna il modello ma la griglia/`impostaBrano` non lo rilegge, o la scelta (`scelte`) resta sul vecchio CH; (d) il tipo scritto nel menu non arriva a `pezzoBrano` (card) ma solo a `pezzoAlt`. Va riprodotto nell'app, non a occhio.
2. Il fader di un CH cambia solo il volume nella vista LIVE, non nel CUE. È voluto (cuffia pre-fader, deciso nel passo 2): Valerio si aspetta invece che i due siano collegati. DECISIONE DA PRENDERE con lui: la cuffia resta pre-fader o segue il fader (e come, per non rompere il preascolto).
3. Valerio vuole che CH1…CH8 del nano siano «inamovibili»: quel CH è quel CH, sempre. Capire cosa lo rende ancora mobile (tipo cambiabile, STRAY che prende «qualsiasi clip», suggerimenti).
Valerio non sapeva cosa fosse THUMP: è il CH1 (batteria e @beat). Nomi CH1-8: THUMP·PURR·GROWL·HOWL·FUR·CLAW·HISS·STRAY. Spiegargli la mappa dei canali (tipo → CH) in modo semplice, magari con una tabella a schermo.

## Fatto
- Passo 4 (23/11) · passaggio a canali: `preparaLive` riconosce il beat di un altro brano mentre un beat suona (`passaggioDelBeat`, solo se non da CUE) e manda rampa o salto (`P.parametriPassaggio`, puro), dissolvenza filtro/hp e transizione col `tieni` = tutti gli altri CH (non escono da soli). `finisciLive` imposta `passaggio` (controllaPassaggio promuove il brano); R-ANNULLA del CH beat azzera `passaggio`. Bug 7 chiuso (il tempo non dipende più dall'effetto go). `passaBrano` intatto. Test 546/547 (MOD noto) + prova `entrata` 38 ok (5 nuovi: passaggio in gruppo e STOP). NON provato: la catena app (R/PLAY su THUMP con due brani veri) a mano.
- Passo 3.1 (23/11) · STOP nel motore: messaggio `annulla-attese` (motore.js `annullaAttese`, puro in `attese.js`: `scegliAttese`, `togliRampa`). Annulla solo entrate non entrate e uscite/sfumate non partite (soglia = max(ciclo adesso, rip.fine)); una transizione partita va avanti. `annullaIngresso` ora toglie anche la rampa (`l.rampa` = gradini + cambi che aveva cancellato, che tornano). `stopNano` manda quel messaggio, azzera `passaggio`, aggiorna i CH. Test 545/546 (MOD noto) + prova `entrata` 33 ok (4 nuovi STOP), volume rimesso a 69.
- Passo 3 (23/11) · trasporto del nano: TRACK◀▶ (`cueBranoVerso`, fuoco restituito all'editor), SET (cambiaLinguetta), MARKER (muoviScena), CYCLE 1→2→4→8 con scritta grande `#grande-nano`, STOP breve = `stopNano` (annullaTutte + sweep dei livelli in attesa + passaggio), STOP 1 s = paracadute, REC = REC del SYNTH (in LIVE avviso), REW/FF liberi; luci CYCLE/REC/STOP. Test 540/541 (resta il MOD noto). Prova a mano e prova audio NON fatte.
- Ritocchi al passo 2 (23/11): aggancio del fader solo se il CH suona o ha un'attesa (CH vuoto = comanda subito); `chDelLivello(config, l)` in canali.js è l'unica regola STRAY, usata da app.js (pila, ripristino, modifica dalla pila). Test 47/47 (canali+nano). Prova automatica `fader` in prova.js NON rilanciata: può assumere il fader sganciato a CH vuoto.
- Passo 1: R esegue NEXT (GO/OUT/ANNULLA/LIVE/«—»). NEXT di default = ciò che suona; OUT = prima zona manopola e primo chip (`scegliAlt(i,k)`, k=0 OUT); scelte per brano; guardare non arma (tolto `cue.suAttiva`); tasto NEXT su ogni card (e uno nella testa del BEAT per la scena scelta). Motore: `togli` con `cicli`, `riprendi` (ANNULLA di un OUT), `gruppo` (PLAY: un solo ciclo d'arrivo); `goLive` diviso in `preparaLive`/`finisciLive`.
- Passo 1.1: la scelta eseguita si cancella in `sincronizza`; `tieniBrani` cancella le scelte dei brani fuori dalle due linguette del CUE.
- Passo 2: `mixer.js`; il motore live tiene `mixer[8]` (volume, pos, muto), messaggio `ch`, guadagno = clip × CH × break; cuffia pre-fader (non riceve mai `ch`); mixer nella fotografia di `ripristinaLive` e rimandato a ogni live rinato; `riprendi()` lo rilegge. StatoCanali: aggancio fader ±3% o passaggio sopra, `sliderSchermo`, `sganciaTutti` (avvio, slider, ripristino, nano ricollegato, PROJ), avvisi MUTE / fader a zero / clip muta; tacca del valore vero in griglia. Fader 8 = CH8 STRAY.
- Prove: test 534/535 (resta il MOD noto in `controller-synth`); entrata 29 ok, livelli+robustezza 44 ok, 5 parti insieme 115 ok. Una volta su prova combinata robustezza «click 0/0», non ripetuta (guasti sparsi noti).

## Da fare (in ordine)
1. (FATTO, vedi sopra, da provare col nano vero) PASSO 3 · Trasporto del nano (nano.js, app.js). CC di fabbrica: TRACK◀ 58 ▶ 59 · CYCLE 46 · SET 60 · MARKER◀ 61 ▶ 62 · REW 43 · FF 44 · STOP 42 · PLAY 41 · REC 45. TRACK = brano prec./succ. del set nella linguetta PROSSIMO (come `cueBrano` dell'X-Touch) · SET = il CUE passa tra brano che suona e prossimo · MARKER = scena del beat indietro/avanti a fine frase (`muoviScena`) · CYCLE = entra tra 1→2→4→8→1, grande a schermo, una sola fonte (`entraTra` dell'app) · PLAY = GO ALL · STOP = annulla tutte le attese, tenuto 1 s = paracadute · REC = piano/registra · REW/FF liberi. Luci: PLAY lampeggia se c'è qualcosa armato, CYCLE acceso se entra tra > 1, REC acceso mentre registra, STOP col paracadute aperto. `riceve()` dentro `sicuro()` come l'X-Touch. PRIMA 5 righe a Valerio e aspettare l'ok.
2. (FATTO) Passo 4 · Passaggio a canali (THUMP che lancia scena di altro brano = passaggio col tempo di `passaBrano`; bug 7: l'effetto go ha bpm ma `eseguiCanali` lo ignora e `goLive` toglie i setcpm; gli altri CH armati nello stesso PLAY sulla stessa battuta; CH non toccati restano «vecchia»).
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
