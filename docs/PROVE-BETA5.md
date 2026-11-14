# Prove della beta 5 (0.5.0-beta.5, 14/11/2026)

## Cosa è stato provato

**Prove automatiche** (volume del Mac al 20%, dati separati in `CUTX-prova`):
- `npm test`: 349 su 349.
- Tutte le parti di `--prova` (circa mille controlli). Quattro rossi noti, da sistemare nella 5.1: `solidita` (scritta «ho ripreso il testo del CUE» dopo un crash dell'interfaccia), `strudel` (manca `CUTX_SUONI_PROVA`), `linguette` e `finestra` (solo in coda al giro lungo; da sole passano).
- `npm run pacchetto`: il `.dmg` arm64 si costruisce.

**Prove «a mano» fatte dal Mac** (`src/main/prova-mano.js`, `electron . --prova=mano-…`, serve `CUTX_MANO_OUT`):
- `mano-primo`: uscita audio registrata e misurata. File fino a 13 MB: 0 colpi persi su 12 lanci (primo suono entro 1–49 ms). File da 190 MB: persi i primi 3 colpi su 4 (prima del precarico).
- `mano-midi`: porta MIDI finta che sparisce e torna.
- `mano-schermo`: secondo schermo finto tolto e rimesso.
- `mano-audio`: uscita audio finta che sparisce e torna (rilevata in 0,2 s, ripresa in 0,4 s, nessun click perso).
- `mano-disco`: stash su un'immagine disco smontata a forza mentre suona (nessun click perso, nessun processo ripartito, `stash.json` identico, fascia «stash non collegato» che compare e se ne va).
- `mano-foto`, `mano-manopola`: foto di «entra tra», avviso senza BEAT, manopola 1 a schermo.

**Prove di Valerio coi cavi veri**: X-Touch Mini staccato e riattaccato: ok. MiniFuse staccata e riattaccata: ok (lo schiocco al cambio di uscita è stato poi corretto con una dissolvenza corta). Manopola 1: 40 scatti lenti = 40 messaggi; nel giro veloce l'X-Touch manda più passi per messaggio e CUTX ne conta uno per messaggio, apposta.

## Cosa resta da guardare coi cavi

1. **Proiettore vero**: staccarlo con la finestra del pubblico aperta (deve chiudersi e tornare da sola quando lo riattacchi); controllare che tutto il codice si legga.
2. **SSD vero con stem grossi**:
   - primo GO LIVE di una clip con uno stem lungo, dopo averla provata in cuffia o scelta nel CUE: il primo colpo c'è? (il precarico lo carica prima; tetto 1 GB, oltre si carica al primo uso);
   - staccare l'SSD a metà e riattaccarlo: compare la fascia, il live continua, i suoni tornano;
   - un SSD lento o addormentato: il primo colpo e la fascia.
3. **MiniFuse**: riattaccarla mentre suona e sentire se lo schiocco è sparito.
4. **Modalità MC dell'X-Touch sull'app installata dal .dmg** (finora verificata sulla versione di sviluppo).
