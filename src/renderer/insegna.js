// L'insegna TECNOLOGIA CANAGLIA è un neon sempre acceso, a media intensità, che vive:
// - un ronzio leggerissimo e continuo (la luce oscilla di poco, lenta: è nel CSS, neon.css);
// - ogni 8–20 secondi un flicker vero: 2–4 sfarfallii rapidi;
// - ogni tanto una sola lettera si spegne per un attimo.
// Deve vedersi ma non disturbare mentre scrivo codice. Uguale nella postazione e sul proiettore.
const FLICKER_MIN_MS = 8_000;
const FLICKER_MAX_MS = 20_000;
const LETTERA_MIN_MS = 5_000;
const LETTERA_MAX_MS = 14_000;

const aCaso = (min, max) => min + Math.random() * (max - min);
const intero = (min, max) => Math.floor(aCaso(min, max + 1));
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

export function avviaInsegna(el) {
  // ogni lettera è sua: una può spegnersi da sola
  const testo = el.textContent;
  el.setAttribute('aria-label', testo);
  el.replaceChildren(
    ...[...testo].map((c) => {
      if (c === ' ') return document.createTextNode(' ');
      const s = document.createElement('span');
      s.className = 'l';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = c;
      return s;
    }),
  );
  const lettere = [...el.querySelectorAll('.l')];
  const riposo = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // 2–4 sfarfallii rapidi: spenta un attimo, riaccesa, di nuovo…
  async function sfarfalla() {
    for (let i = 0, n = intero(2, 4); i < n; i++) {
      el.classList.add('sfarfalla');
      await attendi(aCaso(35, 90));
      el.classList.remove('sfarfalla');
      await attendi(aCaso(45, 130));
    }
  }

  // una sola lettera, per un attimo
  async function spegniLettera() {
    const l = lettere[intero(0, lettere.length - 1)];
    l.classList.add('spenta');
    await attendi(aCaso(120, 420));
    l.classList.remove('spenta');
  }

  let fermo = false;
  const ogni = (min, max, fa) => {
    const giro = () => setTimeout(async () => !fermo && (await fa(), giro()), aCaso(min, max));
    giro();
  };
  if (!riposo) {
    ogni(FLICKER_MIN_MS, FLICKER_MAX_MS, sfarfalla);
    ogni(LETTERA_MIN_MS, LETTERA_MAX_MS, spegniLettera);
  }
  // per le prove: niente flicker e lettere a caso, così si misura solo quello che si chiede
  const ferma = () => (fermo = true);
  return { sfarfalla, spegniLettera, ferma };
}
