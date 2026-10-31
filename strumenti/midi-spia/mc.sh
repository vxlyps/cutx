#!/bin/zsh
# Giro in modalità Mackie (MC): entra con un messaggio, registra i gesti, prova gli anelli, poi torna in standard da solo.
# Se alla fine il led MC MODE resta acceso: tieni premuto il tasto MC mentre ricolleghi il cavo USB, rilascialo quando il led si spegne.
cd "$(dirname "$0")/../.." || exit 1
SPIA_MC=1 node_modules/.bin/electron strumenti/midi-spia 2>&1 | grep -E "^(INGRESSO|USCITA|STATO|PASSO|[0-9]+\.[0-9]+ )"
echo "fatto: registro in ${TMPDIR}cutx-midi-spia-mc.log"
