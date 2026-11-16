# Ultimo stato - 16/11/2026
Fatto: ARPEGGIO «più potente», passo 1 (il disegno): modi nuovi CONVERGE, DIVERGE, PINKY, THUMB; PULSE (+ROTATE) = ritmo euclideo con `.mask("1(k,n,rot)")`; RETRIG = una nota ogni 4 in raffica con `.ply("1 1 1 3…")`. Etichette del gruppo ora in inglese stile Ableton (mode, rate, octaves, accent, humanize, up/down/up-down/random).
Funziona: test puri 41 ok; note verificate su Strudel vero fuori dall'app (converge 0-3-1-2, diverge, pinky, thumb, pulse 5/8, retrig). Prova `synth` nell app: 305 ok, 0 falliti.
Non fatto: ORDER (ordine scritto da te, es. `0 2 1 3`), passo 2 (POLYMETER giro storto, EVOLVE, CHANCE/CAOS), passo 3 (eco a tempo, filtro che pulsa, glide), foto, controller. Non ancora ascoltato da Valerio.
File toccati: src/renderer/synth-codice.js (`rigaArp`, modi), synth-modello.js (arppulse, arprot, arpretrig), testi/it.json, test/synth.test.js.
Prossimo passo: Valerio ascolta (⌘2, gruppo ARPEGGIO: mode converge/pinky, pulse 5, retrig 3); poi passo 2 col giro storto.
