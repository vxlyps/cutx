# Ultimo stato - 19/11/2026 (worktree ~/Progetti/cutx-canali, ramo `canali` da v0.5.1-beta.4)
- Fatto: fase 0 a metà. Creato lo strumento `strumenti/midi-nano/` (nano.sh [auto|sonda|tutto]; registro in $TMPDIR/cutx-midi-nano.log). Specifica CANALI definitiva incollata da Valerio il 19/11 (REGIA/SCALPELLO/PENNA, Banco 8 corsie, fasi 0–4).
- Funziona: il nano si vede in macOS (ingresso «SLIDER/KNOB», uscita «CTRL») e manda i tasti in modo normale (es. STOP = b0 2a 7f).
- Non funziona: nessuna risposta ai messaggi di sistema (Mode Request, scena, Native In, identity), su nessun canale globale 1–16. Da capire se le luci in nativa si accendono davvero (serve l'occhio di Valerio).
- File toccati: strumenti/midi-nano/* (nuovi). Nessun codice dell'app. Conteggio brani: 4 brani in libreria, 15 clip, nessuna con tipo.
- Prossimo: sapere da Valerio se le luci si sono accese; poi decidere (sonda altri messaggi, o piano B Kontrol Editor con luci esterne). Fase 1 NON iniziata.
