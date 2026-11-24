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

// Il PREASCOLTO in cuffia: volume della clip × volume del CH (dopo il fader). Il muto del CH (M) NON c'entra: un muto non zittisce la cuffia.
// Il motore cuffia lo tiene in un guadagno a parte («guadagno della prova»), separato dal volume generale della cuffia.
export function guadagnoProva(volumeClip, volumeCh) {
  const c = Number(volumeClip);
  const f = Number(volumeCh);
  return Math.max(0, Math.min(1.5, (Number.isFinite(c) ? c : 1) * (Number.isFinite(f) ? f : 1)));
}

// Il fader di un CH si muove mentre in cuffia c'è la prova di una sua clip: il nuovo guadagno da mandare alla cuffia, o null (altro CH, o solo il muto).
// effetto = { ch, volume?, muto? } come lo manda StatoCanali; prova = { ch, volumeClip } o null.
export function provaDaEffettoCh(effetto, prova) {
  if (!prova || effetto?.ch !== prova.ch || effetto.volume === undefined) return null;
  return guadagnoProva(prova.volumeClip, effetto.volume);
}
