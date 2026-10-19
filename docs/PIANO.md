# DANEEL · Piano

Una fase è chiusa solo quando Valerio ha verificato tutti i criteri.

## Fase 0 · Prova tecnica
Domanda: cuffia e casse restano a tempo?

- [ ] L'app Electron si avvia con `npm install && npm start`
- [ ] Editor Strudel funzionante
- [ ] Scelta della cartella valigetta, ricordata tra un avvio e l'altro
- [ ] I file in `suoni/` sono usabili come suoni
- [ ] Scelta delle uscite Live e Cuffia dall'elenco dei dispositivi
- [ ] Modalità test: stesso click su entrambe le uscite, con misuratore di sfasamento
- [ ] Dopo 10 minuti lo sfasamento resta stabile e sotto soglia
- [ ] Uno stem dalla valigetta suona
- [ ] Se il motore cuffia si blocca o crasha, il live continua senza accorgersene (e la cuffia riparte)
- [ ] L'app parte da zero su un Mac pulito (Apple Silicon)

## Fase 1 · Il CDJ
- [ ] Libreria letta dalla valigetta, griglia di pezzi colorati (nome, colore, BPM)
- [ ] Editor cuffia ed editor live separati
- [ ] Dalla cuffia mando live un pezzo, entra alla battuta successiva
- [ ] Più pezzi live insieme, ognuno con volume, mute e uscita dal live (taglio e sfumata)
- [ ] Tutto da tastiera, con scorciatoie chiare
- [ ] Formato manifest `daneel-pack.json` per estensioni e pacchi
- [ ] Punti di aggancio del cuore, provati con un'estensione d'esempio
- [ ] 20 minuti di fila solo da tastiera, senza mouse e senza buchi

## Fase 2 · Le mie canzoni
- [ ] Gli stem esportati da Ableton (WAV) nella valigetta diventano suoni e pezzi pronti
- [ ] Suoni base (bd, sd, hh…) nella valigetta; licenza di ogni banca controllata prima di farne un pacco pubblico
- [ ] Sample di codice: beat jungle che spezzetta uno stem
- [ ] Sample di codice: loop pronto
- [ ] Sample di codice: una canzone da mandare live un pezzo alla volta
- [ ] Suono una mia canzone smontata e rimontata dal vivo

## Fase 3 · Proiezione
- [ ] Seconda finestra a schermo intero sul proiettore: codice live grande, riga che suona in rosso, Hydra sotto
- [ ] Video della valigetta come sorgenti Hydra, distorti a tempo
- [ ] Interfaccia nella direzione grafica CROMO definitiva
- [ ] Proiettore acceso, i video si distruggono a tempo, il pubblico vede solo il codice live

## Fase 4 · Hardware
- [ ] APC mini mk2: griglia = libreria (primo tocco cuffia, secondo live)
- [ ] APC mini mk2: fader = volumi dei livelli, ultimo fader = distruzione video
- [ ] APC mini mk2: luci della griglia seguono lo stato (rosso = live)
- [ ] Sync PO-33 dalla terza uscita (impulso sul canale sinistro, 2 per quarto, SY2)
- [ ] Suono con il controller e il PO resta a tempo per tutta la sessione

## Fase 5 · App installabile
- [ ] `.dmg` solo arm64, senza firma Apple, costruito da GitHub Actions su runner macOS e pubblicato nelle Release
- [ ] Primo avvio guidato: valigetta, uscite, test
- [ ] Istruzioni nel README per aprire un'app non firmata (Impostazioni → Privacy → Apri comunque)
- [ ] Scarico il .dmg dalle Release su un Mac Apple Silicon, attacco l'SSD e suono senza Terminale

**→ Serata in officina.**

## Fase 6 · Videocamera (se ci gasa)
- [ ] Webcam come sorgente Hydra, feedback video
- [ ] Segmentazione persone in tempo reale, offline
- [ ] Maschere disegnate a mano sugli oggetti (projection mapping manuale)

## Fase 7 · Estensioni, AI e versione pubblica
- [ ] Estensione AI: scorciatoia, solo sul mio schermo, scrive solo in cuffia
- [ ] Versione 1.0 pubblica
- [ ] Documentazione per chi fa estensioni e pacchi
