# Prossimi passi (decisi il 2/11/2026)

Si parte da qui quando sono finiti il blocco 1 e il blocco 2 del SYNTH (vedi `docs/SYNTH.md`).

## Regola per tutto il lavoro

Tutte le parole dell'interfaccia (etichette, pulsanti, avvisi, nomi di moduli e funzioni) stanno in un unico file di testi (`src/renderer/testi/it.json`), così si possono rinominare quando si vuole, come i testi per il pubblico. Nomi brevi, puliti, stile Ableton; niente frasi da chatbot nei messaggi a schermo. Vale per le parti nuove (SYNTH compreso); le parole già esistenti si spostano lì in un momento tranquillo.

## Principio degli ASSIST

CUTX propone, io ascolto in cuffia, io decido. Mai cambi automatici nel live. Ogni proposta è un piccolo segnale sulla card (accetta/ignora con un tocco), mai sul proiettore. Tutti gli ASSIST sono un gruppo nelle impostazioni, disattivabili uno per uno.

## Dopo il blocco 2 del SYNTH, in quest'ordine

1. **SHOW** (Impostazioni, più spia «SHOW» nella barra in alto, verde fisso quando è accesa):
   - il Mac non va in stop e lo schermo non si spegne; notifiche zittite se possibile;
   - ⌘Q e chiusura della finestra chiedono conferma; impostazioni e modifica degli script bloccate;
   - controllo all'avvio: scheda audio, cuffia, controller in MC, stash (o copia), schermo del proiettore. Tutto verde o dice cosa manca.
