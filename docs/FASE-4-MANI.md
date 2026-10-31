# FASE 4 · LE MANI

È arrivato il controller: Behringer X-Touch Mini, collegato al Mac (8 encoder senza fine con anello LED e push, 16 tasti, 1 fader, tasti layer A/B). Va usato in modalità **MC (Mackie Control)**: in standard le manopole sono assolute con fine corsa (non restano allineate ai valori di CUTX) e i LED non rispondono in modo affidabile; in MC le manopole sono relative (senza fine) e anelli e tasti si accendono da CUTX (MC MODE ambra acceso: tasto MC in basso a sinistra tenuto premuto mentre si collega l'USB). Messaggi e accensione verificati sul dispositivo vero: vedi CLAUDE.md e Impostazioni → controller.

## PRINCIPI

- Ogni cosa che faccio dal controller DIVENTA CODICE visibile, anche sul proiettore. Io suono col live coding: il controller è una tastiera che scrive codice, non una console che fa effetti nascosti.
- CUTX mi protegge ma non suona al posto mio: niente cambi automatici decisi dal software.
- Live al 90% con controller più tastiera del Mac, il mouse solo se proprio serve.
- Ogni funzione è un "comando" (volume livello 3, prossima scena, go live…). Tastiera, mouse e controller lanciano gli stessi comandi. La mappa del controller è modificabile nelle impostazioni, come le scorciatoie.

## 1. LA CODA (le fondamenta, da fare per prima)

- Sotto il codice di ogni livello live CUTX gestisce una "coda" di righe concatenate, evidenziate, che sovrascrivono i parametri (in Strudel il valore scritto dopo vince). Il codice scritto da me non viene mai riscritto né analizzato.
- Manopole: aggiornano un valore nella coda (.lpf(1200), .delay(.4)…). Colpi: aggiungono e tolgono righe (.fast(2)).
- Rivalutazione del livello limitata (massimo ~20-30 volte al secondo mentre giro), senza saltini né eventi persi o doppi: è la parte più delicata, provala bene.
- Il volume si scrive nella coda e si applica anche sul guadagno del livello, così anche le note lunghe cambiano subito.
- Sul proiettore la coda si aggiorna sul posto, senza effetto macchina da scrivere: i numeri cambiano mentre giro.
- Valore iniziale dell'anello: se nel mio codice c'è già un valore letterale (es. .lpf(800)) parti da lì, altrimenti da un predefinito.
- Salvare il brano salva anche la coda (è codice). Un comando "pulisci coda" per livello.

## 2. BEAT + CLIP (il modello della canzone)

- BEAT: la base ritmica preparata a casa (batteria, a volte più sub: lo decido io canzone per canzone), con le sue SCENE (intro, sviluppo, drop, break, outro…). Ogni scena è una versione del codice del beat. Avanza solo quando premo ▶, a fine frase. ◀ torna alla scena prima.
- CLIP: tutto il resto preparato a casa (melodie, bassi, pad, stab, campioni). Stanno nel CUE e li butto dentro io. Non sono legati alle scene.
- Armare il drop: se premo go live mentre un cambio di scena è in attesa, la clip entra insieme al cambio.
- Formato .cutx, per esempio:

  ```
  // @beat
  // @scena intro
  …codice…
  // @scena drop
  …codice…
  // @clip reese
  …codice…
  ```

  I brani senza @beat funzionano come oggi (tutto è una clip). `@clip` (che sostituisce `@pezzo` e `@sezione`, ancora letti) è una clip; `@scena` sostituisce `@momento`, `@beat` sostituisce `@spina`. Vedi docs/STRUTTURA-SET.md. (Fatto, passo 5: ◀ ▶ dal controller, «+ scena» e le card delle scene nel CUE, la clip che entra con un cambio in attesa; resta il «prossimo brano».)
- PASSA AL PROSSIMO BRANO (cambio di canzone): la prossima canzone è nel CUE. Con «passa al prossimo brano» (vedi docs/STRUTTURA-SET.md), a fine frase entra il suo beat dalla prima scena. Le clip vecchie restano finché le tolgo io, o sfumano con la dissolvenza predefinita.
- BPM tra canzoni: se la differenza è entro l'8% circa, rampa durante il passaggio; se è più grande, il tempo salta nell'istante in cui entra il beat nuovo. Se tra le clip rimaste c'è qualcosa di ritmico che salterebbe, avvisami.

## 3. IL GUARDIANO (sempre acceso, invisibile)

- Tutto entra a tempo (già così).
- Ogni clip entra al suo volume con una micro-dissolvenza, senza click.
- Limiter sull'uscita live, così niente esplode in cassa.
- Se il codice che mando ha un errore, continua a suonare la versione di prima e me lo segnala.

## 4. I COLPI (8 tasti, si suonano tenendo premuto)

- Attivi solo finché tengo premuto. Entrano quantizzati (1/8 o 1/4, impostabile) e al rilascio tutto torna esattamente a tempo. Sono righe nella coda, visibili.
- roll (sul beat): .ply che cresce mentre tengo (2 → 4 → 8)
- stop (su tutto): come su un mixer, premendo taglia SUBITO (niente griglia); lasciando riparte sull'1 della battuta dopo (anche con un tocco brevissimo) (il vuoto prima del drop); in Impostazioni → controller si può scegliere «sul battito». Gli altri colpi entrano e escono sulla griglia ¼ o ⅛.
- mezzo (beat): .slow(2)
- doppio (beat): .fast(2)
- indietro (beat): .rev()
- spezza (beat): tagli e colpi saltati a caso
- sale (tutto): livello temporaneo di rumore con passa-alto che sale, visibile come codice
- eco (tutto): lancio nel delay; al rilascio la coda dell'eco continua
- Si combinano (es. stop + sale insieme).
- I colpi sono definiti in un file colpi.cutx nello stash, una riga per colpo (nome + funzione Strudel), così li cambio e ne scrivo di nuovi io. Scegli tu le forme più leggibili per il pubblico.

### A chi vanno i colpi

- Premo un colpo e basta: va sul livello selezionato (bordo verde: ⌃1-9, clic sulla card, manopola tenuta, pagina B); se non c'è niente di selezionato, sul beat.
- Tengo premuta la manopola di una clip e premo il colpo: va su quella clip. Più manopole premute insieme: va su tutti quei clip.
- Stop, sale ed eco vanno sempre su tutto.
- Sulle manopole: tocco breve = muto, tenuto premuto = selezione (per girare il filtro o per indirizzare un colpo). Il muto non deve scattare quando tengo premuto per selezionare.
- Mai "ultimo toccato" come bersaglio dei colpi: troppo facile sbagliare dal vivo. (Vale per i colpi; la selezione per il filtro e lo schermo è quella della manopola tenuta premuta.)

## 5. MAPPA DELL'X-TOUCH MINI

### Pagina A · SUONA

- Il beat sta SEMPRE sulla manopola 1 (e sul tasto-livello 1 in pagina B) e la sua card è sempre la prima in cima al LIVE, qualunque sia l'ordine di entrata; le clip vanno su 2-7 nell'ordine di entrata. Senza beat live la manopola 1 resta libera (anello spento, lo specchio scrive «beat» in grigio) e le clip restano su 2-7. I colpi «solo colpo» vanno sul beat vero; se non c'è, sul primo livello (lo specchio dice «non c'è il beat»).
- Manopola 1 = beat: gira a sinistra svuota (passa-basso), a destra alleggerisce (passa-alto), al centro piena; premi = muto.
- Manopole 2-7 = clip live 2-7: gira = volume, premi = muto, tieni premuto e gira = filtro di quella clip. La clip toccato per ultimo è il selezionato e su schermo si vede. Se entra un settimo clip, avvisami o prendi il posto del più vecchio in muto: proponimi tu.
- Manopola 8 = volume generale.
- Anelli LED = valore vero (si aggiornano anche quando CUTX cambia i valori da solo: dissolvenze, volume dal CUE…).
- Tasti in alto: ◀ scena, ▶ scena, prossimo brano (tocco = cambia linguetta del CUE; tenuto 1 s = passa al prossimo brano), cuffia (tocco = ascolta la sezione selezionata / smette, al rilascio; tenuto + giro una manopola = sfoglio le sezioni del CUE in silenzio, restano selezionate; tenuto + ◀ / ▶ = scelgo quale brano del SET è il prossimo), go live, togli (il selezionato), piano/registra, paracadute (tenuto 1 s, anche in pagina B).
- Tasti in basso: i colpi.
- Fader: filtro del drop su tutto il live.

