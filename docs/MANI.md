# MANI (sperimentale, 5.1)

Comandare CUTX con la mano, tramite la webcam. Prima versione con **un gesto solo**: l'altezza della mano comanda un filtro passa-basso su tutto il live. Spento di serie; se non convince resta nascosto nelle impostazioni e non blocca niente.

## Come si usa
- **M** (fuori dagli editor, rimappabile in Impostazioni → scorciatoie) accende e spegne. Da spento la camera è chiusa del tutto e non pesa niente.
- Da acceso: mano in alto = filtro aperto, in basso = chiuso, scala esponenziale 200–16000 Hz. Nel LIVE compare la riga `all(x => x.lpf(…)) // mano`, come quella del fader.
- Mentre la mano comanda, il fader non scrive la sua riga (la ricorda e la rimette quando la mano smette): al filtro comanda uno solo.
- Se la camera perde la mano (dopo 0,3 s, per non reagire a un fotogramma mancato) il filtro torna aperto in 2 cicli, in modo continuo; poi la riga sparisce e torna il fader. Con M spento torna tutto subito com'era.
- La finestrella (colonna a sinistra, sopra l'aiuto): immagine della camera a specchio con lo scheletro, barra del filtro, «MANO ON». La barra è verde mentre la mano comanda, ambra mentre il filtro sta tornando aperto. **Sul proiettore non va niente** (la riga «mano» non gli arriva).
- Impostazioni → MANI: accese di serie (spento), quale camera, sensibilità (quanta strada deve fare la mano: bassa = quasi tutta l'inquadratura, alta = meno della metà).

## Come gira
- `mani.html` + `mani.js`: una **finestra nascosta in un processo a parte** (la quarta, accanto a controllo, live e cuffia). Apre la camera e riconosce la mano con MediaPipe (`@mediapipe/tasks-vision`, Apache 2.0, in locale, niente internet). Esiste solo finché le mani sono accese; se si blocca o crasha viene chiusa e il filtro torna com'era (avviso nel CUE).
- Al controllo manda, con un canale diretto come i motori, la posizione della mano a ogni fotogramma e un'immagine JPEG piccola (160×120, ~15 al secondo, solo se la finestrella è aperta). **Nessuna immagine esce dal Mac e nessuna viene salvata.**
- `mani-filtro.js` (puro, coi test): dall'altezza della mano al filtro. Valore ammorbidito (τ 120 ms), zona morta 1,2%, al massimo ~15 righe al secondo (ogni riga globale fa rifare i pattern del live, come il fader).
- Il modello (`risorse/mani/hand_landmarker.task`, 7,8 MB) sta nel repo; il Wasm (14 MB) si copia da `node_modules` in `dist/mani` a ogni build (`vite.config.js`). Niente download a ogni avvio.
- I motori audio non si toccano: la riga «mano» è una normale riga globale.

## Quanto pesa (Mac mini M4, misurato con `top`, video di prova a 24 fps)
- Riconoscimento su **CPU** (scelta di serie): circa **29% di un core**, 15 ms a fotogramma. Il processo grafico condiviso sta all'8%.
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
- Un gesto solo, una mano sola (`numHands: 1`).
- La camera finta dà una mano pulita e ben illuminata: con la luce di una serata (buio, luci colorate, proiettore in faccia) il riconoscimento può perdere la mano più spesso. Va provato dal vivo.
- Altri gesti (pugno = stop, mano chiusa = …), la GPU come opzione, i fotogrammi al secondo (oggi 24) e il proiettore: dopo, solo se questo funziona.
