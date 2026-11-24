# CUTX CANALI · ULTIMA TIRATA (mandato di Valerio, 24/11/2026, copiato com'è)

Lavori in ~/Progetti/cutx-canali, ramo `canali`. main = beta 4, non si tocca. Leggi CLAUDE.md, docs/DIREZIONE.md, .claude/ultimo.md.

## Mandato di Valerio
Tutte le decisioni sono prese e stanno qui sotto. Per questa tirata NON serve il mio ok passo per passo: lavori da solo, in ordine, fino alla fine. A ogni lavoro: commit, push, aggiorni .claude/ultimo.md (così una compattazione del contesto non perde niente) e vai avanti.
Ti fermi e mi scrivi SOLO se:
- serve una decisione che cambia il comportamento dal vivo e qui non c'è;
- un test o una prova fallisce e non lo sistemi in 2 tentativi;
- la prova di robustezza fallisce due volte di fila (una volta sola può essere un guasto sparso noto: rilanciala);
- dovresti toccare main, il blocco CANALI di main.js, lo stash vero di Valerio.

## Come lavori
- Prima di ogni lavoro leggi il codice che tocchi. Puoi mandare subagenti (Agent/Task) in parallelo SOLO A LEGGERE e riassumere. Il codice lo scrivi tu nel contesto principale: mai due agenti sugli stessi file.
- Motore, tempo, guardiano: li scrivi tu, mai Codex. Codex solo per lavori isolati senza audio, secondo le regole di CLAUDE.md.
- Ogni lavoro ha i suoi test puri. Prove audio sempre: leggi il volume del Mac, 20%, master del live a zero, a fine prova rimetti il volume com'era (anche se fallisce). Dati di prova sempre separati, stash di prova ~/Progetti/cutx-stash-test.
- Parole dell'interfaccia in it.json. Verde solo per ciò che è live, ambra per avvisi.
- Tieni una lista dei compiti (task list) con i lavori qui sotto e spuntala.

