# MOVIOLA · la scatola nera delle prove

Serve a rivedere una prova: mentre suono scrive un registro, e dopo un comando mi dà la lista dei momenti storti.

## Registrare
1. Impostazioni → MOVIOLA → **on**. In barra compare «● MOVIOLA» (ambra).
2. Scegli il tasto SEGNA: sul controller («scegli il tasto» e lo premo; quel tasto non fa più il suo mestiere finché la MOVIOLA è accesa) e/o sulla tastiera (scorciatoia «MOVIOLA · segna»).
3. Avvio la registrazione dello schermo e **premo SEGNA subito**: il lampo ambra (cornice + «SEGNO n», mezzo secondo) è nel video e nel registro, e fa da ciak. Il lampo compare solo nella finestra di controllo, mai sul proiettore.
4. Suono. Premo SEGNA quando qualcosa va storto o ho un'idea, e lo dico a voce.
5. Spengo la MOVIOLA (o chiudo CUTX): il file è in `~/Library/Application Support/CUTX/prove/AAAA-MM-GG_HH-MM-SS.jsonl` («apri cartella MOVIOLA» nelle impostazioni).

Nel registro (una riga JSON per evento, ora al millisecondo): MIDI del controller, scorciatoie della tastiera, codice mandato ai motori (intero) e risposte con `ingressoMs`, errori e avvisi, guardiano, transizioni, master ogni secondo (picco e medio, anche in dB), stato del live (ritardi, giro massimo, ciclo, tempo), CPU per processo, segni. Scrive solo il processo principale, in modo asincrono: sul suono pesa zero (lo prova `--prova=moviola`). Le finestre mandano gli eventi a pacchetti, quindi nel file non sono sempre in ordine di tempo (l'analisi li riordina).

## Il video: da dove viene
Il video è la registrazione dello schermo del Mac: ⇧⌘5 → «Registra l'intero schermo» → in **Opzioni** scegli il microfono (così c'è la tua voce) → Registra. Premi SEGNA subito (il lampo ambra deve finire nel video), alla fine ferma con il tasto ⏹ nella barra dei menu. Il file `Registrazione schermo ….mov` compare di solito sulla Scrivania. Il registro invece è quello della MOVIOLA: `ultimo` lo prende da solo.

## Analizzare
Senza video: `analizza-prova ultimo` guarda solo il registro (niente voce né fotogrammi).
```
analizza-prova ultimo ~/Movies/prova.mov
analizza-prova registro.jsonl video.mov --srt prova.srt
```
- Legge il video con ffmpeg (i primi 5 minuti, `--scansiona MIN`) per trovare i lampi ambra: il primo SEGNO allinea registro e video da solo. Riserva: `--sposta SECONDI` = il secondo del video in cui ho premuto il primo SEGNA.
- La voce: usa `prova.srt` accanto al video, o `--srt`, o la fa con `trascrivi` (serve A002). `--senza-voce` la salta.
- Scrive `analisi-NOME/rapporto.html` (si apre da solo) e `rapporto.md` accanto al registro, con una cartella `frames/`.
- Il rapporto è diviso in **difetti** (errori, guardiano, risposte lente, giri in ritardo, o «non funziona» a voce), **inciampi** (silenzi, tentativi ripetuti, ingressi lenti, CPU alta, SEGNI senza altro, «boh», «riprovo») e **idee** («vorrei», «sarebbe bello», «perché non»). Ogni momento ha l'ora, il minuto del video, cosa dice il registro, cosa ho detto nei 10 secondi attorno e 1-2 fotogrammi.
- Niente AI: le regole e le soglie sono in `strumenti/analizza-prova-lib.mjs` (`SOGLIE`, `PAROLE`) e si cambiano lì. Il lampo si trova contando i pixel ambra: se il video è a bassa risoluzione o la finestra di CUTX è piccola, il lampo può non vedersi (allora `--sposta`).
