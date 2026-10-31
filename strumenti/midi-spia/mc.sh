#!/bin/zsh
# Mette l'X-Touch Mini in modalità Mackie (MC) e ci resta (il modo si ricorda anche dopo aver scollegato). Il Mac ti dice a voce
# cosa fare (circa 3 minuti). Il registro: ${TMPDIR}cutx-midi-spia-mc.log
# Per tornare a standard (non serve): tieni premuto il tasto MC mentre ricolleghi il cavo USB, rilascialo quando il led MC MODE si spegne.
cd "$(dirname "$0")/../.." || exit 1
SPIA_MC=1 node_modules/.bin/electron strumenti/midi-spia 2>&1 | grep -E "^(INGRESSO|USCITA|STATO|PASSO|[0-9]+\.[0-9]+ )"
echo "fatto: registro in ${TMPDIR}cutx-midi-spia-mc.log"
