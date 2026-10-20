# CUTX · Piano

Piano dettagliato e decisioni della fase 1: [`FASE-1.md`](FASE-1.md). Fase 2: [`ableton/ESTENSIONE-ABLETON.md`](ableton/ESTENSIONE-ABLETON.md).

Una fase è chiusa solo quando Valerio ha verificato tutti i criteri.

## Fase 0 · Prova tecnica
Domanda: cuffia e casse restano a tempo?

- [ ] L'app Electron si avvia con `npm install && npm start`
- [ ] Editor Strudel funzionante
- [ ] Scelta della cartella valigetta, ricordata tra un avvio e l'altro
- [ ] I file in `suoni/` sono usabili come suoni
- [ ] Scelta delle uscite Live e Cuffia dall'elenco dei dispositivi
- [ ] Modalità test: stesso click su entrambe le uscite, con misuratore di sfasamento
- [ ] Dopo 10 minuti lo sfasamento resta stabile e sotto soglia
- [ ] Uno stem dallo stash suona
- [ ] Se il motore cuffia si blocca o crasha, il live continua senza accorgersene (e la cuffia riparte)
- [ ] L'app parte da zero su un Mac pulito (Apple Silicon)

## Fase 1 · La postazione
- [ ] L'app si chiama CUTX ovunque, il repo è `vxlyps/cutx`, il Dock mostra il gatto
- [ ] Valigetta diventa stash (`stash.json`), dati di DANEEL migrati al primo avvio
- [ ] Motore live separato: se interfaccia o cuffia si bloccano o crashano, le casse non perdono un colpo
- [ ] Carico un brano `.cutx` dalla libreria, provo le sezioni in cuffia mentre altre suonano, e le mando live una alla volta: entrano a tempo, scritte a macchina
- [ ] Mando live solo alcune righe di una sezione
- [ ] Improvviso nel livello jam mentre il brano suona
- [ ] Livelli live con volume, muto e uscita a fine ciclo
- [ ] Browser: suoni, libreria, help offline
- [ ] Help al passaggio del mouse e riquadro help
- [ ] Sezioni create a mano o con "+ sezione", visibili anche in modalità libero; rinomina, unisci, dividi, riordina dalla mappa
- [ ] ⌘S salva il brano `.cutx` e riaprendolo torna identico; avviso se allo stash mancano dei suoni del brano
- [ ] "Salva il live come brano" cattura una jam, con volume e muto di ogni livello
- [ ] Conteggio a frasi (1–16) e tempo del set nella barra in alto e nel LIVE
- [ ] Paracadute "CUTX, scelgo te!": al battito successivo entra il codice di emergenza, e si torna indietro
- [ ] Un errore nel codice di un livello live non lo ferma: continua la versione precedente
- [ ] Modifico un livello live sul posto: suona la versione di prima finché non applico (⌘↵), esc annulla
- [ ] Finestra di uscita con il codice live grande, spostabile e a schermo intero (⌃⌘F), ricorda schermo e modalità; se si chiude o crasha le casse non se ne accorgono
- [ ] Impostazioni; cambio una scorciatoia e funziona subito
- [ ] Suono 20 minuti di fila solo da tastiera, senza buchi
- [ ] La postazione corrisponde a `design/riferimenti/main.html`
- [ ] Formato manifest `cutx-pack.json` per estensioni e pacchi
- [ ] Punti di aggancio del cuore, provati con un'estensione d'esempio

