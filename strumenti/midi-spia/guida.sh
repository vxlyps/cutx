#!/bin/zsh
# Giro guidato: il Mac ti dice a voce cosa fare con l'X-Touch Mini (circa 2 minuti e mezzo). Il registro: $TMPDIR/cutx-midi-spia.log
cd "$(dirname "$0")/../.." || exit 1
SPIA_GUIDA=1 node_modules/.bin/electron strumenti/midi-spia 2>&1 | grep -E "^(INGRESSO|USCITA|STATO|PASSO|[0-9]+\.[0-9]+ )"
echo "fatto: registro in ${TMPDIR}cutx-midi-spia-guida.log"
