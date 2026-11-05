# DIREZIONE (5/11/2026)

Come lavorare su CUTX senza passaggi in mezzo. Va letto all'inizio di ogni sessione insieme a CLAUDE.md e .claude/ultimo.md.

## Ruoli

- **Opus** (con `/model opusplan`) fa il direttore: capisce cosa vuole Valerio, progetta, decide l'ordine, rivede il lavoro come farebbe un designer severo.
- **Sonnet** esegue: scrive il codice, lancia le prove, sistema.
- **Valerio** decide il gusto, i nomi e tutto quello che tocca la serata. Si interpella solo quando serve (vedi sotto).

## Quando fermarsi e chiedere a Valerio

1. Prima di scrivere codice: in poche righe cosa fai, cosa tocchi, cosa non tocchi. Poi aspetti l'ok. (Regola sua, sempre.)
2. Nomi nuovi visibili (pulsanti, funzioni, schermate): proponi 2-3 nomi, decide lui.
3. Tutto quello che cambia il comportamento dal vivo (controller, live, proiettore, transizioni, guardiano).
4. Cancellare file suoi, installare cose, toccare impostazioni del Mac.
5. Quando una prova a mano serve davvero (hardware, ascolto, «feeling»): gli dai una lista corta e numerata, niente segnaposto da riempire.

Tutto il resto lo decidi tu: dettagli tecnici, ordine interno, correzioni, prove automatiche.

## Come rivedere il lavoro (prima di dire «fatto»)

- Guarda la schermata vera, non solo il test. Se qualcosa è brutto, tagliato, disallineato o in inglese, sistemalo prima.
- Un valore scritto a mano dal codice vince sempre sul pannello. Niente valori standard aggiunti al codice.
- Niente frasi da chatbot sullo schermo, niente spiegazioni inutili, niente emoji.
- Verde #9FC23A solo per ciò che è live. Ambra per avvisi e «a mano». Font: Canaglia Stencil e Fragment Mono.
- Tutte le parole dell'interfaccia in `src/renderer/testi/it.json`.
- Nei brani niente commenti esplicativi da AI.
- Dati di prova sempre in una cartella separata, mai nelle preferenze vere.
- Mai toccare i progetti Ableton veri e i file suoi (es. brano_01_test).
- Licenza: logo, font e gatti © Michele Ciavarella (DCBstudio), usati con permesso; design interfaccia © Valerio Francini.

## Regole della serata (non si negoziano)

- Dal vivo niente AI e niente modello locale: CUTX deve avere tutta la RAM.
- Il live non salta mai: codice che sbaglia non entra, il guardiano limita, il paracadute c'è sempre.
- Le transizioni sono regole fisse e sempre a tempo, come un CDJ, non AI.
- Gli ASSIST propongono in cuffia, Valerio decide. Mai cambi automatici nel live.

## Ordine dei lavori (aggiornato)

1. **Transizioni CDJ** (in CUTX): «passa al prossimo brano» più un bottone di emergenza «transizione». BPM allineati, entrata sull'1 della frase, **scambio dei bassi** (il sub vecchio esce quando entra il nuovo), poi CUT / SWEEP / BREAKDOWN / ECHO OUT. Scritte in codice visibile. Vedi PROSSIMI.md punto 4.
2. **SHOW** e **RECOVER** (PROSSIMI.md punti 1-2), più dalle revisioni esterne:
   - prova senza wifi: campioni in locale;
   - guardiano: passa-alto 30 Hz sul master, tetti a delayfeedback (0.95) e a fast/ply/segment eccessivi;
   - fader con aggancio (niente salti);
   - paracadute tenuto 0,5 s e nella tonalità del brano.
3. **SIDECHAIN / DUCK** (PROSSIMI.md punto 3). È il preferito di Valerio.
4. **Estensioni**: sistema piccolo e sicuro, file `.cutxext`, si installano trascinandoli su CUTX o da Impostazioni → Estensioni. Non stanno nel pacchetto né su GitHub. Possono solo: aggiungere un pannello, leggere un file audio o il microfono, proporre note e cambi di manopole in cuffia. In SHOW si spengono.
   - **ORECCHIO**: file audio o voce → note nel pianoroll, con Basic Pitch (locale).
   - **COMPLICE** (nome da confermare): Valerio dice a parole come cambiare il suono, il modello locale in LM Studio propone solo cambi di manopole nei limiti del SYNTH, in cuffia. Si basa su una tabella parole → manopole scritta insieme e sui suoi brani come esempi.
5. **SYNTH**: MOD, ARP/CAOS, tastiera MIDI (Arturia MiniLab 3), suoni salvati.
6. **Proiettore**: commenti `//` come sottotitoli, colore diverso per codice preparato e scritto a mano, lampo sulla modifica, conto alla rovescia prima del drop.
7. Pausa: Valerio suona un paio di settimane. Poi ASSIST (PROSSIMI.md).

Più avanti: Pocket Operator come livello «PO», campionamento dal vivo (PO-33, piezo), registrazione della serata, stampa del codice su scontrino, gamepad (volante con pedaliera).

## Risparmio

- Una cosa per sessione. A fine passo il riassunto in .claude/ultimo.md, poi Valerio fa /clear.
- Prove: solo la parte toccata, in silenzioso (`npm run prova:parte -- …`). La sequenza completa solo prima di una release.
- Cerca con grep prima di leggere file interi. STATO.md non si legge intero.
