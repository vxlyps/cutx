# CIMICE · DISPETTI (piano, nessun codice ancora)

La cimice resta solo sul proiettore. I dispetti sono modifiche VERE al suono: succedono nel live, si vedono nella card del tuo schermo e nel codice proiettato. Interruttore a parte, spento di serie.

## Idea chiave: si usa la CODA, non si riscrive il codice
CUTX ha già un modo sicuro di modificare un livello vivo: la **coda** (`coda.js`, messaggio `{ tipo: 'coda', livello, imposta: ['.lpf(900)'], pulisci, togli }`). Il codice del livello non si legge e non si riscrive mai: le righe di coda stanno sotto e sovrascrivono i parametri (l'ultimo vince). Se una riga non compila, il motore tiene il pattern di prima. Si vede già sulla card e sul proiettore, e ha già il suo annulla (`cronologia`, come `aggiungiCoda`). Un dispetto = una riga di coda con un'etichetta «dispetto».

## Chi fa cosa
- **Proiettore (cimice):** propone soltanto: «tocco una nota del livello L». Non modifica niente. Manda un messaggio `dispetto?` all'interfaccia (la porta c'è già, ma oggi va solo in un verso: si aggiunge la risposta in arrivo).
- **Interfaccia di lavoro (nuovo `src/cimice/dispetti.js` + poche righe in `app.js`):** decide ed esegue. Tutte le regole stanno qui: interruttore, un dispetto alla volta, limiti, controllo di validità, cronologia, ritorno, stop.
- Risponde al proiettore `dispetto-attivo` (la cimice si colora di rosso e la riga di coda si vede in ruggine anche lì).

## Regole
1. Parte solo se: interruttore acceso, cimice in giro, un'antenna tocca una nota che suona, nessun altro dispetto attivo, pausa minima passata, live vivo, nessun paracadute o transizione in corso.
2. Si applica al livello toccato, ma mai: al livello che sto modificando (card in modifica), al jam, a un livello muto, in entrata o in uscita. Il testo del codice non si tocca mai, quindi non c'è nessuna riga con il cursore da evitare.
3. Valori: dalla tabella dei dispetti, con limiti fissi. Dove nel codice c'è già un numero (`.lpf(380)`) si parte da quello; altrimenti da un valore fisso. Mai sopra il volume che il livello ha già (`.gain` solo verso il basso).
4. **Controllo prima**: la riga passa da `leggiVoce` (forma valida) e da una prova a vuoto su una copia del pattern già valutato (`coda.applica` + una query di un ciclo). Se dà errore: non si applica, resta una riga nella MOVIOLA.
5. Il ritorno: dopo 1–4 battute (a scelta nelle impostazioni, a caso nel mezzo) si rimette la coda com'era, sul cambio battuta.
6. **Tienilo**: un tasto (tastiera, X-Touch) tiene il dispetto attivo (non torna più, diventa una riga di coda normale).
7. **Stop**: il paracadute (⌘P due volte, X-Touch tasto 8 tenuto) e un tasto dedicato annullano subito tutti i dispetti; il paracadute li toglie prima di partire.
8. Il guardiano: niente dispetti nuovi se il limiter sta già riducendo (soglia da decidere, es. 3 dB) o se il motore è carico; se succede mentre sono attivi, si annullano.
9. Ogni dispetto ha la sua voce in `cronologia` («dispetto: filtro su «basso»») e ⌘Z lo annulla.
10. Nella card, la riga di coda del dispetto è in **ruggine** finché è attiva.

## Impostazioni (sezione CIMICE)
Dispetti: sì/no (no di serie) · quanto spesso: di rado / ogni tanto / spesso (probabilità per battuta e pausa minima ≥ 4 battute) · quanto restano: da 1 a 4 battute (min–max).

## I dispetti proposti (sempre validi, limiti sicuri)
| Nome | Riga di coda | Limite |
|---|---|---|
| filtro che si chiude | `.lpf(N)` | N tra 400 e 2500, mai sotto 400 |
| acido | `.lpf(N).lpq(Q)` | Q ≤ 10 |
| eco | `.delay(.35).delaytime(.375).delayfeedback(.45)` | delay ≤ .5, feedback ≤ .55 |
| stanza | `.room(.5).roomsize(4)` | room ≤ .6 |
| sporco | `.crush(8)` | mai sotto 6 |
| note rotte | `.degradeBy(.3)` | 0.2–0.4 (toglie note, mai più forte) |
| buco | `.mask("1 1 0 1")` | silenzi brevi |
| fuori tempo | `.late(.125)` | tra -1/8 e +1/8 di ciclo |
| doppio | `.ply(2)` | solo ×2 |
| tremolo | `.gain(sine.range(.5, G).fast(4))` | G = il volume di prima, mai di più |
| ottava | `.transpose(12)` o `.transpose(-12)` | solo ±12 |
| al contrario | `.rev()` | — |

Non propongo: nessun aumento di volume, risonanze o feedback alti, `.hpf` stretti (spengono il basso), `.speed`, cambi di campione.

## Fuori dalla prima versione (decidi tu)
Cambiare una cifra dentro la mini-notazione (`"bd*4"` → `"bd*3"`) vorrebbe dire **riscrivere il testo** del livello: va contro la regola di CUTX «il codice del livello non si riscrive mai», e servirebbe un giro di valutazione tutto suo e il rispetto del cursore. Si può fare come secondo passo, con una lista chiusa di cifre. I «piccoli cambi di nota» della prima versione si ottengono con la coda (`degradeBy`, `ply`, `late`, `transpose`).

## Come lo costruisco (passi)
1. `src/cimice/dispetti.js` puro (tabella, limiti, scelta, scadenze, stato) + test.
2. Impostazioni «dispetti» e preferenze; porta proiettore→interfaccia.
3. Collegamento in `app.js`: esecuzione via `live.manda({ tipo: 'coda', origine: 'dispetto' })`, cronologia, ritorno sul cambio battuta, stop dal paracadute, tasti.
4. Ruggine sulle righe di coda (card e proiettore).
5. Prova nell'app vera (master a zero): partenza, controllo di validità, ritorno, stop, testo invariato.

## Da decidere
- Va bene fare la prima versione solo con la coda (niente testo riscritto)?
- Tasti: «ferma i dispetti» e «tienilo» da tastiera (propongo ⌥⌘X e ⌥⌘K, da controllare che siano liberi) e sui tasti dell'X-Touch (prima si fa la mappa tasto per tasto).
- Soglia del limiter per non partire (propongo 3 dB).
