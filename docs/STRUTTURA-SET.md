# STRUTTURA DEL SET (31/10/2026)

Ripensata con Valerio dopo le prove con `brano_1`. Sostituisce il vecchio «passo 6» di `FASE-4-MANI.md` (passa la spina e BPM) e cambia i nomi del passo 5.

## NOMI NUOVI (ovunque: interfaccia, specchio, testi per il pubblico, docs)

| prima | adesso |
|---|---|
| spina | **BEAT** |
| momento | **SCENA** |
| pezzo (e sezione) | **CLIP** |

- Nel `.cutx`: `// @beat`, `// @scena nome`, `// @clip nome`.
- Restano validi come sinonimi in lettura `@spina`, `@momento`, `@pezzo`, `@sezione`: i file vecchi funzionano. In scrittura CUTX usa sempre i nomi nuovi.
- `libreria/brano_1.cutx` dello stash di prova si converte ai tag nuovi.
- Il livello live si chiama «beat» (card, specchio, controller). Un livello chiamato «spina» scritto in un vecchio file vale come beat.

## COME SI SUONA

Una serata è un **SET** di 4-5 brani o più: so quale apre e quale chiude, in mezzo salto dove voglio. Durante un brano lancio soprattutto clip preparate a casa e le lavoro con effetti e colpi; a volte modifico il codice o suono cose nuove. Poi faccio la transizione al brano dopo: lascio sotto il beat vecchio mentre entra la melodia nuova, oppure la melodia vecchia si trasforma nella nuova.

## 1. SET (nuova scheda nella colonna sinistra, accanto a suoni e libreria)

- Un file set nello stash con l'elenco dei brani in ordine; posso segnare quale apre e quale chiude.
- Il brano che suona ha ●, il prossimo ha ▸. Posso cambiare il prossimo quando voglio (clic, CUFFIA + ◀ ▶ dal controller).
- Sotto il SET: il **KIT**, clip sempre disponibili in ogni brano (file `kit.cutx` nello stash). Si mandano live come le altre clip.

## 2. CUE CON DUE LINGUETTE

- Due linguette col nome dei brani: «● brano attivo» e «▸ prossimo brano». Tab le alterna, e c'è un comando anche dal controller.
- Ogni linguetta mostra il brano così:
  - in alto la card del **BEAT**: le scene come pillole arrotondate (quella live accesa, quella prenotata segnata), e sotto il **codice** della scena scelta, leggibile e modificabile (compatto, espandibile);
  - sotto, le card delle **CLIP**, ognuna col suo codice visibile e modificabile, come oggi;
  - card e pulsanti più arrotondati e puliti, nello stile CUTX.
- Il codice si vede e si modifica SEMPRE: niente card da bambini con solo il nome.

## 3. PASSA AL PROSSIMO BRANO

- Un comando (tasto «passa» sul controller, scorciatoia, pulsante nel LIVE): a fine frase entra il BEAT del prossimo brano dalla sua prima scena.
- Le clip del brano vecchio ancora live RESTANO finché le tolgo io.
- Poi il prossimo diventa il brano attivo e il successivo del SET diventa il prossimo, in automatico.
- BPM: se la differenza è entro l'8% circa, rampa durante il passaggio; se è più grande, il tempo salta quando entra il beat nuovo. CUTX avvisa se tra le clip rimaste ce n'è di ritmiche che salterebbero.
- Posso mandare live clip del prossimo brano anche PRIMA di passare il beat (la melodia nuova sopra il beat vecchio).
- Sul proiettore il nome del brano che entra non compare di default (accendibile dai testi per il pubblico).

## 4. CONTROLLER

La manopola 1 resta il BEAT. Le scene con ◀ ▶. I colpi vanno sul selezionato, e se non c'è niente selezionato sul BEAT. Specchio e mappa aggiornati.

## STATO DEI LAVORI

1. **Nomi nuovi**: fatto (31/10/2026).
2. **CUE a due linguette**: fatto (31/10/2026). Tab alterna; sul controller il **tasto 3** (tocco = cambia linguetta, tenuto 1 s = passa al prossimo brano, dal passo 4) al posto di CUFFIA + GO LIVE (che resta «manda la clip»). «Passa da CUE a LIVE» è ora Shift+Tab.
3. SET e KIT: da fare. 4. Passa al prossimo brano: da fare. 5. Controller (CUFFIA tenuto + ◀ ▶ = scelgo il prossimo del SET): da fare.

## ORDINE DEI LAVORI

Dopo questo: passo 7 (guardiano con il limiter), poi modalità piano (si progetta prima insieme), poi Pocket Operator.

---

# PROPOSTE DI CLAUDE (da approvare)

## Formato del file SET (`set.cutx`, nella radice dello stash, come `colpi.cutx`)

Testo semplice, righe `//` di intestazione come nei brani, poi un brano per riga (il nome del file in `libreria/`), nell'ordine della serata. I segni `· apre` e `· chiude` seguono la stessa sintassi di `· volume 0.6` nelle intestazioni dei brani.

```
// @set venerdì al locale

brano_1.cutx · apre
notte-canaglia.cutx
mayia.cutx
x1.cutx
test_jungle_1.cutx · chiude
```

- Un brano che non esiste più in libreria resta nell'elenco, segnato in rosso («manca»); non si perde.
- Il «prossimo» e il «brano attivo» sono stato dell'app (non si scrivono nel file): al riavvio il brano attivo è «nessuno» e il prossimo è quello che apre.
- Si modifica dall'interfaccia (aggiungere dalla libreria, trascinare, segnare apre/chiude, togliere) e a mano nel file. Un solo set per stash (`set.cutx`); più set si possono aggiungere dopo.

## `kit.cutx`

Stesso formato di un brano, ma solo `@clip` (niente beat). Si legge dalla radice dello stash; se non c'è si crea con una clip d'esempio. Le clip del kit stanno sotto il SET e vanno live come le altre.

## Comandi controller (da confermare)

- **Tab (alterna ● attivo / ▸ prossimo)**: tasto alto 3 del controller, **tocco** (decisione di Valerio: CUFFIA + GO LIVE sarebbe una trappola, perché con CUFFIA premuto GO LIVE deve mandare la clip). Da tastiera: Tab.
- **CUFFIA tenuto + ◀ ▶**: cambia il prossimo brano del SET (oggi scorre la libreria).
- **Passa al prossimo brano**: sempre il tasto 3, **tenuto 1 secondo** (lampeggia mentre aspetta la fine della frase, come il paracadute).
- **◀ ▶ da soli**: scena indietro/avanti del beat (come adesso).

## Cosa non cambia

Scratch resta com'è (un bottone nel CUE, accanto a «brano»). Le linguette valgono per i brani del SET. Un brano aperto dalla libreria fuori dal SET si apre nella linguetta «▸ prossimo».
