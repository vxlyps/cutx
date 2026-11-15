# CIMICE · FINALE «HACK» (fatto: decisioni di Valerio incluse)

**Decisioni:** tasti ⌥⌘⇧H due volte (⌥⌘H è «Nascondi altre app» su Mac) o il bottone HACK nella barra del LIVE (due clic); ultima immagine = schermo nero con SOLO «TECNOLOGIA CANAGLIA»; il codice «mangiato» è un disegno sopra, visibile anche nel proprio editor (CUE e card), e alla fine o col paracadute l'editor è com'era. Niente X-Touch. Codice: `src/cimice/hack.js` (curva, pura), `hack-app.js` (esecuzione), `mangia.js` (disegno del codice mangiato), `aggancio.js` (cimici in più sul proiettore), `uscita.css` (`body.hack-nero`). Prova: `npm run prova:parte -- cimice` (parte HACK, con master a zero).

---

Il modo in cui si chiude il live set: la cimice si prende il codice e obbliga a chiudere. Tutto succede solo in memoria: i file `.cutx` non si toccano mai.

## Come parte (niente X-Touch)
- Un **bottone nell'interfaccia** (nella barra del LIVE, piccolo, «HACK», con doppio clic di conferma) **e** una combinazione da tastiera (propongo ⌥⌘H premuto due volte di fila, come il paracadute; da controllare che sia libero). Nessun tasto dell'X-Touch.
- Durata nelle impostazioni (sezione CIMICE): 1–3 minuti, di serie 2. Tutta la curva sotto si scala sulla durata.
- All'avvio si fa una **fotografia** dello stato (livelli, code, volumi, tempo): serve per tornare com'era. Si usa lo stesso meccanismo con cui l'interfaccia già sa «cosa c'era live».

## La curva (durata 2 minuti; percentuali valide per qualunque durata)
| Tempo | Cosa succede | Dispetti (ogni…) | Cimici sul proiettore |
|---|---|---|---|
| 0:00–0:12 (0–10%) | Il brano suona identico. La cimice entra e cammina, firma compresa. Nessun dispetto. | – | 1 |
| 0:12–0:36 (10–30%) | Primi dispetti: quelli di sempre (0.5–2 s), uno alla volta, ogni 2 battute. | 2 battute | 1 |
| 0:36–1:06 (30–55%) | Sovrapposti: fino a 3 insieme, su tutti i livelli. Durano fino a 4 s. Il codice comincia a essere «mangiato»: parole che si corrompono e righe che si accorciano, in card e sul proiettore. | 1 battuta | 2 → 3 |
| 1:06–1:36 (55–80%) | Il bordello a tempo: scatti, balbettii, buchi, rovesci, fuori tempo, filtri. Ogni livello cade un poco alla volta (volume giù, mai su): resta il beat storto. Le righe del codice spariscono una a una sotto gli occhi di tutti. | mezza battuta | 4 → 6 |
| 1:36–1:54 (80–95%) | Il collasso: un livello esce ogni battuta con dissolvenza, il beat si dirada e balbetta, quasi tutto il codice è mangiato. | continui | 6 → 8 |
| 1:54–2:00 (95–100%) | L'ultimo colpo (a tempo), poi il silenzio: dissolvenza del master e ferma tutto pulito. | – | tutte, poi spariscono |

## Musica: deve restare musica
Tutto sulla griglia (sedicesimi/movimenti), solo gli effetti già della lista dei dispetti (filtri ≥ 400 Hz, delay e feedback bassi, `.fast`/`.slow`/`.ply`/`.late`/`.rev`/`.mask`/`.degradeBy`), mai un volume che sale, niente risonanze alte, niente fischi, niente cambi di campione. Se il limiter riduce più di 3 dB l'intensità scende da sola di un gradino; se il motore fatica, i dispetti sovrapposti scendono a uno.

## Il codice «mangiato»
- Gli effetti sul suono passano dalla **coda** (stesso giro dei dispetti, annullabili, con la fotografia per tornare indietro).
- Il «mangiare» del testo è **visivo e in memoria**: nelle card e sul proiettore le parole si rovinano e le righe si accorciano (come la cancellazione a macchina che già c'è). Il codice vero dei livelli e i file non cambiano; la musica semplificata la decide la coda (`.mask`, `.degradeBy`, volumi).
- Sul proiettore la cimice si **moltiplica** (fino a 8, più piccole intorno alla principale, tutte con le stesse regole di disegno; firma solo sulla principale).

## La fine: l'ultima immagine
Propongo: schermo nero, **una sola cimice grande al centro**, ferma, col nucleo che pulsa sempre più piano come un cuore che rallenta; sotto, piccola, la firma **«idea by @rybinfx»**. Resta circa 8 secondi, poi nero. Il live è vuoto, il set è chiuso.

## Sicurezza
- Il **paracadute** lo ferma subito e rimette tutto com'era (dalla fotografia); anche ⌥⌘X (ferma i dispetti) e il clic sul bottone lo fermano.
- Solo in memoria: nessun salvataggio, nessuna scrittura nello stash. L'ultima azione prima del collasso non fa mai «salva».
- Una finestra di conferma prima di partire («chiudo il set con l'HACK?»). Non parte se il live è vuoto.

## Da decidere
1. Combinazione di tasti (⌥⌘H due volte?). 2. L'ultima immagine va bene? 3. Il «mangiare» solo visivo (consigliato) o anche vero sul testo dei livelli (richiederebbe un giro di valutazione tutto suo: lo escluderei).
