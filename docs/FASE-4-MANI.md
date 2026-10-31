# FASE 4 · LE MANI

È arrivato il controller: Behringer X-Touch Mini, collegato al Mac (8 encoder senza fine con anello LED e push, 16 tasti, 1 fader, tasti layer A/B). Va usato in modalità standard (non MC). Verificare sul dispositivo vero quali messaggi manda e come si accendono anelli e tasti da CUTX.

## PRINCIPI

- Ogni cosa che faccio dal controller DIVENTA CODICE visibile, anche sul proiettore. Io suono col live coding: il controller è una tastiera che scrive codice, non una console che fa effetti nascosti.
- CUTX mi protegge ma non suona al posto mio: niente cambi automatici decisi dal software.
- Live al 90% con controller più tastiera del Mac, il mouse solo se proprio serve.
- Ogni funzione è un "comando" (volume livello 3, prossimo momento, go live…). Tastiera, mouse e controller lanciano gli stessi comandi. La mappa del controller è modificabile nelle impostazioni, come le scorciatoie.

## 1. LA CODA (le fondamenta, da fare per prima)

- Sotto il codice di ogni livello live CUTX gestisce una "coda" di righe concatenate, evidenziate, che sovrascrivono i parametri (in Strudel il valore scritto dopo vince). Il codice scritto da me non viene mai riscritto né analizzato.
- Manopole: aggiornano un valore nella coda (.lpf(1200), .delay(.4)…). Colpi: aggiungono e tolgono righe (.fast(2)).
- Rivalutazione del livello limitata (massimo ~20-30 volte al secondo mentre giro), senza saltini né eventi persi o doppi: è la parte più delicata, provala bene.
- Il volume si scrive nella coda e si applica anche sul guadagno del livello, così anche le note lunghe cambiano subito.
- Sul proiettore la coda si aggiorna sul posto, senza effetto macchina da scrivere: i numeri cambiano mentre giro.
- Valore iniziale dell'anello: se nel mio codice c'è già un valore letterale (es. .lpf(800)) parti da lì, altrimenti da un predefinito.
- Salvare il brano salva anche la coda (è codice). Un comando "pulisci coda" per livello.

## 2. SPINA + PEZZI (il modello della canzone)

- SPINA: la base ritmica preparata a casa (batteria, a volte più sub: lo decido io canzone per canzone), con i suoi MOMENTI (intro, sviluppo, drop, break, outro…). Ogni momento è una versione del codice della spina. Avanza solo quando premo ▶, a fine frase. ◀ torna al momento prima.
- PEZZI: tutto il resto preparato a casa (melodie, bassi, pad, stab, campioni). Stanno nel CUE e li butto dentro io. Non sono legati ai momenti.
- Armare il drop: se premo go live mentre un cambio di momento è in attesa, il pezzo entra insieme al cambio.
- Formato .cutx, per esempio:

  ```
  // @spina
  // @momento intro
  …codice…
  // @momento drop
  …codice…
  // @pezzo reese
  …codice…
  ```

  I brani senza @spina funzionano come oggi (tutto è un pezzo).
- PASSA LA SPINA (cambio di canzone): la prossima canzone è nel CUE. Con "passa la spina", a fine frase entra la sua spina dal primo momento. I pezzi vecchi restano finché li tolgo io, o sfumano con la dissolvenza predefinita.
- BPM tra canzoni: se la differenza è entro l'8% circa, rampa durante il passaggio; se è più grande, il tempo salta nell'istante in cui entra la spina nuova. Se tra i pezzi rimasti c'è qualcosa di ritmico che salterebbe, avvisami.

## 3. IL GUARDIANO (sempre acceso, invisibile)

- Tutto entra a tempo (già così).
- Ogni pezzo entra al suo volume con una micro-dissolvenza, senza click.
- Limiter sull'uscita live, così niente esplode in cassa.
- Se il codice che mando ha un errore, continua a suonare la versione di prima e me lo segnala.

## 4. I COLPI (8 tasti, si suonano tenendo premuto)

