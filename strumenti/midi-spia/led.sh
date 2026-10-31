#!/bin/zsh
# Prova di accensione di anelli e tasti: guarda il controller mentre il Mac annuncia cosa sta mandando.
cd "$(dirname "$0")/../.." || exit 1
SPIA_LED=1 node_modules/.bin/electron strumenti/midi-spia 2>&1 | grep -E "^(INGRESSO|USCITA|STATO|PASSO)"
echo "fatto"
