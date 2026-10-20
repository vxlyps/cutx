// L'insegna TECNOLOGIA CANAGLIA è un neon: sempre lì, spenta. Ogni tanto si accende
// con un tremolio, resta accesa qualche secondo e torna spenta. Discreta.
const PAUSA_MIN_MS = 20_000;
const PAUSA_MAX_MS = 60_000;
const ACCESA_MIN_MS = 2_500;
const ACCESA_MAX_MS = 5_000;

const aCaso = (min, max) => min + Math.random() * (max - min);

export function avviaInsegna(el) {
  const accendi = () => {
    el.classList.add('accesa');
    setTimeout(() => {
      el.classList.remove('accesa');
      setTimeout(accendi, aCaso(PAUSA_MIN_MS, PAUSA_MAX_MS));
    }, aCaso(ACCESA_MIN_MS, ACCESA_MAX_MS));
  };
  setTimeout(accendi, aCaso(PAUSA_MIN_MS, PAUSA_MAX_MS));
  return accendi;
}
