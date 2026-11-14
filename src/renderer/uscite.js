// Elenco dei dispositivi audio e scelta dell'uscita di un AudioContext.
// I dispositivi si ricordano per nome: l'id cambia da un Mac all'altro, il nome no.

async function dispositivi(tipo) {
  const tutti = await navigator.mediaDevices.enumerateDevices();
  return tutti.filter((d) => d.kind === tipo && d.deviceId !== 'default' && d.label);
}

export const elencoUscite = () => dispositivi('audiooutput');
export const elencoIngressi = () => dispositivi('audioinput');

// nome vuoto = uscita predefinita di macOS
// `prima()` (se c'è) viene chiamata solo se l'uscita cambia davvero, subito prima del cambio (il motore ci chiude il volume: niente schiocco).
export async function impostaUscita(ac, nome, prima = null) {
  let id = '';
  if (nome) {
    const d = (await elencoUscite()).find((u) => u.label === nome);
    if (!d) throw new Error(`uscita non trovata: ${nome}`);
    id = d.deviceId;
  }
  if (ac.sinkId === id) return false;
  await prima?.();
  await ac.setSinkId(id);
  return true;
}
