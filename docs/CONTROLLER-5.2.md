# X-Touch Mini a ruoli (5.2): proposta APPROVATA il 15/11/2026 (con le decisioni qui sotto)

L'X-Touch Mini ha 8 manopole (si girano e si premono), 16 tasti (8 in alto, 8 in basso), i due tasti **layer A / B**, un fader. Oggi: nel LIVE comanda livelli ed effetti; nel SYNTH (⌘2) le manopole sono i parametri e i tasti in alto scelgono il gruppo, quelli in basso sono comandi (CUE, mutate, annulla…). Sempre del LIVE, in ogni vista: **fader**, **manopola 8 = volume generale**, **paracadute** (oggi tasto in alto 8, tenuto 1 s).

## Cosa cambia: la vista e il layer scelgono il ruolo
| Vista | Layer A | Layer B |
|---|---|---|
| LIVE | com'è oggi | com'è oggi (pagina B) |
| SYNTH · scheda suono/note | com'è oggi (parametri) | **PIANO** (nuovo) |
| SYNTH · scheda **drum** | **SEQUENCER** (nuovo) | **PAD** (nuovo) |

## SEQUENCER (DRUM, layer A), stile Pocket Operator
- **16 tasti = 16 passi** (in alto 1–8 = passi 1–8, in basso 1–8 = passi 9–16). Premi = passo acceso o spento.
- **Luci**: tasto acceso = passo acceso; **la luce che corre**: il passo che suona adesso lampeggia (se è acceso lampeggia a ritmo, se è spento si accende un attimo), così si vede la testina anche sul controller.
- **Manopola 1** = **riga** (gira tra le righe della griglia; la riga scelta si evidenzia a schermo, i tasti mostrano i suoi passi). **Manopola 2** = **suono** della riga scelta (scorre l'elenco).
- **Velocity**: **tieni premuto un passo e gira la manopola 1** → velocity di quel passo (sullo schermo la barretta). Senza passo premuto la manopola 1 cambia riga.
- **32 passi**: un tasto cambia pagina (passi 1–16 ↔ 17–32); la luce dice quale pagina; a 16 passi non fa niente.
- Il resto (formato, cicli, → CUE, annulla) resta sul Mac o nelle manopole libere (vedi domande).

## PAD (DRUM, layer B)
- **16 tasti = 16 righe** della griglia (tasto 1 = riga 1…). Premi = suona quel suono nella cuffia, a **velocity fissa** (.8), la luce si accende finché tieni.
- **REC** (nel Mac e sul controller): registra i colpi a tempo nei passi della riga, quantizzati (è il REC del DRUM, già nella 5.2).

## PIANO (SYNTH, layer B)
- Come un piccolo pianoforte: **fila in basso = 8 tasti bianchi** (do re mi fa sol la si do), **fila in alto = i neri** sopra i buchi giusti (1 do#, 2 re#, 4 fa#, 5 sol#, 6 la#; il 3, il 7 e l'8 non fanno niente). **Manopola 1 = ottava.** Suona il suono del synth in cuffia a velocity fissa; con REC le note vanno nel pianoroll. Luce accesa finché il tasto è premuto.

## Domande (le scelte vere)
1. **Il paracadute sotto le dita.** Con 16 passi i due ordini di tasti sono tutti occupati. Dove va? **(a)** **spinta della manopola 8 tenuta 1 s**, in tutte le viste (uguale ovunque, destra in alto; la manopola 8 gira già per il volume generale) — la mia preferita; **(b)** solo nel DRUM e nel PIANO, e nel LIVE resta il tasto in alto 8 (due posti da ricordare); **(c)** sequencer a 15 passi.
2. **Dove vanno ▶ cuffia, ■, REC, → CUE e annulla** quando i tasti sono passi? Proposta: **spinte delle manopole 3–7** (3 = pagina 17–32, 4 = ▶/■ cuffia, 5 = REC, 6 = → CUE, 7 = annulla). Oppure li lasci al Mac.
3. **Layer A/B**: nel SYNTH-suono e nel DRUM ogni layer ha un ruolo nuovo. Va bene che nel SYNTH-suono il **layer B diventi PIANO** (oggi non fa niente)?
4. **Velocity del PAD e del PIANO**: fissa a .8 (come il passo nuovo), o la scegli tu in un'impostazione?
5. **Luci** (l'X-Touch Mini ha solo acceso/lampeggia/spento, niente colore né livelli): ti va la regola «acceso = passo, lampeggio = dove siamo, spento = niente»? Per la velocity niente luce: si vede a schermo.

Dopo il tuo ok: modulo puro con i test (mappa e luci, senza hardware), poi il collegamento e la prova coi cavi veri.


## Decisioni di Valerio (15/11/2026): valgono al posto delle proposte sopra
- **Nel DRUM e nel PIANO l'X-Touch Mini è uno strumento e basta**: i 16 tasti sono passi, pad o tasti del piano. **Niente paracadute dal controller** in queste viste (resta nel LIVE, com'è). Niente ▶ cuffia, ■, REC, → CUE, annulla sul controller: si fanno con tastiera e mouse. Quindi non servono le spinte delle manopole per quelle cose.
- **Unico comando in più sul controller**: il cambio pagina 1–16 ↔ 17–32 del sequencer (proposta: spinta della manopola 3, solo a 32 passi), perché fa parte dello strumento. Se preferisci il layer o altro si cambia.
- **Velocity fissa**: quella di default dei programmi di musica, 100/127 ≈ **.8** (già il valore dei passi nuovi). Poi si modifica a mano (sequencer: passo tenuto + manopola 1; sul Mac: trascinamento).
- **Luci** come proposto: acceso = passo, lampeggio = dove siamo, spento = niente. **Deve funzionare come un Pocket Operator**: una luce che corre sui passi e le luci fisse dove c'è qualcosa.
- Fader, volume generale (manopola 8) e layer restano com'è nel resto; il fader resta sempre del LIVE.

## Come si scrive (pronto per la sessione dopo)
1. Modulo puro `controller-ruoli.js` + test, senza hardware: dato (vista, scheda, layer) dice il ruolo; per ogni ruolo trasforma gli eventi dell'X-Touch (tasto n giù/su, manopola n ±, spinta n) in azioni sulla griglia o sul piano e dice le luci (16 stati: spento/acceso/lampeggio). Adatto a Codex con un brief preciso (nessuna decisione di design da lasciargli).
2. Collegamento in `controller.js` (sceglie il ruolo, manda le luci, tiene il paracadute spento in queste viste) e in `drum-vista.js` / `synth-vista.js` (riga scelta, pagina, testina, nota suonata). Prova automatica con eventi finti, poi coi cavi veri.


## Cambio del 15/11/2026 (sera, dopo la prima prova coi cavi): i layer portano alla scheda
- **Layer A = batteria**: lo schermo passa alla scheda DRUM, tasti = sequencer. Premuto di nuovo: **pad** (il layer lampeggia).
- **Layer B = synth**: lo schermo passa all'ultima scheda suono/note, tasti = piano (manopola 1 = ottava, 2-7 parametri). Premuto di nuovo: **parametri** (tasti in alto = gruppi, come prima; il layer lampeggia).
- Entrando nel SYNTH si parte dai parametri, come prima. La riga cliccata col mouse nella griglia è anche quella del sequencer. Luci ogni 50 ms come strumento, e subito dopo ogni tocco.
- **CASSE** nella barra del SYNTH: la cuffia esce dall'uscita del live (solo il motore cuffia cambia uscita). Parte spento e si spegne uscendo dal SYNTH.
