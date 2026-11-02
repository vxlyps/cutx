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

- Aprendo il SYNTH, l'X-Touch passa al synth da solo; tornando al LIVE torna al live.
- Tasti in alto 1-7: scelgono il modulo (oscillatore, filtro, ampiezza, effetti, mod, arpeggio, caos). Manopole 1-7: i parametri di quel modulo. Lo specchio mostra modulo e nomi.
- SEMPRE del LIVE, anche nel SYNTH: manopola 8 (generale), fader, paracadute (tasto 8), per sicurezza in serata.
- REC, ▶ cuffia e → CUE: da proporre (controller e scorciatoie che non si scontrano con i tasti del piano).
- Un domani con due controller: la tastierina comanda il synth e l'X-Touch resta sempre al LIVE (impostazione).

## Blocchi di lavoro

Uno alla volta, commit e prove per ognuno, poi mi fermo a provare.

1. Vista SYNTH con oscillatore, filtro, ampiezza, effetti, pannello codice, preview in cuffia, → CUE.
2. Note: pianoroll, tastiera del Mac, REC quantizzato.
3. MOD trascinabili.
4. ARPEGGIO e CAOS.
5. Controller nel SYNTH.
6. Tastiera MIDI (quando ce l'ho) e suoni salvati.

## Verificato in superdough 1.3.0

- **Forme**: `sine`, `sawtooth`, `square`, `triangle` (oscillatori nativi; `user` con `partials`); `supersaw` (`unison` voci 1-100, `spread` 0-1, `detune`); `pulse` (`pw` larghezza); rumori `white`, `pink`, `brown`, `crackle` (`density`); FM su qualsiasi sintetizzatore con `fm` (indice), `fmh` (armonica), `fmwave`, `fmattack/fmdecay/fmsustain/fmenv`; wavetable `wt_*`; campioni dello stash con `s('nome')`.
- **Pitch**: inviluppo `penv` (semitoni), `pattack`, `pdecay`, `psustain`, `prelease`; vibrato `vib`, `vibmod`.
- **Filtri**: `lpf`/`hpf`/`bpf` con `lpq`/`hpq`/`bpq`; inviluppi `lpenv`, `lpattack`, `lpdecay`, `lpsustain`, `lprelease` (e gli equivalenti `hp*`, `bp*`); `ftype` (12db, ladder, 24db), `fanchor`; `vowel`; `djf`.
- **Ampiezza**: `attack`, `decay`, `sustain`, `release`, `gain`, `velocity`, `postgain`, `pan`.
- **Effetti**: `shape`, `distort` (+ `distortvol`, `distorttype`), `crush`, `coarse`, `tremolo` (+ depth/phase/shape/sync), `phaser` (+ depth/center/sweep), `compressor` (+ ratio/knee/attack/release), `delay` (+ `delaytime`, `delayfeedback`, `delaysync`), `room` (+ `roomsize`, `roomfade`, `roomlp`, `roomdim`), `duckorbit` (sidechain).
- Da ricontrollare caso per caso nel codice (non dare per scontato): `n`/`detune` del supersaw (in superdough `n` vale come detune se `detune` manca), valori consentiti di `ftype`.

## Blocco 1 · fatto (2/11/2026)

Vista SYNTH nella stessa finestra (⌘1/⌘2), oscillatore, filtro, ampiezza, effetti (con phaser e tremolo), pannello codice, ▶ in cuffia a volume prudente (⌘↵), → CUE (brano attivo, prossimo, kit), «apri nel synth» sulle clip fatte dal synth, ⌘Z/⇧⌘Z, A/B, init, sorprendimi. Dettagli e scelte nella voce «SYNTH · blocco 1» di `CLAUDE.md`.

Limiti scelti: sovrapposizioni (layer) al massimo 5; voci del supersaw al massimo 7; sub = una copia in più; peso stimato «pesante» da 10, tetto a 18; risonanza al massimo 25 (il limiter e il volume 0,5 proteggono le orecchie); gain al massimo 1; feedback del delay al massimo 0,85.

Non c'è ancora: pianoroll, tastiera, REC (blocco 2); modulatori (blocco 3); arpeggio e caos (blocco 4); controller (blocco 5); campioni dello stash come forma d'onda, MIDI e suoni salvati (blocco 6).
