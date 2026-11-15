// La CIMICE: una creatura di linee e nodi che cammina sul codice. SOLO VISIVA.
// Mette un canvas trasparente sopra `contenitore` (pointer-events: none) e non tocca mai il testo, lo stato del set o l'audio.
// Acceso e spento da un solo punto: creaCimice(...).avvia() / .spegni(). Se qualcosa va storto si spegne in silenzio.
//
//   const c = creaCimice({ contenitore, leggiParole, opzioni });
//   c.avvia();
//   c.passo(k)            // a ogni sedicesimo del clock (k = numero del sedicesimo)
//   c.battuta({ variazione, drop })   // a inizio battuta, con quello che ha letto il sensore
//   c.ricalcola()         // quando cambiano scroll, misure, codice o schermata
//
// leggiParole({ larghezza, altezza }) ritorna le parole in coordinate del contenitore:
//   [{ x, y, w, h, testo?, font?, salta? }]   (salta = punteggiatura, i piedi non ci stanno)
import { aggiorna, aggiornaFirma, congedo, creaCorpo, geom, scegliBersaglio, suSedicesimo } from './corpo.js';
import { disegnaCimice, disegnaCorrotte, disegnaSotto, glifo } from './disegno.js';

export const OPZIONI = {
  acceso: true,
  scala: 1, // grandezza
  velocita: 1, // degli scatti
  cooldown: 8, // battute minime tra un'uscita e la prossima entrata
  probabilita: 0.5, // di entrare a ogni variazione
  durataMin: 4, // quante battute resta
  durataMax: 8,
  folle: true, // impazzisce sul drop
  battuteFolle: 4,
  lampi: true, // lampi rosso/verde
  corrompe: true, // le parole sotto la testa si corrompono (solo disegno)
  trema: true, // lo schermo trema un poco (solo il disegno)
  sensibilitaDrop: 0.5, // quanto deve essere forte il ritorno della cassa (0 poco … 1 molto)
  disegnaNote: false, // il canvas incornicia da sé le note che suonano (di serie lo fa già l'editor)
};

const colore = (nome, ripiego) => {
  try { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || ripiego; } catch { return ripiego; }
};

