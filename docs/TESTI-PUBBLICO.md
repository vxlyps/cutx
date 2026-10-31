# Inventario dei testi sul proiettore

Tutto quello che il pubblico può leggere nella finestra di uscita (`uscita.html` / `uscita.js`), oggi (31/10/2026).
La finestra riceve dal live solo il tempo e i livelli, e dall'interfaccia solo le bozze di quello che sto scrivendo (+ l'onda
per lo sfondo): avvisi ed errori non le arrivano, quindi oggi non compaiono mai. Il campo `codaErrore` dei livelli viaggia fino
a lì ma non viene disegnato.

## Fissi (sempre sul proiettore)

| # | Testo | Da dove viene | Quando appare | Si spegne oggi? |
|---|-------|---------------|---------------|-----------------|
| 1 | Logo «CUTX» in alto a sinistra | immagine `design/risorse/logo/cutx_bianco.svg` | sempre | no |
| 2 | «128 BPM» in alto | tempo del live (`bpm`), formato `${bpm} BPM` | sempre, appena c'è la mappa del tempo | no |
| 3 | Numero di frase (1…8/16/32) nell'angolo in basso a destra | ciclo corrente, lunghezza scelta in Impostazioni | sempre | no (la lunghezza sì: 8/16/32) |
| 4 | Neon «TECNOLOGIA CANAGLIA» | testo fisso in `uscita.html` | sempre, con flicker | sì: preferenza `insegna` (testo non modificabile) |
| 5 | Titolo della finestra «CUTX · uscita» (con «DEV …» in CUTX dev) | `title` della finestra | solo se la finestra non è a tutto schermo | no |

(Non sono testo: i 4 pallini delle battute, il gatto — preferenza `gatto` — e lo sfondo note/onda.)

## Per ogni livello live

| # | Testo | Da dove viene | Quando appare | Si spegne oggi? |
|---|-------|---------------|---------------|-----------------|
| 6 | Etichetta «● nome» sopra il codice | nome della sezione (`// @sezione nome`); «libero» se scrivo nel CUE libero senza sezioni; «jam» dal jam; «paracadute» per il codice di emergenza | per tutto il tempo che il livello c'è | no |
| 7 | «· muto» in coda all'etichetta | stato muto del livello | quando il livello è in muto | no |
| 8 | «nome · tra 2 cicli» (o «tra 1 ciclo») | conto alla rovescia dell'entrata | dal go live fino all'entrata | no |
| 9 | «● nome · in scrittura» e «jam · in scrittura» | bozza che sto scrivendo dalla card o dal jam | mentre scrivo nel LIVE prima di applicare | no |
| 10 | Il codice del livello (tutto, commenti `//` compresi, anche quelli del preambolo del brano, es. `setcpm(...)` e i suoi commenti) | testo del livello | sempre | no |
| 11 | Cursore `_` e scrittura lettera per lettera | scrittura umana | mentre un livello entra, esce o viene modificato | sì: preferenza `scritturaAMacchina` |
| 12 | La coda: `.lpf(1200)`, `.fast(2)`, e `.gain(0.6)` se il volume non è al massimo | coda del livello + volume | quando c'è una coda o il volume è sceso | no |

## Cose che NON arrivano sul proiettore (verificato)

- «§1», «nomeBrano §1»: è la provenienza (`provenienza`), la vede solo la card sul mio schermo.
- Avvisi sotto la testa del CUE (suoni mancanti, «c'è solo la coda»…), errori di valutazione, `codaErrore`.
- Nomi dei brani, degli stash, dei file; l'elenco dei suoni; lo stato della cuffia.

## Cose che arriveranno con la Fase 4 (da decidere prima)

- Scritta grande del controller («REESE · FILTRO 0.42»): già prevista come opzione.
- Momenti della spina (intro, drop…), nome del brano che passa, eventuali colpi attivi.
