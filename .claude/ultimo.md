# Ultimo stato - 19/11/2026 (LAVORARE IN ~/Progetti/cutx-canali, ramo `canali` da v0.5.1-beta.4; main = beta 4 intatta)
## Nomi (valgono ovunque: interfaccia, messaggi, test, codice)
REGIA→NANO · SCALPELLO→X-TOUCH · PENNA→tastiera · corsia→CH (CH1…CH8) · Banco→pagina CANALI · in canna→NEXT · ENTRA/ESCE/MUTO→GO/OUT/MUTE · ACQUA·ARIA→SWEEP · ARREMBAGGIO→GO ALL · CANAGLIA→FREE · in mano→FOCUS · TUTTO→MASTER · CUFFIA (tasto CYCLE)→CUE. Restano: paracadute, colpi, cimice, CUE (zona brani), LIVE, STASH, PROJ, DRUM, SYNTH. Il file del PROJ si chiama `canali.json` (NON proj.json).
## Fatto
- Rete di sicurezza: backup in ~/Progetti/backup/cutx-stash-2026-11-19 (originale) e -con-tipi; il ramo gira con dati separati («CUTX canali», ~/Library/Application Support/CUTX-canali; blocco `CANALI` in main.js da togliere prima di un merge); tipi `· tipo` scritti nello stash.
- Fase 1 parte A: `src/renderer/canali.js` (StatoCanali: CANALI predefiniti+validazione, alternative in ordine di file, zone ±3%, go/out/annulla/vince l'ultimo, goAll, BPM con DRUM, vecchia, gainFader, sweep, luci, vista) + `test/canali.test.js` (16 test, verdi). NON ancora collegato all'app.
## Decisioni di Valerio (non rimettere in discussione)
- CUE raggruppato per tipo nella beta: va bene. Alternative della manopolina = SOLO clip del brano nel CUE (in ordine di file; DRUM = scene @beat poi clip drum; FREE = tutte le clip, scene no). Tutto il resto (clip dello stash/kit, @apertura, jam, scratch, GO LIVE dalla tastiera) entra nel CH del suo tipo, o FREE se senza tipo. I colpi che creano livelli da soli («sale») sono fuori dai CH: come oggi, non sul nano.
- Identità del livello nel motore = CH + nome (stessa clip in due CH = due livelli). Il motore tiene in ogni livello il suo CH; dopo un crash l'interfaccia ricostruisce lo stato `canali` da lì.
- «Annulla» di un'entrata già mandata: lo scrivo io nel motore, con test e `npm run prova` (mai Codex). Se è invasivo: FERMARSI e dirlo; nella prima versione si può togliere «annulla» (GO e OUT restano).
- Il PROJ ha le sue definizioni in `canali.json` nella cartella del PROJ (se c'è vince; PROJ nuovo = predefinito). Si cambia solo a live fermo (acceso: sola lettura con scritta del perché).
## Da fare (fase 1 parte B, poi FERMARSI)
1. FATTO: `categorie.js` esporta TIPI (8, per i CH) e CATEGORIE (6, SYNTH, = TIPI senza drum/perc); canali.js importa TIPI da lì. Test synth/canali/pacchetto verdi (63). RESTA per la pagina CANALI: l'ordine dei gruppi nel CUE (`gruppiClip`) deve seguire l'ordine dei CH (predefinito: drum, keys/arp, bass, lead, pad, perc, fx, senza tipo) e `categoriaDi` deve riconoscere perc/drum nel CUE; oggi `gruppiClip` usa ancora CATEGORIE.
2. Motore: livello con campo CH + identità CH+nome; annulla di un'entrata; stato ricostruibile dal live (leggere motore.js `guadagnoDi`, app.js ~347/383/451, stato-live.js).
3. Pagina CANALI nelle impostazioni (8 righe: nome libero, colore, tipi a spunte, una FREE, «torna al predefinito»; canali.json nel PROJ).
4. Griglia LIVE col mouse (8 colonne × alternative del brano nel CUE; chiusura: suona, NEXT, countdown, fader «non letto», mute, vecchia). Pila (src/renderer/pila.js, 588 righe) è il LIVE di oggi.
5. X-TOUCH con la mappa di oggi sui CH. Poi test + prova + rapporto (cosa funziona/no/rischia/cosa provare + tabella regola→file→test). Fermarsi.
## Fase 0 (piano B) ancora aperta
Valerio configura il nano col KORG Kontrol Editor (LED External, tasti Momentary, un canale globale, Write Scene). Poi adattare `strumenti/midi-nano` (togliere la parte nativa) per verificare premuto 127/rilasciato 0 e luci comandate. Il nano NON risponde ai sysex (modo nativo scartato); si vede in macOS come ingresso «SLIDER/KNOB» e uscita «CTRL».
## Domande aperte a Valerio: nessuna.
