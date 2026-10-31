#!/bin/zsh
# Prova dei LED in modalità standard (valori della tabella RX ufficiale, canale 11). Guarda il controller: il Mac annuncia ogni passo.
cd "$(dirname "$0")/../.." || exit 1
SPIA_LED=1 node_modules/.bin/electron strumenti/midi-spia 2>&1 | grep -E "^(INGRESSO|USCITA|STATO|PASSO|[0-9]+\.[0-9]+ )"
echo "fatto: registro in ${TMPDIR}cutx-midi-spia-led.log"
