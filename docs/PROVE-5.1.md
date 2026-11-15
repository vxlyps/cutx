# Prove della 5.1 (0.5.1-beta)

## Prove automatiche
- `npm test`: 412 su 412 (15/11/2026, compresi i test sui punti del video vero delle mani se il file c'è).
- Giro lungo `npm run prova:tutto`: lanciato da Valerio con niente altro in esecuzione, prima della pubblicazione; esito comunicato a voce (via libera alla release), i conteggi non sono stati riportati. Noto: `solidita` è rossa solo se la MiniFuse non è collegata.
- Parti nuove: `proj`, `onda`, `mani` (video di una mano al posto della webcam), `mani-proiettore` (con foto in `~/Desktop/cutx-schermate/mano/`), `drum` (30 controlli, foto in `~/Desktop/cutx-schermate/drum/`).
- `npm run pacchetto`: il `.dmg` arm64 si costruisce (`CUTX-0.5.1-beta-arm64.dmg`); `Info.plist` ha `NSCameraUsageDescription`, e dentro l'app ci sono modello e Wasm delle mani.

## Provato dal Mac, senza hardware
- Migrazione della libreria in PROJ 01 su uno stash finto (copia, non sposta); schermata dei PROJ (foto); cambio PROJ a live fermo e col live che suona (conferma); copia di brani e clip da altri PROJ.
- Onda LED: puntini accesi anche a master zero, clic onda/note per card, proiettore che segue, interruttore generale.
- Mani, col video di Valerio (51 s): le tre entrate di corsa non agganciano, la mano ferma aggancia (12,6 s), il pugno blocca (28,3 · 31,0 · 32,6 s) e riaggancia, mano fuori inquadratura = bloccata; valore senza salti; righe al massimo ~15 al secondo in tutti e tre i modi; CPU ~27% di un core (1 mano) o ~48% (2 mani).
- Mano sul proiettore: forma non stirata (test sulla geometria), mai tagliata dal bordo, valori sotto la mano.
- Scheda DRUM: clic e trascinamento col mouse vero, codice nei due versi (righe illeggibili conservate), formato 16/32 passi e 1/2/4 cicli, ▶ cuffia (quasi muta) con testina, → CUE con · drum, riapri dalla card, annulla.
- Il pulsante «apri» dei PROJ: test col mouse vero che lo tiene premuto (rosso senza la correzione, verde con).

## Da guardare con le mani e i cavi (cosa guardare)
1. **Mani con la webcam vera**: aggancio (il mezzo secondo è giusto?), pugno, zona disegnata, modi SPAZIO e CTX con un pezzo vero, con la luce di una serata. Permesso camera dal **`.dmg` installato**: premi M → macOS chiede «CUTX vorrebbe usare la camera» → consenti; se non chiede, segnalarlo.
2. **Mano sul proiettore**: dimensione e posizione sul proiettore vero, e che l'insegna si spenga e torni.
3. **DRUM con suoni veri dello stash**: la scheda suona bd/sd/hh veri? il menu elenca i suoni dello stash? i colpi in cuffia a tempo col live.
4. **PROJ**: avviare con «riapri l'ultimo PROJ» acceso e spento; cambiare PROJ col live che suona; tasto PROJ.
5. **Onda** sul proiettore vero con un beat vero.
6. Rimaste dalla beta 5 (`docs/PROVE-BETA5.md`): proiettore staccato e riattaccato, SSD vero con stem grossi.

## Rossi noti
Nessuno comunicato da Valerio dopo il giro lungo e la sua prova a mano di dieci minuti. Restano le cose «da guardare» sopra, non ancora provate coi cavi e con la webcam su una serata vera.