- Attivi solo finché tengo premuto. Entrano quantizzati (1/8 o 1/4, impostabile) e al rilascio tutto torna esattamente a tempo. Sono righe nella coda, visibili.
- roll (sulla spina): .ply che cresce mentre tengo (2 → 4 → 8)
- stop (su tutto): silenzio, rilascio quantizzato sull'1
- mezzo (spina): .slow(2)
- doppio (spina): .fast(2)
- indietro (spina): .rev()
- spezza (spina): tagli e colpi saltati a caso
- sale (tutto): livello temporaneo di rumore con passa-alto che sale, visibile come codice
- eco (tutto): lancio nel delay; al rilascio la coda dell'eco continua
- Si combinano (es. stop + sale insieme).
- I colpi sono definiti in un file colpi.cutx nello stash, una riga per colpo (nome + funzione Strudel), così li cambio e ne scrivo di nuovi io. Scegli tu le forme più leggibili per il pubblico.

### A chi vanno i colpi

- Premo un colpo e basta: va sulla spina.
- Tengo premuta la manopola di un pezzo e premo il colpo: va su quel pezzo. Più manopole premute insieme: va su tutti quei pezzi.
- Stop, sale ed eco vanno sempre su tutto.
- Sulle manopole: tocco breve = muto, tenuto premuto = selezione (per girare il filtro o per indirizzare un colpo). Il muto non deve scattare quando tengo premuto per selezionare.
- Mai "ultimo toccato" come bersaglio dei colpi: troppo facile sbagliare dal vivo. (Vale per i colpi; la selezione per il filtro e lo schermo è quella della manopola tenuta premuta.)

## 5. MAPPA DELL'X-TOUCH MINI

### Pagina A · SUONA

- Manopola 1 = spina: gira a sinistra svuota (passa-basso), a destra alleggerisce (passa-alto), al centro piena; premi = muto.
- Manopole 2-7 = pezzi live 2-7: gira = volume, premi = muto, tieni premuto e gira = filtro di quel pezzo. Il pezzo toccato per ultimo è il selezionato e su schermo si vede. Se entra un settimo pezzo, avvisami o prendi il posto del più vecchio in muto: proponimi tu.
- Manopola 8 = volume generale.
- Anelli LED = valore vero (si aggiornano anche quando CUTX cambia i valori da solo: dissolvenze, volume dal CUE…).
- Tasti in alto: ◀ momento, ▶ momento, passa la spina, cuffia (tenuto premuto + giri una manopola = sfoglio i pezzi del CUE e li sento in cuffia), go live, togli (il selezionato), piano/registra, paracadute (tenuto 1 s).
- Tasti in basso: i colpi.
- Fader: filtro del drop su tutto il live.

### Pagina B · SCOLPISCI

- Tasti in alto: scelgo spina, pezzo 2-7 o globale.
- Manopole: volume, filtro, risonanza, eco, riverbero, velocità (a scatti 1/4, 1/2, 1, 2, 4), sporco (distorsione), altezza.
- Su "globale": BPM, eco e riverbero di tutto.
- Tasti in basso: gli stessi colpi.
- Fader: riser.

Ogni cosa che tocco compare in grande su schermo e, se attivo l'opzione, sul proiettore (es. "REESE · FILTRO 0.42").

## 6. MODALITÀ PIANO

- Un tasto (dal controller o dalla tastiera del Mac) attiva la modalità piano: A S D F G H J K = bianchi, W E T Y U = neri, Z/X ottava. Le scorciatoie si mettono in pausa.
- Mini pianoroll nel CUE. Registra: suono 1, 2 o 4 battute in cuffia sopra il live, CUTX quantizza (aggancio alla scala del brano attivabile) e scrive note(...) come nuovo pezzo nel CUE.
- Da lì lo provo, lo mando live col controller e, se mi piace, lo salvo nel brano con un tasto.

## ORDINE DI LAVORO

1 coda → 2 controller (comandi, mappa, anelli LED, pagine) → 3 manopole → 4 colpi → 5 spina e momenti → 6 passa la spina e BPM → 7 guardiano → 8 piano.

Un passo alla volta, commit per ognuno, solo test brevi. Dopo il passo 2 mi fermo a provare il controller dal vivo prima di andare avanti.
