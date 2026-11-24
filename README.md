<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="design/risorse/logo/cutx_bianco_1024.png">
    <img src="design/risorse/logo/cutx_nero_1024.png" alt="CUTX" width="320">
  </picture>
</h1>

> 🚧 In costruzione / Under construction

**IT** — CUTX è un'app per Mac per fare live coding musicale dal vivo, pensata come un CDJ: una libreria di pezzi di codice pronti, una cuffia per provarli a tempo, e un'uscita live per le casse e il proiettore.

CUTX è basato su [Strudel](https://strudel.cc) ([codice sorgente](https://codeberg.org/uzu/strudel)), il progetto di live coding di Felix Roos e della community di Strudel. Usa i pacchetti npm ufficiali di Strudel senza modificarli. CUTX **non** è un progetto ufficiale di Strudel e non è affiliato ai suoi autori: tutto il merito del motore musicale è loro.

**EN** — CUTX is a Mac app for live music coding, designed like a CDJ: a library of ready-made code snippets, a headphone cue to try them in time, and a live output for speakers and projector.

CUTX is built on [Strudel](https://strudel.cc) ([source code](https://codeberg.org/uzu/strudel)), the live coding project by Felix Roos and the Strudel community. It uses the official Strudel npm packages, unmodified. CUTX is **not** an official Strudel project and is not affiliated with its authors: all credit for the music engine goes to them.

## Provare / Try it

Serve un Mac Apple Silicon e Node.js. / Requires an Apple Silicon Mac and Node.js.

```sh
npm install
npm start
```

### Controller / Controllers

**IT** — CUTX usa il **Korg nanoKONTROL2** (la regia: cosa suona) e l'**Arturia/Behringer X-Touch Mini** in modalità MC (come suona). Una volta sola, col nano, nell'**Editor Korg**: LED Mode = **External**, pulsanti in **Momentary**, un solo canale MIDI (**1**), tipo **CC**, poi **Write Scene Data**. Le mappe stanno in `docs/CANALI.md`.

**EN** — CUTX uses the **Korg nanoKONTROL2** (the director: what plays) and the **X-Touch Mini** in MC mode (how it sounds). Once, with the Korg Editor: LED Mode = **External**, buttons **Momentary**, a single MIDI channel (**1**), assign type **CC**, then **Write Scene Data**. Maps in `docs/CANALI.md`.

## Licenza / License

[AGPL-3.0-or-later](LICENSE), come Strudel / like Strudel.

Logo, font e gatti © Michele Ciavarella (DCBstudio), design dell'interfaccia © Valerio Francini: tutti i diritti riservati, fuori dall'AGPL ([design/LICENSE](design/LICENSE)). / Logo, font and cats © Michele Ciavarella (DCBstudio), interface design © Valerio Francini: all rights reserved, not covered by the AGPL.
