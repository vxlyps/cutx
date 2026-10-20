#!/bin/zsh
# CUTX · doppio clic e parte. Va bene anche copiato sulla Scrivania.
# Se il progetto non è in ~/Progetti/cutx, imposta CUTX_DIR.

DIR="${CUTX_DIR:-$HOME/Progetti/cutx}"
LOG="$HOME/Library/Logs/CUTX/avvio.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$DIR" 2>/dev/null || { echo "Non trovo CUTX in $DIR"; read -k1; exit 1; }
command -v npm >/dev/null || { echo "Manca Node.js: brew install node"; read -k1; exit 1; }

if [ ! -d node_modules ]; then
  echo "Primo avvio: installo le dipendenze…"
  npm install || { read -k1; exit 1; }
fi

mkdir -p "${LOG:h}"
nohup npm start >"$LOG" 2>&1 &!

# Chiude questa finestra del Terminale: CUTX continua da sola.
osascript -e 'tell application "Terminal" to close (every window whose name contains "CUTX.command")' >/dev/null 2>&1 &!
exit 0
