#!/bin/zsh
# CUTX dev · doppio clic e parte la versione locale più aggiornata di ~/Progetti/cutx.
# Gira accanto a CUTX installata dal .dmg: si chiama «CUTX dev», ha dati a parte e nel titolo DEV più il commit.
# Se qualcosa va storto questa finestra resta aperta con l'errore. Se il progetto non è in ~/Progetti/cutx, imposta CUTX_DIR.

DIR="${CUTX_DIR:-$HOME/Progetti/cutx}"
LOG="$HOME/Library/Logs/CUTX/avvio-dev.log"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

sbaglia() {
  echo
  echo "✗ $1"
  echo
  echo "Premi un tasto per chiudere."
  read -k1
  exit 1
}

cd "$DIR" 2>/dev/null || sbaglia "Non trovo CUTX in $DIR"
command -v npm >/dev/null || sbaglia "Manca Node.js: brew install node"

# le dipendenze si reinstallano solo se package.json (o il lock) è cambiato dall'ultima volta
FIRMA=$(cat package.json package-lock.json 2>/dev/null | shasum | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat node_modules/.cutx-firma 2>/dev/null)" != "$FIRMA" ]; then
  echo "package.json è cambiato: installo le dipendenze…"
  npm install || sbaglia "npm install è fallito (lo spazio sul disco? la rete?)"
  echo "$FIRMA" > node_modules/.cutx-firma
fi

COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "?")
git diff --quiet HEAD 2>/dev/null || COMMIT="$COMMIT+"   # + = ci sono modifiche non committate

echo "Compilo CUTX dev $COMMIT…"
npx vite build || sbaglia "La compilazione è fallita: l'errore è qui sopra."

mkdir -p "${LOG:h}"
CUTX_DEV=1 CUTX_COMMIT="$COMMIT" nohup node_modules/.bin/electron . >"$LOG" 2>&1 &!
PID=$!

# se entro pochi secondi si è già chiusa, c'è un errore: lo faccio vedere
sleep 8
if ! kill -0 $PID 2>/dev/null; then
  echo
  echo "---- ultime righe di $LOG ----"
  tail -25 "$LOG"
  sbaglia "CUTX dev si è chiusa subito."
fi

# parte: chiudo questa finestra del Terminale, CUTX continua da sola
osascript -e 'tell application "Terminal" to close (every window whose name contains "CUTX.command")' >/dev/null 2>&1 &!
exit 0
