// Il mixer dei CANALI, la parte pura: il motore live ne tiene lo stato (volume e muto di ogni CH) e la cuffia non lo conosce mai
// (la cuffia è pre-fader, come il CUE di un mixer DJ). Si prova con test/canali.test.js.
export const N_CH_MIXER = 8;
export const chNeutro = () => ({ volume: 1, pos: 1, muto: false });

// Il guadagno di un livello: volume della clip × volume del CH × «break» del fader; muto se è muta la clip o il CH. Un livello fuori dai CH (ch nullo) non ha CH.
export function guadagnoLivello(l, ch = null, rompi = 1) {
  if (l.muto || ch?.muto) return 0;
  return l.volume * (ch?.volume ?? 1) * rompi;
}

// Applica un messaggio { ch, volume?, pos?, muto? } allo stato di un CH. Un volume che non è un numero romperebbe la catena audio: si ignora.
export function applicaMessaggioCh(stato, m) {
  const v = Number(m.volume);
  if (m.volume !== undefined && Number.isFinite(v)) stato.volume = Math.max(0, Math.min(1, v));
  const p = Number(m.pos);
  if (m.pos !== undefined && Number.isFinite(p)) stato.pos = Math.max(0, Math.min(1, p));
  if (m.muto !== undefined) stato.muto = m.muto === 'inverti' ? !stato.muto : !!m.muto;
  return stato;
}
