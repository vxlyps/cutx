// Quando lo stash cambia, i motori che stanno suonando aggiungono solo i suoni nuovi (o cambiati): rifare tutta
// la mappa mentre suona è un lavoro inutile e un rischio. Ritorna la mappa ridotta, o null se non c'è niente da fare.
// Un suono sparito dallo stash resta registrato fino al prossimo avvio: meglio che toglierlo sotto un livello che lo usa.
export function suoniNuovi(visti, nuova) {
  if (!nuova) return null;
  if (!visti) return nuova;
  const solo = { _base: nuova._base };
  let quanti = 0;
  for (const [nome, files] of Object.entries(nuova)) {
    if (nome === '_base') continue;
    if (JSON.stringify(files) !== JSON.stringify(visti[nome])) {
      solo[nome] = files;
      quanti++;
    }
  }
  return quanti || nuova._base !== visti._base ? solo : null;
}
