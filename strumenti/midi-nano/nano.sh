#!/bin/zsh
# Fase 0 «CANALI»: prova la REGIA (Korg nanoKONTROL2) in modalità nativa. Non è CUTX: dati a parte, nessun suono, non scrive nella memoria del nano.
#   nano.sh          → tutto: parte automatica (luci) + giro guidato con i gesti + stacco del cavo (circa 5 minuti)
#   nano.sh auto     → solo la parte che non vuole le tue mani (luci e modalità)
# Il registro: ${TMPDIR}cutx-midi-nano.log
cd "$(dirname "$0")/../.." || exit 1
NANO_FASE="${1:-tutto}" node_modules/.bin/electron strumenti/midi-nano 2>&1 | grep -E "^(INGRESSO|USCITA|STATO|PASSO|ESITO|SX|[0-9]+\.[0-9]+ )"
echo "fatto: registro in ${TMPDIR}cutx-midi-nano.log"