### Pagina B · SCOLPISCI

- Tasti in alto: 1–7 scelgono il livello (beat o clip 2-7); **il tasto 8 è il paracadute in tutte e due le pagine** (tenuto 1 s). Il «globale» si sceglie premendo di nuovo il tasto layer B: B una volta = il livello scelto, B di nuovo = globale, e così via. Lo specchio dice «SCOLPISCI · GLOBALE» (in bianco pieno) o «SCOLPISCI · nome del livello».
- Manopole: volume, filtro, risonanza, eco, riverbero, velocità (a scatti 1/4, 1/2, 1, 2, 4), sporco (distorsione), altezza.
- Su "globale": BPM, eco e riverbero di tutto.
- Tasti in basso: gli stessi colpi.
- Fader: riser.

Ogni cosa che tocco compare in grande su schermo e, se attivo l'opzione, sul proiettore (es. "REESE · FILTRO 0.42").

## 6. MODALITÀ PIANO

- Un tasto (dal controller o dalla tastiera del Mac) attiva la modalità piano: A S D F G H J K = bianchi, W E T Y U = neri, Z/X ottava. Le scorciatoie si mettono in pausa.
- Mini pianoroll nel CUE. Registra: suono 1, 2 o 4 battute in cuffia sopra il live, CUTX quantizza (aggancio alla scala del brano attivabile) e scrive note(...) come nuovo clip nel CUE.
- Da lì lo provo, lo mando live col controller e, se mi piace, lo salvo nel brano con un tasto.

