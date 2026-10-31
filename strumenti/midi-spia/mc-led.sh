#!/bin/zsh
# Prova dei LED in modalità MC: usa i numeri dei tasti visti da mc.sh (lancia prima quello). Guarda il controller: il Mac annuncia ogni passo.
cd "$(dirname "$0")/../.." || exit 1
SPIA_MCLED=1 node_modules/.bin/electron strumenti/midi-spia 2>&1 | grep -E "^(INGRESSO|USCITA|STATO|PASSO|NOTE)"
echo "fatto: registro in ${TMPDIR}cutx-midi-spia-mcled.log"
