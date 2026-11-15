# MANI (sperimentale, 5.1)

Comandare CUTX con la mano, tramite la webcam. Prima versione con **un gesto solo**: l'altezza della mano comanda un filtro passa-basso su tutto il live. Spento di serie; se non convince resta nascosto nelle impostazioni e non blocca niente.

## Come si usa
- **M** (fuori dagli editor, rimappabile) accende e spegne. **⇧M** passa al modo dopo (FILTRO → SPAZIO → CTX). Da spento la camera è chiusa del tutto e non pesa niente.
- **Aggancio**: la mano comanda solo dopo che la tieni **aperta e ferma** verso la camera per circa mezzo secondo (tarabile in Impostazioni → MANI). Nella finestrella un anello si riempie e compare AGGANCIATA. Una mano che passa o entra ed esce di corsa non aggancia.
- **Niente salto**: all'aggancio il valore resta dov'è e la mano lo sposta da lì (come una manopola già girata). Sopra e sotto il punto di aggancio il percorso è scalato, così tutta la manopola resta raggiungibile.
- **Mano persa**: il valore resta fermo 2 secondi; se rientri e la tieni aperta e ferma un quarto di secondo riagganci al volo da dov'era. Dopo i 2 secondi torna a neutro piano in 2 cicli, poi la riga sparisce.
- **Pugno chiuso = blocca**: il valore resta lì (tornando a un attimo prima che chiudessi la mano), la riga resta nel live e la mano non comanda finché non riagganci (aperta e ferma per mezzo secondo).
- **Solo la mia mano**: si riconoscono fino a 2 mani; conta la più grande, e solo se il centro è dentro la **zona** che disegni trascinando sulla finestrella (doppio clic = tutta l'inquadratura). La zona si salva.
- **Tre modi** (stile Kaoss Pad), ognuno scrive una riga `all(x => …) // mano` o, se scelto «sul livello scelto», righe nella coda del livello (a fine gesto la coda torna com'era):
  - **FILTRO** (di serie): altezza = taglio (200–16000 Hz), destra-sinistra = risonanza;
  - **SPAZIO**: altezza = riverbero, apertura delle dita (pollice–mignolo) = eco;
  - **CTX**: altezza = crush, destra-sinistra = distorsione.
- Nel modo FILTRO, finché la mano comanda su tutto il live, il fader non scrive la sua riga (la ricorda e la rimette): al filtro comanda uno solo.
- **La finestrella** (colonna a sinistra, sopra l'aiuto): camera a specchio con lo scheletro, il nome del modo grande, l'anello dell'aggancio, due barre (i due valori), lo stato (AGGANCIATA, mano persa, BLOCCATA…) e il valore. Verde mentre comanda, ambra mentre il valore aspetta o torna a neutro. Il nome del modo compare anche nel CUE quando cambi con ⇧M.
- **Sul proiettore**: solo la mano (i 21 punti e le linee, verde col bagliore, sottile) in alto al centro, **sotto solo i numeri** (`820 Hz · 6`) e due barrette; niente nomi, mai l'immagine della camera, non specchiata (il pubblico ti vede come la camera). Prima dell'aggancio grigia e tenue con l'anello che si riempie; agganciata verde piena con un piccolo anello; col pugno ferma e spenta. Compare quando la mano entra e si dissolve quando esce. Interruttore «la mano sul proiettore» tra i testi per il pubblico (acceso di serie).
- **Impostazioni → MANI**: pronte all'avvio, modo di partenza, su tutto il live o sul livello scelto, durata dell'aggancio, riconosci fino a 2 mani, camera, sensibilità.

## Come gira
- `mani.html` + `mani.js`: una **finestra nascosta in un processo a parte** (la quarta, accanto a controllo, live e cuffia). Apre la camera e riconosce la mano con MediaPipe (`@mediapipe/tasks-vision`, Apache 2.0, in locale, niente internet). Esiste solo finché le mani sono accese; se si blocca o crasha viene chiusa e il filtro torna com'era (avviso nel CUE).
- Al controllo manda, con un canale diretto come i motori, i punti delle mani viste a ogni fotogramma e un'immagine JPEG piccola (160×120, ~15 al secondo, solo se la finestrella è aperta). **Nessuna immagine esce dal Mac e nessuna viene salvata.**
- `mani-filtro.js` (puro, coi test): dall'altezza della mano al filtro. Valore ammorbidito (τ 120 ms), zona morta 1,2%, al massimo ~15 righe al secondo (ogni riga globale fa rifare i pattern del live, come il fader).
- Il modello (`risorse/mani/hand_landmarker.task`, 7,8 MB) sta nel repo; il Wasm (14 MB) si copia da `node_modules` in `dist/mani` a ogni build (`vite.config.js`). Niente download a ogni avvio.
- I motori audio non si toccano: la riga «mano» è una normale riga globale.

## Quanto pesa (Mac mini M4, misurato con `top`, video di prova a 24 fps)
- Riconoscimento su **CPU** (scelta di serie): con **1 mano** circa **27% di un core**, 17 ms a fotogramma; con **2 mani** (di serie, serve a ignorare gli altri) circa **48%**, 22 ms. Il processo grafico condiviso sta al 9%. Interruttore «riconosci fino a 2 mani» per tornare alla più leggera.
- Su GPU il processo «mani» scende al 5% ma il lavoro finisce nel processo grafico condiviso (16%): rischio di scatti sui visual del proiettore. Per ora la GPU non è un'opzione; il codice è una riga (`delegate` in `mani.js`).
- Dopo M ci vogliono **circa 7 secondi** prima della prima lettura (camera, modello, Wasm). Se serve in serata: accenderle prima (o «accese all'avvio»).

## Provarlo senza webcam
`npm run prova:parte -- mani` (a volume basso, come sempre) usa un video di una mano al posto della camera: `~/Progetti/cutx-prova-mani/mano.mjpeg` (o `CUTX_VIDEO_MANO`). Senza il file la prova si salta. Da un `.mov`:

```
ffmpeg -i mano.mov -vf scale=640:-2,fps=30 -an -c:v mjpeg -f mjpeg mano.mjpeg
```

La prova controlla: la finestra è un processo a parte, riconosce a 12–35 fps, costo per fotogramma, CPU, immagine JPEG, tasto M, riga «mano» nel live (da ~200 a ~16000 Hz col video di Valerio), il fader che cede il posto e torna, la mano persa che torna aperta, M spento che chiude tutto.

## Permesso della camera su macOS
Nel pacchetto c'è `NSCameraUsageDescription` (`package.json` → `build.mac.extendInfo`): verificato leggendo l'`Info.plist` del `.app` costruito. L'app è senza firma e senza runtime protetto, quindi non servono altri permessi. **Non verificato:** la finestra del permesso vera sull'app installata dal `.dmg` con la webcam vera (la prova automatica usa una camera finta, che non passa dal permesso di macOS). Da guardare la prima volta: premi M → macOS chiede «CUTX vorrebbe usare la camera» → consenti.

## Limiti e idee dopo
- Una mano che comanda (le altre vengono ignorate). Soglie aperta/pugno e larghezza delle dita da tarare con la mano vera (`SOGLIE` in `mani-gesto.js`).
- La camera finta dà una mano pulita e ben illuminata: con la luce di una serata (buio, luci colorate, proiettore in faccia) il riconoscimento può perdere la mano più spesso. Va provato dal vivo.
- Per dopo (in `docs/PROSSIMI.md`): pinza = colpo tenuto (roll), gesto del drop, due mani, braccialetto colorato per riconoscere la mia mano, GPU come opzione.
