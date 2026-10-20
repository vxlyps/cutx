# CUTX · design

Tecnologia canaglia. Semplice come un oggetto Teenage Engineering, sporco come un monitor CRT lasciato acceso in officina. Niente decorazioni senza una funzione, niente animazioni al passaggio del mouse.

I file in `riferimenti/` sono le tavole approvate. Sono scritti in un formato per un editor di design (tag `<x-dc>`, `<sc-if>`), quindi non si aprono nel browser così come sono: vanno letti come riferimento per layout, misure, colori e testi, non copiati come codice.

| Tavola | Cosa mostra |
| --- | --- |
| `main.html` | La postazione: browser a sinistra, CUE al centro, LIVE a destra |
| `impostazioni.html` | Scorciatoie personalizzabili e interruttori |
| `proiettore.html` | Quello che vede il pubblico, solo codice |
| `proiettorehydra.html` | Il proiettore con Hydra dietro |
| `icona.html` | Icona dell'app e wordmark |

## Colori

| Nome | Valore | Uso |
| --- | --- | --- |
| fondo | `#050604` | Sfondo di tutto, nero che tira al verde |
| pannello | `#0B0B0B` | Tasti e campi |
| linea | `#1F1F1F` | Divisori |
| bordo | `#2A2A28` | Bordi dei tasti e delle card |
| testo | `#D9DCCC` | Testo principale, bianco sporco |
| spento | `#7A7E72` | Etichette, testo secondario |
| secondario | `#A3A796` | Descrizioni |
| marcio | `#9FC23A` | **Solo ciò che suona live.** Mai decorativo |
| marcio scuro | `#4E6118` | Spessore inferiore del tasto GO LIVE |
| su marcio | `#0B0F03` | Testo sopra il verde |

Il bagliore esiste solo sul verde: `text-shadow: 0 0 12px rgba(159,194,58,.6)` sul testo, `box-shadow: 0 0 16px rgba(159,194,58,.35)` sul tasto GO LIVE, `filter: drop-shadow(0 0 6px rgba(159,194,58,.55))` sul gatto.

In cuffia si usa il bianco (`#D9DCCC`): note evidenziate in bianco nel CUE, in verde nel LIVE. Così si capisce sempre cosa sente il pubblico e cosa senti solo tu.

## Font

- **Wordmark CUTX** (`risorse/logo/`): logo disegnato da Valerio, di sua proprietà. Non è un font: si usa come immagine. Varianti `marcio`, `bianco`, `nero`, `box_nero`, `box_marcio`, in SVG e in PNG da 512, 1024 e 2048 px. Nell'interfaccia va `cutx_bianco`.
- **Canaglia Stencil** (`risorse/font/`): font ricavato dalle lettere di Valerio, di sua proprietà, si può distribuire nel repo. Contiene A–Z, punto, trattino, punto centrale e spazio; le minuscole vengono mostrate maiuscole. Si usa per titoli di sezione (CUE, LIVE), insegna TECNOLOGIA CANAGLIA, numeri grandi.
- **Fragment Mono** (Google Fonts, licenza OFL): tutto il resto, codice compreso. Va incluso nell'app come file locale, non caricato da internet.
- Le cifre non esistono nello stencil: i numeri cadono su Fragment Mono. Va bene così.

## Tasti

Tasti come keycap: angoli 3 px, bordo 1 px `#2A2A28`, bordo inferiore 3 px che dà lo spessore, etichetta in minuscolo, scorciatoia scritta accanto in piccolo e spenta. Tre stati: normale, acceso (fondo `#D9DCCC`, testo scuro), GO LIVE (fondo marcio con bagliore). Gli interruttori sono due tasti attaccati, `on` e `off`.

## Il gatto

Disegni originali di Valerio in `risorse/gatti/disegni-originali.png`, ricalcati linea per linea negli SVG. Quattro pose: `seduto` (logo e icona), `lecca`, `dorme`, `in_piedi`. Varianti: `_marcio` (verde), `_bianco`, e `_logo_` con tratto spesso per le misure piccole (sotto i 120 px usa sempre la versione logo).

Animazione: cambio di posa secco, senza transizioni. Sequenza indicativa: seduto 7 s, lecca 3,5 s, seduto 6 s, dorme 5 s, seduto 5 s, in piedi 2 s. Si spegne dalle impostazioni.

## Insegna TECNOLOGIA CANAGLIA

Testo in Canaglia Stencil, verde marcio con bagliore, su un fondo a puntini LED (`#0A0D06` con punti `#1A2010` ogni 4 px), bordo `#1F2614`.
- Postazione: accanto al gatto, si accende solo quando il gatto non è seduto.
- Proiettore senza Hydra: sempre visibile, sopra il gatto.
- Proiettore con Hydra: insieme a gatto e wordmark CUTX, si toglie con "logo sopra hydra".
- Interruttore generale nelle impostazioni.
