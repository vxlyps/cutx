# CUTX SYNTH

Grande fase nuova (decisa il 2/11/2026). Questo file è la specifica scritta da Valerio; le note "Verificato in superdough" in fondo sono state controllate sul codice installato (superdough 1.3.0, @strudel/core 1.2.6). Il piano di ogni blocco si aggiunge qui, dopo l'ok.

## Idea

Un synth dentro CUTX, completo come può esserlo nei limiti di Strudel/superdough, dove ogni manopola È un parametro di Strudel: il codice si scrive mentre giro, sempre con TUTTI i parametri espliciti (niente nomi di preset nel codice). Dopo il passo dei preset, quando applico un suono salvato, il codice si riempie con tutti i suoi parametri.

## Due viste, come Ableton

LIVE (quella di oggi: CUE e LIVE) e SYNTH. Si passa con ⌘1 / ⌘2 e dal controller. Il live continua a suonare mentre sono nel SYNTH.

## La vista SYNTH

- **Barra**: nome del suono, ▶ cuffia (preview in loop, a tempo col live), ● REC, salva suono, → CUE (manda la clip al brano attivo, al prossimo o al KIT: scelgo io).
- **OSCILLATORE**: forma (sine, sawtooth, square, triangle, supersaw, FM, rumore white/pink/brown, campione dello stash), voci e detune (layer con `add(note(x))` o i parametri del supersaw), ottava, sub (−12), pan.
- **FILTRO**: tipo (lpf, hpf, bpf), cutoff, risonanza, inviluppo del filtro (lpenv, lpattack, lpdecay, lpsustain, lprelease), vowel.
- **AMPIEZZA**: attack, decay, sustain, release, gain, inviluppo di pitch.
- **EFFETTI**: shape, distort, crush, coarse, delay (tempo a suddivisioni del BPM, feedback), room e roomsize, e gli altri effetti che superdough supporta davvero (verificati, niente parametri inventati).
- **MOD**: almeno 2 modulatori (sine, saw, square, perlin, rand) con da-a, cicli e fase. Si trascinano su qualsiasi manopola e diventano un segnale nel codice, es. `.lpf(sine.range(300, 2400).slow(8))`. La manopola modulata si vede (colore e anello diverso).
- **ARPEGGIO**: modi su/giù/su-giù/caso/accordo, passo, ottave, gate, ritmo euclideo. Usa le funzioni vere di Strudel (`arp`, `struct` con euclide, ecc.).
- **CAOS**: probabilità di saltare note (`degradeBy`), raddoppiare (`sometimesBy` + `ply`), ottava su, al contrario, umanizza la dinamica (perlin), più un SEME per renderlo ripetibile.
- **NOTE**: pianoroll vero (1/2/4/8 cicli, griglia 1/16, aggancio alla scala, accordi, disegno e modifica col mouse) e la stessa cosa in mini-notazione: modifico l'uno o l'altra e restano allineati.
- **SUONARE**: tastiera del Mac (A S D F G H J K bianchi, W E T Y U neri, Z/X ottava) e qualsiasi tastiera MIDI (presto una Arturia MiniLab 3, con dinamica). Le note suonano subito in cuffia con il suono del synth. REC registra a tempo col live, con conteggio, quantizzato, e le note finiscono nel pianoroll.
- **CODICE**: pannello sempre visibile col codice generato, aggiornato mentre giro. Se lo modifico a mano, il pannello si allinea dove può e segnala cosa non riesce più a comandare.
- **SUONI SALVATI**: libreria di suoni nello stash (solo il suono, senza note), da riusare in altre clip.

## Controller nel SYNTH

Fatto: vedi «Cosa c'è adesso». Resta da fare: i tasti 6 e 7 in alto (MOD e ARPEGGIO) quando ci saranno, e un domani con due controller la tastierina al synth e l'X-Touch sempre al LIVE.

## Blocchi di lavoro

Uno alla volta, commit e prove per ognuno, poi mi fermo a provare.