## Fase 2 · Importare progetti Ableton
Sostituisce la vecchia fase "le mie canzoni": la musica fatta a casa in Ableton arriva in CUTX da qui. Piano e regole di conversione: [`ableton/ESTENSIONE-ABLETON.md`](ableton/ESTENSIONE-ABLETON.md); il prototipo Python `ableton/als2cutx.py` è solo riferimento per la logica (l'estensione si scrive in JavaScript dentro CUTX). I progetti veri di Valerio non vanno mai nel repo.
- [ ] Nelle impostazioni scelgo le cartelle dove tengo i progetti Ableton
- [ ] Nel browser c'è la scheda **ableton**: elenca i `.als` trovati (senza `Backup/`) con nome, BPM e numero di tracce
- [ ] Clic su un progetto: pannello di importazione con una riga per traccia (tipo, strumento rilevato, codice o audio, varianti con ▶ in cuffia) e anteprima delle sezioni
- [ ] Importa: brano `.cutx` nella libreria, suoni copiati nello stash, brano aperto nel CUE in modalità brano
- [ ] Tracce MIDI → codice Strudel con un synth di CUTX scelto dal nome della traccia; Drum Rack → una riga per ruolo; tracce audio → `s("…").begin().end()` dai loop e dai warp
- [ ] File mancanti (libreria di Ableton, altre cartelle): elenco, "cerca" a mano, suggerimento "Raccogli tutto e salva"; le sezioni si creano lo stesso con l'avviso
- [ ] Limiti detti chiaramente nell'interfaccia (strumenti ed effetti non riprodotti, niente time-stretch, niente automazioni)
- [ ] Test sul convertitore con piccoli `.als` creati per i test; ogni sezione prodotta si valuta con Strudel
- [ ] Importo un mio progetto vero (x1, Mayia) e suono una mia canzone smontata e rimontata dal vivo
- [ ] Suoni base (bd, sd, hh…) nello stash; licenza di ogni banca controllata prima di farne un pacco pubblico
- [ ] Sample di codice: beat jungle che spezzetta uno stem, loop pronto, una canzone da mandare live un pezzo alla volta

## Fase 3 · Proiezione
- [ ] La finestra di uscita (dalla fase 1) diventa il proiettore: riga che suona in verde, Hydra sotto
- [ ] Video dello stash come sorgenti Hydra, distorti a tempo
- [ ] Hydra ascolta: i video reagiscono al volume reale della cassa e dei bassi, letto dal motore live
- [ ] Conteggio a frasi anche sul proiettore
- [ ] Proiettore acceso, i video si distruggono a tempo, il pubblico vede solo il codice live

## Fase 4 · Hardware
- [ ] APC mini mk2: griglia = libreria (primo tocco cuffia, secondo live)
- [ ] APC mini mk2: fader = volumi dei livelli, ultimo fader = distruzione video
- [ ] APC mini mk2: luci della griglia seguono lo stato (verde = live)
- [ ] Sync PO-33 dalla terza uscita (impulso sul canale sinistro, 2 per quarto, SY2)
- [ ] Suono con il controller e il PO resta a tempo per tutta la sessione

## Fase 5 · App installabile
- [ ] `.dmg` solo arm64, senza firma Apple, costruito da GitHub Actions su runner macOS e pubblicato nelle Release
- [ ] Tipo di file `.cutx` registrato su macOS, con l'icona del gatto e apertura con doppio clic
- [ ] Primo avvio guidato: stash, uscite, test
- [ ] Istruzioni nel README per aprire un'app non firmata (Impostazioni → Privacy → Apri comunque)
- [ ] Scarico il .dmg dalle Release su un Mac Apple Silicon, attacco l'SSD e suono senza Terminale

**→ Serata in officina.**

## Fase 6 · Videocamera (se ci gasa)
- [ ] Webcam come sorgente Hydra, feedback video
- [ ] Segmentazione persone in tempo reale, offline
- [ ] Maschere disegnate a mano sugli oggetti (projection mapping manuale)

## Fase 7 · Estensioni, AI e versione pubblica
- [ ] Estensione AI: scorciatoia, solo sul mio schermo, scrive solo in cuffia
- [ ] Versione 1.0 pubblica
- [ ] Documentazione per chi fa estensioni e pacchi

## Idee per dopo
- Ogni serata diventa un film: registrazione dell'audio e di ogni modifica al codice con l'orario, per rivedere il set che si riscrive da solo ed esportare il video del proiettore.
- Ableton Link per suonare in sync con un altro computer sulla stessa rete.
