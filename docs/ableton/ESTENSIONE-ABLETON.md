# CUTX · importare progetti Ableton

Obiettivo: apro un progetto Ableton fatto a casa, scelgo cosa importare, e me lo ritrovo nel CUE come brano `.cutx` diviso in sezioni, pronto da mandare live un pezzo alla volta.

Questa estensione sostituisce la vecchia fase 2 ("le mie canzoni"): è il modo principale per portare in CUTX la musica che faccio in Ableton.

`docs/ableton/als2cutx.py` è un prototipo in Python che funziona già: è stato provato su due progetti veri di Valerio (x1 e Mayia, Ableton Live 12.3) e i brani prodotti si valutano tutti con Strudel. Va usato come riferimento per la logica, non copiato: l'estensione va scritta in JavaScript dentro CUTX.

---

## Come funziona per me

1. **Nelle impostazioni** (sezione stash o una nuova sezione "ableton") scelgo una o più cartelle dove tengo i progetti Ableton, per esempio `~/Desktop/x1 Project`.
2. **Nel browser** c'è una nuova scheda **ableton**, accanto a suoni, libreria e help?. Elenca i progetti `.als` trovati in quelle cartelle (ignorando `Backup/`), con nome, BPM e numero di tracce.
3. **Clic su un progetto**: si apre il pannello di importazione.
4. **Scelgo cosa importare** e premo importa: CUTX crea il brano nella libreria dello stash, copia i suoni che servono e lo apre nel CUE in modalità brano.

## Il pannello di importazione

- In alto: nome del progetto, BPM, lunghezza in battute.
- Una riga per ogni traccia di Ableton, con:
  - casella per includerla o no;
  - tipo: MIDI, batteria (Drum Rack) o audio;
  - strumento rilevato (Wavetable, Drift, Simpler, plugin…);
  - **modalità**:
    - **codice**: le note MIDI diventano codice Strudel con un synth di CUTX al posto dello strumento originale. Modificabile dal vivo. Un menu propone il synth (pad, basso, arp, lead, tasti, batteria sintetica), scelto in automatico dal nome della traccia e modificabile;
    - **audio**: usa i file audio del progetto. Per una traccia MIDI vuol dire indicare uno stem esportato da Ableton (scelgo il WAV a mano).
  - le **varianti** della traccia (clip con contenuto diverso), ognuna con ▶ per sentirla in cuffia e una casella per includerla.
- In basso: anteprima delle sezioni che verranno create, nell'ordine in cui compaiono nell'arrangiamento, con i nomi modificabili.
- Avviso chiaro sui file mancanti (vedi sotto), prima di importare.

## Regole di conversione (verificate nel prototipo)

- Il `.als` è XML compresso con gzip: si apre con `zlib` nel processo principale e si legge con un parser XML.
- **Tempo**: `LiveSet/MainTrack/.../Tempo/Manual` (in Live 12 si chiama MainTrack, nelle versioni vecchie MasterTrack). Il brano parte con `setcpm(bpm/4)`.
- **Clip**: quelle dell'arrangiamento (`ArrangerAutomation/Events`) e quelle della Session (`ClipSlotList`). Di ogni clip conta la zona di loop (`Loop/LoopStart`, `Loop/LoopEnd`) e la posizione nell'arrangiamento (`CurrentStart`).
- **Varianti**: le clip di una traccia con lo stesso contenuto sono la stessa variante. Ogni variante diventa una sezione. Nome della sezione = nome della traccia pulito (senza numero iniziale, minuscolo), più `a`, `b`, `c` se le varianti sono più di una. Le tracce chiamate solo "Audio" o "MIDI" prendono il loro numero ("audio 5").
- **Note MIDI**: `Notes/KeyTracks/KeyTrack` con `MidiKey`, e dentro `MidiNoteEvent` con `Time`, `Duration`, `Velocity`, `IsEnabled`. Si tengono solo le note dentro la zona di loop.
- **Griglia**: la risoluzione è il massimo comun divisore di inizi e durate in sedicesimi. Una nota per battuta diventa `note("d4 g4 c4 f4").slow(4)`, non 64 caselle. `_` prolunga la nota, `~` è pausa, gli accordi sono `[c4,eb4,g4]`.
- **Batteria (Drum Rack)**: i pad (`DrumBranch`) hanno un nome e una nota MIDI di ricezione. Il ruolo si ricava dal nome del pad (kick, snare, hat, clap, perc…) e, se manca, dalla nota General MIDI (36 cassa, 38 rullante, 42 charleston). Una riga per ruolo, scritta battuta per battuta: `.struct("<[x ~ ~ ~ …] [~] …>")`. Attenzione: in Ableton la nota di ricezione dei pad risulta salvata invertita (128 meno la nota), e il prototipo non lo gestisce bene: nei test ha funzionato grazie ai nomi dei pad. Verifica sui file reali.
- **Audio**: il file viene da `SampleRef/FileRef/RelativePath`, relativo alla cartella del progetto. Inizio e fine del loop si convertono in secondi con i `WarpMarkers` della clip (interpolando tra `BeatTime` e `SecTime`), poi in frazioni della durata del file (`DefaultDuration / DefaultSampleRate`). Risultato: `s("nome").begin(0.12).end(0.39).slow(4)`.
- **Suoni dello stash**: ogni file audio usato viene copiato in `suoni/<brano>_<nn>_<nome breve>/`, una cartella per file. I nomi devono restare corti e leggibili.
- **Intestazione del brano**: `@brano`, `@bpm`, `@data`, `@suoni`, più `@origine` con il percorso del `.als`, così si può reimportare.
- **Tracce audio con tantissime clip** (montaggi di registrazioni): nel prototipo si tengono al massimo due varianti per traccia, le più usate. Nel pannello invece le mostro tutte e scelgo io.

## File mancanti

Alcuni file non stanno nella cartella del progetto: i campioni della libreria di Ableton (dentro l'app) e i file presi da altre cartelle, come Download. Quando succede:

- il pannello elenca i file mancanti e per ognuno offre "cerca" per indicarlo a mano;
- suggerisce la soluzione più semplice: **in Ableton, File → Raccogli tutto e salva**, che copia tutti i file usati dentro la cartella del progetto, poi reimporta;
- le sezioni con suoni mancanti vengono create lo stesso, e CUTX le segnala come fa già per i brani con suoni assenti.

## Limiti da dire chiaramente nell'interfaccia

- Strumenti ed effetti di Ableton e dei plugin non si possono riprodurre: in modalità codice suona un synth di CUTX che ci somiglia, in modalità audio suona l'audio originale.
- Gli audio con warp molto diversi dal tempo del progetto cambiano altezza, perché Strudel non fa time-stretch.
- Automazioni e mix (volumi, filtri automatizzati) per ora non vengono importati.

## Test

- Test sul convertitore con piccoli `.als` di prova creati per i test: tempo, una traccia MIDI, un Drum Rack, una traccia audio con warp.
- Ogni sezione prodotta deve valutarsi con Strudel senza errori (come già fanno i test dei brani).
- I progetti veri di Valerio non vanno mai committati nel repo.

## Più avanti

- Reimportare un progetto aggiornato mantenendo le modifiche fatte in CUTX alle sezioni.
- Estensione AI (fase 7): nomi delle sezioni più musicali e scelta del synth più vicino allo strumento originale.
