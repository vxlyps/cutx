# Ultimo stato - 16/11/2026
Fatto: barra e schede del SYNTH e del DRUM negli stessi punti; riga del pianoroll allineata; arpeggio su 3 righe; CLEAR e clear notes svuotano anche il codice (note("~")); gruppo MOD (2 LFO: target, wave, bars, depth, riga `.lpf(sine.range(a, b).slow(n))`); specchietto forma d'onda + curva filtro (synth-scope.js).
Funziona: test puri 44 ok, prova synth+drum 346 ok, 0 falliti, LFO verificato su Strudel vero.
Non fatto: ascolto/occhio di Valerio; glide e OSC2 (non nativi in Strudel); suoni salvati (le clip già lo sono); controller per MOD; foto del gruppo MOD/ARPEGGIO (sotto il bordo).
File toccati: synth-codice.js, synth-modello.js, synth-vista.js, synth-roll.js, synth-scope.js (nuovo), drum-vista.js, synth.css, drum.css, stile.css, testi/it.json, prova.js, test/synth.test.js.
Prossimo passo: Valerio guarda la barra ferma tra le schede, MOD e specchietto; poi MOD sul controller e tastiera MIDI.