2. **RECOVER**: lo stato del live (livelli, codice, code, volumi, BPM, brano attivo e prossimo, scena) si salva ogni pochi secondi. Dopo un crash o una chiusura per sbaglio, all'avvio: «recover set?» e riparte uguale, quantizzato.
3. **SIDECHAIN** e **DUCK**: verificare se superdough supporta il ducking tra orbite (`duckorbit` / `duckattack` / `duckdepth` o simili) e come. Ogni livello ha già la sua orbita: la cassa del BEAT abbassa le clip scelte a ogni colpo. Manopola SIDECHAIN in pagina B per livello, riga visibile nella coda, e un colpo DUCK da tenere premuto su tutto. Se superdough non lo fa, proporre come farlo nel motore.
4. **Transizioni pronte** per «passa al prossimo brano» (tasto 3 tenuto): **CUT** (il vecchio si ferma sull'1, il nuovo entra sull'1 dopo), **SWEEP** (il vecchio si chiude, il nuovo si apre, 4 o 8 cicli), **BREAKDOWN** (il vecchio alla sua scena break, riser, il nuovo droppa), **ECHO OUT** (il vecchio lanciato nell'eco). Tutte scritte in codice visibile, con il cambio di BPM fatto dentro la durata della transizione. Nel `set.cutx` si scrive la transizione di ogni passaggio (es. `brano_2.cutx · transizione sweep 8`); predefinita `sweep 8`.

## Poi pausa

Valerio suona per un paio di settimane.

## Dopo la pausa (ASSIST)

- **Tonalità**: `// @tonalita` nel brano; per le clip si deduce da scala/note. Se una clip è in un'altra tonalità: «Re min → La min?», preview in cuffia, accetta. Cambio visibile nel codice. Mai sulle batterie.
- **WARP**: porta a tempo le clip audio, con preview (dicendo che cambia l'altezza).
- **BASS CLASH**: due bassi insieme (dalla striscia viva): «abbasso il vecchio?».
- **AUTO GAIN**: una clip molto più forte delle altre entra al livello giusto (volume d'ingresso).

## Annotato il 14/11/2026 (fuori dalla beta 5, niente codice ancora)

- **DRUM a fette per i break**: nella scheda DRUM una versione che taglia un break in fette (`chop`/`slice`) e le mette sulla griglia. La versione base della griglia (un suono per riga) viene prima.
- **Tasto synth su ogni scena**: riaprire nel SYNTH qualsiasi clip o scena, modificando solo il pezzetto di note e lasciando intatto il resto. È il punto 4 di `docs/CHECKUP.md`: grosso, da fare a pezzi.
- **Serate come progetti** (decisioni di Valerio): il nome a schermo è **SERATA**; ogni serata ha il suo **kit**, che nasce come **copia del kit dell'ultima serata**; la riga **«viene da…»** (da quale serata è stata copiata) c'è. Il progetto è in `docs/CHECKUP.md` («serate come progetti»).
- **Volume dell'apertura**: il cursore c'è ma non si salva nel brano (deciso: niente cambio di formato).

## 5.1: scheda DRUM (piano approvato il 14/11/2026; passi 1-2 fatti il 15/11, mancano REC/tasti/scena beat)

Una griglia a passi per la batteria, stile FL Studio, come scheda a sé «DRUM» nella vista ⌘2 (accanto a «suono» e «note»), senza le manopole del synth.

- **Righe** = suoni scelti da un menu: campioni dello stash e suoni di Strudel (bd, sd, hh…). **16 passi** (anche 32), 1, 2 o 4 cicli.
- **Clic** accende e spegne il passo; **velocity** trascinando in verticale sul passo.
- **Scrive codice vero e leggibile**: una riga per suono dentro uno `stack(...)`, tipo `s("bd ~ ~ ~ bd ~ ~ ~ …").gain("1 …")`, e lo rilegge nei due versi come fa il pianoroll.
- Quello che non sa leggere (ritmi euclidei, `?`, break tagliati) **resta nel testo** con un avviso, mai cancellato; quella riga non si modifica dalla griglia.
- Riusa **prova in cuffia** (a tempo col live), **REC** e **→ CUE** (come clip o come scena del beat). Non tocca i motori del live.
- Se costa poco: i tasti del Mac suonano le righe e REC li registra a tempo.
- **Come si scrive**: la parte «griglia ↔ codice» è un modulo isolato con i suoi test puri (adatta a Codex); la vista e gli agganci a cuffia/REC/→ CUE a parte.
- Dopo: la versione **a fette** per i break (vedi sopra).

## 5.1: rossi noti delle prove automatiche (dalla beta 5) · RISOLTI il 15/11/2026

Solidita: il controllo dei suoni cancellava ogni avviso, ora solo il suo. Strudel: senza `CUTX_SUONI_PROVA` è «SALTATA» (si lancia con `scripts/prova-suoni-strudel.mjs`). Linguette e finestra: partono da uno stato noto (linguette vuote, uscita chiusa).

1. `solidita`: dopo un crash dell'interfaccia il testo del CUE viene ripreso ma la scritta «ho ripreso il testo del CUE» non si vede (c'era già a fine fase 2 del check-up).
2. `strudel`: vuole una cartella di suoni (`CUTX_SUONI_PROVA`) che nel giro completo non viene data.
3. `linguette`: fallisce in coda al giro lungo, passa lanciata da sola (stato lasciato da una prova precedente).
4. `finestra`: come sopra (la finestra del pubblico risulta già aperta).


## Mani, dopo la 5.1 (annotato il 15/11/2026)
- **Pinza = colpo tenuto (roll)**: pollice e indice che si chiudono tengono un colpo ripetuto finché restano chiusi.
- **Gesto del drop**: un gesto per far entrare il drop / la scena dopo.
- **Due mani**: una per il valore, l'altra per il modo o per un secondo effetto.
- **Braccialetto colorato**: riconoscere la mia mano dal colore di un braccialetto, per non confonderla con quelle degli altri.

## DRUM: cosa resta (15/11/2026)
Fatto: `drum-codice.js` (Codex, test puri), `drum-vista.js` + `drum.css` (terza scheda «drum» nella vista SYNTH: griglia, clic, velocity col trascinamento, menu suoni stash/Strudel, passi 16/32, cicli 1/2/4, codice nei due versi con righe illeggibili conservate, ▶ cuffia con testina, → CUE con `· drum`, annulla), `apri-clip.js` (il pulsante sulle card riapre le clip `// @drum`), prova `drum` (30 controlli) e foto in `~/Desktop/cutx-schermate/drum/`.
Da fare, in quest'ordine: (1) **REC e tasti del Mac**: i tasti suonano le righe (una riga per tasto, `drum-vista.js` → `tastoGiu`, oggi nel DRUM i tasti non suonano niente) e REC li registra a tempo come passi (guarda `synth-rec.js`); (2) **→ CUE come scena del beat** oltre che come clip (guarda come si scrivono le scene `@beat` in `brano.js`); (3) foto finale e prova «drum» nel giro lungo (già inclusa: `parti.includes('drum')`); (4) poi **blocco C controller** (mappa tasto per tasto da far approvare PRIMA di scrivere) e **D arpeggio** (solo valutazione).

## 5.2 (decisione del 15/11/2026: la 5.1 esce con quello che c'è)
- **DRUM, il resto**: REC e tasti del Mac nella griglia (una riga per tasto, REC li registra a tempo come passi: vedi `synth-rec.js`; oggi nel DRUM i tasti non suonano niente); **→ CUE come scena del beat** oltre che come clip (come si scrivono le scene `@beat` in `brano.js`); poi la versione «a fette» per i break (sopra).
- **Blocco C, controller X-Touch a ruoli** (prima la mappa tasto per tasto e luce per luce, da approvare): DRUM livello A = SEQUENCER (16 tasti come passi, luce che corre, manopola 1 = riga, 2 = suono, tieni passo + manopola = velocity, cambio pagina 32 passi), DRUM livello B = PAD, SYNTH livello B = PIANO; fader, master e paracadute sempre live; velocity fissa.
- **Blocco D, arpeggio** (solo valutazione, niente codice): cosa si può fare con codice Strudel vero, se le note tenute si arpeggiano dal vivo, dove sta nel pannello e sul controller, quanti giorni, 5.2 o dopo.
- **Prove**: una prova alla volta (vedi `scripts/prova-libera.mjs`); con due sessioni di lavoro, dati separati con `CUTX_PROVA_NOME=altro` (e `CUTX_PROVA_STASH` per uno stash di prova a parte), ma il volume del Mac resta uno solo.