1. Vista SYNTH con oscillatore, filtro, ampiezza, effetti, pannello codice, preview in cuffia, → CUE. **Fatto.**
2. Note: pianoroll, tastiera del Mac, REC quantizzato. **Fatto** (con matita, passi e velocity).
3. Controller nel SYNTH. **Fatto.**
4. MOD trascinabili. **Da fare** (dopo la beta 4).
5. ARPEGGIO e CAOS. **Da fare.**
6. Tastiera MIDI (quando ce l'ho) e suoni salvati; campioni dello stash come forma d'onda. **Da fare.**

## Verificato in superdough 1.3.0

- **Forme**: `sine`, `sawtooth`, `square`, `triangle` (oscillatori nativi; `user` con `partials`); `supersaw` (`unison` voci 1-100, `spread` 0-1, `detune`); `pulse` (`pw` larghezza); rumori `white`, `pink`, `brown`, `crackle` (`density`); FM su qualsiasi sintetizzatore con `fm` (indice), `fmh` (armonica), `fmwave`, `fmattack/fmdecay/fmsustain/fmenv`; wavetable `wt_*`; campioni dello stash con `s('nome')`.
- **Pitch**: inviluppo `penv` (semitoni), `pattack`, `pdecay`, `psustain`, `prelease`; vibrato `vib`, `vibmod`.
- **Filtri**: `lpf`/`hpf`/`bpf` con `lpq`/`hpq`/`bpq`; inviluppi `lpenv`, `lpattack`, `lpdecay`, `lpsustain`, `lprelease` (e gli equivalenti `hp*`, `bp*`); `ftype` (12db, ladder, 24db), `fanchor`; `vowel`; `djf`.
- **Ampiezza**: `attack`, `decay`, `sustain`, `release`, `gain`, `velocity`, `postgain`, `pan`.
- **Effetti**: `shape`, `distort` (+ `distortvol`, `distorttype`), `crush`, `coarse`, `tremolo` (+ depth/phase/shape/sync), `phaser` (+ depth/center/sweep), `compressor` (+ ratio/knee/attack/release), `delay` (+ `delaytime`, `delayfeedback`, `delaysync`), `room` (+ `roomsize`, `roomfade`, `roomlp`, `roomdim`), `duckorbit` (sidechain).
- Da ricontrollare caso per caso nel codice (non dare per scontato): `n`/`detune` del supersaw (in superdough `n` vale come detune se `detune` manca), valori consentiti di `ftype`.

## Cosa c'è adesso (beta 4, 4/11/2026)

Dettagli di codice e prove: voci «SYNTH · …» in `CLAUDE.md`. Tutte le parole dell'interfaccia del SYNTH sono in `src/renderer/testi/it.json` (chiave `synth`).

### Vista e suono
- **Vista**: ⌘1 LIVE, ⌘2 SYNTH (o i due tasti in barra). Il live non si ferma mai. **Spazio** = ▶/■ della prova in cuffia (non nei campi di testo); ⌘↵ come prima. ⌘Z / ⇧⌘Z.
- **Pannello**: oscillatore (forma, voci, detune, stereo, width, FM, ottava, sub, pan), filtro (tipo, cutoff, reso, slope, env, vocale), ampiezza (ADSR, gain, pitch), DRIVE (shape, distort, crush, coarse), SPACE (delay, tempo, feedback, room, size, phaser, tremolo). Le manopole sono chiare (il verde è solo del live); gli avvisi in ambra.
- **Tetti**: layer ≤ 5, unison ≤ 7, peso «pesante» da 10, tetto 18, reso ≤ 25. Cuffia: limiter e volume prudente (0,5 nel SYNTH).
- **A/B**, **init**, **MUTATE** con «quanto» e **tipo del suono** (BASS · LEAD · ARP · PAD · KEYS · FX, limiti per tipo nella tabella più sotto).
- **→ CUE**: brano attivo, prossimo o kit; la clip porta `// @synth {…}` e `// @clip nome · tipo`; nel CUE le clip sono raggruppate per tipo; × toglie la clip (⌘Z la riprende); «synth» sulla card la riapre.

### Codice
- Il pannello del codice è un campo di testo: quello che il pannello conosce sposta le manopole, il resto resta scritto in fondo, segnato «a mano» (anello tratteggiato ambra sulle manopole scavalcate). Errori o valori fuori limiti non fermano il suono.
- **Il codice mostra solo quello che serve**: non scrive quello che una chiamata a mano scrive già (niente `.delaysync` accanto a `.delaytime`, un solo `.lpf`) né quello che il motore fa da solo (unison 5, detune .18, spread .6, feedback .5, delaysync 3/16, roomsize 2, profondità phaser .75, l'inviluppo .001/.05/.6/.01). Il suono init ha un inviluppo suo e lo scrive. Un inviluppo scritto a metà si completa come fa superdough.
- I commenti in cima restano in cima.
- **Teste lette**: `note("…")` (nomi o numeri midi), `n("…").scale("A2:minor")` (anche scale alternate `<A:minor F:major>`), `.velocity("…")`. La scala di Strudel va scritta senza spazi (`C3:minor:pentatonic`). Scale conosciute: major/ionian, minor/aeolian, dorian, phrygian, lydian, mixolydian, major/minor pentatonic, blues.

### Pianoroll (scheda «note»)
- **Griglie**: 1/16 (predefinita), 1/12 (terzine), 1/32, 1/24, 1/48, scelta da sola in base alle note o dal menu. Più di 5 note in un ciclo che non cadono su nessuna griglia (quintine) si vedono ma non si modificano. 1, 2, 4 o 8 cicli; scala e radice con aggancio; accordi; lunghezza della nota.
- **Mini-notazione** (il campo sopra) e pianoroll restano allineati. Quello che il pianoroll non legge (`? / | euclidei`) resta nel testo, con un avviso.
- **Selezione** (strumento di partenza): rettangolo, doppio clic per una nota, ⇧ per aggiungere, spostare e allungare tutte le scelte, ⌘A, ⌘C ⌘X ⌘V (anche dal menu del Mac), ⌘D, ↑↓ e ⇧↑↓ per trasporre, ⌫.
- **Matita** (B alterna, B tenuto = temporanea): un clic mette una nota; trascinando ne mette una ogni «lunghezza», all'altezza del mouse; sulle note cancella.
- **Passi** (pulsante «passi», esc esce): i tasti del piano scrivono al cursore e lo fanno avanzare; più tasti insieme = accordo (un solo ⌘Z); Spazio = pausa, ⌫ = indietro, ←→ muovono il cursore.
- **Velocity**: striscia sotto le note, una barra per ogni punto in cui parte una nota (un accordo ne ha una sola); clic o trascinamento, a passi di .05; nel codice `.velocity("1 .5 1@2")`.
- **Tastiera del Mac**: A S D F G H J K bianchi, W E T Y U neri, Z/X ottava (A = do 3), suona subito in cuffia.
- **REC**: una battuta di conteggio con click, poi un giro; note quantizzate alla griglia del pianoroll; con note già scritte si aggiunge.
- La prova controlla che le note (e le velocity) del pianoroll siano quelle che Strudel suona davvero.

### Controller (X-Touch Mini in MC)
Con ⌘2 l'X-Touch comanda il synth; impostazione «nel SYNTH: segue la vista / resta al LIVE» (con SHOW, quando ci sarà, sempre al LIVE).
- **Tasti in alto 1–5**: oscillatore, filtro, ampiezza, DRIVE, SPACE. Di nuovo lo stesso tasto = pagina 2 (il tasto lampeggia). 6 e 7 liberi.
- **Manopole 1–7**: i parametri del gruppo, posti fissi; un parametro che non conta ha l'anello spento. **Premuta e rilasciata** = valore di partenza (init); **premuta e girata** = regolazione fine (un decimo). Un giro continuo = un passo di ⌘Z.
- **Sempre del LIVE**: manopola 8 (volume generale), fader, paracadute (tasto 8). I tasti layer A/B non fanno niente nel SYNTH.
- **Tasti in basso**: DROP → CUE, REPLACE mutate, REWIND annulla, FORWARD ripeti, CYCLE A/B, STOP ferma, PLAY ▶ cuffia, REC.
- **Specchio** in ambra in fondo alla vista SYNTH («controller → SYNTH» o «→ LIVE»), mai sul proiettore.

### Limiti di MUTATE per tipo (`PROFILI` in `synth-modello.js`)

| tipo | forme | ottava | filtro | inviluppo | effetti |
|---|---|---|---|---|---|
| BASS | saw, square, supersaw (2–4 voci), triangle | −1 | solo lpf 150–1200 Hz, reso fino a 8 | attack ≤ 20 ms, decay .1–.4, sustain .4–.9, release ≤ .3 | sub possibile, distort spesso, delay/room quasi mai |
| LEAD | saw, square, supersaw, pulse | 0–+1 | lpf 1200–8000, reso fino a 10 | attack ≤ 50 ms, sustain .5–1, release .1–.6 | delay spesso, room media |
| ARP | saw, square, pulse, triangle | 0–+1 | lpf (o bpf) 800–6000, inviluppo del filtro quasi sempre | attack ≤ 10 ms, decay ≤ .25, sustain ≤ .3 | delay 1/8 o 3/16 spesso |
| PAD | supersaw (3–7 voci), saw, triangle, sine | 0–+1 | lpf 600–5000, reso ≤ 4 | attack .4–2, release 1–4 | room quasi sempre (.3–.8, size 3–8), phaser |
| KEYS | triangle, sine, square (+FM) | 0 | lpf 1500–6000 | attack ≤ 10 ms, decay .3–1.2, sustain .1–.5 | room, phaser, tremolo |
| FX | tutte, anche i rumori | −1…+2 | 200–12000, reso fino a 18 | libero | pitch env ±24, crush, distort, delay e room larghi |

Il gain non lo tocca mai MUTATE.

### Limiti noti
- L'arpeggio, i MOD e il CAOS non ci sono ancora.
- Il pianoroll non legge `? / | euclidei`, le quintine e i pattern che si ripetono ogni più di 8 cicli; il testo resta com'è.
- La velocity vale per le note scritte nel pianoroll; i tasti suonati dal vivo hanno velocity fissa. La velocity scritta a mano come segnale (`sine.range`) resta «a mano».
- Le scale: solo quelle elencate; la scala di Strudel va scritta con i due punti, senza spazi.
- Il «feeling» a mano (latenza dei tasti, rilascio) è stato provato solo da Valerio; le prove automatiche usano tasti e MIDI simulati.
- Le prove automatiche (`--prova=synth`) a volte falliscono alla prima esecuzione dopo una build (guasti sparsi, rilanciate passano): vedi `CLAUDE.md`.
- Tastiera MIDI (MiniLab 3) e suoni salvati: non ci sono ancora.
