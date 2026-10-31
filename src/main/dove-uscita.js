// Dove si apre la finestra del pubblico. Puro (niente electron): lo provano i test.
// - lo schermo ricordato, se c'è ancora (con la sua posizione e se era a tutto schermo);
// - altrimenti il secondo schermo, a tutto schermo;
// - con un solo schermo una finestra normale: a tutto schermo coprirebbe la postazione.
// schermi: [{ id, bounds }], primarioId, ricordo: { schermo, schermoIntero, bordi }, bordiValidi(bordi) → bordi | null
export function doveApre({ schermi, primarioId, ricordo = {}, bordiValidi = (b) => b ?? null }) {
  const ricordato = schermi.find((d) => d.id === ricordo.schermo);
  if (ricordato) return { schermo: ricordato, intero: !!ricordo.schermoIntero, bordi: bordiValidi(ricordo.bordi) };
  const secondo = schermi.find((d) => d.id !== primarioId);
  if (secondo) return { schermo: secondo, intero: true, bordi: null };
  return { schermo: schermi.find((d) => d.id === primarioId) ?? schermi[0], intero: false, bordi: bordiValidi(ricordo.bordi) };
}