// suTocco(parola): chiamata (al massimo una volta per movimento) quando un'antenna tocca una nota che suona.
export function creaCimice({ contenitore, leggiParole, opzioni = {}, caso = Math.random, suTocco = null }) {
  const opz = { ...OPZIONI, ...opzioni };
  const rnd = (a, b) => a + caso() * (b - a);
  const pick = (arr) => arr[Math.floor(caso() * arr.length)];
  const ridotto = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas = null;
  let g = null;
  let dpr = 1;
  let acceso = false;
  let raf = 0;
  let ultimo = 0;
  let sporco = true; // le parole vanno rilette
  let osservatore = null;
  let bug = null;
  let rientro = null;
  let autoK = 1; // la cimice si adatta alla grandezza del testo (sul proiettore il codice è enorme)
  let folleBattute = 0;
  let battuteDaUscita = 99;
  const fx = { fili: [], barre: [], scossa: 0, ultimoBattito: 0 };

  const m = {
    parole: [], W: 0, H: 0, g: geom(opz.scala), opz, ridotto, rnd, pick,
    col: { ACID: '#b6f000', ROT: '#6d8a14', INK: '#d6ecae', RUST: '#ff5b1f', BG: '#0a0c07' },
    fontFirma: 'ui-monospace, Menlo, monospace',
    folle: () => !!bug && folleBattute > 0 && opz.folle,
    filo(x1, y1, x2, y2, color, max = 0.35) {
      fx.fili.push({ x1, y1, x2, y2, color, life: 0, max });
      if (fx.fili.length > 70) fx.fili.shift();
    },
    barra() {
      if (ridotto) return;
      const c = m.folle();
      const { ACID, INK, RUST } = m.col;
      fx.barre.push({
        x: rnd(-40, m.W * 0.7), y: rnd(0, m.H), w: rnd(90, c ? 620 : 300), h: rnd(4, c ? 24 : 12),
        color: opz.lampi && c && caso() < 0.6 ? RUST : caso() < 0.25 ? INK : ACID, life: 0, max: rnd(0.06, 0.18),
      });
    },
    trema(v) { if (opz.trema && !ridotto) fx.scossa = v; },
    lampeggia(p, v = 1) { if (p) p.hl = Math.max(p.hl, v); },
    corrompi(p, ms) {
      if (ridotto || !opz.corrompe || !p || p.salta || !p.font) return;
      const now = performance.now();
      if (p.scrUntil < now) p.scrNext = 0;
      p.scrUntil = Math.max(p.scrUntil, now + ms);
    },
  };

  function leggiColori() {
    m.col.ACID = colore('--marcio', m.col.ACID);
    m.col.ROT = colore('--marcio-scuro', m.col.ROT);
    m.col.INK = colore('--testo', m.col.INK);
    m.col.BG = colore('--fondo', m.col.BG);
    m.fontFirma = colore('--mono', m.fontFirma);
  }

  function misura() {
    const r = contenitore.getBoundingClientRect();
    m.W = opzioni.fisso ? window.innerWidth : r.width;
    m.H = opzioni.fisso ? window.innerHeight : r.height;
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(m.W * dpr));
    canvas.height = Math.max(1, Math.round(m.H * dpr));
    sporco = true;
  }

  // Le posizioni delle parole stanno in cache: si rileggono solo quando qualcosa è cambiato, mai a ogni frame.
  function ricalcola() { sporco = true; }
  function rileggi() {
    sporco = false;
    const lette = leggiParole({ larghezza: m.W, altezza: m.H }) || [];
    m.parole = lette.map((p) => ({
      ...p, cx: p.x + p.w / 2, cy: p.y + p.h / 2, hl: 0, held: 0, scrUntil: 0, scrNext: 0, scrTesto: '',
      vis: p.x + p.w > 0 && p.x < m.W && p.y + p.h > 0 && p.y < m.H,
    }));
    if (m.parole.length) {
      const alt = m.parole.map((p) => p.h).sort((a, b) => a - b);
      autoK = Math.min(4, Math.max(0.8, alt[alt.length >> 1] / 16));
      m.g = geom(opz.scala * autoK);
    }
    if (bug) {
      for (const leg of bug.legs) { leg.tok = null; if (leg.to) leg.to.tok = null; }
      for (const an of bug.ants) an.tok = null;
    }
  }

  function evoca() {
    if (bug) return;
    rientro = null;
    if (sporco) rileggi();
    const { W, H } = m;
    const bordi = [[-60, rnd(H * 0.2, H * 0.8), 0], [W + 60, rnd(H * 0.2, H * 0.8), Math.PI], [rnd(W * 0.2, W * 0.8), -60, Math.PI / 2], [rnd(W * 0.2, W * 0.8), H + 60, -Math.PI / 2]];
    const [x, y, h] = pick(bordi);
    bug = creaCorpo(m, x, y, h, false);
    bug.scia = [];
    bug.maxBars = Math.round(rnd(opz.durataMin, opz.durataMax));
    scegliBersaglio(m, bug);
  }
  function congeda() { if (bug) congedo(m, bug); }
  function toglie() {
    for (const leg of bug.legs) if (leg.tok) leg.tok.held--;
    if (bug.blink && opz.acceso) {
      // sparisce e rientra subito da un altro lato
      rientro = { at: performance.now() + rnd(150, 700), tieni: { age: bug.age, maxBars: bug.maxBars, tagOn: bug.tagOn, tagOffAge: bug.tagOffAge } };
      bug = null;
      return;
    }
    bug = null;
    battuteDaUscita = 0;
  }

  // A inizio battuta decide da sola, con quello che dice il sensore.
  function battuta({ variazione = false, drop = false } = {}) {
    if (!acceso) return;
    if (!bug) battuteDaUscita++;
    if (!opz.acceso) { congeda(); return; }
    if (drop && opz.folle) {
      folleBattute = opz.battuteFolle;
      if (!bug) evoca();
      if (bug) { bug.maxBars = Math.max(bug.maxBars, bug.age + 6); if (bug.state === 'exit') bug.state = 'walk'; }
    } else if (variazione) {
      if (!bug && battuteDaUscita >= opz.cooldown && caso() < opz.probabilita) evoca();
      else if (bug && bug.age >= 3 && folleBattute <= 0 && caso() < 0.5) congeda();
    }
    if (bug && !m.parole.some((p) => p.vis && !p.salta)) congeda(); // schermata senza codice
    if (bug) {
      bug.age++;
      aggiornaFirma(bug, caso);
      if (bug.state === 'walk' && folleBattute <= 0 && bug.age >= 2 && bug.age < bug.maxBars - 1 && caso() < 0.2) { congeda(); bug.blink = true; }
      if (bug.age >= bug.maxBars && folleBattute <= 0) congeda();
    }
    if (folleBattute > 0) folleBattute--;
  }

  function passo(k) {
    if (!acceso || !bug) return;
    try {
      if (sporco) rileggi();
      if (((k % 16) + 16) % 16 % 4 === 0) fx.ultimoBattito = performance.now();
      suSedicesimo(m, bug, k, performance.now());
      if (suTocco && bug && bug.state !== 'exit' && ((k % 4) + 4) % 4 === 0) {
        const an = bug.ants.find((x) => x.tok && x.tok.hl > 0.5);
        if (an) suTocco(an.tok);
      }
    } catch { spegni(); }
  }

  function frame(now) {
    raf = 0;
    if (!acceso) return;
    try {
      const dt = Math.min(0.05, (now - ultimo) / 1000);
      ultimo = now;
      if (sporco && bug) rileggi();
      if (!bug && rientro && now >= rientro.at) {
        const tieni = rientro.tieni;
        evoca();
        Object.assign(bug, tieni);
        bug.mode = 'dart'; bug.armed = false; bug.modeUntil = now + rnd(200, 450);
      }
      if (bug && aggiorna(m, bug, dt, now)) toglie();
      if (bug) {
        if (bug.mode === 'dart' && !ridotto) { bug.scia.push({ x: bug.x, y: bug.y, h: bug.h }); if (bug.scia.length > 5) bug.scia.shift(); }
        else if (bug.scia.length) bug.scia.shift();
      }
      // spegne e muove gli effetti
      for (const p of m.parole) {
        p.hl = p.hl > 0.01 ? p.hl * Math.exp(-dt * 8) : 0;
        if (p.scrUntil) {
          if (now > p.scrUntil) p.scrUntil = 0;
          else if (now > p.scrNext) {
            let s = '';
            for (let i = 0; i < (p.testo || '').length; i++) s += caso() < 0.55 ? glifo(caso) : p.testo[i];
            p.scrTesto = s; p.scrNext = now + 45;
          }
        }
      }
      for (const arr of [fx.fili, fx.barre]) for (let i = arr.length - 1; i >= 0; i--) { arr[i].life += dt; if (arr[i].life > arr[i].max) arr.splice(i, 1); }
      if (fx.scossa > 0) fx.scossa -= dt;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, m.W, m.H);
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (fx.scossa > 0) g.translate(rnd(-3, 3), rnd(-2, 2));
      if (bug || fx.fili.length || fx.barre.length) {
        disegnaSotto(g, m, fx, now);
        disegnaCorrotte(g, m, now);
        if (bug) disegnaCimice(g, m, bug, now);
      }
      g.globalAlpha = 1;
    } catch { spegni(); return; }
    pianifica();
  }
  function pianifica() { if (acceso && !raf && !document.hidden) raf = requestAnimationFrame(frame); }
  function suVisibilita() { ultimo = performance.now(); pianifica(); }

  function avvia() {
    if (acceso) return;
    try {
      if (!contenitore || typeof leggiParole !== 'function') return;
      leggiColori();
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = `position:${opzioni.fisso ? 'fixed' : 'absolute'};inset:0;width:100%;height:100%;pointer-events:none;z-index:50;`;
      contenitore.appendChild(canvas);
      g = canvas.getContext('2d');
      misura();
      if (typeof ResizeObserver === 'function') { osservatore = new ResizeObserver(misura); osservatore.observe(contenitore); }
      document.addEventListener('visibilitychange', suVisibilita);
      acceso = true;
      ultimo = performance.now();
      battuteDaUscita = 99;
      pianifica();
    } catch { spegni(); }
  }

  function spegni() {
    acceso = false;
    try {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('visibilitychange', suVisibilita);
      osservatore?.disconnect();
      osservatore = null;
      canvas?.remove();
    } catch { /* si spegne in silenzio */ }
    canvas = null; g = null; bug = null; rientro = null; m.parole = [];
    fx.fili.length = 0; fx.barre.length = 0;
  }

  function imposta(nuove) {
    Object.assign(opz, nuove);
    m.g = geom(opz.scala * autoK);
    if (!opz.acceso) congeda();
  }

  return {
    avvia, spegni, ricalcola, passo, battuta, evoca, congeda, imposta,
    // accende una parola (da fuori: quella che suona adesso); cerca per posizione nel testo o per indice
    accendi(parola, v = 1) { m.lampeggia(parola, v); },
    // le note che suonano adesso, come rettangoli della finestra: le parole dentro si accendono
    segna(rettangoli) {
      for (const p of m.parole) {
        if (!p.vis) continue;
        for (const r of rettangoli) {
          if (p.cx >= r.left - 1 && p.cx <= r.right + 1 && p.cy >= r.top - 1 && p.cy <= r.bottom + 1) { p.hl = 1; break; }
        }
      }
    },
    get parole() { return m.parole; },
    // Un dispetto è partito davvero: la cimice si accende di rosso un attimo.
    reagisci() { if (bug) { bug.redUntil = performance.now() + 450; bug.pulse = 1; } },
    get presente() { return !!bug; },
    get scalaEffettiva() { return m.g.k; }, // opzione grandezza × scala automatica sul testo
    get folle() { return m.folle(); },
    get acceso() { return acceso; },
  };
}