## ORDINE DI LAVORO

1 coda → 2 controller (comandi, mappa, anelli LED, pagine) → 3 manopole → 4 colpi → 5 beat e scene → 6 prossimo brano e BPM → 7 guardiano → 8 piano.

Un passo alla volta, commit per ognuno, solo test brevi. Dopo il passo 2 mi fermo a provare il controller dal vivo prima di andare avanti.

## DEFINIZIONI AGGIUNTE (31/10/2026)

### CANCELLARE DA UMANO (proiettore)
Oggi la scrittura sul proiettore è umana (raffiche, esitazioni, refusi rari), la cancellazione no. Deve sembrare una persona anche quando il codice sparisce (livello che esce, modifica che toglie testo, coda che si pulisce):
- di solito a ritroso a raffica, più veloce della scrittura;
- ogni tanto una parola intera alla volta (come ⌥⌫);
- quando esce un livello intero, a volte selezione di un blocco (evidenziato un attimo) e via in un colpo;
- stesse regolazioni della scrittura (velocità e imperfezione), stessa sincronia: la cancellazione finisce quando il suono esce davvero.

### STRISCIA VIVA (sotto ogni card live; sul proiettore è un elemento del pubblico, accendibile dalle impostazioni)
Sostituisce le tacchette di oggi, che non dicono niente di utile (si accendono anche su un livello con `.gain(.0001)` che non suona):
- note vere del ciclo: trattini all'altezza della nota (più alti = più acuti, più luminosi = più forti), batterie come tacche, una testina che scorre;
- a destra un misuratore del suono VERO di quel livello (dopo gli effetti e il suo guadagno). Se il livello è acceso ma non esce suono (gain bassissimo, campione mancante, filtro chiuso), il misuratore resta spento e compare «silenzio». Se esagera, avviso «troppo forte»;
- durante entrata, uscita o dissolvenza, la striscia mostra quanto manca;
- costo CPU basso: dire quanto pesa con 7 livelli.
Prima di farla: proporre l'aspetto con uno screenshot.

### PASSO 3 (finire le manopole)
Fader = filtro del drop su tutto il live; pagina B completa (velocità a scatti ¼, ½, 1, 2, 4 al battito; sporco; altezza in semitoni); «globale» su pagina B (BPM, eco e riverbero di tutto). Poi passo 4, i colpi.

### ORDINE
Passo 3 → cancellare da umano → striscia viva (screenshot prima) → passo 4.
