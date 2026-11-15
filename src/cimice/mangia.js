// Il codice «mangiato» dalla cimice nel finale HACK: parole che si sostituiscono con glitch e poi spariscono, righe che si svuotano.
// È SOLO un disegno sopra il testo (un canvas con pointer-events: none): il testo dell'editor non cambia mai, e quando si ferma
// l'editor è esattamente com'era. Lo usano l'interfaccia di lavoro (CUE e livelli) e il proiettore.
import { statoParola } from './hack.js';
import { creaLettore } from './dom.js';
import { glifo } from './disegno.js';

const hash = (testo, n) => {
  let h = 2166136261 ^ n;
  for (let i = 0; i < testo.length; i++) h = Math.imul(h ^ testo.charCodeAt(i), 16777619);
  return h >>> 0;
};

// radici: selettore dei riquadri di codice · frazioneDi(radice) → 0…1: quanto di quel riquadro è mangiato
export function creaMangia({ radici, frazioneDi, caso = Math.random }) {
  const lettore = creaLettore({ radici, note: '.nessuna-nota' });
  let canvas = null;
  let g = null;
  let raf = 0;
  let parole = [];
  let impronta = '';
  let controllo = 0;
  let dpr = 1;
  let sporco = true;
  const sporca = () => { sporco = true; };

  function misura() {
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    sporco = true;
  }

  function rileggi() {
    sporco = false;
    const viste = new Map(); // quante volte ho visto questa parola in questo riquadro: il seme resta lo stesso se la pagina scorre un poco
    parole = lettore.parole().map((p) => {
      const chiave = `${p.testo}`;
      const k = viste.get(p.radice) ?? new Map();
      viste.set(p.radice, k);
      const n = k.get(chiave) ?? 0;
      k.set(chiave, n + 1);
      return { ...p, seme: hash(chiave, n), glitch: '', prossimo: 0 };
    });
  }

  function frame(ora) {
    raf = 0;
    if (!canvas) return;
    try {
      if (ora - controllo > 250) {
        controllo = ora;
        const ip = lettore.impronta();
        if (ip !== impronta) { impronta = ip; sporco = true; }
      }
      if (sporco) rileggi();
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, innerWidth, innerHeight);
      g.textBaseline = 'middle';
      for (const p of parole) {
        const stato = statoParola(p.seme, frazioneDi(p.radice));
        if (!stato) continue;
        g.fillStyle = p.sfondo;
        g.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
        if (stato === 1 || (stato === 2 && p.seme % 7 === 0)) {
          // caratteri sostituiti da glitch; qualche pezzo resta come un moncone
          if (ora > p.prossimo) {
            let t = '';
            for (let i = 0; i < p.testo.length; i++) t += caso() < (stato === 1 ? 0.6 : 0.85) ? (stato === 2 && caso() < 0.6 ? ' ' : glifo(caso)) : p.testo[i];
            p.glitch = t;
            p.prossimo = ora + (stato === 1 ? 50 : 140);
          }
          g.font = p.font;
          g.fillStyle = p.seme % 3 === 0 ? '#ff5b1f' : '#9fc23a';
          g.globalAlpha = stato === 1 ? 1 : 0.55;
          g.fillText(p.glitch, p.x, p.y + p.h / 2 + 0.5);
          g.globalAlpha = 1;
        }
      }
    } catch { ferma(); return; }
    raf = requestAnimationFrame(frame);
  }

  function avvia() {
    if (canvas) return;
    try {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:40;';
      document.body.appendChild(canvas);
      g = canvas.getContext('2d');
      misura();
      addEventListener('resize', misura, { passive: true });
      addEventListener('scroll', sporca, { capture: true, passive: true });
      raf = requestAnimationFrame(frame);
    } catch { ferma(); }
  }

  // Si ferma: il canvas sparisce e l'editor è com'era (non gli abbiamo mai toccato niente).
  function ferma() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    removeEventListener('resize', misura);
    removeEventListener('scroll', sporca, { capture: true });
    canvas?.remove();
    canvas = null;
    g = null;
    parole = [];
  }

  return { avvia, ferma, get attivo() { return !!canvas; } };
}