## Il modello (non si discute)
- NANO = cosa suona. Manopola = sceglie NEXT (a sinistra OUT, poi le clip del CH nell'ordine del file). R = esegue NEXT (GO / OUT / ANNULLA / LIVE / —), tenuto 1 s = fuori subito. S = cuffia (vedi lavoro 2). M = muto del CH. Fader = volume del CH, con aggancio solo se il CH suona o aspetta. PLAY = tutto quello che è armato, sullo stesso ciclo. STOP = annulla ciò che non è cominciato, tenuto 1 s = paracadute. TRACK = brano prima/dopo in PROSSIMO. SET = linguetta del CUE. MARKER = scena del beat. CYCLE = entra tra. REC = REC del SYNTH.
- X-TOUCH = come suona (lavoro 4). TASTIERA = la penna: apertura, scratch e jam vanno in CH8.
- Canali fissi: una mappa sola nello stash, «CHn NOME» sempre in vista. Una clip sta in UN CH, quello del suo tipo. Senza tipo = DA ASSEGNARE, non entra live finché non ha un canale. CH8 STRAY = scratch, jam, kit, tipo `stray`, impila. In THUMP una cosa sola (beat o clip drum).
- Quello che non tocchi non cambia. Guardare non arma.
- Senza nano collegato CUTX si comporta come la beta 4.

## Lavori, in ordine

### 1 · Ritocchi al 4.1 (cue.js, app.js, test)
1. Una clip senza tipo si può ascoltare in cuffia. Bloccati restano solo go live, ⌘↵, ⇧⌘↵.
2. Il menu del CH si comporta in base a chi l'ha aperto. Da un gesto di lancio (go live, ⌘↵, ⇧⌘↵): scrive il tipo e la clip entra in quel CH a «entra tra», senza R. Dal tasto «CHn ▾» della card: scrive il tipo e basta, niente NEXT, niente suono.
3. Tasto «USA I SUGGERITI» in testa al gruppo DA ASSEGNARE: dà il tipo suggerito (suggerisciTipo) a ogni clip senza tipo che ne ha uno, in un solo passo di ⌘Z, senza armare niente.
Finito quando: test per ognuno dei 3 punti, prova entrata ok.

### 2 · S tenuto e TRACK sicuro (nano.js, canali.js, griglia.js, app.js, test)
1. S del nano: premuto = cuffia sul NEXT di quel CH, rilasciato = smette. Mentre è premuto, girando la manopola la cuffia segue NEXT. Si ferma solo la cuffia che quell'S ha acceso (non un preascolto partito dalla card). Due S tenuti: vince l'ultimo, lasciare il primo non spegne il secondo. Luce di S accesa finché lo tieni.
2. Il tasto CUE della griglia a schermo fa lo stesso: tieni il clic = senti, lasci = smette. Il tasto cuffia delle card resta com'è (acceso/spento), per ascoltare a lungo mentre scrivi.
3. TRACK con il PROSSIMO che ha modifiche non salvate: non apre, avviso «PROSSIMO ha modifiche: ripremi TRACK per buttarle». Ripremuto entro 2 s apre.
Finito quando: test puri su S (premi/rilascia, manopola che segue, due S, cuffia partita dalla card non toccata) e su TRACK.

### 3 · Un volume solo (cue.js, app.js, motore.js, test)
1. Lo slider volume della card di una clip con CH È il volume del CH: fader del nano, slider della griglia e slider della card sono la stessa cosa. Muovere uno slider a schermo sgancia il fader fisico, come oggi. Lo slider della card BEAT = THUMP. Le card DA ASSEGNARE non hanno lo slider. Lo slider non scrive più niente nel file.
2. Il volume proprio della clip resta solo nella sua riga (`· volume 0.8`), scritto a mano, e si applica come ora (clip × CH).
3. Cuffia dopo il fader: preascolto (S, tasto cuffia della card) a volume clip × volume CH, e segue il fader mentre lo muovi. M non zittisce la cuffia. Un guadagno della prova nel motore cuffia, separato dal volume generale della cuffia.
4. Sotto lo slider della card la scritta «CHn» del canale che muove.
Finito quando: test (fader → slider della card e guadagno in cuffia; M non tocca la cuffia; riga della clip invariata), prove livelli, entrata, robustezza.

### 4 · X-Touch MANI (controller.js, controller-mappa.js, app.js, test)
Solo nella vista LIVE e solo se il nano è stato visto in questa sessione. Se il nano si stacca, MANI resta fino alla chiusura (niente cambi di pagina per un cavo che balla). Senza nano: pagine A e B della beta 4. SYNTH e DRUM invariati.
Riusa la pagina B di oggi (parametri, scatti, righe di coda, anelli): cambia solo il bersaglio, che diventa i livelli del CH in FOCUS.
- Tasti in alto 1–8 = FOCUS sul CH1–8, luce accesa sul FOCUS. Parte da CH1. FOCUS grande a schermo. Non segue il nano da solo.
- Manopole sul CH in FOCUS, scritte come righe di coda visibili: 1 SWEEP (sweep() di canali.js: a sinistra passa-basso, a destra passa-alto, al centro la riga sparisce; anello bipolare), 2 risonanza, 3 eco, 4 riverbero, 5 velocità a scatti, 6 sporco, 7 altezza. Spinta = la riga esce. Anelli = valori veri. Sullo schermo la scritta di cosa tocchi («CH3 GROWL · SWEEP 800 Hz»).
- Manopola 8 = volume generale. Layer B = le stesse manopole su tutto (righe globali). Fila in basso = colpi, fader = effetto globale: come oggi.
- CH in FOCUS vuoto: le manopole non fanno niente, a schermo «CHn vuoto».
- STRAY: la riga va su tutti i livelli del CH8.
- Le righe messe dalle manopole sono del CH: la clip che entra nel CH le eredita (stessa chiave = vince quella della manopola). Se il motore sa da dove viene una riga, eredita solo quelle delle manopole; altrimenti quelle con le chiavi di MANI.
- Paracadute: con MANI attivo sta solo sul nano (STOP tenuto).
Finito quando: test puri del ruolo (eventi finti X-Touch → righe di coda sul CH giusto, eredità al cambio clip, FOCUS vuoto, cavo del nano che si stacca), prove livelli e robustezza.

### 5 · Serata finta automatica (src/main/prova.js, nuova parte «serata»)
Con lo stash di prova e il volume al 20%, uno scenario da capo a fondo con eventi finti di nano e X-Touch:
A (170 bpm), B (174, rampa), C (140, salto), clip tutte con tipo più una senza.
TRACK su A → manopola THUMP su una scena, R → entra. GROWL e PURR armati, PLAY → stesso ciclo. Fader CH3 giù → guadagno giusto. S tenuto su CH2 → cuffia, lasciato → zitto. FOCUS 3 + SWEEP → riga di coda, cambio clip in CH3 → riga ereditata. TRACK su B, THUMP su B, GROWL su B, PURR su OUT, CYCLE a 4, PLAY → tutto sullo stesso ciclo, rampa del tempo. STOP prima del confine → non entra niente e niente rampa. Rifai e lascialo entrare, poi passaggio a C con salto. ⌘↵ su clip senza tipo → menu. STOP tenuto → paracadute.
La sentinella non deve perdere click. Finito quando la parte «serata» passa due volte di fila.

### 6 · Revisione indipendente
Manda un subagente revisore che NON ha scritto il codice. Gli dai: questa specifica, il diff da f8cc7aa a HEAD, i test. Deve cercare scostamenti dalla specifica e bug dal vivo (scenari concreti), non stile. Sistemi i problemi veri, poi una seconda revisione solo sulle correzioni.

### 7 · Chiusura
- npm test (resta solo il MOD noto), npm run prova completa, build.
- docs/CANALI.md: UNA pagina da stampare con la mappa del nano (strip e trasporto), dell'X-Touch MANI, la tabella dei canali (CHn NOME → tipi), le 5 regole del modello. Parole semplici.
- .claude/ultimo.md aggiornato, bozza di NOVITA.
- NON fare merge, NON fare release.

## Rapporto finale (a me, corto)
1. Cosa è fatto, lavoro per lavoro (una riga ciascuno, con commit).
2. Numeri: test, prove, serata finta.
3. Cosa ha trovato la revisione e cosa hai sistemato.
4. Scostamenti dalla specifica, se ce ne sono, e perché.
5. Le prove a mano per me col nano e l'X-Touch veri, massimo 10, numerate, volume al 20%.
