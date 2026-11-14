// Un errore imprevisto in qualcosa che gira di continuo (il giro del motore, lo schermo, il proiettore) non deve fermare il resto
// né riempire il registro: lo stesso guasto si scrive al massimo una volta al secondo.
const ultimi = new Map(); // dove|messaggio → quando l'ho scritto

export function guasto(dove, e, { ora = Date.now(), scrivi = (t) => console.error(t) } = {}) {
  const messaggio = typeof e?.message === 'string' ? e.message : String(e);
  const chiave = `${dove}|${messaggio}`;
  if (ora - (ultimi.get(chiave) ?? -Infinity) < 1000) return false;
  if (ultimi.size > 50) ultimi.clear();
  ultimi.set(chiave, ora);
  scrivi(`${dove}: ${e?.stack ?? messaggio}`);
  return true;
}

// Esegue fn; se lancia, lo dice (una volta al secondo) e si va avanti.
export function sicuro(dove, fn) {
  try {
    return fn();
  } catch (e) {
    guasto(dove, e);
    return undefined;
  }
}
